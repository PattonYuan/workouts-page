# 运动主页每日数据同步与发布 — 执行记录

## 2026-08-17 23:55 (GMT+8)
- 准备：git HTTP/1.1 已设置；remote origin = https://github.com/PattonYuan/workouts-page.git（已存在）。
- Keep 同步：失败。运行 `tools/fetch_keep.py`，登录接口返回 HTTP 400（Keep 登录失败，接口可能已变更或凭据被拒）。按规则记录并跳过，未报错退出。
- 高驰同步：跳过。凭据缺失——`tools/.env` 中 COROS_EMAIL/COROS_PASSWORD 为空，且 `~/github/running_page/config.yaml` 的 coros.email/password 也为空，无可用凭证。未运行 fetch_coros.py / sync_fit.py。
- real_data.js 变化检查：git status --short 为空，文件无改动。
- 提交：无（无变化）。
- 推送：无（无提交，故未执行 `git push`）。
- 结论：本次无数据更新，无需发布。需后续排查 Keep 登录接口（HTTP 400）与补填高驰凭证。

## 2026-08-18 23:55 (GMT+8)
- 准备：git HTTP/1.1 已设置；remote origin = https://github.com/PattonYuan/workouts-page.git（已存在）。
- Keep 同步：失败。运行 `tools/fetch_keep.py` 登录接口返回 HTTP 400（凭证仍为占位符 你的手机号/你的密码，接口拒绝）。按规则记录并跳过。
- 高驰同步：成功。tools/.env 中 COROS_EMAIL/PASSWORD 为空，回退读取 ~/github/running_page/config.yaml 的 coros 凭证成功。fetch_coros.py：账号共 298 个活动，本地已有 295，本次新增下载 3 个；sync_fit.py --parse coros_activities：解析 298 条活动并写入 assets/js/real_data.js。
- real_data.js 变化检查：git status --short 显示 `M assets/js/real_data.js`（1928 行新增）。已 add 并提交 `git commit -m "自动同步：Keep/高驰 数据更新"`（1 file changed, 1928 insertions）。
- 推送：成功 `git push origin main`（8c8a627..88285ab main -> main），GitHub Pages Actions 将重新部署。
- 结论：高驰新增 3 条运动记录，已提交并推送发布；Keep 登录仍待修复（占位凭证）。

## 2026-08-19 00:00 (GMT+8)
- 准备：git HTTP/1.1 已设置；remote origin = https://github.com/PattonYuan/workouts-page.git（已存在）。
- Keep 同步：失败。运行 `tools/fetch_keep.py` 登录接口返回 HTTP 400（Keep 登录失败，凭证被拒或接口已变更）。按规则记录并跳过，未报错退出。
- 高驰同步：成功。tools/.env 中 COROS_EMAIL/PASSWORD 为空，回退读取 ~/github/running_page/config.yaml 的 coros 凭证成功。fetch_coros.py：账号共 298 个活动，本地已有 298，本次新增下载 0 个（已是最新）；sync_fit.py --parse coros_activities：解析 298 条活动并重写 assets/js/real_data.js（内容与已提交版本一致）。
- real_data.js 变化检查：git status --short 未列出该文件，diff --stat 为空，确认无改动。
- 提交：无（real_data.js 无变化）。
- 推送：无（无提交，故未执行 `git push`）。
- 结论：本次高驰无新增记录，数据已是最新，无需发布；Keep 登录仍待修复（HTTP 400）。

## 2026-08-22 00:03 (GMT+8)
- 准备：git HTTP/1.1 已设置；remote origin 已存在。
- Keep 同步：失败（持续问题）。`tools/fetch_keep.py` 登录接口返回 HTTP 400（Keep 登录失败，凭证被拒或接口已变更）。按规则记录并跳过。
- 高驰同步：成功。tools/.env 中 COROS_EMAIL/PASSWORD 为空，回退读取 ~/github/running_page/config.yaml 凭证成功。fetch_coros.py：账号共 299 个活动，本地已有 298，本次新增下载 1 个；sync_fit.py --parse：解析 299 条活动并重写 real_data.js（648 行新增）。
- real_data.js 变化检查：有变化（648 行插入），已 add 并提交（`396a749`，1 file changed, 648 insertions）。
- 推送：成功 `git push origin main`（88285ab..396a749），Pages Actions 将重新部署。
- 用户要求查看问题并停止自动同步；已将该 automation 状态置为 PAUSED（保留配置，不再每日自动运行），后续由用户手动同步。
- 核心问题：Keep 登录接口持续 HTTP 400（自 08-17 起未修复，凭证为占位符），需另查登录接口或补真实手机号/密码；高驰同步正常可用。

## 2026-08-22 00:06 (GMT+8) — 用户决策：暂时只用 Coros，跳过 Keep
- 用户明确要求：暂时跳过 Keep，只用 Coros；以后需要再添加。
- 已在 `tools/fetch_keep.py` 主流程开头加开关：仅当环境变量 `KEEP_ENABLED` 为 1/true/yes/on 时才执行 Keep 登录与拉取；否则直接打印「⏭️ Keep 同步已禁用」并跳过。`tools/.env` 当前未设置该项，故默认跳过。
- 同步策略现状：Coros 凭证来自 `~/github/running_page/config.yaml`（可用）；Keep 暂不接入。若日后要恢复 Keep，先在 `tools/.env` 设 `KEEP_ENABLED=true` 并补真实 KEEP_MOBILE/KEEP_PASSWORD，再单独跑 `tools/fetch_keep.py`。
- 重新启用自动定时时，推荐只保留 Coros 相关步骤（fetch_coros.py + sync_fit.py + 提交/推送），不再调用 fetch_keep.py。
