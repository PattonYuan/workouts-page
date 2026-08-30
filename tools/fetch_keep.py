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

依赖：Python 标准库（urllib / json / zlib / base64）+ pycryptodome（AES 解密轨迹，
      pip install pycryptodome）。无 pycryptodome 时轨迹退化为空，但距离/时长/爬升仍正确。
"""
import base64
import json
import math
import os
import sys
import time
import zlib
from datetime import datetime, timedelta, timezone
from urllib import request as ureq
from urllib.parse import urlencode
import http.cookiejar

try:
    from Crypto.Cipher import AES as _AES
except Exception:  # noqa: BLE001
    _AES = None

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from realdata import merge_and_write  # noqa: E402

# ----------------------------- 接口地址 -----------------------------
LOGIN_API = "https://api.gotokeep.com/v1.1/users/login"
STATS_API = "https://api.gotokeep.com/pd/v3/stats/detail?dateUnit=all&type={type}&lastDate={last_date}"
RUN_LOG_API = "https://api.gotokeep.com/pd/v3/runninglog/{run_id}"
# 训练类（力量/核心/自重）详情走 traininglog 接口，runninglog 对其返回 400
TRAININGLOG_API = "https://api.gotokeep.com/pd/v3/traininglog/{log_id}"
# 步行/徒步（dataType=*Walking / id 带 _hk 后缀）的详情走 hikinglog 接口，
# runninglog 对其返回 400；hikinglog 返回 geoPoints（真实 GPS 轨迹）。
# 线索：活动列表 stats.schema 形如 keep://hikinglogs/{id}。
HIKINGLOG_API = "https://api.gotokeep.com/pd/v3/hikinglog/{log_id}"

# Keep 返回的时间戳是 UTC 毫秒；日期一律按东八区换算。此前用 UTC 格式化，
# 导致凌晨 00:00–08:00 的活动（如 00:01 的俯卧撑）被记到前一天，还会让
# 跨平台（高驰）去重因「日期不同」而失败，同一活动重复展示。
TZ_CN = timezone(timedelta(hours=8))

# 训练动作名 → 习惯打卡 item 键（用于 HABIT 打卡板块）
# 注意：这些在 Keep 里 dataType 多为 manualStrengthTraining / trainingStretching / hiit 等，
# 全混在 training 流里，只能靠 name 关键词识别。
TRAINING_HABIT_MAP = {
    "平板支撑": "plank",
    "俯卧撑": "pushup",
    "卷腹": "situp",
    "仰卧起坐": "situp",
    "深蹲": "squat",
}

# 要拉取的类型：Keep 类型 → 主页类型
FETCH_TYPES = {
    "running": "run",
    "cycling": "ride",
    "hiking": "hike",
    "walking": "walk",
}
TYPE_LABEL = {"running": "跑步", "cycling": "骑行", "hiking": "徒步", "walking": "健走"}

# 轨迹降采样上限（与 sync_fit.py 一致）：高驰侧已限制 150 点；Keep 原始 GPS 点极多，
# 不降采样会让 real_data.js 膨胀到十几 MB 并拖慢地图渲染。每条约保留 200 点足矣。
MAX_TRACK_POINTS = 200

# 增量同步状态文件：记录上次成功同步的时间游标（毫秒时间戳），
# 下次只拉取该时间之后的活动，避免每次全量扫 7500+ 条历史记录。
STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".keep_state.json")

# 增量扫描的「宽限期」：游标之前的这段时间窗口内仍会重新拉取，用于兜底「补录/倒签」
# 活动（用户后补记、但 Keep 把日期标成较早的情况）。此前代码用 `ms <= since_ts` 直接
# 停止翻页，会把游标当天、但时间戳早于游标的最近活动（如同一天稍早补记的卷腹/俯卧撑）
# 误判为「已同步」而丢弃。改为 `ms < since_ts - GRACE_MS` 才停止，既有历史仍在窗口外被
# 跳过（保证增量效率），窗口内的重复记录由 merge_and_write 按 id/模糊去重，不会重复。
GRACE_MS = 30 * 24 * 3600 * 1000  # 30 天


def load_state():
    """读取上次同步游标（毫秒时间戳）。不存在返回 0（首次全量）。"""
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            return int(json.load(f).get("last_sync_ts", 0))
    except Exception:
        return 0


def save_state(ts):
    """写入同步游标。ts 为本次处理到的最早时间戳（毫秒）。"""
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump({"last_sync_ts": int(ts)}, f)
    except Exception as e:  # noqa: BLE001
        print(f"  ⚠️ 写入 Keep 同步状态失败（不影响本次数据）：{e}")


def _rec_start_ms(st):
    """取一条 stats 记录的开始时间（毫秒），用于增量游标判定。"""
    ms = st.get("startTime") or 0
    if not ms:
        dd = st.get("doneDate")
        if dd:
            try:
                ms = int(datetime.fromisoformat(dd.replace("Z", "+00:00")).timestamp() * 1000)
            except Exception:  # noqa: BLE001
                ms = 0
    return int(ms)


def _downsample_track(track, cap=MAX_TRACK_POINTS):
    """均匀降采样轨迹点到 cap 个以内（保留首尾），避免文件过大/地图卡顿。"""
    if not track or len(track) <= cap:
        return track
    step = max(1, math.ceil(len(track) / cap))
    out = [track[i] for i in range(0, len(track), step)]
    if out and out[-1] != track[-1]:
        out.append(track[-1])
    return out

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
        self.track_blocked = False  # 轨迹 CDN 首次 403/失败后自适应关闭，避免每条记录白等数秒

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
            except ureq.HTTPError as e:
                # 4xx = 请求本身有误（如失效/非法的 run_id、接口不支持该类型），
                # 重试无意义，直接跳过该条记录，避免每条白白等数秒/陷入慢循环。
                if 400 <= getattr(e, "code", 0) < 500:
                    print(f"  ⚠️ 请求 4xx 跳过 {url[:60]}…：HTTP {getattr(e, 'code', '?')}")
                    return None
                last_err = e
                time.sleep(1.0 * (i + 1))
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
# Keep 的 GPS(geoPoints) / 心率(heartRates) 采用：base64 → [AES-CBC] → zlib → JSON。
# 解密 key/iv 来自 yihong0618/running_page（公开硬编码，与官方 App 一致）。
_KEEP_KEY = base64.b64decode("NTZmZTU5OzgyZzpkODczYw==")
_KEEP_IV = base64.b64decode("MjM0Njg5MjQzMjkyMDMwMA==")


def _decode_runmap(text, is_geo=False):
    """解码 Keep 的 GPS/心率数据。
    - 心率(heartRates)：base64(zlib) 直接解压，is_geo=False
    - 轨迹(geoPoints)：base64 → AES-CBC 解密 → zlib 解压，is_geo=True
    返回 JSON 对象（GPS 为 [{latitude, longitude, ...}]，GCJ-02 坐标）。
    """
    try:
        b = base64.b64decode(text)
        if is_geo:
            if _AES is None:
                return None
            b = _AES.new(_KEEP_KEY, _AES.MODE_CBC, _KEEP_IV).decrypt(b)
        return json.loads(zlib.decompress(b, 16 + zlib.MAX_WBITS))
    except Exception as e:  # noqa: BLE001
        print(f"  ⚠️ 轨迹/心率解码失败：{e}")
        return None


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
def _fetch_detail(client, run_id, page_type):
    """取活动详情 JSON data。runninglog 不支持（400）的类型自动回退：
    步行/徒步 → hikinglog。返回 data dict 或 None。"""
    r = client._req(RUN_LOG_API.format(run_id=run_id))
    if not r or not r.get("data"):
        if page_type in ("hiking", "walking"):
            r = client._req(HIKINGLOG_API.format(log_id=run_id))
        if not r or not r.get("data"):
            return None
    return r["data"]


def _extract_track(d, client):
    """从详情 data 提取 GPS 轨迹（GCJ-02 → WGS-84，[lat, lon] 列表）。
    优先 geoPoints（接口内嵌加密 GPS），缺失时回退 CDN rawDataURL（可能 403）。"""
    track = []
    geo = d.get("geoPoints")
    if geo:
        pts = _decode_runmap(geo, is_geo=True)
        if pts:
            for p in pts:
                lat = p.get("latitude")
                lng = p.get("longitude")
                if lat is None or lng is None:
                    continue
                wlon, wlat = gcj02_to_wgs84(float(lng), float(lat))
                track.append([round(wlat, 6), round(wlon, 6)])
    if not track:
        raw_url = d.get("rawDataURL")
        if raw_url and not client.track_blocked:
            resp = client._req(raw_url, retries=1)
            if resp and isinstance(resp, str):
                pts = _decode_runmap(resp)
                if pts:
                    for p in pts:
                        lat = p.get("latitude")
                        lng = p.get("longitude")
                        if lat is None or lng is None:
                            continue
                        wlon, wlat = gcj02_to_wgs84(float(lng), float(lat))
                        track.append([round(wlat, 6), round(wlon, 6)])
            else:
                client.track_blocked = True
    return track


def parse_run_log(client, run_id, page_type):
    d = _fetch_detail(client, run_id, page_type)
    if not d:
        return None
    try:
        start = d.get("startTime", 0) / 1000
        end = d.get("endTime", 0) / 1000
        if not start:
            return None
        dt = datetime.fromtimestamp(start, tz=TZ_CN)
        date_str = dt.strftime("%Y-%m-%d")
        # 时长优先用接口直接给的 duration（秒），缺失时回退到 end-start
        dur = int(d.get("duration") or 0)
        if not dur and end > start:
            dur = int(end - start)

        # 距离：Keep 接口直接返回 distance（单位：米），优先使用，避免依赖被防盗链挡掉的轨迹 CDN。
        dist_m = d.get("distance")
        dist = round(float(dist_m) / 1000.0, 2) if isinstance(dist_m, (int, float)) else 0.0

        # 轨迹（GCJ-02 → WGS-84）。室内运动（跑步机/室内训练）本身无 GPS，track 自然为空。
        track = _extract_track(d, client)

        # 爬升：接口直接给 accumulativeUpliftedHeight（米）
        elev = d.get("accumulativeUpliftedHeight")
        elev = round(float(elev), 1) if isinstance(elev, (int, float)) else 0.0

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
            "elevationM": elev,
            "avgHr": int(hr) if hr else 0,
            "track": _downsample_track(track),
            "source": "keep",
        }
    except Exception as e:  # noqa: BLE001
        print(f"  ⚠️ 解析活动 {run_id} 失败：{e}")
        return None


def fetch_type(client, page_type, since_ts=0):
    """分页拉取某类型的活动 id 列表，再逐条解析。返回 (活动dict列表, 最早时间戳ms)。

    增量：since_ts>0 时，只拉取开始时间晚于 since_ts 的活动；因接口按时间倒序
    返回，一旦遇到 startTime<=since_ts 的旧记录即停止翻页，避免全量扫历史。
    健壮性：若某类型整批请求都失败（如骑行/徒步在 RUN_LOG_API 上系统性返回
    HTTP 400，无法解析），则在该类型连续失败达到阈值后提前中止，避免对几百条
    注定失败的记录逐条空跑（既慢又无意义）。这类运动通常由高驰(Coros)覆盖。
    """
    out = []
    last_date = 0          # 始终从最新页开始；下方 early-break 实现增量
    seen_ids = set()
    prev_last = None
    consecutive_fail = 0
    newest_ms = since_ts or None  # 本次拉到的最新时间戳，用于推进游标
    FAIL_ABORT = 20  # 连续失败（无一条成功解析）达到此数 → 提前中止该类型
    while True:
        r = client._req(STATS_API.format(type=page_type, last_date=last_date))
        if not r or not r.get("data"):
            break
        data = r["data"]
        page_parsed = 0
        for rec in data.get("records", []):
            for log in rec.get("logs", []):
                st = log.get("stats")
                if not isinstance(st, dict):
                    continue  # 跳过 type=steps 的计步摘要（无 id，且 .get 会崩）
                # 步行（outdoorWalking/indoorWalking）只从 walking 流由 fetch_walks 处理。
                # Keep 的 hiking 流同样混着步行记录（内部 type=hiking），若在此解析会
                # 被误标成 hike（"Keep徒步"），且与 fetch_walks 产生的 walk 记录、以及
                # 高驰的健走记录因「类型不同」而无法模糊去重 → 同一次步行重复展示。
                if page_type != "walking" and st.get("dataType") in ("outdoorWalking", "indoorWalking"):
                    continue
                # hiking 流里还混有爬楼梯（stairClimbing）等非徒步记录（id 同为 _hk，
                # 详情也在 hikinglog 上，能解析成功），只保留真正的徒步。
                if page_type == "hiking":
                    dt = (st.get("dataType") or "").lower()
                    nm = st.get("name") or ""
                    if "hiking" not in dt and not any(k in nm for k in ("徒步", "登山", "远足")):
                        continue
                ms = _rec_start_ms(st)
                # 增量：接口按时间倒序返回，见到不晚于游标的旧记录即已到底，停止翻页
                if since_ts and ms and ms < since_ts - GRACE_MS:
                    return out, newest_ms or since_ts
                rid = st.get("id")
                if rid and rid not in seen_ids:
                    seen_ids.add(rid)
                    act = parse_run_log(client, rid, page_type)
                    if act:
                        out.append(act)
                        if newest_ms is None or (ms and ms > newest_ms):
                            newest_ms = ms
                        page_parsed += 1
                        consecutive_fail = 0
                        print(f"  + {act['date']} [{act['type']}] {act['title']} {act['distanceKm']}km")
                    else:
                        consecutive_fail += 1
        # 分页未推进（lastTimestamp 不变）→ 防止某些接口返回的死循环
        new_last = data.get("lastTimestamp", 0)
        if not new_last or new_last == prev_last:
            break
        prev_last = new_last
        last_date = new_last
        time.sleep(0.6)  # 轻量限速
        # 该类型连续失败过多且尚无成功解析 → 整批不可解析，提前中止
        if consecutive_fail >= FAIL_ABORT and page_parsed == 0 and not out:
            print(f"  ⚠️ 类型 {page_type} 连续 {consecutive_fail} 条请求失败且无一成功解析，"
                  f"判定为不可解析（可能 RUN_LOG_API 不支持该类型），提前跳过。")
            break
    return out, newest_ms or since_ts


# ----------------------------- 步行专用拉取 -----------------------------
# Keep 的 "walking" 接口其实是「全量活动流」：跑步/骑行/徒步/爬楼/HIIT/羽毛球/拉伸/步行…
# 全混在一起（共 7500+ 条），因此单独实现：只挑真正的步行，不把同流的跑步/骑行误标成 walk。
#
# 轨迹：户外步行（outdoorWalking，id 带 _hk 后缀）的详情在 hikinglog 接口上
# （runninglog 对其返回 400），带 geoPoints 加密 GPS，可解出真实轨迹。
# 室内步行无 GPS，直接用列表摘要构造，不调详情。
WALK_NAME_HINTS = ("步行", "行走", "健走", "走路")


def _is_walk(st):
    dt = st.get("dataType")
    if dt in ("outdoorWalking", "indoorWalking"):
        return True
    nm = st.get("name") or ""
    return any(h in nm for h in WALK_NAME_HINTS)


def _build_walk(client, st):
    """由列表摘要构造步行记录；户外步行再调 hikinglog 详情补全 GPS 轨迹/心率。
    详情失败时退化为无轨迹的摘要记录（距离/时长仍正确）。"""
    ms = st.get("startTime") or 0
    if not ms:
        dd = st.get("doneDate")
        if dd:
            try:
                ms = int(datetime.fromisoformat(dd.replace("Z", "+00:00")).timestamp() * 1000)
            except Exception:  # noqa: BLE001
                ms = 0
    if not ms:
        return None
    dt = datetime.fromtimestamp(ms / 1000, tz=TZ_CN)
    date_str = dt.strftime("%Y-%m-%d")
    dist_m = st.get("distance")
    dist = round(float(dist_m) / 1000.0, 2) if isinstance(dist_m, (int, float)) else 0.0
    dur = int(st.get("duration") or 0)
    name = st.get("name") or "健走"

    track = []
    elev = 0.0
    hr = None
    rid = st.get("id")
    if st.get("dataType") == "outdoorWalking" and rid:
        d = client._req(HIKINGLOG_API.format(log_id=rid))
        dd = (d or {}).get("data") if d else None
        if dd:
            track = _extract_track(dd, client)
            if isinstance(dd.get("distance"), (int, float)) and dd["distance"] > 0:
                dist = round(float(dd["distance"]) / 1000.0, 2)
            if dd.get("duration"):
                dur = int(dd["duration"])
            e = dd.get("accumulativeUpliftedHeight")
            if isinstance(e, (int, float)):
                elev = round(float(e), 1)
            h = (dd.get("heartRate") or {}).get("averageHeartRate")
            if isinstance(h, (int, float)) and 0 < h < 250:
                hr = int(h)
            name = dd.get("workoutName") or dd.get("exerciseName") or name
        time.sleep(0.3)  # 详情接口轻量限速
    return {
        "date": date_str,
        "type": "walk",
        "title": name,
        "distanceKm": dist,
        "movingTimeSec": dur,
        "elevationM": elev,
        "avgHr": hr or 0,
        "track": _downsample_track(track),
        "source": "keep",
    }


def fetch_walks(client, since_ts=0):
    """从 walking 全量活动流中挑出真正的步行（其余类型由各自接口/高驰覆盖）。

    增量：since_ts>0 时遇到 startTime<=since_ts 的旧记录即停止翻页。
    """
    out = []
    last = 0              # 始终从最新页开始；靠下方 early-break 实现增量
    seen = set()
    newest_ms = since_ts or None
    while True:
        r = client._req(STATS_API.format(type="walking", last_date=last))
        if not r or not r.get("data"):
            break
        data = r["data"]
        for rec in data.get("records", []):
            for log in rec.get("logs", []):
                st = log.get("stats")
                if not isinstance(st, dict):
                    continue
                ms = _rec_start_ms(st)
                if since_ts and ms and ms < since_ts - GRACE_MS:
                    return out, newest_ms or since_ts
                rid = st.get("id")
                if not rid or rid in seen:
                    continue
                if not _is_walk(st):
                    continue
                seen.add(rid)
                act = _build_walk(client, st)
                if act:
                    out.append(act)
                    if newest_ms is None or (ms and ms > newest_ms):
                        newest_ms = ms
                    print(f"  + {act['date']} [walk] {act['title']} {act['distanceKm']}km"
                          f"{' (含GPS轨迹)' if act['track'] else ''}")
        nl = data.get("lastTimestamp", 0)
        if not nl:
            break
        last = nl
        time.sleep(0.4)
    return out, newest_ms or since_ts


# ----------------------------- 训练/核心类拉取 -----------------------------
# Keep 的训练、核心、自重动作（平板支撑/俯卧撑/卷腹/深蹲等）全混在 training 流里，
# 详情接口用 traininglog（非 runninglog，后者对训练类返回 400）。
# traininglog 的 groups[].actualRep = 当次个数，actualSec = 当次秒数（平板支撑靠它）。
# 这些动作作为「每日习惯打卡」记录：返回 (activities, checkins) 两套数据。
HABIT_KEYWORDS = {  # 动作名片段 → HABIT item 键
    "平板支撑": "plank",
    "俯卧撑": "pushup",
    "卷腹": "situp",
    "仰卧起坐": "situp",
    "深蹲": "squat",
}


def _training_item_key(name):
    for kw, key in HABIT_KEYWORDS.items():
        if kw in (name or ""):
            return key
    return None


def _training_from_summary(st):
    """用列表摘要直接构造（无需调详情接口，避免 400）。返回 (activity, checkin) 或 None。"""
    ms = st.get("startTime") or 0
    if not ms:
        dd = st.get("doneDate")
        if dd:
            try:
                ms = int(datetime.fromisoformat(dd.replace("Z", "+00:00")).timestamp() * 1000)
            except Exception:
                ms = 0
    if not ms:
        return None
    dt = datetime.fromtimestamp(ms / 1000, tz=TZ_CN)
    date_str = dt.strftime("%Y-%m-%d")
    dur = int(st.get("duration") or st.get("accurateDuration") or 0)
    name = st.get("name") or "训练"
    act = {
        "date": date_str,
        "type": "workout",
        "title": name,
        "distanceKm": 0.0,
        "movingTimeSec": dur,
        "elevationM": 0.0,
        "avgHr": 0,
        "track": [],
        "source": "keep",
    }
    key = _training_item_key(name)
    checkin = None
    if key:
        # 摘要阶段只有时长；真实次数 reps 由 fetch_training 调详情补全
        checkin = {"item": key, "date": date_str, "reps": None, "sec": dur or None}
    return act, checkin


def fetch_training(client, since_ts=0):
    """从 training 全量流里挑训练/核心动作，构造活动 + 打卡。

    增量：since_ts>0 时遇到 startTime<=since_ts 的旧记录即停止翻页。
    """
    acts, checkins = [], []
    last = 0              # 始终从最新页开始；靠下方 early-break 实现增量
    seen = set()
    newest_ms = since_ts or None
    while True:
        r = client._req(STATS_API.format(type="training", last_date=last))
        if not r or not r.get("data"):
            break
        data = r["data"]
        for rec in data.get("records", []):
            for log in rec.get("logs", []):
                st = log.get("stats")
                if not isinstance(st, dict):
                    continue
                ms = _rec_start_ms(st)
                if since_ts and ms and ms < since_ts - GRACE_MS:
                    return acts, checkins, newest_ms or since_ts
                rid = st.get("id")
                if not rid or rid in seen:
                    continue
                # 只处理能识别为习惯动作的训练（其余训练如 HIIT/拉伸不进打卡）
                if not _training_item_key(st.get("name")):
                    seen.add(rid)
                    continue
                seen.add(rid)
                res = _training_from_summary(st)
                if not res:
                    continue
                act, checkin = res
                # 用 traininglog 详情补全精确次数与时长（字段严格分开，勿混）：
                #   · reps = groups[].actualRep 累加 —— Keep 记录的真实次数
                #     （俯卧撑/卷腹/深蹲；累加而非取第一组，多组课程才不漏）；
                #   · sec  = groups[].actualSec 累加（缺失回退详情 duration）——时长秒数，
                #     平板支撑只有 sec 没有 reps。
                if checkin is not None:
                    d = client._req(TRAININGLOG_API.format(log_id=rid))
                    dd = (d or {}).get("data") if d else None
                    if dd:
                        groups = dd.get("groups") or []
                        n = sum(int(g.get("actualRep") or 0) for g in groups)
                        s = sum(int(g.get("actualSec") or 0) for g in groups)
                        s = s or int(dd.get("duration") or 0)
                        if n and checkin["item"] != "plank":
                            checkin["reps"] = n
                        if s:
                            checkin["sec"] = s
                acts.append(act)
                checkins.append(checkin)
                if newest_ms is None or (ms and ms > newest_ms):
                    newest_ms = ms
                got = f"{checkin['reps']}个" if checkin.get("reps") else f"{checkin.get('sec') or 0}秒"
                print(f"  + {act['date']} [workout] {act['title']} -> {checkin['item']} {got}")
        nl = data.get("lastTimestamp", 0)
        if not nl or nl == last:
            break
        last = nl
        time.sleep(0.4)
    return acts, checkins, newest_ms or since_ts


# ----------------------------- 主流程 -----------------------------
# Keep 同步默认禁用（KEEP_ENABLED 未开启时跳过）。启用后首次全量，之后自动按
# .keep_state.json 游标做增量（只拉取上次同步之后的新活动），大幅减少接口读取。
def main():
    _load_dotenv()
    if os.environ.get("KEEP_ENABLED", "").strip().lower() not in ("1", "true", "yes", "on"):
        print("⏭️  Keep 同步已禁用（KEEP_ENABLED 未开启）。本次仅使用 Coros 数据，跳过 Keep。")
        return

    mobile = os.environ.get("KEEP_MOBILE")
    password = os.environ.get("KEEP_PASSWORD")
    if not (mobile and password):
        sys.exit("❌ 未找到 Keep 凭据：请设置环境变量 KEEP_MOBILE / KEEP_PASSWORD，"
                 "或在 tools/.env 中填写（参见 .env.example）。")

    # 增量游标：上次成功同步到的最新活动时间戳（毫秒）。首次为 0（全量）。
    # 注意：游标存的是“最新”而非“最早”——Keep 接口按时间倒序返回，我们从最新页
    # 开始翻，一旦遇到 startTime<=游标 的旧记录即停，从而只拉取增量（delta）。
    since_ts = load_state()
    if since_ts:
        print(f"🔖 Keep 增量模式：只拉取比 {datetime.fromtimestamp(since_ts/1000, tz=timezone.utc).strftime('%Y-%m-%d')} 更新的活动")
    else:
        print("🔖 Keep 首次全量同步（之后自动转为增量）")

    client = KeepClient()
    try:
        client.login(mobile, password)
    except Exception as e:  # noqa: BLE001
        sys.exit(f"❌ {e}")

    all_acts = []
    newest_ms = since_ts or None  # 跟踪本次拉到的最新时间戳，用于推进游标
    for page_type in FETCH_TYPES:
        if page_type == "walking":
            continue  # walking 接口是全量活动流，单独用 fetch_walks 处理（避免误标/崩溃）
        print(f"── 拉取 {TYPE_LABEL.get(page_type, page_type)} …")
        try:
            acts, nm = fetch_type(client, page_type, since_ts=since_ts)
            all_acts.extend(acts)
            if nm and (newest_ms is None or nm > newest_ms):
                newest_ms = nm
        except Exception as e:  # noqa: BLE001
            print(f"  ⚠️ 类型 {page_type} 拉取失败（接口可能不支持）：{e}")
    print("── 拉取 健走（从全量活动流筛选） …")
    try:
        acts, nm = fetch_walks(client, since_ts=since_ts)
        all_acts.extend(acts)
        if nm and (newest_ms is None or nm > newest_ms):
            newest_ms = nm
    except Exception as e:  # noqa: BLE001
        print(f"  ⚠️ 健走拉取失败：{e}")

    all_checkins = []
    print("── 拉取 训练/核心动作（平板支撑/俯卧撑/卷腹/深蹲，作为每日打卡） …")
    try:
        tr_acts, tr_checkins, nm = fetch_training(client, since_ts=since_ts)
        all_acts.extend(tr_acts)
        all_checkins.extend(tr_checkins)
        if nm and (newest_ms is None or nm > newest_ms):
            newest_ms = nm
    except Exception as e:  # noqa: BLE001
        print(f"  ⚠️ 训练动作拉取失败：{e}")

    if not all_acts:
        print("⚠️ 未拉取到任何 Keep 活动（可能接口失效，或该账号无对应类型数据）。保留现有数据。")
        # 无新增时保持游标不变（不推进到当前时间，避免漏掉补录/倒签活动）
        return

    merge_and_write(all_acts, checkins=all_checkins, source="keep")
    # 更新增量游标：用本次拉到的最新时间戳（若有），否则当前时间
    new_ts = int(newest_ms) if newest_ms else int(time.time() * 1000)
    save_state(new_ts)
    print(f"✅ Keep 同步完成，本次拉取 {len(all_acts)} 条活动 + {len(all_checkins)} 条打卡"
          f"（已与高驰等合并并按平台去重）。游标已更新至 "
          f"{datetime.fromtimestamp(new_ts/1000, tz=timezone.utc).strftime('%Y-%m-%d')}。")


if __name__ == "__main__":
    main()
