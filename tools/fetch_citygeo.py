#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_citygeo.py — 下载足迹地图涉及城市的边界 GeoJSON，简化后打包为 assets/js/real_citygeo.js

数据源：DataV.GeoAtlas（阿里）https://geo.datav.aliyun.com/areas_v3/bound/{adcode}.json
  - 用 {adcode}.json（城市整体轮廓，非 _full 分区版），单城 ~25KB
  - 坐标系 GCJ-02：城市级 choropleth 场景下 ~300-500m 偏移不可见，可接受
简化：坐标保留 4 位小数（~11m）+ Douglas-Peucker（eps=0.004° ≈ 400m）
输出：window.REAL_CITYGEO = { type:"FeatureCollection", features:[...] }（紧凑 JSON）
      app.js 与 real_tracks.js 一样异步注入加载

用法：
  /Users/yuanpengtao/opt/anaconda3/bin/python tools/fetch_citygeo.py            # 全量下载
  /Users/yuanpengtao/opt/anaconda3/bin/python tools/fetch_citygeo.py --out /tmp/x.js  # 干跑
"""
import json
import math
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
OUT_DEFAULT = os.path.join(ROOT, "assets", "js", "real_citygeo.js")

# 与 data.js FOOTPRINT_CITIES 一一对应（zh -> adcode）
CITY_ADCODE = {
    "北京": "110000", "上海": "310000", "深圳": "440300", "广州": "440100",
    "绍兴": "330600", "杭州": "330100", "南京": "320100", "苏州": "320500",
    "宁波": "330200", "温州": "330300", "金华": "330700", "台州": "331000",
    "武汉": "420100", "长沙": "430100", "成都": "510100", "重庆": "500000",
    "西安": "610100", "郑州": "410100", "新乡": "410700", "晋城": "140500",
    "周口": "411600", "济南": "370100", "青岛": "370200", "天津": "120000",
    "香港": "810000", "澳门": "820000", "珠海": "440400", "东莞": "441900",
    "佛山": "440600", "中山": "442000", "惠州": "441300", "清远": "441800",
    "南宁": "450100", "北海": "450500", "百色": "451000", "海口": "460100",
    "三亚": "460200", "昆明": "530100", "厦门": "350200", "福州": "350100",
}

BASE = "https://geo.datav.aliyun.com/areas_v3/bound/{}.json"
ROUND = 4          # 小数位数
EPS = 0.004        # DP 简化容差（度）


def _round_pt(p):
    return [round(p[0], ROUND), round(p[1], ROUND)]


def _perp_dist(p, a, b):
    """点 p 到线段 ab 的距离（度）"""
    ax, ay = a; bx, by = b; px, py = p
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _dp(points, eps):
    """Douglas-Peucker，闭环首尾点相同也可用"""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        dmax, idx = 0.0, -1
        for k in range(i + 1, j):
            d = _perp_dist(points[k], points[i], points[j])
            if d > dmax:
                dmax, idx = d, k
        if dmax > eps:
            keep[idx] = True
            stack.append((i, idx)); stack.append((idx, j))
    return [p for p, k in zip(points, keep) if k]


def simplify_coords(coords):
    """递归处理 Polygon / MultiPolygon 的所有 ring"""
    if isinstance(coords[0][0], (int, float)):   # ring: [[x,y],...]
        pts = [_round_pt(p) for p in coords]
        out = _dp(pts, EPS)
        return out if len(out) >= 4 else pts
    return [simplify_coords(c) for c in coords]


def fetch(adcode, retries=3):
    url = BASE.format(adcode)
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "workouts-page/1.0"})
            with urllib.request.urlopen(req, timeout=15) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            last = e
            print(f"  retry {i + 1}/{retries} for {adcode}: {e}")
    raise SystemExit(f"下载失败 {adcode}: {last}")


def main():
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else OUT_DEFAULT
    features = []
    total_raw = total_simpl = 0
    for zh, ad in CITY_ADCODE.items():
        data = fetch(ad)
        feats = data.get("features") or []
        if not feats:
            raise SystemExit(f"{zh}({ad}) 无 features")
        # 合并同 adcode 的多 feature（个别城市可能拆多块）
        for f in feats:
            props = f.get("properties") or {}
            geom = f.get("geometry") or {}
            if not geom.get("coordinates"):
                continue
            raw = json.dumps(geom["coordinates"])
            simpl = simplify_coords(geom["coordinates"])
            total_raw += len(raw)
            total_simpl += len(json.dumps(simpl))
            features.append({
                "type": "Feature",
                "properties": {
                    "adcode": props.get("adcode") or int(ad),
                    "name": props.get("name") or zh,
                },
                "geometry": {"type": geom["type"], "coordinates": simpl},
            })
        print(f"✓ {zh} {ad} {props.get('name', '')} features={len(feats)}")

    fc = {"type": "FeatureCollection", "features": features}
    body = json.dumps(fc, ensure_ascii=False, separators=(",", ":"))
    js = (
        "// 由 tools/fetch_citygeo.py 自动生成（数据源 DataV.GeoAtlas，GCJ-02，已 DP 简化），请勿手动编辑\n"
        "window.REAL_CITYGEO = " + body + ";\n"
    )
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(js)
    print(f"\n原始坐标 {total_raw / 1e6:.2f} MB → 简化后 {total_simpl / 1e6:.2f} MB")
    print(f"输出 {out}（{os.path.getsize(out) / 1024:.0f} KB，{len(features)} features）")


if __name__ == "__main__":
    main()
