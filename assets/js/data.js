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
  name: 'Tao',
  tagline: 'Run free · Ride far · Train hard',
  avatar: 'assets/images/avatar.png',  // 头像图片路径（留 emoji 则显示占位图标）
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

/* 用「本地」年月日生成日期字符串（YYYY-MM-DD）。
 * 注意：绝不能用 d.toISOString().slice(0,10)——那是 UTC 时间，
 * 在 GMT+8 下会把每个日期回退 1 天，导致热力图彩色格子落在错误的工作日（整体偏移）。*/
function ymdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
    const dateStr = ymdLocal(d);
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
    const dateStr = ymdLocal(d);
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

// 优先使用真实数据（由 tools/sync_*.py 合并写入 real_data.js）。
// 仅当「完全没有真实数据」（real_data.js 未加载）时才回退到示例数据；
// 一旦真实数据存在，即使某字段为空数组（例如 Coros 不含习惯打卡，checkins=[]），
// 也必须以真实数据为准，绝不能回退到示例数据，否则会凭空造出假的打卡/热力图。
const _real = (typeof window !== 'undefined' && window.REALDATA) ? window.REALDATA : null;
const ACTIVITIES = _real ? (_real.activities || []) : buildActivities();
const CHECKINS = _real ? (_real.checkins || []) : buildCheckins();

// 若真实数据提供了个人资料，则覆盖默认资料
if (_real && _real.profile) {
  Object.assign(PROFILE, _real.profile);
}

/* --------------------------- 运动类型配置 --------------------------- */
const SPORT = {
  run:     { label: '跑步', en: 'Run',     color: '#2f80ed', icon: '🏃' },
  walk:    { label: '步行', en: 'Walk',    color: '#00b8d4', icon: '🚶' },
  ride:    { label: '骑行', en: 'Ride',    color: '#27ae60', icon: '🚴' },
  hike:    { label: '徒步', en: 'Hike',    color: '#e8a33d', icon: '🥾' },
  moto:    { label: '摩托', en: 'Moto',    color: '#8e44ad', icon: '🏍️' },
  workout: { label: '训练', en: 'Workout', color: '#eb5757', icon: '🏋️' },
};

// 统计卡片 / 轨迹墙展示顺序（其余类型按需追加）
const SPORT_ORDER = ['run', 'walk', 'ride', 'hike', 'moto', 'workout'];

const HABIT = {
  pushup:     { label: '俯卧撑', en: 'Push-ups',  color: '#f2994a', icon: '💪' },
  squat:      { label: '深蹲',   en: 'Squats',    color: '#9b51e0', icon: '🦵' },
  coldshower: { label: '冷水澡', en: 'Cold Shower', color: '#56ccf2', icon: '🚿' },
};

/* ----------------------------- 多语言文案 ----------------------------- */
// 站点支持中英双语，默认英文（见 app.js 的 LANG 设置）。
// 取值：I18N[LANG][key]，LANG ∈ 'en' | 'zh'。
const I18N = {
  zh: {
    title: '我的运动主页 · Workouts',
    desc: '个人运动记录主页 · 跑步 / 骑行 / 训练 / 习惯打卡',
    brand: '我的运动主页',
    navHeatmap: '热力图', navStats: '统计', navActivities: '活动',
    navTracks: '轨迹', navMap: '地图', navHabits: '习惯',
    navInsights: '坚持', navPB: '最佳', navFun: '趣味',
    secHeatmap: '年度热力图', secStats: '数据统计', secActivities: '最近活动',
    secTracks: '轨迹墙', secMap: '轨迹地图', secHabits: '习惯打卡',
    secInsights: '坚持度', secPB: '个人最佳', secFun: '趣味数据',
    less: '少', more: '多',
    filterAll: '全部',
    heroSince: '自 {year} 起记录',
    statYearKm: '{year} 里程(km)', statYearActs: '{year} 活动',
    statTotalTime: '总时长', statStreak: '连续打卡(天)',
    statWorkoutUnit: '次', statTimes: '次',
    statElev: '爬升 {n}m', statTotal: '📊 年度合计', statTotalAll: '📊 累计合计',
    statTotalSub: '总里程 {km}km · 时长 {dur}',
    statScopeYear: '本年', statScopeAll: '全部',
    hmCell: '{count} 项 · {km}km', hmNoActivity: '无运动',
    insCurrentStreak: '当前连续', insLongestStreak: '最长连续',
    insFavoriteDay: '最爱星期', insDays: '天',
    insActiveDays: '活跃 {n} 天', insFavoriteSub: '最常运动的星期',
    pb5k: '5K 最佳', pb10k: '10K 最佳', pbLongest: '最长距离', pbClimb: '最大爬升',
    pbDist: '距离 {km}km', pbEmpty: '暂无足够数据生成个人最佳',
    funMarathon: '马拉松当量', funEquator: '赤道环绕', funEverest: '珠峰当量',
    funMarathonSub: '相当于全程马拉松', funEquatorSub: '绕地球赤道',
    funEverestSub: '累计爬升高度', funSummaryTitle: '总记录',
    funSummary: '总时长 {dur}',
    actEmptyAll: '今年暂无运动记录',
    actEmpty: '今年暂无「{type}」记录',
    actDuration: '时长', actElev: '爬升m', actHr: '心率',
    tracksEmpty: '今年暂无带轨迹的运动记录。',
    tracksFocus: '（点击在地图上聚焦）',
    mapReset: '↺ 重置视图',
    mapHint: '真实 GPS 轨迹叠加在地图上 · 点击轨迹查看详情 · 点击上方「轨迹墙」卡片可在地图上聚焦',
    mapError: '地图组件加载失败（需要联网加载 Leaflet 与地图瓦片）。<br>可继续使用上方「轨迹墙」查看路线轮廓。',
    mapTileError: '⚠️ 地图底图加载失败（当前网络无法访问瓦片服务）。轨迹线仍可显示，联网后底图会自动出现。',
    mapDistance: '距离', mapDuration: '时长', mapElev: '爬升', mapHr: '心率',
    habitEmpty: '今年暂无习惯打卡记录。',
    habitStreak: '连续 {n} 天', habitDays: '打卡天数',
    habitUnitReps: '个', habitUnitTimes: '次',
    footerBy: '灵感来自',
  },
  en: {
    title: 'My Workouts',
    desc: 'Personal workout journal · Running / Cycling / Training / Habits',
    brand: 'My Workouts',
    navHeatmap: 'Heatmap', navStats: 'Stats', navActivities: 'Activities',
    navTracks: 'Tracks', navMap: 'Map', navHabits: 'Habits',
    navInsights: 'Consistency', navPB: 'PB', navFun: 'Fun',
    secHeatmap: 'Annual Heatmap', secStats: 'Statistics', secActivities: 'Recent Activities',
    secTracks: 'Track Wall', secMap: 'Track Map', secHabits: 'Habits',
    secInsights: 'Consistency', secPB: 'Personal Bests', secFun: 'Fun Facts',
    less: 'Less', more: 'More',
    filterAll: 'All',
    heroSince: 'Recording since {year}',
    statYearKm: '{year} Distance (km)', statYearActs: '{year} Activities',
    statTotalTime: 'Total Time', statStreak: 'Day Streak',
    statWorkoutUnit: 'sessions', statTimes: 'times',
    statElev: 'Elev {n}m', statTotal: '📊 Year Total', statTotalAll: '📊 All-Time Total',
    statTotalSub: 'Total {km}km · {dur}',
    statScopeYear: 'This Year', statScopeAll: 'All Time',
    hmCell: '{count} activities · {km}km', hmNoActivity: 'No activity',
    insCurrentStreak: 'Current Streak', insLongestStreak: 'Longest Streak',
    insFavoriteDay: 'Favorite Day', insDays: 'days',
    insActiveDays: 'Active {n} days', insFavoriteSub: 'Your most active weekday',
    pb5k: '5K Best', pb10k: '10K Best', pbLongest: 'Longest Distance', pbClimb: 'Biggest Climb',
    pbDist: 'Dist {km}km', pbEmpty: 'Not enough data for personal bests',
    funMarathon: 'Marathon Eq.', funEquator: 'Equator Laps', funEverest: 'Everest Climbs',
    funMarathonSub: 'Full marathon distances', funEquatorSub: 'Around the equator',
    funEverestSub: 'Cumulative elevation', funSummaryTitle: 'Total Logged',
    funSummary: 'Total time {dur}',
    actEmptyAll: 'No activities this year',
    actEmpty: "No '{type}' records this year",
    actDuration: 'Duration', actElev: 'Elev', actHr: 'HR',
    tracksEmpty: 'No GPS-tracked activities this year.',
    tracksFocus: '(click to focus on map)',
    mapReset: '↺ Reset View',
    mapHint: 'Real GPS tracks overlaid on the map · click a track for details · click a "Track Wall" card above to focus it on the map',
    mapError: 'Map component failed to load (needs internet for Leaflet & tiles).<br>You can still use the "Track Wall" above to see route shapes.',
    mapTileError: '⚠️ Map basemap failed to load (tiles unreachable on this network). Track lines still show; basemap appears when online.',
    mapDistance: 'Distance', mapDuration: 'Duration', mapElev: 'Elevation', mapHr: 'Heart Rate',
    habitEmpty: 'No habit check-ins this year.',
    habitStreak: 'Streak {n} days', habitDays: 'Days',
    habitUnitReps: 'reps', habitUnitTimes: 'times',
    footerBy: 'Inspired by',
  },
};
