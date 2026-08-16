// real_data.js — 真实运动数据入口（高驰 / Keep 等合并）
// 默认空数组：未接入真实数据时，页面会回退到 data.js 里的示例数据。
// 运行 tools/sync_coros.py 或 tools/sync_keep.py 后，本文件会被自动合并写入。
window.REALDATA = {
  profile: null,                 // 可选：{ name, tagline, avatar, location, since }
  activities: [],                // 各平台活动（去重合并）
  checkins: [],                  // 习惯打卡（高驰无此功能，通常为空）
};
