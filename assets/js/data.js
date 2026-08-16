/* =========================================================================
 * data.js — 运动主页数据层
 * -------------------------------------------------------------------------
 * 这里生成「确定性的示例数据」，方便你直接预览效果。
 * 想换成真实数据，只需把 PROFILE / ACTIVITIES / CHECKINS 替换成你自己的内容，
 * 其余渲染逻辑无需改动。
 *
 * 数据字段说明：
 *   PROFILE      : 个人资料（姓名、标语、头像）
 *   ACTIVITIES   : 运动记录 [{ date, type, title, distanceKm, movingTimeSec, elevationM, avgHr }]
 *                  type ∈ 'run' | 'ride' | 'hike' | 'moto' | 'workout'
 *   CHECKINS     : 习惯打卡 [{ date, item, reps }]
 *                  item ∈ 'pushup' | 'squat' | 'coldshower'
 * ========================================================================= */

/* ----------------------------- 个人资料 ----------------------------- */
const PROFILE = {
  name: '阿涛',
  tagline: 'Run free · Ride far · Train hard',
  avatar: '🏃',            // 可替换为头像图片 URL
  location: 'Shanghai, CN',
  since: 2022,
};

/* ----------------------- 确定性随机（可复现） ----------------------- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------- 生成运动记录 ------------------------- */
function buildActivities() {
  const rnd = mulberry32(20260816);
  const types = ['run', 'run', 'run', 'ride', 'workout']; // 跑步权重更高
  const titles = {
    run: ['晨跑', '夜跑', '轻松跑', '间歇训练', '长距离 LSD', '通勤跑'],
    ride: ['骑行通勤', '周末长途', '爬坡训练', '环湖骑行'],
    workout: ['力量训练', '核心训练', 'HIIT', '自重训练'],
  };
  const activities = [];
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 364); // 近一年

  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    const dow = d.getDay(); // 0=周日
    // 工作日跑步概率低一些，周末高一些
    const baseP = (dow === 0 || dow === 6) ? 0.55 : 0.32;
    if (rnd() > baseP) continue;

    const type = types[Math.floor(rnd() * types.length)];
    const titlePool = titles[type];
    const title = titlePool[Math.floor(rnd() * titlePool.length)];

    let distanceKm = 0, movingTimeSec = 0, elevationM = 0, avgHr = 0;
    if (type === 'run') {
      distanceKm = +(4 + rnd() * 12).toFixed(2);
      const pace = 300 + rnd() * 90;           // 5:00–6:30 /km (秒)
      movingTimeSec = Math.round(distanceKm * pace);
      elevationM = Math.round(rnd() * 120);
      avgHr = Math.round(150 + rnd() * 25);
    } else if (type === 'ride') {
      distanceKm = +(20 + rnd() * 50).toFixed(2);
      const speed = 5 + rnd() * 2;             // m/s
      movingTimeSec = Math.round((distanceKm * 1000) / speed);
      elevationM = Math.round(50 + rnd() * 400);
      avgHr = Math.round(120 + rnd() * 30);
    } else {
      distanceKm = 0;
      movingTimeSec = Math.round(30 * 60 + rnd() * 30 * 60); // 30–60 分钟
      elevationM = 0;
      avgHr = Math.round(110 + rnd() * 40);
    }

    activities.push({
      date: dateStr,
      type,
      title,
      distanceKm,
      movingTimeSec,
      elevationM,
      avgHr,
    });
  }
  return activities;
}

/* ------------------------- 生成习惯打卡 ------------------------- */
function buildCheckins() {
  const rnd = mulberry32(987654321);
  const checkins = [];
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 364);

  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    // 俯卧撑
    if (rnd() > 0.45) {
      checkins.push({ date: dateStr, item: 'pushup', reps: 20 + Math.floor(rnd() * 60) });
    }
    // 深蹲
    if (rnd() > 0.55) {
      checkins.push({ date: dateStr, item: 'squat', reps: 30 + Math.floor(rnd() * 70) });
    }
    // 冷水澡
    if (rnd() > 0.7) {
      checkins.push({ date: dateStr, item: 'coldshower', reps: 1 });
    }
  }
  return checkins;
}

// 优先使用真实数据（由 tools/sync_*.py 合并写入 real_data.js）；否则回退到示例数据
const _real = (typeof window !== 'undefined' && window.REALDATA) ? window.REALDATA : null;
const ACTIVITIES = (_real && _real.activities && _real.activities.length)
  ? _real.activities
  : buildActivities();
const CHECKINS = (_real && _real.checkins && _real.checkins.length)
  ? _real.checkins
  : buildCheckins();

// 若真实数据提供了个人资料，则覆盖默认资料
if (_real && _real.profile) {
  Object.assign(PROFILE, _real.profile);
}

/* --------------------------- 运动类型配置 --------------------------- */
const SPORT = {
  run:     { label: '跑步', color: '#2f80ed', icon: '🏃' },
  walk:    { label: '步行', color: '#00b8d4', icon: '🚶' },
  ride:    { label: '骑行', color: '#27ae60', icon: '🚴' },
  hike:    { label: '徒步', color: '#e8a33d', icon: '🥾' },
  moto:    { label: '摩托', color: '#8e44ad', icon: '🏍️' },
  workout: { label: '训练', color: '#eb5757', icon: '🏋️' },
};

// 统计卡片 / 轨迹墙展示顺序（其余类型按需追加）
const SPORT_ORDER = ['run', 'walk', 'ride', 'hike', 'moto', 'workout'];

const HABIT = {
  pushup:     { label: '俯卧撑', color: '#f2994a', icon: '💪' },
  squat:      { label: '深蹲',   color: '#9b51e0', icon: '🦵' },
  coldshower: { label: '冷水澡', color: '#56ccf2', icon: '🚿' },
};
