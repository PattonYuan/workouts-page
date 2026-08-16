#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_keep.py — 通过 Keep 非官方接口自动拉取运动数据，合并进「运动主页」

与 sync_keep.py（手动导出 GPX/TCX）不同，本脚本直接调用 Keep 接口，
用「手机号 + 密码」登录后拉取全部活动（含 GPS 轨迹、心率），无需每次手动导出。
适合配合定时任务（WorkBuddy 每日自动化 / GitHub Actions）做到「设好即忘」。

⚠️ 注意：
  1. 这是 Keep 的非官方接口，属于 ToS 灰色地带，可能随时失效；账号密码请只放在
     本地环境变量或同目录 .env 中，切勿提交进仓库。
  2. Keep 返回的坐标是 GCJ-02（国测局加密），而本主页地图（Leaflet + OSM/CARTO）
     使用 WGS-84，中国境内会整体偏移几百米，本脚本已内置 GCJ-02 → WGS-84 纠偏。

用法：
  python tools/fetch_keep.py
  （凭据读取顺序：环境变量 KEEP_MOBILE / KEEP_PASSWORD → 同目录 .env 文件）

依赖：仅 Python 标准库（urllib / json / zlib / base64），无需 pip 安装。
"""
import base64
import json
import math
import os
import sys
import time
import zlib
from datetime import datetime, timezone
from urllib import request as ureq
from urllib.parse import urlencode
import http.cookiejar

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from realdata import merge_and_write  # noqa: E402

# ----------------------------- 接口地址 -----------------------------
LOGIN_API = "https://api.gotokeep.com/v1.1/users/login"
STATS_API = "https://api.gotokeep.com/pd/v3/stats/detail?dateUnit=all&type={type}&lastDate={last_date}"
RUN_LOG_API = "https://api.gotokeep.com/pd/v3/runninglog/{run_id}"

# 要拉取的类型：Keep 类型 → 主页类型
FETCH_TYPES = {
    "running": "run",
    "cycling": "ride",
    "hiking": "hike",
    "walking": "walk",
}
TYPE_LABEL = {"running": "跑步", "cycling": "骑行", "hiking": "徒步", "walking": "健走"}

UA = ("Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:78.0) Gecko/20100101 Firefox/78.0")


# ----------------------------- .env 加载 -----------------------------
def _load_dotenv():
    """读取脚本同目录的 .env（KEY=VALUE，忽略 # 注释与空行）。不依赖第三方库。"""
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(p):
        return
    with open(p, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


# ----------------------------- HTTP 客户端 -----------------------------
class KeepClient:
    def __init__(self):
        self.cj = http.cookiejar.CookieJar()
        self.opener = ureq.build_opener(ureq.HTTPCookieProcessor(self.cj))
        self.headers = {"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"}
        self.token = None

    def _req(self, url, data=None, headers=None, retries=3):
        h = dict(self.headers)
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        if headers:
            h.update(headers)
        body = urlencode(data).encode() if data else None
        last_err = None
        for i in range(retries):
            try:
                req = ureq.Request(url, data=body, headers=h)
                with self.opener.open(req, timeout=20) as resp:
                    raw = resp.read().decode("utf-8", "ignore")
                return json.loads(raw)
            except Exception as e:  # noqa: BLE001
                last_err = e
                time.sleep(1.5 * (i + 1))
        print(f"  ⚠️ 请求失败 {url[:60]}…：{last_err}")
        return None

    def login(self, mobile, password):
        r = self._req(LOGIN_API, data={"mobile": mobile, "password": password})
        if not r or not r.get("data", {}).get("token"):
            raise RuntimeError("Keep 登录失败（检查手机号/密码，或接口已变更）")
        self.token = r["data"]["token"]
        self.headers["Authorization"] = f"Bearer {self.token}"
        nickname = r["data"].get("user", {}).get("nickname") or mobile
        print(f"✅ Keep 登录成功：{nickname}")
        return self


# ----------------------------- GCJ-02 → WGS-84 -----------------------------
def _out_of_china(lng, lat):
    return not (73.66 < lng < 135.05 and 3.86 < lat < 53.55)


def _transform_lat(lng, lat):
    ret = -100 + 2 * lng + 3 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * math.sqrt(abs(lng))
    ret += (20 * math.sin(6 * lng * math.pi) + 20 * math.sin(2 * lng * math.pi)) * 2 / 3
    ret += (20 * math.sin(lat * math.pi) + 40 * math.sin(lat / 3 * math.pi)) * 2 / 3
    ret += (160 * math.sin(lat / 12 * math.pi) + 320 * math.sin(lat * math.pi / 30)) * 2 / 3
    return ret


def _transform_lng(lng, lat):
    ret = 300 + lng + 2 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * math.sqrt(abs(lng))
    ret += (20 * math.sin(6 * lng * math.pi) + 20 * math.sin(2 * lng * math.pi)) * 2 / 3
    ret += (20 * math.sin(lng * math.pi) + 40 * math.sin(lng / 3 * math.pi)) * 2 / 3
    ret += (150 * math.sin(lng / 12 * math.pi) + 300 * math.sin(lng / 30 * math.pi)) * 2 / 3
    return ret


def gcj02_to_wgs84(lng, lat):
    """GCJ-02（国测局加密，Keep/高德/腾讯用）转 WGS-84（GPS 标准，OSM/Mapbox 用）。"""
    if _out_of_china(lng, lat):
        return lng, lat
    a = 6378245.0
    ee = 0.00669342162296594323
    dlat = _transform_lat(lng - 105, lat - 35)
    dlng = _transform_lng(lng - 105, lat - 35)
    radlat = lat / 180 * math.pi
    magic = math.sin(radlat)
    magic = 1 - ee * magic * magic
    sqrtmagic = math.sqrt(magic)
    dlat = (dlat * 180) / ((a * (1 - ee)) / (magic * sqrtmagic) * math.pi)
    dlng = (dlng * 180) / (a / sqrtmagic * math.cos(radlat) * math.pi)
    mglat = lat + dlat
    mglng = lng + dlng
    return lng * 2 - mglng, lat * 2 - mglat


# ----------------------------- 轨迹解码 -----------------------------
def _decode_runmap(text):
    """Keep 的 rawDataURL 返回 base64(zlib) 的 GPS 点序列，解出 [[lat,lon], ...]（GCJ-02）。"""
    try:
        raw = zlib.decompress(base64.b64decode(text), 16 + zlib.MAX_WBITS)
        pts = json.loads(raw)
        return pts
    except Exception as e:  # noqa: BLE001
        print(f"  ⚠️ 轨迹解码失败：{e}")
        return []


def _haversine_km(lats, lons):
    if len(lats) < 2:
        return 0.0
    R = 6371.0
    total = 0.0
    for i in range(1, len(lats)):
        la1, lo1 = math.radians(lats[i - 1]), math.radians(lons[i - 1])
        la2, lo2 = math.radians(lats[i]), math.radians(lons[i])
        dla = la2 - la1
        dlo = lo2 - lo1
        a = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2
        total += 2 * R * math.asin(math.sqrt(a))
    return round(total, 2)


# ----------------------------- 单条活动解析 -----------------------------
def parse_run_log(client, run_id, page_type):
    r = client._req(RUN_LOG_API.format(run_id=run_id))
    if not r or not r.get("data"):
        return None
    d = r["data"]
    try:
        start = d.get("startTime", 0) / 1000
        end = d.get("endTime", 0) / 1000
        if not start:
            return None
        tz = d.get("timezone", "")
        dt = datetime.fromtimestamp(start, tz=timezone.utc)
        date_str = dt.strftime("%Y-%m-%d")
        dur = int(end - start) if end > start else 0

        # 轨迹（GCJ-02 → WGS-84）
        track = []
        raw_url = d.get("rawDataURL")
        if raw_url:
            resp = client._req(raw_url)
            if resp and isinstance(resp, str):
                pts = _decode_runmap(resp)
                for p in pts:
                    lat = p.get("latitude")
                    lng = p.get("longitude")
                    if lat is None or lng is None:
                        continue
                    wlon, wlat = gcj02_to_wgs84(float(lng), float(lat))
                    track.append([round(wlat, 6), round(wlon, 6)])
        lats = [t[0] for t in track]
        lons = [t[1] for t in track]
        dist = _haversine_km(lats, lons) if track else 0.0

        hr = (d.get("heartRate") or {}).get("averageHeartRate")
        if isinstance(hr, (int, float)) and hr < 0:
            hr = None
        name = d.get("name") or f"Keep{TYPE_LABEL.get(page_type, '运动')}"

        return {
            "date": date_str,
            "type": FETCH_TYPES.get(page_type, "workout"),
            "title": name,
            "distanceKm": dist,
            "movingTimeSec": dur,
            "elevationM": 0,
            "avgHr": int(hr) if hr else 0,
            "track": track,
            "source": "keep",
        }
    except Exception as e:  # noqa: BLE001
        print(f"  ⚠️ 解析活动 {run_id} 失败：{e}")
        return None


def fetch_type(client, page_type):
    """分页拉取某类型的活动 id 列表，再逐条解析。返回活动 dict 列表。"""
    out = []
    last_date = 0
    seen_ids = set()
    while True:
        r = client._req(STATS_API.format(type=page_type, last_date=last_date))
        if not r or not r.get("data"):
            break
        data = r["data"]
        for rec in data.get("records", []):
            for log in rec.get("logs", []):
                rid = log.get("stats", {}).get("id")
                if rid and rid not in seen_ids:
                    seen_ids.add(rid)
                    act = parse_run_log(client, rid, page_type)
                    if act:
                        out.append(act)
                        print(f"  + {act['date']} [{act['type']}] {act['title']} {act['distanceKm']}km")
        last_date = data.get("lastTimestamp", 0)
        if not last_date:
            break
        time.sleep(0.6)  # 轻量限速
    return out


# ----------------------------- 主流程 -----------------------------
def main():
    _load_dotenv()
    mobile = os.environ.get("KEEP_MOBILE")
    password = os.environ.get("KEEP_PASSWORD")
    if not (mobile and password):
        sys.exit("❌ 未找到 Keep 凭据：请设置环境变量 KEEP_MOBILE / KEEP_PASSWORD，"
                 "或在 tools/.env 中填写（参见 .env.example）。")

    client = KeepClient()
    try:
        client.login(mobile, password)
    except Exception as e:  # noqa: BLE001
        sys.exit(f"❌ {e}")

    all_acts = []
    for page_type in FETCH_TYPES:
        print(f"── 拉取 {TYPE_LABEL.get(page_type, page_type)} …")
        try:
            all_acts.extend(fetch_type(client, page_type))
        except Exception as e:  # noqa: BLE001
            print(f"  ⚠️ 类型 {page_type} 拉取失败（接口可能不支持）：{e}")

    if not all_acts:
        print("⚠️ 未拉取到任何 Keep 活动（可能接口失效，或该账号无对应类型数据）。保留现有数据。")
        return

    merge_and_write(all_acts, source="keep")
    print(f"✅ Keep 同步完成，本次拉取 {len(all_acts)} 条（已与高驰等合并并按平台去重）。")


if __name__ == "__main__":
    main()
