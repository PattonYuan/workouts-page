#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync_fit.py —— 解析高驰(Coros)导出的 FIT 文件，写入 workouts-page 的真实数据源。

数据来源：
  - 直接用 running_page 已同步的 FIT_OUT 目录（最稳，无需账号/网络）
  - 或用 corosexport 拉取后得到的 *.fit 目录

用法：
  python3 tools/sync_fit.py --parse <FIT目录>
      （默认目录：~/github/running_page/FIT_OUT）

输出：自动合并写入 ../assets/js/real_data.js ，刷新页面即可看到真实高驰数据。
      若没有任何真实活动，页面会自动回退到内置示例数据。

依赖：pip install fitparse
"""
import argparse
import glob
import os
import sys

# 复用共享合并逻辑
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from realdata import merge_and_write

SPORT_MAP = {
    "running": "run",
    "cycling": "ride",
    "walking": "workout",
    "swimming": "workout",
    "training": "workout",
    "workout": "workout",
    "elliptical": "workout",
    "indoor_cycling": "ride",
    "treadmill": "run",
}

SPORT_LABEL = {
    "run": "Run",
    "ride": "Ride",
    "workout": "Workout",
}

MAX_TRACK_POINTS = 150


def semicircle_to_deg(v):
    return v * (180.0 / 2**31) if v is not None else None


def time_of_day_label(hour):
    if hour < 5:
        return "Early"
    if hour < 11:
        return "Morning"
    if hour < 14:
        return "Midday"
    if hour < 18:
        return "Afternoon"
    return "Evening"


def parse_fit_file(path):
    """解析单个 FIT 文件。优先 fitdecode（更鲁棒，可跳过异常帧），失败回退 fitparse。"""
    try:
        return _parse_with_fitdecode(path)
    except Exception as e:
        print(f"  ⚠️  fitdecode 解析失败 {os.path.basename(path)}: {e}，尝试 fitparse")
        try:
            return _parse_with_fitparse(path)
        except Exception as e2:
            print(f"  ❌  跳过 {os.path.basename(path)}: {e2}")
            return None


def _parse_with_fitdecode(path):
    import fitdecode

    session = None
    track = []
    with fitdecode.FitReader(path, error_handling=fitdecode.ErrorHandling.IGNORE) as fit:
        for frame in fit:
            if not isinstance(frame, fitdecode.records.FitDataMessage):
                continue
            if frame.name == "session" and session is None:
                session = {f.name: f.value for f in frame.fields}
            elif frame.name == "record":
                d = {f.name: f.value for f in frame.fields}
                lat = semicircle_to_deg(d.get("position_lat"))
                lon = semicircle_to_deg(d.get("position_long"))
                if lat is not None and lon is not None:
                    track.append((round(lat, 5), round(lon, 5)))
    if not session:
        return None
    return _build_activity(session, track, os.path.basename(path))


def _parse_with_fitparse(path):
    import fitparse

    fit = fitparse.FitFile(path)
    session = None
    for m in fit.get_messages("session"):
        session = {f.name: f.value for f in m}
        break
    if not session:
        return None
    track = []
    for m in fit.get_messages("record"):
        d = {f.name: f.value for f in m}
        lat = semicircle_to_deg(d.get("position_lat"))
        lon = semicircle_to_deg(d.get("position_long"))
        if lat is not None and lon is not None:
            track.append((round(lat, 5), round(lon, 5)))
    return _build_activity(session, track, os.path.basename(path))


def _build_activity(session, track, fname):
    sport = (session.get("sport") or "training").lower()
    stype = SPORT_MAP.get(sport, "workout")

    start = session.get("start_time")
    if start is None:
        return None
    date = start.strftime("%Y-%m-%d")
    hour = start.hour
    title = f"{time_of_day_label(hour)} {SPORT_LABEL.get(stype, 'Workout')}"

    distance_km = round((session.get("total_distance") or 0) / 1000.0, 2)
    moving = session.get("total_timer_time") or session.get("total_elapsed_time") or 0
    moving = int(round(moving))
    ascent = int(round(session.get("total_ascent") or 0))
    avg_hr = int(session.get("avg_heart_rate") or 0) or None

    # 降采样 GPS 轨迹
    raw = track
    track_out = []
    if raw:
        step = max(1, len(raw) // MAX_TRACK_POINTS)
        track_out = [[la, lo] for i, (la, lo) in enumerate(raw) if i % step == 0]
        if track_out and track_out[-1] != [raw[-1][0], raw[-1][1]]:
            track_out.append([raw[-1][0], raw[-1][1]])

    return {
        "date": date,
        "type": stype,
        "title": title,
        "distanceKm": distance_km,
        "movingTimeSec": moving,
        "elevationM": ascent,
        "avgHr": avg_hr,
        "source": "coros",
        "track": track_out,
    }


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    default_fit = os.path.expanduser("~/github/running_page/FIT_OUT")
    ap = argparse.ArgumentParser(description="解析 Coros FIT 文件 -> real_data.js")
    ap.add_argument("--parse", default=default_fit,
                    help="包含 *.fit 的目录（默认 ~/github/running_page/FIT_OUT）")
    ap.add_argument("--out", default=os.path.join(here, "..", "assets", "js", "real_data.js"),
                    help="输出 real_data.js 路径")
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(args.parse, "*.fit")))
    if not files:
        print(f"⚠️  在 {args.parse} 未找到任何 .fit 文件，页面将回退到示例数据。")
        return

    activities = []
    for fp in files:
        a = parse_fit_file(fp)
        if a:
            activities.append(a)

    print(f"解析到 {len(activities)} 条真实高驰活动（来自 {len(files)} 个 FIT 文件）")
    if not activities:
        return
    merge_and_write(activities, out_path=args.out)


if __name__ == "__main__":
    main()
