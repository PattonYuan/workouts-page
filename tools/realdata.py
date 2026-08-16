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


def merge_and_write(new_activities, profile=None, checkins=None, out_path=None):
    if out_path is None:
        here = os.path.dirname(os.path.abspath(__file__))
        out_path = os.path.join(here, "..", "assets", "js", "real_data.js")
    out_path = os.path.abspath(out_path)

    data = load_existing(out_path)

    seen = {_key(a) for a in data["activities"]}
    for a in new_activities:
        k = _key(a)
        if k not in seen:
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
