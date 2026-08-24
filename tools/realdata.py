#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
realdata.py — 真实运动数据的统一读写（被 sync_coros.py / sync_keep.py 共用）

负责把各平台的活动合并写入 assets/js/real_data.js（window.REALDATA）。
多平台分别运行各自的脚本时，活动会累加而非互相覆盖（按 日期|标题|距离|时长 去重）。
"""
import json
import os


def load_existing(path):
    """读取已有的 real_data.js，解析出 window.REALDATA 内容。"""
    if not os.path.exists(path):
        return {"profile": None, "activities": [], "checkins": []}
    try:
        with open(path, encoding="utf-8") as f:
            txt = f.read()
        marker = txt.index("window")
        s = txt.index("{", marker)
        e = txt.rindex("}") + 1
        return json.loads(txt[s:e])
    except Exception:
        return {"profile": None, "activities": [], "checkins": []}


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
    返回 [{item, date, reps}, ...]，按 (item,date) 去重。
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
        # reps：优先活动自带（Keep 详情已填 actualRep/actualSec），否则用时长兜底
        reps = a.get("reps") or a.get("movingTimeSec") or 1
        out.append({"item": key, "date": date, "reps": int(reps)})
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
    return True


def merge_and_write(new_activities, profile=None, checkins=None, out_path=None, source=None):
    if out_path is None:
        here = os.path.dirname(os.path.abspath(__file__))
        out_path = os.path.join(here, "..", "assets", "js", "real_data.js")
    out_path = os.path.abspath(out_path)

    data = load_existing(out_path)

    # 同源替换：重新解析（如分类规则变更/重拉）时，先丢弃旧的同源活动，
    # 再写入新解析结果，避免旧分类（如摩托骑行被误判为训练）残留。
    # 不同源（如 coros + keep）则保留其它源，本源重新写入。
    if source:
        existing_others = [a for a in data["activities"] if a.get("source") != source]
    else:
        # 兼容旧调用（不带 source）：整文件由本次结果替换
        existing_others = []

    # 跨平台去重（核心）：以 higher-rank 平台为准，且「直接替换」低优先级平台的
    # 重复记录，而不是让两者共存——否则热力图/统计会重复计数。
    #   · 高驰(coros, rank2) 重跑撞上 keep(rank1) 已存在记录 → 用高驰覆盖 keep；
    #   · keep 新拉撞上高驰已存在记录 → 丢弃 keep，保留高驰。
    # 即「高驰的轨迹优先」：同一场运动在两平台都有记录时，最终只保留高驰那条（含真实 GPS）。
    merged = list(existing_others)
    for a in new_activities:
        a_rank = _rank(source) if source else 0
        skip = False
        replace_idx = None
        for i, o in enumerate(merged):
            if _fuzzy_dup(a, o):
                o_rank = _rank(o.get("source"))
                if o_rank >= a_rank:
                    # 既有记录优先级更高或相等 → 丢弃本次（保留既有）
                    print(f"↺ 去重跳过（与 {o.get('source')} 重复）: {a.get('date')} {a.get('title')} "
                          f"{a.get('distanceKm')}km")
                    skip = True
                    break
                # 本次优先级更高（如 coros 覆盖 keep）→ 替换既有记录
                replace_idx = i
                break
        if skip:
            continue
        if replace_idx is not None:
            print(f"⇄ 以高优先级 {source} 覆盖 {merged[replace_idx].get('source')}: "
                  f"{a.get('date')} {a.get('title')} {a.get('distanceKm')}km")
            merged[replace_idx] = a
        else:
            merged.append(a)

    data["activities"] = merged
    data["activities"].sort(key=lambda a: a["date"])

    if profile:
        data["profile"] = profile

    if checkins:
        cseen = {_key(c) for c in data["checkins"]}
        for c in checkins:
            if _key(c) not in cseen:
                data["checkins"].append(c)
                cseen.add(_key(c))

    # 兜底：若最终仍无打卡数据，从已有活动按动作名派生（保证训练类总能打卡）
    if not data.get("checkins"):
        derived = derive_checkins(merged)
        if derived:
            data["checkins"] = derived
            print(f"↪ 从活动派生 {len(derived)} 条打卡（未从上游接收到 checkins）")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("// 由 tools/sync_*.py 自动生成，请勿手动编辑\n")
        f.write("window.REALDATA = ")
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write(";\n")

    print(f"✅ 已写入 {out_path}（共 {len(data['activities'])} 条活动）")
