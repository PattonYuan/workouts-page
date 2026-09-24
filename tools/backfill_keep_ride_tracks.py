#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
backfill_keep_ride_tracks.py — 定向回填 Keep 骑行 GPS 轨迹（不重扫全部活动）。

背景：此前全量重扫（fetch_keep 扫 walking 全量流 + 每条 outdoor walk/ride 调详情接口）
在长会话下连接被拖垮、卡死且耗时数小时。本脚本只走 type=cycling 列表接口拿全部骑行
摘要(id/名称/距离/时长)，再逐条 cyclinglog 补 GPS 轨迹，最后 merge_and_write 同源覆盖
旧的无轨迹骑行记录。walks/runs/hikes/training 不受影响（不重拉）。

用法：
  KEEP_ENABLED=true python tools/backfill_keep_ride_tracks.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fetch_keep as fk
from realdata import merge_and_write

OUT_LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "logs", "backfill_ride.log")


def main():
    fk._load_dotenv()
    mobile = os.environ.get("KEEP_MOBILE")
    password = os.environ.get("KEEP_PASSWORD")
    if not (mobile and password):
        sys.exit("❌ 未找到 Keep 凭据（KEEP_MOBILE / KEEP_PASSWORD）")

    client = fk.KeepClient().login(mobile, password)

    rides = []
    failed = 0
    last = 0
    page = 0
    while True:
        r = client._req(fk.STATS_API.format(type="cycling", last_date=last))
        if not r or not r.get("data"):
            break
        data = r["data"]
        for rec in data.get("records", []):
            for log in rec.get("logs", []):
                st = log.get("stats")
                if not isinstance(st, dict):
                    continue
                if not fk._is_ride(st):
                    continue
                try:
                    act = fk._build_ride(client, st)
                except Exception as e:  # noqa: BLE001
                    failed += 1
                    print(f"  ⚠️ 骑行解析失败 {st.get('id')}: {e}")
                    continue
                if act:
                    rides.append(act)
                    tag = " (含GPS轨迹)" if act["track"] else " (无轨迹)"
                    print(f"  + {act['date']} [ride] {act['title']} {act['distanceKm']}km{tag}")
        page += 1
        nl = data.get("lastTimestamp", 0)
        if not nl or nl == last:
            break
        last = nl
        time.sleep(0.4)

    with_track = sum(1 for a in rides if a["track"])
    print(f"── 共拉取 Keep 骑行 {len(rides)} 条（含 GPS 轨迹 {with_track} 条，解析失败 {failed} 条）")

    if not rides:
        print("⚠️ 未拉到任何骑行，跳过写入。")
        return

    merge_and_write(rides, source="keep")
    print("✅ 骑行轨迹定向回填完成")


if __name__ == "__main__":
    main()
