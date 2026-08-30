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
import json
import os
import sys
from datetime import timedelta, timezone

# 复用共享合并逻辑
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from realdata import merge_and_write

# FIT 里的时间戳是 UTC（fitparse 解出 naive datetime），日期/时段一律按东八区换算。
# 此前直接 strftime UTC 值，凌晨 00:00–08:00 的活动会被记到前一天。
TZ_CN = timezone(timedelta(hours=8))

SPORT_MAP = {
    "running": "run",
    "treadmill": "run",          # 跑步机
    "cycling": "ride",           # 公路骑行 / 骑行（sportType=200）
    "indoor_cycling": "ride",
    "hiking": "hike",            # 徒步（sportType=104）单独成类
    "walking": "walk",           # 健走（sportType=900）单独成「步行」类
    "swimming": "workout",
    "training": "workout",
    "workout": "workout",
    "elliptical": "workout",
    "generic": "workout",        # 无明确类型回退（摩托骑行需靠 Coros sportType 区分）
}

# 高驰 sportType 码 -> 页面类型（权威来源，优先于 FIT 的 sport 字段）
# 实测：100/101=跑步, 200=骑行, 104=徒步, 103/400/401/402/701=训练,
#       900=健走(步行), 9807=摩托骑行, 1000/9900=羽毛球(无FIT)
COROS_TYPE_MAP = {
    100: "run", 101: "run",
    200: "ride",
    104: "hike",
    103: "workout", 400: "workout", 401: "workout", 402: "workout", 701: "workout",
    900: "walk",
    9807: "moto",
}

SPORT_LABEL = {
    "run": "Run",
    "walk": "Walk",
    "ride": "Ride",
    "hike": "Hike",
    "moto": "Moto",
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


def parse_fit_file(path, coros_type=None, name=None):
    """解析单个 FIT 文件。优先 fitdecode（更鲁棒，可跳过异常帧），失败回退 fitparse。"""
    try:
        return _parse_with_fitdecode(path, coros_type=coros_type, name=name)
    except Exception as e:
        print(f"  ⚠️  fitdecode 解析失败 {os.path.basename(path)}: {e}，尝试 fitparse")
        try:
            return _parse_with_fitparse(path, coros_type=coros_type, name=name)
        except Exception as e2:
            print(f"  ❌  跳过 {os.path.basename(path)}: {e2}")
            return None


def _parse_with_fitdecode(path, coros_type=None, name=None):
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
    return _build_activity(session, track, os.path.basename(path), coros_type=coros_type, name=name)


def _parse_with_fitparse(path, coros_type=None, name=None):
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
    return _build_activity(session, track, os.path.basename(path), coros_type=coros_type, name=name)


def _build_activity(session, track, fname, coros_type=None, name=None):
    sport = str(session.get("sport") or "training").lower()
    stype = SPORT_MAP.get(sport, "workout")
    # 优先用高驰 sportType（权威）：摩托骑行(9807)等 FIT 标为 generic 的活动可正确归类
    if coros_type is not None and coros_type in COROS_TYPE_MAP:
        stype = COROS_TYPE_MAP[coros_type]

    start = session.get("start_time")
    if start is None:
        return None
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)  # FIT 存 UTC（naive）
    local = start.astimezone(TZ_CN)
    date = local.strftime("%Y-%m-%d")
    hour = local.hour
    # 优先用高驰活动名（真实名称），否则按时间段合成
    title = name.strip() if name and name.strip() else f"{time_of_day_label(hour)} {SPORT_LABEL.get(stype, 'Workout')}"

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
    # 默认解析项目内的 coros_activities/（带侧车 meta）。
    # 此前默认 ~/github/running_page/FIT_OUT：该目录无 <id>.fit.meta.json，
    # 导致 name=None 降级成合成英文标题、且摩托骑行(sportType 9807)丢失类型，
    # 曾一次性毁掉 305 条高驰活动的真实名称。
    default_fit = os.path.join(here, "..", "coros_activities")
    ap = argparse.ArgumentParser(description="解析 Coros FIT 文件 -> real_data.js")
    ap.add_argument("--parse", default=default_fit,
                    help="包含 *.fit 的目录（默认项目内 coros_activities/）")
    ap.add_argument("--out", default=os.path.join(here, "..", "assets", "js", "real_data.js"),
                    help="输出 real_data.js 路径")
    ap.add_argument("--allow-synthetic", action="store_true",
                    help="允许在缺少侧车 meta 时解析（标题会退化为合成英文名，仅调试用）")
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(args.parse, "*.fit")))
    if not files:
        print(f"⚠️  在 {args.parse} 未找到任何 .fit 文件，页面将回退到示例数据。")
        return

    # 防呆：侧车 meta 缺失会让标题退化为 "Evening Run" 这类合成名、并丢掉摩托骑行等类型。
    # 曾经静默通过（except: pass），造成全量覆盖事故，这里直接拒绝执行。
    metas = glob.glob(os.path.join(args.parse, "*.fit.meta.json"))
    miss = len(files) - len(metas)
    if miss > 0 or not metas:
        print(f"❌ {args.parse} 中 {miss}/{len(files)} 个 FIT 缺少 <id>.fit.meta.json，"
              f"标题会退化为合成英文名、摩托骑行(sportType 9807)会被误判为 workout。")
        print("   请确认 --parse 指向 coros_activities/ 且已跑过 tools/fetch_coros.py；"
              "确需无 meta 解析请加 --allow-synthetic。")
        if not args.allow_synthetic:
            sys.exit(1)

    activities = []
    for fp in files:
        coros_type = None
        name = None
        # 读取 fetch_coros.py 生成的侧车元数据（高驰 sportType + 活动名）
        # 注意：fetch_coros 写入的是 "<labelId>.fit.meta.json"
        meta_path = fp + ".meta.json"
        if os.path.exists(meta_path):
            try:
                with open(meta_path, encoding="utf-8") as mf:
                    meta = json.load(mf)
                coros_type = meta.get("sportType")
                name = meta.get("name")
            except Exception as e:
                print(f"⚠️  侧车元数据解析失败，标题将退化为合成名：{os.path.basename(meta_path)}: {e}")
        else:
            print(f"⚠️  缺侧车元数据，标题将退化为合成名：{os.path.basename(fp)}")
        a = parse_fit_file(fp, coros_type=coros_type, name=name)
        if a:
            activities.append(a)

    print(f"解析到 {len(activities)} 条真实高驰活动（来自 {len(files)} 个 FIT 文件）")
    if not activities:
        return
    # 整源重建：解析逻辑纠正过类型（摩托骑行 workout→moto），_fuzzy_dup 要求 type 相同，
    # 不整源替换会把 11 条摩托追加成重复记录。
    merge_and_write(activities, out_path=args.out, source="coros", replace_source=True)


if __name__ == "__main__":
    main()
