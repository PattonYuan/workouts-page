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
  since: 2017,
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
  plank:      { label: '平板支撑', en: 'Plank',   color: '#27ae60', icon: '🧘' },
  situp:      { label: '卷腹',   en: 'Sit-ups',   color: '#eb5757', icon: '🔥' },
  coldshower: { label: '冷水澡', en: 'Cold Shower', color: '#56ccf2', icon: '🚿' },
};

// 足迹地图：城市锚点（WGS-84）+ 匹配半径 r（km，覆盖该城市日常活动范围）。
// 命中规则：dist ≤ r 的锚点里取 dist/r 最小者（对城市「归属度」最高）；
// 无命中则不标注（宁缺毋滥，不猜地名）。可按需追加。
const FOOTPRINT_CITIES = [
  { zh: '北京', en: 'Beijing',    lat: 39.90, lng: 116.40, r: 40 },
  { zh: '上海', en: 'Shanghai',   lat: 31.23, lng: 121.47, r: 35 },
  { zh: '深圳', en: 'Shenzhen',   lat: 22.54, lng: 114.06, r: 58 },
  { zh: '广州', en: 'Guangzhou',  lat: 23.13, lng: 113.26, r: 40 },
  { zh: '绍兴', en: 'Shaoxing',   lat: 30.03, lng: 120.58, r: 60 },
  { zh: '杭州', en: 'Hangzhou',   lat: 30.27, lng: 120.15, r: 30 },
  { zh: '南京', en: 'Nanjing',    lat: 32.06, lng: 118.80, r: 35 },
  { zh: '苏州', en: 'Suzhou',     lat: 31.30, lng: 120.58, r: 30 },
  { zh: '宁波', en: 'Ningbo',     lat: 29.87, lng: 121.54, r: 25 },
  { zh: '温州', en: 'Wenzhou',    lat: 28.00, lng: 120.70, r: 25 },
  { zh: '金华', en: 'Jinhua',     lat: 29.08, lng: 119.65, r: 25 },
  { zh: '台州', en: 'Taizhou',    lat: 28.66, lng: 121.42, r: 25 },
  { zh: '武汉', en: 'Wuhan',      lat: 30.59, lng: 114.31, r: 30 },
  { zh: '长沙', en: 'Changsha',   lat: 28.23, lng: 112.94, r: 25 },
  { zh: '成都', en: 'Chengdu',    lat: 30.57, lng: 104.07, r: 35 },
  { zh: '重庆', en: 'Chongqing',  lat: 29.56, lng: 106.55, r: 35 },
  { zh: '西安', en: "Xi'an",      lat: 34.34, lng: 108.94, r: 35 },
  { zh: '郑州', en: 'Zhengzhou',  lat: 34.75, lng: 113.63, r: 30 },
  { zh: '新乡', en: 'Xinxiang',   lat: 35.30, lng: 113.93, r: 20 },
  { zh: '晋城', en: 'Jincheng',   lat: 35.49, lng: 112.85, r: 55 },
  { zh: '周口', en: 'Zhoukou',    lat: 33.63, lng: 114.70, r: 45 },
  { zh: '济南', en: 'Jinan',      lat: 36.65, lng: 117.12, r: 25 },
  { zh: '青岛', en: 'Qingdao',    lat: 36.07, lng: 120.38, r: 30 },
  { zh: '天津', en: 'Tianjin',    lat: 39.13, lng: 117.20, r: 25 },
  { zh: '香港', en: 'Hong Kong',  lat: 22.32, lng: 114.17, r: 15 },
  { zh: '澳门', en: 'Macau',      lat: 22.20, lng: 113.55, r: 15 },
  { zh: '珠海', en: 'Zhuhai',     lat: 22.27, lng: 113.58, r: 35 },
  { zh: '东莞', en: 'Dongguan',   lat: 23.02, lng: 113.75, r: 30 },
  { zh: '佛山', en: 'Foshan',     lat: 23.02, lng: 113.12, r: 40 },
  { zh: '中山', en: 'Zhongshan',  lat: 22.52, lng: 113.39, r: 20 },
  { zh: '惠州', en: 'Huizhou',    lat: 23.11, lng: 114.41, r: 30 },
  { zh: '清远', en: 'Qingyuan',   lat: 23.68, lng: 113.06, r: 25 },
  { zh: '南宁', en: 'Nanning',    lat: 22.82, lng: 108.32, r: 35 },
  { zh: '北海', en: 'Beihai',     lat: 21.48, lng: 109.12, r: 20 },
  { zh: '百色', en: 'Baise',      lat: 23.90, lng: 106.62, r: 20 },
  { zh: '海口', en: 'Haikou',     lat: 20.04, lng: 110.32, r: 25 },
  { zh: '三亚', en: 'Sanya',      lat: 18.25, lng: 109.51, r: 20 },
  { zh: '昆明', en: 'Kunming',    lat: 24.88, lng: 102.83, r: 30 },
  { zh: '厦门', en: 'Xiamen',     lat: 24.48, lng: 118.09, r: 20 },
  { zh: '福州', en: 'Fuzhou',     lat: 26.07, lng: 119.30, r: 25 },
];

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
    secTrend: '月度趋势', trendMonthly: '月度里程', trendCum: '累计对比',
    trendPrevYear: '去年同期', trendKmUnit: 'km',
    trendHint: '柱状按运动类型堆叠显示月度里程 · 虚线为去年同期累计',
    secTracks: '轨迹墙', secMap: '轨迹地图', secHabits: '习惯打卡',
    secInsights: '坚持度', secPB: '个人最佳', secFun: '趣味数据',
    secFootprint: '足迹地图', navFootprint: '足迹',
    secCalendar: '月度日历', calThisMonth: '本月',
    calWeekdays: '日,一,二,三,四,五,六',
    insStreakWeeks: '连续周数', insWeeksUnit: '周',
    latestTitle: '最新打卡', relToday: '今天', relYesterday: '昨天',
    habitLast: '最近',
    fpByPlace: '按地点聚合', fpAllPoints: '全部起点',
    fpSpot: '足迹点', fpCities: '城市', fpSpots: '个足迹点', fpTotalKm: '累计里程',
    fpHint: '所有带 GPS 记录的出发地点 · 圆圈大小代表到访次数 · 点击查看详情',
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
    routeTimes: '该路线共 {n} 次记录', routePrev: '上一次', routeNext: '下一次',
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
    secTrend: 'Monthly Trend', trendMonthly: 'Monthly distance', trendCum: 'Cumulative',
    trendPrevYear: 'Last year', trendKmUnit: 'km',
    trendHint: 'Monthly distance stacked by sport · dashed line = same period last year',
    secTracks: 'Track Wall', secMap: 'Track Map', secHabits: 'Habits',
    secInsights: 'Consistency', secPB: 'Personal Bests', secFun: 'Fun Facts',
    secFootprint: 'Footprint Map', navFootprint: 'Footprint',
    secCalendar: 'Month Calendar', calThisMonth: 'This month',
    calWeekdays: 'Su,Mo,Tu,We,Th,Fr,Sa',
    insStreakWeeks: 'Week Streak', insWeeksUnit: 'wks',
    latestTitle: 'Latest check-in', relToday: 'Today', relYesterday: 'Yesterday',
    habitLast: 'Last',
    fpByPlace: 'By place', fpAllPoints: 'All start points',
    fpSpot: 'Spot', fpCities: 'cities', fpSpots: 'spots', fpTotalKm: 'total distance',
    fpHint: 'Every GPS start location · circle size = visits · click a bubble for details',
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
    routeTimes: '{n} times on this route', routePrev: 'Previous', routeNext: 'Next',
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
