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
    # 不同源（如 coros + keep）则累加，互不覆盖。
    if source:
        data["activities"] = [a for a in data["activities"] if a.get("source") != source]
    else:
        # 兼容旧调用（不带 source）：整文件由本次结果替换
        data["activities"] = []

    # 其它平台已有活动（用于跨平台去重判定）
    others = list(data["activities"])
    seen = {_key(a) for a in data["activities"]}
    for a in new_activities:
        k = _key(a)
        if k in seen:
            continue  # 完全一致的重复（如同文件重跑）
        if source:
            # 跨平台模糊去重：若与某个更高/同级优先级的平台记录重复，则丢弃本次（保留既有）
            a_rank = _rank(source)
            matched = False
            for o in others:
                if _fuzzy_dup(a, o):
                    o_rank = _rank(o.get("source"))
                    if o_rank >= a_rank:
                        print(f"↺ 去重跳过（与 {o.get('source')} 重复）: {a.get('date')} {a.get('title')} "
                              f"{a.get('distanceKm')}km")
                        matched = True
                        break
                    # 否则本次优先级更高（如 coros 重跑撞上 keep 原生记录），保留本次
            if matched:
                continue
        data["activities"].append(a)
        seen.add(k)
    data["activities"].sort(key=lambda a: a["date"])

    if profile:
        data["profile"] = profile

    if checkins:
        cseen = {_key(c) for c in data["checkins"]}
        for c in checkins:
            if _key(c) not in cseen:
                data["checkins"].append(c)
                cseen.add(_key(c))

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("// 由 tools/sync_*.py 自动生成，请勿手动编辑\n")
        f.write("window.REALDATA = ")
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write(";\n")

    print(f"✅ 已写入 {out_path}（共 {len(data['activities'])} 条活动）")
