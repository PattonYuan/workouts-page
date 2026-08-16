#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync_keep.py — 把 Keep(Keep运动)数据接入「运动主页」

两种用法（任选其一）：

  1) 解析导出的目录（推荐，无需账号密码）
     来源 A：Keep App「我的 → 更多 → 数据同步 → 运动数据文件导出」导出 TCX/GPX，
             文件默认在手机 /Keep/export/，拷到电脑后放到一个目录。
     来源 B：用 RunGap 等第三方工具把 Keep 导出为 GPX/TCX/FIT。
       python sync_keep.py --parse ./keep_activities

  2) 直接从 Keep 账号拉取（非官方接口，可能随版本失效）
     需要 running_page 项目的 keep_sync.py 能力；本脚本提供 --fetch 占位，
     详见下方说明。一般情况下更推荐用方式 1 手动导出。

输出：自动合并写入 ../assets/js/real_data.js （与高驰等其它平台并存），
      刷新页面即可看到真实数据。若没有任何真实活动，页面回退到内置示例数据。

说明：Keep 导出的 GPX 常缺少心率曲线；TCX 一般含心率与逐点距离，解析更完整。
"""

import argparse
import glob
import math
import os
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from realdata import merge_and_write  # noqa: E402

# ----------------------------- 运动类型映射 -----------------------------
RUN_KEYWORDS = ["run", "running", "跑步", "户外跑", "室内跑", "慢跑", "trail", "jog"]
RIDE_KEYWORDS = ["ride", "cycling", "骑行", "自行车", "单车", "bike", "indoor cycling"]
WORKOUT_KEYWORDS = ["workout", "training", "训练", "力量", "strength", "hiit", "core"]


def map_type(name):
    n = (name or "").lower()
    if any(k in n for k in RUN_KEYWORDS):
        return "run"
    if any(k in n for k in RIDE_KEYWORDS):
        return "ride"
    if any(k in n for k in WORKOUT_KEYWORDS):
        return "workout"
    return "workout"


def _tag(t):
    return t.split("}")[-1]


def _parse_dt(s):
    if not s:
        return None
    s = s.strip()
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        pass
    try:
        f = float(s)
        if f > 1e12:
            f /= 1000
        return datetime.fromtimestamp(f, tz=timezone.utc)
    except Exception:
        return None


def _date_str(dt):
    return dt.strftime("%Y-%m-%d") if dt else ""


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


def _elevation_gain(eles):
    gain = 0.0
    last = None
    for e in eles:
        if e is None:
            continue
        if last is not None and e > last:
            gain += e - last
        last = e
    return round(gain)


# ----------------------------- GPX 解析 -----------------------------
def parse_gpx(path):
    try:
        root = ET.parse(path).getroot()
    except Exception as e:
        print(f"跳过无法解析的 GPX: {path} ({e})")
        return None

    times, lats, lons, eles, hrs = [], [], [], [], []
    for tp in root.iter():
        t = _tag(tp.tag)
        if t != "trkpt":
            continue
        lat = tp.get("lat")
        lon = tp.get("lon")
        if lat is None or lon is None:
            continue
        lats.append(float(lat))
        lons.append(float(lon))
        tm = ele = hr = None
        for c in tp:
            ct = _tag(c.tag)
            if ct == "time" and c.text:
                tm = c.text
            elif ct == "ele" and c.text:
                try:
                    ele = float(c.text)
                except ValueError:
                    ele = None
            elif ct in ("hr", "heartrate") and c.text:
                try:
                    hr = float(c.text)
                except ValueError:
                    hr = None
        if tm:
            times.append(tm)
        eles.append(ele)
        if hr is not None:
            hrs.append(hr)

    if not lats:
        return None

    dt0 = _parse_dt(times[0]) if times else None
    dt1 = _parse_dt(times[-1]) if times else None
    dur = int((dt1 - dt0).total_seconds()) if (dt0 and dt1) else 0
    dist = _haversine_km(lats, lons)
    gain = _elevation_gain(eles)
    avg_hr = round(sum(hrs) / len(hrs)) if hrs else 0
    title = os.path.splitext(os.path.basename(path))[0]
    return {
        "date": _date_str(dt0),
        "type": map_type(title),
        "title": title,
        "distanceKm": dist,
        "movingTimeSec": dur,
        "elevationM": gain,
        "avgHr": avg_hr,
    }


# ----------------------------- TCX 解析 -----------------------------
def parse_tcx(path):
    try:
        root = ET.parse(path).getroot()
    except Exception as e:
        print(f"跳过无法解析的 TCX: {path} ({e})")
        return None

    sport = None
    for act in root.iter():
        if _tag(act.tag) == "Activity":
            sport = act.get("Sport")
            break

    times, lats, lons, eles, hrs, dists = [], [], [], [], [], []
    for tp in root.iter():
        if _tag(tp.tag) != "Trackpoint":
            continue
        tm = lat = lon = ele = hr = dist = None
        for c in tp:
            ct = _tag(c.tag)
            if ct == "Time" and c.text:
                tm = c.text
            elif ct == "Position":
                for p in c:
                    pc = _tag(p.tag)
                    if pc == "LatitudeDegrees" and p.text:
                        lat = float(p.text)
                    elif pc == "LongitudeDegrees" and p.text:
                        lon = float(p.text)
            elif ct == "AltitudeMeters" and c.text:
                try:
                    ele = float(c.text)
                except ValueError:
                    ele = None
            elif ct == "DistanceMeters" and c.text:
                try:
                    dist = float(c.text)
                except ValueError:
                    dist = None
            elif ct == "HeartRateBpm":
                for v in c:
                    if _tag(v.tag) == "Value" and v.text:
                        try:
                            hr = float(v.text)
                        except ValueError:
                            hr = None
        if tm:
            times.append(tm)
        if lat is not None:
            lats.append(lat)
        if lon is not None:
            lons.append(lon)
        eles.append(ele)
        if dist is not None:
            dists.append(dist)
        if hr is not None:
            hrs.append(hr)

    if not times:
        return None

    dt0 = _parse_dt(times[0])
    dt1 = _parse_dt(times[-1])
    dur = int((dt1 - dt0).total_seconds()) if (dt0 and dt1) else 0
    dist = round(max(dists) / 1000.0, 2) if dists else _haversine_km(lats, lons)
    gain = _elevation_gain(eles)
    avg_hr = round(sum(hrs) / len(hrs)) if hrs else 0
    stype = map_type(sport or os.path.basename(path))
    title = (sport or "Keep运动")
    return {
        "date": _date_str(dt0),
        "type": stype,
        "title": title,
        "distanceKm": dist,
        "movingTimeSec": dur,
        "elevationM": gain,
        "avgHr": avg_hr,
    }


# ----------------------------- 目录解析 -----------------------------
def parse_folder(folder):
    if not os.path.isdir(folder):
        sys.exit(f"目录不存在: {folder}")

    activities = []
    files = sorted(
        glob.glob(os.path.join(folder, "*.gpx"))
        + glob.glob(os.path.join(folder, "*.tcx"))
        + glob.glob(os.path.join(folder, "*.GPX"))
        + glob.glob(os.path.join(folder, "*.TCX"))
    )
    if not files:
        print("⚠️ 未找到 .gpx/.tcx 文件，请确认目录是 Keep 导出结果。")
        return activities

    for f in files:
        ext = os.path.splitext(f)[1].lower()
        act = parse_tcx(f) if ext == ".tcx" else parse_gpx(f)
        if act:
            activities.append(act)

    activities.sort(key=lambda a: a["date"])
    return activities


def fetch_mode(phone, password):
    """Keep 非官方拉取（占位）。

    真实可用的实现来自 running_page 项目的 keep_sync.py（手机号+密码登录
    非官方接口）。由于该接口不稳定且需额外依赖，本脚本默认不内置完整拉取，
    推荐用 --parse 解析 Keep App / RunGap 导出的文件。

    若确需自动拉取，可参考：
      https://github.com/yihong0618/running_page 的 run_page/keep_sync.py
    """
    sys.exit(
        "Keep 的 --fetch 自动拉取未内置（接口非官方、易失效）。\n"
        "更稳妥的做法：\n"
        "  1) Keep App 内「数据同步 → 运动数据文件导出」导出 TCX/GPX；\n"
        "  2) 把文件放到一个目录后运行：python sync_keep.py --parse <目录>"
    )


def main():
    p = argparse.ArgumentParser(description="Keep(Keep运动)数据接入运动主页")
    p.add_argument("--parse", metavar="DIR", help="解析导出的 keep_activities 目录（含 .gpx/.tcx）")
    p.add_argument("--fetch", action="store_true", help="从 Keep 账号拉取（未内置，见说明）")
    p.add_argument("--phone", help="Keep 手机号（--fetch 时）")
    p.add_argument("--password", help="Keep 密码（--fetch 时）")
    p.add_argument("--out", default=None, help="输出 real_data.js 路径")
    args = p.parse_args()

    if args.fetch:
        if not (args.phone and args.password):
            sys.exit("--fetch 需要同时提供 --phone 和 --password")
        fetch_mode(args.phone, args.password)
        return

    src = args.parse
    if not src:
        sys.exit("请指定 --parse <目录> 来解析 Keep 导出的 GPX/TCX 文件。")

    activities = parse_folder(src)
    if not activities:
        print("未解析到任何活动，保留页面内置示例数据。")
        return
    merge_and_write(activities, out_path=args.out)
    print("完成。刷新浏览器即可看到真实 Keep 数据（已与高驰等合并）。")


if __name__ == "__main__":
    main()
