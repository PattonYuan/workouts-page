#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
workout_to_obsidian.py
======================
把 workout page 同步得到的真实运动数据（assets/js/real_data.js 里的
window.REALDATA.activities[]）桥接到 Obsidian 周总结，做到：

  1) 自动仪表盘：周总结-自动聚合.md 的「⑤ 健身明细」区块用 DataviewJS 读取
     Notes/Research/workouts/_weekly.json，自动展示本周距离/时长/次数 + 按类型、
     keep/coros 来源拆分（复用 WEEK_OFFSET，可回溯任意周）。

  2) 手动周报：生成 Notes/Research/workouts/健身周报.md（近 N 周，可粘贴），
     供 Template/weekly report.md 的「健身」小节直接复制。

数据按「周一起始」聚合，与周总结仪表盘的周边界一致。

设计要点
--------
* 单个 JSON 文件覆盖所有周（幂等覆盖），DataviewJS 用 app.vault.adapter.read 读；
  同时输出 by_monday 索引（"2026-08-24" -> "2026-W35"），让仪表盘用"周一日期串"
  直接查周，彻底规避 JS/PY 各自算 ISO 周号可能不一致的风险。
* 不改动任何现有日记与周总结 ①②③④ 逻辑（追加式、可逆）。
* 仅用标准库（json/re/datetime/os/pathlib），与 auto_sync.sh 的 PY 一致即可。

用法
----
  python tools/workout_to_obsidian.py
  OBSIDIAN_VAULT=/path/to/Notes/Research python tools/workout_to_obsidian.py
  MD_WEEKS=8 python tools/workout_to_obsidian.py     # 可粘贴周报保留近 8 周
"""
import json
import os
import re
from datetime import date, datetime, timedelta
from pathlib import Path

PROJ = Path(__file__).resolve().parent.parent
REALDATA_JS = PROJ / "assets" / "js" / "real_data.js"

# Obsidian 库根（Notes/Research）。可用环境变量覆盖。
VAULT = Path(os.environ.get(
    "OBSIDIAN_VAULT",
    "/Users/yuanpengtao/Library/CloudStorage/OneDrive-mail.ecust.edu.cn/Notes/Research",
))
OUT_DIR = VAULT / "workouts"
OUT_JSON = OUT_DIR / "_weekly.json"
OUT_MD = OUT_DIR / "健身周报.md"

# 手动周报可粘贴窗口（近 N 周）
MD_WEEKS = int(os.environ.get("MD_WEEKS", "12"))

# 周报笔记（供 Obsidian Bases 读取）：最近 N 周，落在 workouts/weeks/周报-YYYY-Www.md
# 只出最近 N 周的原因：全量历史有 370+ 周，全部落盘会污染库和 OneDrive 同步。
WEEKS_DIR = OUT_DIR / "weeks"
NOTE_WEEKS = int(os.environ.get("NOTE_WEEKS", "26"))


def load_realdata(path: Path):
    """从 real_data.js 抽取 window.REALDATA = {...}; 并解析为 dict。"""
    if not path.exists():
        raise FileNotFoundError(f"未找到 {path}")
    txt = path.read_text(encoding="utf-8")
    m = re.search(r"window\.REALDATA\s*=\s*", txt)
    if not m:
        raise ValueError("real_data.js 中未找到 window.REALDATA 赋值")
    obj_str = txt[m.end():].strip().rstrip(";").strip()
    return json.loads(obj_str)


def monday_of(d: date) -> date:
    """返回 d 所在周的周一（weekday(): 周一=0）。"""
    return d - timedelta(days=d.weekday())


def iso_label(mon: date) -> str:
    """ISO 周标签，如 2026-W35（用周一日期算，跨年安全）。"""
    y, w, _ = mon.isocalendar()
    return f"{y}-W{w:02d}"


def round1(x):
    return round(x, 1)


def aggregate(activities):
    weeks = {}          # label -> payload
    by_monday = {}      # "YYYY-MM-DD" -> label
    for a in activities:
        ds = a.get("date")
        if not ds:
            continue
        try:
            d = datetime.strptime(ds, "%Y-%m-%d").date()
        except ValueError:
            continue
        mon = monday_of(d)
        label = iso_label(mon)
        mon_str = mon.isoformat()
        by_monday.setdefault(mon_str, label)
        w = weeks.setdefault(label, {
            "monday": mon_str,
            "sunday": (mon + timedelta(days=6)).isoformat(),
            "runKm": 0.0,
            "otherKm": 0.0,
            "moveMin": 0.0,
            "count": 0,
            "byType": {},
            "bySource": {},
            "activities": [],
        })
        km = float(a.get("distanceKm") or 0.0)
        sec = float(a.get("movingTimeSec") or 0.0)
        typ = (a.get("type") or "other").lower()
        src = (a.get("source") or "unknown").lower()
        if typ == "run":
            w["runKm"] += km
        else:
            w["otherKm"] += km
        w["moveMin"] += sec / 60.0
        w["count"] += 1

        bt = w["byType"].setdefault(typ, {"km": 0.0, "min": 0.0, "n": 0})
        bt["km"] += km
        bt["min"] += sec / 60.0
        bt["n"] += 1

        bs = w["bySource"].setdefault(src, {"km": 0.0, "min": 0.0, "n": 0})
        bs["km"] += km
        bs["min"] += sec / 60.0
        bs["n"] += 1

        w["activities"].append({
            "date": ds,
            "title": a.get("title", ""),
            "type": typ,
            "km": round1(km),
            "min": round1(sec / 60.0),
            "source": src,
        })

    # 四舍五入 + 活动按日期倒序
    for w in weeks.values():
        w["runKm"] = round1(w["runKm"])
        w["otherKm"] = round1(w["otherKm"])
        w["moveMin"] = round1(w["moveMin"])
        for bt in w["byType"].values():
            bt["km"] = round1(bt["km"]); bt["min"] = round1(bt["min"])
        for bs in w["bySource"].values():
            bs["km"] = round1(bs["km"]); bs["min"] = round1(bs["min"])
        w["activities"].sort(key=lambda x: x["date"], reverse=True)

    return weeks, by_monday


def build_markdown(weeks, md_weeks):
    """生成近 md_weeks 周的可粘贴周报（按周倒序）。"""
    labels = sorted(weeks.keys(), key=lambda l: weeks[l]["monday"], reverse=True)[:md_weeks]
    lines = ["---", "tags: [workout-weekly]", "type: workout-weekly-md", "---", ""]
    lines.append("# 🏋️ 健身周报（来自 workout page 自动同步）")
    lines.append("")
    lines.append("> 由 `tools/workout_to_obsidian.py` 自动生成，复制对应周内容粘贴进手动周报的「健身」小节即可。")
    lines.append("")
    for label in labels:
        w = weeks[label]
        lines.append(f"## {label}（{w['monday']} ~ {w['sunday']}）")
        lines.append("")
        lines.append("| 指标 | 值 |")
        lines.append("| --- | --- |")
        lines.append(f"| 🏃 跑步距离 | {w['runKm']} km |")
        lines.append(f"| 🚴 其他运动距离 | {w['otherKm']} km |")
        lines.append(f"| ⏱ 运动时长 | {round1(w['moveMin'])} min |")
        lines.append(f"| 🔢 运动次数 | {w['count']} 次 |")
        lines.append("")
        if w["byType"]:
            lines.append("**按类型**")
            for t, v in sorted(w["byType"].items(), key=lambda kv: -kv[1]["km"]):
                lines.append(f"- {t}: {v['km']} km / {round1(v['min'])} min / {v['n']} 次")
            lines.append("")
        if w["bySource"]:
            lines.append("**按来源**")
            for s, v in sorted(w["bySource"].items(), key=lambda kv: -kv[1]["km"]):
                lines.append(f"- {s}: {v['km']} km / {round1(v['min'])} min / {v['n']} 次")
            lines.append("")
        if w["activities"]:
            lines.append("**明细**")
            for a in w["activities"]:
                lines.append(f"- {a['date']}  {a['title']}（{a['type']}, {a['source']}）：{a['km']} km / {a['min']} min")
            lines.append("")
    return "\n".join(lines) + "\n"


def ensure_current_week(weeks, by_monday, today: date):
    """确保本周（即使 0 活动）也在 weeks 里，避免 Bases 视图落到上一周。"""
    mon = monday_of(today)
    label = iso_label(mon)
    mon_str = mon.isoformat()
    by_monday.setdefault(mon_str, label)
    if label not in weeks:
        weeks[label] = {
            "monday": mon_str,
            "sunday": (mon + timedelta(days=6)).isoformat(),
            "runKm": 0.0,
            "otherKm": 0.0,
            "moveMin": 0.0,
            "count": 0,
            "byType": {},
            "bySource": {},
            "activities": [],
        }
    return label


def build_week_note(label: str, w: dict) -> str:
    """单周周报笔记：frontmatter 供 Bases 读取，正文保留类型/来源/明细拆分。"""
    srcs = sorted(w["bySource"].keys())
    lines = [
        "---",
        "tags: [workout-weekly]",
        "type: workout-weekly",
        f"week: {label}",
        f"monday: {w['monday']}",
        f"sunday: {w['sunday']}",
        f"runKm: {w['runKm']}",
        f"otherKm: {w['otherKm']}",
        f"moveMin: {round1(w['moveMin'])}",
        f"count: {w['count']}",
    ]
    if srcs:
        lines.append("sources:")
        for s in srcs:
            lines.append(f"  - {s}")
    lines += ["---", ""]
    lines.append(f"# 🏋️ {label} 健身周报")
    lines.append("")
    lines.append(f"> {w['monday']}（周一） ~ {w['sunday']}（周日） ｜ 共 {w['count']} 次活动")
    lines.append("")
    lines.append("| 指标 | 值 |")
    lines.append("| --- | --- |")
    lines.append(f"| 🏃 跑步距离 (km) | {w['runKm']} |")
    lines.append(f"| 🚴 其他运动距离 (km) | {w['otherKm']} |")
    lines.append(f"| ⏱ 运动时长 (min) | {round1(w['moveMin'])} |")
    lines.append(f"| 🔢 运动次数 | {w['count']} |")
    lines.append("")
    if w["byType"]:
        lines.append("## 按类型")
        lines.append("")
        lines.append("| 类型 | 距离(km) | 时长(min) | 次数 |")
        lines.append("| --- | --- | --- | --- |")
        for t, v in sorted(w["byType"].items(), key=lambda kv: -kv[1]["km"]):
            lines.append(f"| {t} | {v['km']} | {round1(v['min'])} | {v['n']} |")
        lines.append("")
    if w["bySource"]:
        lines.append("## 按来源")
        lines.append("")
        lines.append("| 来源 | 距离(km) | 时长(min) | 次数 |")
        lines.append("| --- | --- | --- | --- |")
        for s, v in sorted(w["bySource"].items(), key=lambda kv: -kv[1]["km"]):
            lines.append(f"| {s} | {v['km']} | {round1(v['min'])} | {v['n']} |")
        lines.append("")
    if w["activities"]:
        lines.append("## 明细")
        lines.append("")
        for a in w["activities"][:40]:
            lines.append(f"- {a['date']}  {a['title']}（{a['type']}, {a['source']}）：{a['km']} km / {a['min']} min")
        if len(w["activities"]) > 40:
            lines.append(f"- …（共 {len(w['activities'])} 条，此处仅列最近 40 条）")
        lines.append("")
    return "\n".join(lines) + "\n"


def write_week_notes(weeks, note_weeks):
    """把最近 note_weeks 周写成独立笔记（幂等覆盖），供 Bases 视图聚合。"""
    WEEKS_DIR.mkdir(parents=True, exist_ok=True)
    labels = sorted(weeks.keys(), key=lambda l: weeks[l]["monday"], reverse=True)[:note_weeks]
    for label in labels:
        (WEEKS_DIR / f"周报-{label}.md").write_text(
            build_week_note(label, weeks[label]), encoding="utf-8")
    return labels


def main():
    data = load_realdata(REALDATA_JS)
    activities = data.get("activities", [])
    weeks, by_monday = aggregate(activities)
    ensure_current_week(weeks, by_monday, date.today())

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    payload = {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "source": "workouts-page/assets/js/real_data.js",
        "total_activities": len(activities),
        "by_monday": by_monday,
        "weeks": weeks,
    }
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[workout_to_obsidian] 写出 {OUT_JSON}：共 {len(weeks)} 周 / {len(activities)} 条活动")

    md = build_markdown(weeks, MD_WEEKS)
    OUT_MD.write_text(md, encoding="utf-8")
    print(f"[workout_to_obsidian] 写出 {OUT_MD}：近 {MD_WEEKS} 周")

    labels = write_week_notes(weeks, NOTE_WEEKS)
    span = f"{labels[-1]} ~ {labels[0]}" if labels else "无"
    print(f"[workout_to_obsidian] 写出 {WEEKS_DIR}/：{len(labels)} 个周报笔记（{span}）")

    # 提示本周标签，便于排查
    today_mon = monday_of(date.today()).isoformat()
    print(f"[workout_to_obsidian] 本周(周一 {today_mon}) -> {by_monday.get(today_mon, '无数据')}")


if __name__ == "__main__":
    main()
