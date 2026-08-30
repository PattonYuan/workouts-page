#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
realdata.py — 真实运动数据的统一读写（被 sync_coros.py / sync_keep.py 共用）

负责把各平台的活动合并写入 assets/js/real_data.js（window.REALDATA）。
多平台分别运行各自的脚本时，活动会累加而非互相覆盖（按 日期|标题|距离|时长 去重）。
"""
import json
import os


def _load_tracks(path):
    """读取与 real_data.js 同目录、按活动顺序对齐的轨迹文件 real_tracks.js。
    返回轨迹数组（与活动一一对应，无轨迹处为 null）；文件不存在返回 None。"""
    tp = os.path.join(os.path.dirname(path), "real_tracks.js")
    if not os.path.exists(tp):
        return None
    try:
        with open(tp, encoding="utf-8") as f:
            txt = f.read()
        s = txt.index("[")
        e = txt.rindex("]") + 1
        return json.loads(txt[s:e])
    except Exception:
        return None


def load_existing(path):
    """读取已有的 real_data.js，解析出 window.REALDATA 内容。
    轨迹拆分存储在 real_tracks.js，这里自动合回活动上（保证增量合并不丢轨迹）。"""
    if not os.path.exists(path):
        return {"profile": None, "activities": [], "checkins": []}
    try:
        with open(path, encoding="utf-8") as f:
            txt = f.read()
        marker = txt.index("window")
        s = txt.index("{", marker)
        e = txt.rindex("}") + 1
        data = json.loads(txt[s:e])
    except Exception:
        return {"profile": None, "activities": [], "checkins": []}
    tracks = _load_tracks(path)
    if tracks:
        for a, t in zip(data.get("activities", []), tracks):
            if t:
                a["track"] = t
    return data


def _key(a):
    return f"{a.get('date')}|{a.get('title')}|{a.get('distanceKm')}|{a.get('movingTimeSec')}"


# 平台优先级：高驰数据更准（含真实标题/心率/GPS），重复时以高驰为准
_SOURCE_RANK = {"coros": 2, "keep": 1}


def _rank(src):
    return _SOURCE_RANK.get(src or "", 0)


# 训练动作名片段 → 习惯打卡 item 键（与 fetch_keep.TRAINING_HABIT_MAP 保持一致）
_HABIT_NAME_MAP = {
    "平板支撑": "plank",
    "俯卧撑": "pushup",
    "卷腹": "situp",
    "仰卧起坐": "situp",
    "深蹲": "squat",
}


def _habit_key_from_name(name):
    for kw, key in _HABIT_NAME_MAP.items():
        if kw in (name or ""):
            return key
    return None


def derive_checkins(activities):
    """兜底：从已有 activities 按动作名关键词派生打卡记录。

    保证即使 fetch_keep 未传 checkins（或训练类来自高驰），打卡板块仍有数据。
    返回 [{item, date, reps, sec}, ...]，按 (item,date) 去重。
    注意：活动本身不含真实次数（Keep 的 actualRep 只在详情接口里有），
    因此这里 reps 恒为 None，时长放 sec —— 严禁拿时长秒数冒充次数。
    """
    out = []
    seen = set()
    for a in activities:
        key = _habit_key_from_name(a.get("title"))
        if not key:
            continue
        date = a.get("date")
        ck = (key, date)
        if ck in seen:
            continue
        seen.add(ck)
        sec = a.get("movingTimeSec") or None
        out.append({"item": key, "date": date, "reps": None, "sec": int(sec) if sec else None})
    return out


def _fuzzy_dup(new, existing):
    """跨平台重复判定（用于 Coros→Keep 同步场景）。

    当两条记录 同日 + 同运动类型 + 距离接近 + 时长接近 时，视为同一次运动，
    即使标题/数值因导出方式不同而有差异，也判定为重复。
    """
    if not new.get("date") or new.get("date") != existing.get("date"):
        return False
    if new.get("type") != existing.get("type"):
        return False
    nd, ed = new.get("distanceKm") or 0, existing.get("distanceKm") or 0
    nt, et = new.get("movingTimeSec") or 0, existing.get("movingTimeSec") or 0
    # 距离容差：0.3km 或 3%，取较大者
    if abs(nd - ed) > max(0.3, 0.03 * max(nd, ed, 1)):
        return False
    # 时长容差：120s 或 5%，取较大者
    if abs(nt - et) > max(120, 0.05 * max(nt, et, 1)):
        return False
    # 无距离的活动（训练/核心动作，distance≈0）必须按动作名去重：同日同类但不同动作
    # （如 卷腹 vs 俯卧撑）时长往往相近，若只靠时间容差会被误判为同一条而互相覆盖、丢失记录。
    if max(nd, ed) < 0.01:
        nk = _habit_key_from_name(new.get("title")) or (new.get("title") or "").strip()
        ek = _habit_key_from_name(existing.get("title")) or (existing.get("title") or "").strip()
        if nk and ek and nk != ek:
            return False
    return True


def _rebuild_checkins(activities, existing_checkins, incoming_checkins):
    """由合并后的活动重建打卡列表（按 动作+日期 去重）。

    字段语义（勿混）：
      · reps = 真实次数（俯卧撑/卷腹/深蹲，来自 Keep traininglog 的 actualRep）；
      · sec  = 时长秒数（全部动作都有；平板支撑只有秒数没有次数）。
    reps 与 sec 严格分开：历史上曾把时长秒数回退成"次数"存进 reps，导致
    统计口径错乱（如"卷腹 240 个"实为 240 秒）。重建时优先沿用既有/传入值，
    活动级信息只用于补 sec（活动不含真实次数）。
    """
    reps = {}
    sec = {}
    for c in (existing_checkins or []):
        ik = (c.get("item"), c.get("date"))
        if c.get("reps") is not None:
            reps[ik] = int(c["reps"])
        if c.get("sec") is not None:
            sec[ik] = int(c["sec"])
    for c in (incoming_checkins or []):
        ik = (c.get("item"), c.get("date"))
        if c.get("reps") is not None:
            reps[ik] = int(c["reps"])
        if c.get("sec") is not None:
            sec[ik] = int(c["sec"])
    # 同日同动作可能有多条活动（如早晚各一次卷腹）：sec 累加，reps 取首个非空
    agg = {}
    order = []
    for a in activities:
        hk = _habit_key_from_name(a.get("title"))
        if not hk:
            continue
        ck = (hk, a.get("date"))
        if ck not in agg:
            agg[ck] = {"sec": 0, "reps": None}
            order.append(ck)
        agg[ck]["sec"] += int(a.get("movingTimeSec") or 0)
        if agg[ck]["reps"] is None and a.get("reps"):
            agg[ck]["reps"] = int(a["reps"])
    out = []
    for ck in order:
        e = agg[ck]
        r = reps.get(ck) if reps.get(ck) is not None else e["reps"]
        s = sec.get(ck) if sec.get(ck) is not None else e["sec"]
        out.append({
            "item": ck[0],
            "date": ck[1],
            "reps": int(r) if r else None,
            "sec": int(s) if s else None,
        })
    return out


def merge_and_write(new_activities, profile=None, checkins=None, out_path=None, source=None):
    if out_path is None:
        here = os.path.dirname(os.path.abspath(__file__))
        out_path = os.path.join(here, "..", "assets", "js", "real_data.js")
    out_path = os.path.abspath(out_path)

    data = load_existing(out_path)

    # 合并策略（增量友好）：
    #   · 保留全部既有活动（含本源历史），不再「整源丢弃」——
    #     否则增量同步时本源只返回新活动，会把历史全清掉（曾导致 Keep 3500+ 记录丢失）。
    #   · 遍历本次新增活动，按以下规则并入 merged（初始为全部既有记录）：
    #       - 同源(模糊相同) → 用新拉取的覆盖旧记录（允许更新/重分类）；
    #       - 跨源模糊重复 → 既有优先级 >= 本次则丢弃本次，否则用本次覆盖既有。
    #   即「高驰的轨迹优先」：同场运动两平台都有时只保留高驰那条；本源重拉则原地更新。
    merged = list(data["activities"])
    for a in new_activities:
        a_src = source or a.get("source") or ""
        a_rank = _rank(a_src)
        handled = False
        for i, o in enumerate(merged):
            if not _fuzzy_dup(a, o):
                continue
            o_src = o.get("source") or ""
            o_rank = _rank(o_src)
            if o_src == a_src:
                # 同源：以新拉取的覆盖旧记录（允许更新/重分类）
                merged[i] = a
            elif o_rank >= a_rank:
                # 跨源且既有优先级更高或相等 → 丢弃本次，保留既有
                print(f"↺ 去重跳过（与 {o_src} 重复）: {a.get('date')} {a.get('title')} "
                      f"{a.get('distanceKm')}km")
                handled = True
                break
            else:
                # 跨源且本次优先级更高 → 替换既有记录
                print(f"⇄ 以高优先级 {a_src} 覆盖 {o_src}: "
                      f"{a.get('date')} {a.get('title')} {a.get('distanceKm')}km")
                merged[i] = a
            handled = True
            break
        if not handled:
            merged.append(a)

    data["activities"] = merged
    data["activities"].sort(key=lambda a: a["date"])

    if profile:
        data["profile"] = profile

    # 重建打卡：由合并后的全部活动按「动作 + 日期」去重派生；reps 优先用既有/本次传入
    # 打卡里的精确值（Keep traininglog 的 actualRep），缺失时回退到活动时长。
    # 此前用 title|距离|时长 作去重键，而打卡记录无这些字段，导致同一天多条打卡被错误
    # 合并成一条（如 2026-08-24 只留下深蹲，卷腹/俯卧撑/平板支撑丢失）。
    data["checkins"] = _rebuild_checkins(merged, data.get("checkins", []), checkins)
    if not data["checkins"]:
        derived = derive_checkins(merged)
        if derived:
            data["checkins"] = derived
            print(f"↪ 从活动派生 {len(derived)} 条打卡（未从上游接收到 checkins）")

    # 轨迹拆分：real_data.js 只存活动摘要（首屏体积从 ~7MB 降到 <1MB），
    # GPS 轨迹按活动顺序写入 real_tracks.js（数组对齐，无轨迹处 null），
    # 由前端异步注入加载后再渲染轨迹墙/地图/足迹。
    # 注意：拆出的轨迹已在内存 data 中移除，须先取引用再写文件。
    tracks = []
    for a in data["activities"]:
        t = a.pop("track", None)
        tracks.append(t if t else None)

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("// 由 tools/sync_*.py 自动生成，请勿手动编辑\n")
        f.write("window.REALDATA = ")
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write(";\n")

    tracks_path = os.path.join(os.path.dirname(out_path), "real_tracks.js")
    with open(tracks_path, "w", encoding="utf-8") as f:
        f.write("// 由 tools/realdata.py 自动生成（轨迹与 REALDATA.activities 按下标对齐），请勿手动编辑\n")
        f.write("window.REALTRACKS = ")
        json.dump(tracks, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    print(f"✅ 已写入 {out_path}（共 {len(data['activities'])} 条活动）"
          f" + {tracks_path}（{sum(1 for t in tracks if t)} 条轨迹）")
