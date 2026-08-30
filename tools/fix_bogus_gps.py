#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fix_bogus_gps.py — 清除 Keep 无 GPS 时的「回退坐标」污染

问题：Keep 在活动没有真实 GPS 信号（室内训练、手动记录、信号丢失等）时，
会把轨迹起点 / 整条轨迹钉在一个固定的回退坐标 [39.908201, 116.390984]（北京），
导致这些活动被错误归因到北京，污染「足迹地图 / 城市热度」模式，并让用户在
热力图上误以为 2026 年还有北京的活动。

本脚本把「整条轨迹所有点都精确落在该回退坐标（6 位小数相等）」的退化轨迹清空
（置 null）：这些活动不再在地图/足迹里显示，但活动本身（日期 / 距离 / 时长）
仍保留在统计与年度热力图中（日期是正确的，错的只是定位）。

只修改 real_tracks.js（real_data.js 中的活动已不带 track 字段、无需改动）。
可重复运行：已为 null 的轨迹不会被重复处理。
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TRACKS_PATH = os.path.join(HERE, "..", "assets", "js", "real_tracks.js")

# Keep 无 GPS 时的固定回退坐标（北京）。6 位小数精确相等才判定为退化轨迹，
# 避免误伤真实落在北京、坐标各异的活动。
DEFAULT = (39.908201, 116.390984)


def _near_default(p):
    return round(p[0], 6) == DEFAULT[0] and round(p[1], 6) == DEFAULT[1]


def is_bogus(track):
    if not track or len(track) < 1:
        return False
    return all(_near_default(p) for p in track)


def main():
    if not os.path.exists(TRACKS_PATH):
        sys.exit(f"❌ 未找到 {TRACKS_PATH}")
    with open(TRACKS_PATH, encoding="utf-8") as f:
        txt = f.read()
    s = txt.index("[")
    e = txt.rindex("]") + 1
    tracks = json.loads(txt[s:e])

    n_total = sum(1 for t in tracks if t)
    n_fixed = 0
    for i, tr in enumerate(tracks):
        if is_bogus(tr):
            tracks[i] = None
            n_fixed += 1

    head = txt[:s]
    tail = txt[e:]
    out = head + json.dumps(tracks, ensure_ascii=False, separators=(",", ":")) + tail
    with open(TRACKS_PATH, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"✅ 已清空 {n_fixed} 条 Keep 回退坐标（北京）退化轨迹；"
          f"清空前轨迹 {n_total} 条，清空后 {n_total - n_fixed} 条。")


if __name__ == "__main__":
    main()
