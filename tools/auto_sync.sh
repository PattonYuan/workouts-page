#!/usr/bin/env bash
# ============================================================================
# 运动主页 全量自动同步脚本（本机定时运行，无需 WorkBuddy 介入）
# 串联：高驰 Coros 拉取 + Keep 训练/步行/跑步拉取 → 合并 → 提交 → 推送 GitHub Pages
#
# 用法：
#   手动运行：  bash /Users/yuanpengtao/WorkBuddy/Personal/workouts-page/tools/auto_sync.sh
#   不推送：    bash .../auto_sync.sh --no-push
#
# 定时（cron 示例，每天 03:17 跑）：
#   17 3 * * * /Users/yuanpengtao/WorkBuddy/Personal/workouts-page/tools/auto_sync.sh >> /Users/yuanpengtao/WorkBuddy/Personal/workouts-page/logs/auto_sync.log 2>&1
# ============================================================================
set -u

PROJ="/Users/yuanpengtao/WorkBuddy/Personal/workouts-page"
PY="/Users/yuanpengtao/opt/anaconda3/bin/python"
REMOTE_BRANCH="main"
CONFIG="$HOME/github/running_page/config.yaml"
PUSH=1
TS="$(date '+%Y-%m-%d %H:%M:%S')"

for a in "$@"; do
  case "$a" in
    --no-push) PUSH=0 ;;
  esac
done

mkdir -p "$PROJ/logs"
cd "$PROJ" || exit 1

# 0. 基础设置（绕过沙箱 HTTP2 报错）
git config --global http.version HTTP/1.1

echo "=============================="
echo "[$TS] 开始自动同步"
echo "=============================="

# 1. 高驰 Coros（中国区 teamcnapi，凭证在 config.yaml）
if [ -f "$CONFIG" ]; then
  echo "==> [1/3] 拉取高驰活动 ..."
  if "$PY" tools/fetch_coros.py >> "$PROJ/logs/auto_sync.log" 2>&1; then
    "$PY" tools/sync_fit.py --parse coros_activities >> "$PROJ/logs/auto_sync.log" 2>&1 \
      && echo "    高驰 OK" \
      || echo "    ⚠️ 高驰解析失败（见日志）"
  else
    echo "    ⚠️ 高驰拉取失败（见日志），跳过此源"
  fi
else
  echo "    ⚠️ 未找到 Coros 凭证 $CONFIG，跳过高驰"
fi

# 2. Keep（训练类 + 步行 + 跑步，含每日打卡 checkins）
echo "==> [2/3] 拉取 Keep 活动 ..."
if KEEP_ENABLED=true "$PY" tools/fetch_keep.py >> "$PROJ/logs/auto_sync.log" 2>&1; then
  echo "    Keep OK"
else
  echo "    ⚠️ Keep 拉取失败（见日志），保留已有数据"
fi

# 3. 提交 + 推送（仅在有变化时）
echo "==> [3/3] 检查变更并提交 ..."
# 只检测数据文件本身，避免把 untracked 脚本/日志误判为"有变化"
if git diff --quiet assets/js/real_data.js 2>/dev/null; then
  # 无变化
  echo "    ✅ 无新增数据，无需提交/推送"
else
  git add assets/js/real_data.js
  git commit -m "auto sync: $(date '+%Y-%m-%d') 数据更新" >> "$PROJ/logs/auto_sync.log" 2>&1 \
    && echo "    已提交" \
    || echo "    ⚠️ 提交失败"
  if [ "$PUSH" = "1" ]; then
    # 探测本机代理（Clash/Shadowrocket/ghlper 等），找到才 push
    PROXY_PORT=""
    for p in 7890 7891 7892 7893 1080 1081 8080 33210 33211 52074 63863 62459; do
      if (exec 3<>/dev/tcp/127.0.0.1/$p) 2>/dev/null; then
        exec 3>&-
        code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 -x "http://127.0.0.1:$p" https://github.com 2>/dev/null)
        if [ "$code" != "000" ] && [ -n "$code" ]; then
          PROXY_PORT=$p; break
        fi
      fi
    done
    if [ -z "$PROXY_PORT" ]; then
      echo "    ⚠️ 未检测到本机代理（Clash/Shadowrocket 未运行？），已提交本地，待代理开启后重跑可补推"
    else
      echo "    使用代理 127.0.0.1:$PROXY_PORT 推送中 ..."
      export HTTP_PROXY="http://127.0.0.1:$PROXY_PORT"
      export HTTPS_PROXY="http://127.0.0.1:$PROXY_PORT"
      export http_proxy="$HTTP_PROXY"
      export https_proxy="$HTTPS_PROXY"
      ok=0
      for i in $(seq 1 15); do
        if git push origin "$REMOTE_BRANCH" >> "$PROJ/logs/auto_sync.log" 2>&1; then
          ok=1; echo "    ✅ 推送成功，GitHub Pages 将重新部署"; break
        fi
        sleep 20
      done
      [ "$ok" = "0" ] && echo "    ⚠️ 推送失败（代理 502 或不稳），本地已提交，可稍后手动 git push"
      unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy
    fi
  else
    echo "    ℹ️ 已跳过推送（--no-push）"
  fi
else
  echo "    ✅ 无新增数据，无需提交/推送"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 自动同步结束"
