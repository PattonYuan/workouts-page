#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync_coros.py — 把高驰(Coros)运动数据接入「运动主页」

两种用法（任选其一）：

  1) 解析已导出的目录（无需账号密码，推荐先用这种方式验证）
     目录结构由 corosexport 生成：每个活动含  <日期>_activity-<id>.gpx
     和 <日期>_activity-<id>_metadata.json
       python sync_coros.py --parse ./coros_activities

  2) 直接从高驰账号拉取（需要 corosexport 库，会交互式/参数式登录）
       pip install corosexport
       python sync_coros.py --fetch --email you@example.com --password xxx \
                            --backup-dir ./coros_activities

输出：自动合并写入 ../assets/js/real_data.js （与 Keep 等其它平台并存），
      刷新页面即可看到真实数据。若没有任何真实活动，页面会自动回退到内置示例数据。

说明：高驰没有「习惯打卡」概念，checkins 通常为空；
      页面会保留示例的习惯打卡，保证该模块不空白。
"""

import argparse
import glob
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from realdata import merge_and_write  # noqa: E402

# ----------------------------- 运动类型映射 -----------------------------
RUN_KEYWORDS = ["run", "running", "跑步", "户外跑", "室内跑", "越野跑", "trail", "jog"]
RIDE_KEYWORDS = ["ride", "cycling", "骑行", "自行车", "bike", "indoor cycling"]


def map_type(name):
    n = (name or "").lower()
    if any(k in n for k in RUN_KEYWORDS):
        return "run"
    if any(k in n for k in RIDE_KEYWORDS):
        return "ride"
    return "workout"  # 力量/室内/其他


def _local_key(meta, *hints):
    """在 metadata 字典里按关键词（不区分大小写）查找键。"""
    lower = {str(k).lower(): k for k in meta.keys()}
    for h in hints:
        h = h.lower()
        if h in lower:
            return meta[lower[h]]
        for lk, ok in lower.items():
            if h in lk:
                return meta[ok]
    return None


def _parse_date(start):
    if not start:
        return ""
    s = str(start).strip()
    # ISO 格式
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d")
    except Exception:
        pass
    # epoch 秒/毫秒
    try:
        f = float(s)
        if f > 1e12:
            f /= 1000
        dt = datetime.fromtimestamp(f, tz=timezone.utc)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        pass
    # 退而求其次：取前 10 个字符（如 2025-01-10）
    return s[:10]


def parse_gpx(path):
    """从 GPX 提取累计爬升(elevation gain)与平均心率；无则为 0。"""
    import xml.etree.ElementTree as ET

    ele_gain = 0.0
    hr_samples = []
    last_ele = None
    try:
        root = ET.parse(path).getroot()
    except Exception:
        return 0, 0

    def tag_name(t):
        return t.split("}")[-1]

    for elem in root.iter():
        t = tag_name(elem.tag)
        if t == "ele" and elem.text:
            try:
                e = float(elem.text)
            except ValueError:
                continue
            if last_ele is not None and e > last_ele:
                ele_gain += e - last_ele
            last_ele = e
        elif t in ("hr", "heartrate") and elem.text:
            try:
                hr_samples.append(float(elem.text))
            except ValueError:
                pass
    avg_hr = round(sum(hr_samples) / len(hr_samples)) if hr_samples else 0
    return round(ele_gain), avg_hr


def parse_folder(folder):
    """解析 corosexport 导出目录，返回活动列表。"""
    if not os.path.isdir(folder):
        sys.exit(f"目录不存在: {folder}")

    activities = []
    metas = sorted(glob.glob(os.path.join(folder, "*_metadata.json")))
    if not metas:
        print("⚠️ 未找到 *_metadata.json，请确认目录是 corosexport 的导出结果。")
        return activities

    for meta_path in metas:
        try:
            with open(meta_path, encoding="utf-8") as f:
                meta = json.load(f)
        except Exception as e:
            print(f"跳过无法解析的元数据: {meta_path} ({e})")
            continue

        name = _local_key(meta, "activity_name", "name", "title") or "运动"

        dist_raw = _local_key(meta, "distance", "dist")
        try:
            dist_m = float(dist_raw) if dist_raw is not None else 0.0
        except (TypeError, ValueError):
            dist_m = 0.0
        # corosexport 的 distance_meters 单位为米
        distance_km = round(dist_m / 1000.0, 2) if dist_m > 1000 else round(dist_m, 2)

        dur_raw = _local_key(meta, "workout_duration", "duration", "total_duration")
        try:
            dur = int(float(dur_raw)) if dur_raw is not None else 0
        except (TypeError, ValueError):
            dur = 0

        start = _local_key(meta, "start_time", "starttime", "start", "begin_time")
        date = _parse_date(start)

        stype = map_type(name)

        base = meta_path[: -len("_metadata.json")]
        gpx = base + ".gpx"
        ele_gain, avg_hr = (0, 0)
        if os.path.exists(gpx):
            ele_gain, avg_hr = parse_gpx(gpx)

        activities.append(
            {
                "date": date,
                "type": stype,
                "title": name,
                "distanceKm": distance_km,
                "movingTimeSec": dur,
                "elevationM": ele_gain,
                "avgHr": avg_hr,
            }
        )

    activities.sort(key=lambda a: a["date"])
    return activities


def write_data_js(activities, checkins=None, profile=None, out_path=None):
    # 兼容旧调用：转交统一的合并写入（real_data.js）
    merge_and_write(activities, profile=profile, checkins=checkins, out_path=out_path)


def fetch_mode(email, password, backup_dir):
    """从高驰账号下载活动。

    说明：corosexport 库仅支持 eu/us 两个 team host，对中国区(@qq.com 等)
    账号登录后调用 activity/query 会返回 1019 (Access token is invalid)，
    无法直接自动拉取。故此处改为直接对接 Coros 中国区 API。
    """
    try:
        import requests
        import bcrypt
        import hashlib
        import json as _json
    except ImportError:
        sys.exit("缺少依赖，请先安装：pip install requests bcrypt")

    BASE = "https://teameuapi.coros.com"  # 登录可用；列表接口对中国区返回 1019
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Origin": "https://training.coros.com",
        "Referer": "https://training.coros.com/",
    })
    pw_md5 = hashlib.md5(password.encode()).hexdigest()
    salt = bcrypt.gensalt(rounds=10)
    hashed = bcrypt.hashpw(pw_md5.encode(), salt)
    payload = {"account": email, "accountType": 2,
               "p1": hashed.decode(), "p2": salt.decode()}
    r = s.post(f"{BASE}/account/login", json=payload)
    if r.status_code != 200 or r.json().get("result") != "0000":
        sys.exit(f"高驰登录失败：{r.status_code} {r.text[:120]}")
    d = r.json()["data"]
    token = d["accessToken"]; uid = str(d["userId"])
    s.cookies["CPL-coros-token"] = token
    s.cookies["CPL-coros-region"] = "3"
    h = {"accesstoken": token, "yfheader": _json.dumps({"userId": uid})}
    rr = s.get(f"{BASE}/activity/query",
               params={"size": 5, "pageNumber": 1, "modeList": ""},
               headers=h)
    j = rr.json()
    if j.get("result") == "1019":
        sys.exit(
            "⚠️ 已确认：corosexport 及 team host 对中国区(@qq.com 等)账号\n"
            "   在登录成功后仍会被 activity/query 拒绝(token 1019)。\n"
            "   自动拉取暂不可用。请改用手动导出：\n"
            "   1) 在 Coros App / 官网导出 .fit 文件\n"
            "   2) 拷贝到 ./coros_activities/\n"
            "   3) 运行: python tools/sync_fit.py --parse ./coros_activities\n"
            "   （账号密码已保存于 tools/.env，可在未来支持中国区时启用）"
        )
    # 若将来中国区 host 可用，可在此继续翻页下载；当前直接报错兜底。
    sys.exit("未预期的中国区 API 响应，请改用 --parse 手动导出模式。")


def main():
    p = argparse.ArgumentParser(description="高驰(Coros)运动数据接入运动主页")
    p.add_argument("--parse", metavar="DIR", help="解析已导出的 coros_activities 目录")
    p.add_argument("--fetch", action="store_true", help="从高驰账号直接拉取")
    p.add_argument("--email", help="高驰账号邮箱（--fetch 时必填）")
    p.add_argument("--password", help="高驰账号密码（--fetch 时必填）")
    p.add_argument("--backup-dir", default="./coros_activities", help="导出/下载目录")
    p.add_argument("--out", default=None, help="输出 coros_data.js 路径")
    args = p.parse_args()

    if args.fetch:
        if not (args.email and args.password):
            sys.exit("--fetch 需要同时提供 --email 和 --password")
        src = fetch_mode(args.email, args.password, args.backup_dir)
    else:
        src = args.parse or args.backup_dir

    activities = parse_folder(src)
    if not activities:
        print("未解析到任何活动，保留页面内置示例数据。")
        return
    write_data_js(activities, out_path=args.out)
    print("完成。刷新浏览器即可看到真实高驰数据。")


if __name__ == "__main__":
    main()
