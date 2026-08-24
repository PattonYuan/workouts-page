#!/usr/bin/env bash
# 运动主页 Coros 手动同步脚本（仅 Coros，跳过 Keep）
# 用法：
#   一键执行：  bash /Users/yuanpengtao/WorkBuddy/Personal/workouts-page/tools/sync_coros_only.sh
#   不推送：    bash /Users/yuanpengtao/WorkBuddy/Personal/workouts-page/tools/sync_coros_only.sh --no-push
set -e

PROJ="/Users/yuanpengtao/WorkBuddy/Personal/workouts-page"
PY="/Users/yuanpengtao/.workbuddy/binaries/python/envs/fitparse/bin/python"
REMOTE_BRANCH="main"
CONFIG="$HOME/github/running_page/config.yaml"
PUSH=1

# 解析参数
for a in "$@"; do
  case "$a" in
    --no-push) PUSH=0 ;;
  esac
done

cd "$PROJ" || exit 1

# 0. 基础设置（幂等，绕过沙箱 HTTP2 报错）
git config --global http.version HTTP/1.1

# 0.5 检查 Coros 凭证
if [ ! -f "$CONFIG" ]; then
  echo "⚠️ 未找到 Coros 凭证文件：$CONFIG"
  echo "   请先配置 ~/github/running_page/config.yaml 后再运行。"
  exit 1
fi

# 1. 拉取高驰活动
echo "==> 拉取高驰活动 ..."
"$PY" tools/fetch_coros.py

# 2. 解析 FIT 并写入 real_data.js
echo "==> 解析并写入 real_data.js ..."
"$PY" tools/sync_fit.py --parse coros_activities

# 3. 检查是否变化
if git status --short assets/js/real_data.js | grep -q .; then
  git add assets/js/real_data.js
  git commit -m "手动同步：Coros 数据更新"
  echo "==> 已提交。"
  if [ "$PUSH" = "1" ]; then
    echo "==> 推送到 GitHub Pages ..."
    if git push origin "$REMOTE_BRANCH" 2>&1; then
      echo "✅ 推送成功，GitHub Pages 将重新部署"
    else
      echo "⚠️ 推送失败（详见上方错误）。本地已提交，可稍后重试：git push origin $REMOTE_BRANCH"
    fi
  else
    echo "ℹ️ 已跳过推送（--no-push）。需要发布时执行：git push origin $REMOTE_BRANCH"
  fi
else
  echo "✅ 无新增数据，无需提交/推送"
fi

echo "==> 完成"
