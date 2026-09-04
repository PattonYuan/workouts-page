/* =========================================================================
 * app.js — 运动主页渲染与交互
 * 依赖 data.js 提供的 PROFILE / ACTIVITIES / CHECKINS / SPORT / HABIT
 * ========================================================================= */
(function () {
  'use strict';

  /* ----------------------------- 工具函数 ----------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ----------------------------- 语言（默认英文） ----------------------------- */
  let LANG = (function () {
    try { return localStorage.getItem('workouts-lang'); } catch (e) { return null; }
  })() || 'en';
  function t(key) {
    const d = I18N[LANG] || I18N.zh;
    return (d && d[key] != null) ? d[key] : (I18N.zh[key] != null ? I18N.zh[key] : key);
  }
  function sportLabel(type) {
    const s = SPORT[type];
    if (!s) return type;
    return LANG === 'en' ? s.en : s.label;
  }
  function habitLabel(key) {
    const h = HABIT[key];
    if (!h) return key;
    return LANG === 'en' ? h.en : h.label;
  }
  function categoryLabel(key) {
    const c = CATEGORIES[key];
    if (!c) return key;
    return LANG === 'en' ? c.en : c.zh;
  }
  // 活动归并分类（显示时计算：历史数据即时生效，无需重新同步）
  // 规则自上而下短路：优先看 type（权威），再看标题关键词；室内/室外仅靠标题关键词判定。
  function activityCategory(a) {
    const ti = (a && a.title) || '';
    const ty = (a && a.type) || '';
    const has = (...kw) => kw.some((k) => ti.indexOf(k) >= 0);
    if (ty === 'moto' || has('摩托', '机车')) return 'moto';
    if (ty === 'ride' || has('骑行', '骑车', '单车')) return 'ride';
    if (ty === 'hike' || has('徒步', '越野', '登山', '爬山')) return 'hike';
    // 训练类：球类/游泳/瑜伽归「其他」，其余（卷腹/俯卧撑/平板支撑/深蹲/力量课）归力量核心
    if (ty === 'workout') return has('羽毛球', '篮球', '游泳', '瑜伽', '拉伸') ? 'other' : 'strength';
    if (ty === 'run' || has('跑步', '轻松跑', '热身跑', '法特莱克', '测试', '跑者')) {
      return has('跑步机', '室内', 'Treadmill') ? 'indoor_run' : 'outdoor_run';
    }
    if (ty === 'walk' || has('行走', '步行', '健走', '走路', '散步')) {
      return has('室内') ? 'indoor_walk' : 'outdoor_walk';
    }
    if (has('卷腹', '平板支撑', '俯卧撑', '深蹲', '力量', '核心', 'Strength', 'Gym')) return 'strength';
    return 'other';
  }

  const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WK_ZH = ['日', '一', '二', '三', '四', '五', '六'];

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  function fmtDuration(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (LANG === 'en') return h > 0 ? `${h}h ${m}m` : `${m}m`;
    if (h > 0) return `${h}小时${m}分`;
    return `${m}分钟`;
  }
  function fmtDate(s) {
    const d = new Date(s + 'T00:00:00');
    if (LANG === 'en') return `${MON_EN[d.getMonth()]} ${d.getDate()} · ${WK_EN[d.getDay()]}`;
    return `${d.getMonth() + 1}月${d.getDate()}日 · 周${WK_ZH[d.getDay()]}`;
  }

  /* ------------------- 活动标题中英翻译 ------------------- */
  // 导入的 Coros/Keep 标题多为中文（如「深圳市 跑步」「7k轻松跑」），
  // 英文模式下尽量翻译；已为英文/缩写（如 E60+6ST、LSD）则原样保留。
  const CITY_EN = {
    '深圳市': 'Shenzhen', '河南省': 'Henan', '广州市': 'Guangzhou', '长沙市': 'Changsha',
    '新乡市': 'Xinxiang', '清远市': 'Qingyuan', '绍兴市': 'Shaoxing', '杭州市': 'Hangzhou',
    '香港特别行政区': 'Hong Kong', '香港': 'Hong Kong',
    '北京市': 'Beijing', '上海市': 'Shanghai', '东莞市': 'Dongguan', '惠州市': 'Huizhou',
    '珠海市': 'Zhuhai', '佛山市': 'Foshan', '中山市': 'Zhongshan', '宁波市': 'Ningbo',
  };
  const SPORT_EN = {
    '徒步': 'Hike', '跑步': 'Run', '健走': 'Walk', '步行': 'Walk', '行走': 'Walk',
    '骑行': 'Ride', '公路骑行': 'Road Cycling', '摩托骑行': 'Motorcycle Ride',
    '呼狗崖徒步': 'Hugouya Hike',
    '越野跑': 'Trail Run', '室内跑': 'Indoor Run', '室内跑步': 'Indoor Run',
    '有氧': 'Cardio', '力量': 'Strength', '拉伸': 'Stretching', '游泳': 'Swim',
  };
  // Keep 训练课程名 → 英文（高频 + 一次性短语）
  const PHRASE_EN = {
    '跑步能力测试': 'Running Ability Test', '室内有氧': 'Indoor Cardio', '羽毛球': 'Badminton',
    '5公里测试': '5K Test', '5km测试': '5km Test', '上肢力量徒手训练': 'Upper Body Bodyweight Strength',
    '跑者日常核心组合': 'Runner Daily Core Routine', '10K测试日': '10K Test Day', '训练': 'Training',
    '法特莱克跑': 'Fartlek', '下肢力量': 'Lower Body Strength', '核心力量': 'Core Strength',
    '跑步机': 'Treadmill', 'T强度倒金字塔跑': 'T-pace Descending Pyramid Run',
    '晨跑': 'Morning Run', '夜跑': 'Night Run', '轻松跑': 'Easy Run', '间歇训练': 'Interval Training',
    '长距离 LSD': 'Long Run LSD', '通勤跑': 'Commute Run', '骑行通勤': 'Cycle Commute',
    '周末长途': 'Weekend Long Ride', '爬坡训练': 'Hill Training', '环湖骑行': 'Lakeside Ride',
    '力量训练': 'Strength Training', '核心训练': 'Core Training', '自重训练': 'Bodyweight Training',
    // —— Keep 高频运动 / 训练课程 ——
    '户外行走': 'Outdoor Walk', '户外步行': 'Outdoor Walk', '户外健走': 'Outdoor Walk',
    '室内步行': 'Indoor Walk', '室内5000步走路燃脂，大体重友好！': 'Indoor 5000-step Fat-burn Walk (Plus-size Friendly)',
    'Keep跑步': 'Keep Run', '卷腹': 'Sit-ups', '90°卷腹': '90° Sit-ups',
    '俯卧撑': 'Push-ups', '俯卧撑入门': 'Push-ups for Beginners',
    '平板支撑': 'Plank', '深蹲': 'Squats',
    '7 分钟平板支撑·安小雨的马甲线秘籍': "7-min Plank · An Xiaoyu's Abs Routine",
  };
  // CJK 判定：含扩展 A 区(3400-4DBF)与兼容区(F900-FAFF)，仅 [一-鿿] 会漏掉生僻字
  const CJK = /[㐀-䶿一-鿿豈-﫿]/;
  function translateTitleEn(title) {
    if (!title || !CJK.test(title)) return title || '';
    if (PHRASE_EN[title]) return PHRASE_EN[title];
    // 先剥掉 emoji / 标点 / 空白前缀（如「🏃 深圳市 跑步」「【深圳市 跑步】」），
    // 否则下面的 ^(\S+?) 会抓到符号，导致整串漏翻
    // 只剥离 emoji/标点/空白前缀，保留汉字与字母数字
    // （注意：不能用 [\s\W_]，JS 的 \w 不含汉字，会把「绍兴市 跑步」削成「跑步」导致漏翻）
    const t2 = title
      .replace(/^[^\p{Script=Han}\w]+/u, '')
      .replace(/[【】\[\]()（）「」]+$/u, '');
    // 「城市 运动类型/英文短语」模式：深圳市 跑步 → Shenzhen Run；广州市 GPS Cardio → Guangzhou GPS Cardio
    const m = t2.match(/^(\S+?)\s+(.+)$/);
    if (m && CITY_EN[m[1]]) {
      const rest = SPORT_EN[m[2]] || translateTitleEn(m[2]);
      // 剩余部分仍含中文时（如未收录的「越野跑」）不硬拼半中半英，整体回退原文
      if (!CJK.test(rest)) return CITY_EN[m[1]] + ' ' + rest;
    }
    // 其余模式：7k轻松跑→7km Easy Run、长距离跑→Long Run、热身跑→Warm-up Run
    const out = (t2 || title)
      .replace(/(\d+(?:\.\d+)?)\s*k轻松跑/gi, '$1km Easy Run')
      .replace(/轻松跑/g, 'Easy Run')
      .replace(/长距离跑/g, 'Long Run')
      .replace(/热身跑/g, 'Warm-up Run')
      .replace(/\s+/g, ' ').trim();
    return CJK.test(out) ? (title || '') : out;
  }
  function actTitle(a) {
    const t0 = (a && a.title) || '';
    return LANG === 'en' ? translateTitleEn(t0) : t0;
  }

  /* ----------------------------- Hero ----------------------------- */
  function renderHero() {
    const av = PROFILE.avatar || '🏃';
    const avEl = $('#heroAvatar');
    // 头像为图片路径（含 / 或 . 或 http）时渲染 <img>，否则显示 emoji 占位
    if (/[/.]|^https?:/.test(av)) {
      avEl.innerHTML = '<img src="' + av + '" alt="头像" />';
    } else {
      avEl.textContent = av;
    }
    $('#heroName').textContent = PROFILE.name;
    $('#heroTagline').textContent = PROFILE.tagline || '';
    // 记录起始年：优先从真实活动数据推断最早年份（如 2017），无数据才回退 PROFILE.since
    const sinceYears = ACTIVITIES.map((a) => parseInt((a.date || '').slice(0, 4), 10)).filter((y) => y > 0);
    const since = sinceYears.length ? Math.min(...sinceYears) : (PROFILE.since || new Date().getFullYear());
    const subParts = [];
    if (PROFILE.location) subParts.push(PROFILE.location);
    subParts.push(t('heroSince').replace('{year}', since));
    $('#heroSub').textContent = subParts.join(' · ');

    const years = availableYears();
    const thisYear = years.length ? years[0] : new Date().getFullYear();
    const yActs = ACTIVITIES.filter((a) => a.date.startsWith(thisYear));
    const totalKm = yActs.reduce((s, a) => s + (a.distanceKm || 0), 0);
    const totalTime = yActs.reduce((s, a) => s + a.movingTimeSec, 0);
    const streak = calcStreak(ACTIVITIES.map((a) => a.date));

    const stats = [
      { num: totalKm.toFixed(0), lbl: t('statYearKm').replace('{year}', thisYear) },
      { num: yActs.length, lbl: t('statYearActs').replace('{year}', thisYear) },
      { num: fmtDuration(totalTime), lbl: t('statTotalTime') },
      { num: streak, lbl: t('statStreak') },
    ];
    $('#heroStats').innerHTML = stats
      .map((s) => `<div class="hero-stat"><span class="num">${s.num}</span><span class="lbl">${s.lbl}</span></div>`)
      .join('');
  }

  /* 连续天数（最近一次活动至今或到最近活动日） */
  function calcStreak(dateStrs) {
    if (!dateStrs.length) return 0;
    const set = new Set(dateStrs);
    let streak = 0;
    const d = new Date();
    // 如果今天没活动，从昨天开始算，避免 streak 归零误判
    if (!set.has(ymd(d))) d.setDate(d.getDate() - 1);
    while (set.has(ymd(d))) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  /* 历史最长连续天数 */
  function calcLongestStreak(dateStrs) {
    if (!dateStrs.length) return 0;
    const dates = Array.from(new Set(dateStrs)).sort();
    let best = 0, run = 0, prev = null;
    for (const ds of dates) {
      if (prev && isNextDay(prev, ds)) run++;
      else run = 1;
      if (run > best) best = run;
      prev = ds;
    }
    return best;
  }
  function isNextDay(a, b) {
    const d1 = new Date(a + 'T00:00:00');
    const d2 = new Date(b + 'T00:00:00');
    return Math.round((d2 - d1) / 86400000) === 1;
  }

  /* 最常运动的星期几 */
  function favoriteWeekday(acts) {
    const cnt = [0, 0, 0, 0, 0, 0, 0];
    acts.forEach((a) => { cnt[new Date(a.date + 'T00:00:00').getDay()]++; });
    let mi = 0;
    for (let i = 1; i < 7; i++) if (cnt[i] > cnt[mi]) mi = i;
    return LANG === 'en' ? WK_EN[mi] : WK_ZH[mi];
  }

  /* 按当前「年度 / 累计」作用域筛选活动 */
  function actsInScope() {
    if (statScope === 'all') return ACTIVITIES.slice();
    return ACTIVITIES.filter((a) => a.date.startsWith(String(currentYear)));
  }

  function fmtDateShort(s) {
    const d = new Date(s + 'T00:00:00');
    if (LANG === 'en') return `${MON_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  /* ----------------------------- 轨迹地图状态 ----------------------------- */
  let map = null;
  let mapTile = null;
  let mapTrackGroup = null;
  const mapFilter = new Set(['run', 'walk', 'ride', 'hike', 'moto']);
  let mapTrackRefs = [];        // [{ act, layer }]
  let currentTrackActs = [];    // 轨迹墙当前展示的 12 条，用于点击联动

  /* ----------------------------- 热力图 ----------------------------- */
  let currentYear = new Date().getFullYear();
  let statScope = 'year';   // 'year'（跟随 currentYear）或 'all'（累计全部）

  function availableYears() {
    const ys = new Set(ACTIVITIES.map((a) => a.date.slice(0, 4)));
    CHECKINS.forEach((c) => ys.add(c.date.slice(0, 4)));
    return Array.from(ys).sort((a, b) => b - a);
  }

  function renderYearTabs() {
    const years = availableYears();
    if (!years.includes(String(currentYear))) currentYear = +years[0];
    $('#yearTabs').innerHTML = years
      .map((y) => `<button class="${y === currentYear ? 'active' : ''}" data-year="${y}">${y}</button>`)
      .join('');
    $$('#yearTabs button').forEach((b) =>
      b.addEventListener('click', () => {
        currentYear = +b.dataset.year;
        statScope = 'year';
        renderYearTabs();
        updateScopeChips();
        renderHeatmap();
        renderStats();
        renderInsights();
        renderPB();
        renderFunFacts();
        renderActivities();
        renderTracks();
        renderMap();
      })
    );
  }

  // 聚合某年每天的「活动计数 + 距离」用于着色
  function buildDayMap(year) {
    const map = {};
    ACTIVITIES.concat(
      CHECKINS.map((c) => ({ date: c.date, type: 'habit' }))
    ).forEach((a) => {
      if (!a.date.startsWith(year)) return;
      if (!map[a.date]) map[a.date] = { count: 0, km: 0 };
      map[a.date].count += 1;
      map[a.date].km += a.distanceKm || 0;
    });
    return map;
  }

  function renderHeatmap() {
    const year = currentYear;
    const dayMap = buildDayMap(year);

    // 找到该年第一周开始的周日
    const first = new Date(year, 0, 1);
    const start = new Date(first);
    start.setDate(start.getDate() - first.getDay()); // 回退到周日

    // 所有年份（含当前年份）均展示完整一年：从 1 月所在周的周日开始，
    // 到 12 月 31 日所在周的周六结束。当前年份尚未发生的月份为空白格子，
    // 与其它年份保持一致的完整布局（不再截断到「今天」）。
    const last = new Date(year, 11, 31);
    const end = new Date(last);
    end.setDate(end.getDate() + (6 - last.getDay())); // 补齐到周六

    const cells = [];
    const firstCalCol = {};    // 每月 1 号所在列（同时作为月份标签对齐列）
    let cursor = new Date(start);
    let lastMonth = -1;
    let col = 0;

    while (cursor <= end) {
      const inYear = String(cursor.getFullYear()) === String(year);
      const key = ymd(cursor);
      const info = dayMap[key];

      if (inYear) {
        const mo = cursor.getMonth();
        if (mo !== lastMonth) { firstCalCol[mo] = col; lastMonth = mo; }
      }

      if (!inYear || !info) {
        cells.push(`<div class="hm-cell empty" data-empty="1" data-date="${key}" title="${key}"></div>`);
      } else {
        const km = info.km;
        let lv = 0;
        if (info.count >= 1) lv = 1;
        if (km >= 5 || info.count >= 2) lv = 2;
        if (km >= 15 || info.count >= 3) lv = 3;
        if (km >= 30 || info.count >= 4) lv = 4;
        cells.push(
          `<div class="hm-cell lv${lv}" data-date="${key}" data-count="${info.count}" data-km="${km.toFixed(1)}" title="${key} · ${t('hmCell').replace('{count}', info.count).replace('{km}', km.toFixed(1))}"></div>`
        );
      }

      cursor.setDate(cursor.getDate() + 1);
      if (cursor.getDay() === 0) col++;
    }

    // 月份标签对齐到「当月 1 号所在列」：相邻月份天然相隔 4 周以上，
    // 标签列距 ≥4 列（约 64px），远大于文字宽度，彻底避免相邻月份（如 Mar/Apr）文字重叠。
    // 同时仅当严格大于上一标签列时才显示，作为兜底。
    const monthLabels = [];
    let lastLabelCol = -1;
    for (let mo = 0; mo < 12; mo++) {
      if (firstCalCol[mo] === undefined) continue;
      const c = firstCalCol[mo];
      if (c > lastLabelCol) {
        monthLabels.push({ col: c, label: LANG === 'en' ? MON_EN[mo] : `${mo + 1}月` });
        lastLabelCol = c;
      }
    }

    // 月份标签列对齐（53 列）
    $('#heatmapMonths').style.gridTemplateColumns = `repeat(${col + 1}, 13px)`;
    $('#heatmapMonths').innerHTML = monthLabels
      .map((m) => `<span style="grid-column:${m.col + 1}">${m.label}</span>`)
      .join('');
    // 热力图网格必须与月份标签网格使用完全相同的列定义（列数 + 列宽 + 间距），
    // 否则两网格列结构由不同机制生成，会出现横向错位。
    $('#heatmapGrid').style.gridTemplateColumns = `repeat(${col + 1}, 13px)`;
    $('#heatmapGrid').innerHTML = cells.join('');
  }

  /* 自定义悬停提示：比原生 title 更美观，显示日期 + 活动数/距离 */
  function hmTipContent(cell) {
    const date = cell.dataset.date;
    if (cell.dataset.empty) return `${fmtDateShort(date)}<br><span style="opacity:.7">${t('hmNoActivity')}</span>`;
    return `${fmtDateShort(date)}<br>${t('hmCell').replace('{count}', cell.dataset.count).replace('{km}', cell.dataset.km)}`;
  }
  function initHeatmapTip() {
    let tip = document.getElementById('hmTip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'hmTip';
      tip.className = 'hm-tip';
      document.body.appendChild(tip);
    }
    const grid = $('#heatmapGrid');
    if (!grid) return;
    grid.addEventListener('mouseover', (e) => {
      const cell = e.target.closest('.hm-cell');
      if (!cell) return;
      tip.innerHTML = hmTipContent(cell);
      tip.classList.add('show');
    });
    grid.addEventListener('mousemove', (e) => {
      tip.style.left = e.clientX + 'px';
      tip.style.top = e.clientY + 'px';
    });
    grid.addEventListener('mouseout', (e) => {
      if (e.target.closest('.hm-cell')) tip.classList.remove('show');
    });
  }

  /* ----------------------------- 统计卡片 ----------------------------- */
  /* ----------------------------- 统计卡片（按归并类别，避免 跑步/户外跑步 重复） ----------------------------- */
  function renderStats() {
    const acts = actsInScope();
    const sumKm = (arr) => arr.reduce((s, a) => s + (a.distanceKm || 0), 0);
    const sumTime = (arr) => arr.reduce((s, a) => s + (a.movingTimeSec || 0), 0);
    const sumEle = (arr) => arr.reduce((s, a) => s + (a.elevationM || 0), 0);

    // 按归并类别分组（户外跑步 / 室内跑步 / 户外步行 / …）。
    // 同一项运动在 Keep(跑步) 与 Coros(户外跑步) 下会被归并到同一类别，
    // 不再像旧版那样既统计「跑步」又统计「户外跑步」造成重复。
    const g = {};
    CATEGORY_ORDER.forEach((k) => (g[k] = []));
    acts.forEach((a) => {
      const k = activityCategory(a);
      (g[k] = g[k] || []).push(a);
    });

    const cards = CATEGORY_ORDER
      .filter((k) => g[k] && g[k].length)
      .map((k) => {
        const c = CATEGORIES[k];
        const arr = g[k];
        const km = sumKm(arr);
        const sec = sumTime(arr);
        const ele = sumEle(arr);
        // 有里程的类别（户外/室内跑步、骑行、徒步、步行等 GPS 运动）以「距离」为主指标，
        // 次数降为次要信息写进副标题；无里程的力量核心类仍以「次数」为主。
        const hasDist = km >= 0.1;
        const sub = hasDist
          ? `${arr.length} ${t('statTimes')} · ${fmtDuration(sec)}`
            + (ele > 0 ? ` · ${t('statElev').replace('{n}', ele.toFixed(0))}` : '')
          : fmtDuration(sec);
        return {
          color: c.color,
          title: `${c.icon} ${categoryLabel(k)}`,
          big: hasDist ? (km >= 10 ? km.toFixed(0) : km.toFixed(1)) : arr.length,
          unit: hasDist ? 'km' : t('statTimes'),
          sub,
        };
      });

    // 合计卡（本年 / 累计 跟随作用域切换）
    cards.push({
      color: 'var(--accent)',
      title: statScope === 'all' ? t('statTotalAll') : t('statTotal'),
      big: acts.length, unit: t('statWorkoutUnit'),
      sub: t('statTotalSub').replace('{km}', sumKm(acts).toFixed(0)).replace('{dur}', fmtDuration(sumTime(acts))),
    });

    $('#statCards').innerHTML = cards
      .map((c) => `
        <div class="stat-card">
          <div class="bar" style="background:${c.color}"></div>
          <h3>${c.title}</h3>
          <div><span class="big">${c.big}</span><span class="unit">${c.unit}</span></div>
          <div class="sub">${c.sub}</div>
        </div>`)
      .join('');
  }

  /* ------------------- 坚持度（连续打卡 / 最长连续 / 最爱星期） ------------------- */
  function renderInsights() {
    const acts = actsInScope();
    const allDates = ACTIVITIES.map((a) => a.date);
    const curStreak = calcStreak(allDates);
    const longest = calcLongestStreak(acts.map((a) => a.date));
    const fav = favoriteWeekday(acts);
    const activeDays = new Set(acts.map((a) => a.date)).size;
    // 记录起始年：与 Hero 一致，从真实活动数据推断最早年份
    const _sinceYears = ACTIVITIES.map((a) => parseInt((a.date || '').slice(0, 4), 10)).filter((y) => y > 0);
    const _since = _sinceYears.length ? Math.min(..._sinceYears) : (PROFILE.since || new Date().getFullYear());
    const cards = [
      { color: 'var(--accent)', ico: '🔥', title: t('insCurrentStreak'), big: curStreak, unit: t('insDays'), sub: t('heroSince').replace('{year}', _since) },
      { color: 'var(--accent-2)', ico: '📈', title: t('insLongestStreak'), big: longest, unit: t('insDays'), sub: t('insActiveDays').replace('{n}', activeDays) },
      { color: '#e8a33d', ico: '📅', title: t('insFavoriteDay'), big: fav, unit: '', sub: t('insFavoriteSub') },
      { color: '#27ae60', ico: '🗓️', title: t('insStreakWeeks'), big: calcWeekStreak(acts.map((a) => a.date), currentYear), unit: t('insWeeksUnit'), sub: weekStripHTML(currentYear) },
    ];
    $('#insightCards').innerHTML = cards
      .map(
        (c) => `
        <div class="stat-card">
          <div class="bar" style="background:${c.color}"></div>
          <h3>${c.ico} ${c.title}</h3>
          <div><span class="big">${c.big}</span><span class="unit">${c.unit}</span></div>
          <div class="sub">${c.sub}</div>
        </div>`
      )
      .join('');
  }

  /* ----------------------------- 个人最佳（PB） ----------------------------- */
  let pbRefs = [];   // 与渲染顺序对应的活动引用，供点击跳转

  function renderPB() {
    const acts = actsInScope();
    const runs = acts.filter((a) => a.type === 'run');
    const bestIn = (lo, hi) => {
      let pick = null;
      runs.forEach((a) => {
        if (a.distanceKm >= lo && a.distanceKm <= hi) {
          if (!pick || a.movingTimeSec < pick.movingTimeSec) pick = a;
        }
      });
      return pick;
    };
    const f5 = bestIn(4.8, 5.3);
    const f10 = bestIn(9.5, 10.5);
    const longest = acts.reduce((m, a) => (a.distanceKm > (m ? m.distanceKm : 0) ? a : m), null);
    const climb = acts.reduce((m, a) => ((a.elevationM || 0) > (m ? (m.elevationM || 0) : 0) ? a : m), null);

    const items = [];
    if (f5) items.push({ label: t('pb5k'), act: f5, big: fmtDuration(f5.movingTimeSec), unit: '', color: '#2f80ed' });
    if (f10) items.push({ label: t('pb10k'), act: f10, big: fmtDuration(f10.movingTimeSec), unit: '', color: '#27ae60' });
    if (longest) items.push({ label: t('pbLongest'), act: longest, big: longest.distanceKm.toFixed(1), unit: 'km', color: '#e8a33d' });
    if (climb && climb.elevationM) items.push({ label: t('pbClimb'), act: climb, big: String(climb.elevationM), unit: 'm', color: '#8e44ad' });

    const wrap = $('#pbCards');
    if (!items.length) {
      wrap.innerHTML = `<p class="muted">${t('pbEmpty')}</p>`;
      pbRefs = [];
      return;
    }
    pbRefs = items.map((i) => i.act);
    wrap.innerHTML = items
      .map(
        (it, i) => `
        <div class="stat-card clickable" data-idx="${i}">
          <div class="bar" style="background:${it.color}"></div>
          <h3>🏅 ${it.label}</h3>
          <div><span class="big">${it.big}</span><span class="unit">${it.unit}</span></div>
          <div class="sub">${it.act.date} · ${t('pbDist').replace('{km}', it.act.distanceKm.toFixed(1))}</div>
        </div>`
      )
      .join('');
    $$('#pbCards .stat-card.clickable').forEach((el) =>
      el.addEventListener('click', () => jumpToActivity(pbRefs[+el.dataset.idx]))
    );
  }

  // 点击 PB 卡片 → 过滤到该类型、滚动到活动列表并高亮
  function jumpToActivity(act) {
    if (!act) return;
    const yr = +act.date.slice(0, 4);
    if (yr !== currentYear) { currentYear = yr; statScope = 'year'; renderYearTabs(); updateScopeChips(); }
    actFilter = act.type;
    actLimit = 600;   // 放大上限，确保目标活动出现在列表
    renderActivities();
    const sec = document.getElementById('activities');
    if (sec && sec.scrollIntoView) sec.scrollIntoView({ behavior: 'smooth' });
  }

  /* ----------------------------- 趣味数据 ----------------------------- */
  function renderFunFacts() {
    const acts = actsInScope();
    const totalKm = acts.reduce((s, a) => s + (a.distanceKm || 0), 0);
    const totalTime = acts.reduce((s, a) => s + a.movingTimeSec, 0);
    const totalEle = acts.reduce((s, a) => s + (a.elevationM || 0), 0);
    const count = acts.length;
    const cards = [
      { ico: '🏅', title: t('funMarathon'), big: (totalKm / 42.195).toFixed(1), unit: '', sub: t('funMarathonSub') },
      { ico: '🌍', title: t('funEquator'), big: (totalKm / 40075).toFixed(2), unit: '', sub: t('funEquatorSub') },
      { ico: '⛰️', title: t('funEverest'), big: (totalEle / 8849).toFixed(2), unit: '', sub: t('funEverestSub') },
      { ico: '📊', title: t('funSummaryTitle'), big: String(count), unit: t('statWorkoutUnit'), sub: t('funSummary').replace('{dur}', fmtDuration(totalTime)) },
    ];
    $('#funCards').innerHTML = cards
      .map(
        (c) => `
        <div class="stat-card">
          <div class="bar" style="background:var(--accent)"></div>
          <h3>${c.ico} ${c.title}</h3>
          <div><span class="big">${c.big}</span><span class="unit">${c.unit}</span></div>
          <div class="sub">${c.sub}</div>
        </div>`
      )
      .join('');
  }

  /* ----------------------------- 统计作用域切换（本年 / 累计） ----------------------------- */
  function updateScopeChips() {
    $$('#statScopeTabs .chip').forEach((chip) =>
      chip.classList.toggle('active', chip.dataset.scope === statScope)
    );
  }
  function bindStatScope() {
    $$('#statScopeTabs .chip').forEach((chip) =>
      chip.addEventListener('click', () => {
        statScope = chip.dataset.scope;
        updateScopeChips();
        renderStats();
        renderInsights();
        renderPB();
        renderFunFacts();
      })
    );
    updateScopeChips();
  }

  /* ----------------------------- 月度趋势（原生 SVG，零依赖） ----------------------------- */
  const TREND_TYPES = ['run', 'walk', 'ride', 'hike', 'moto'];
  let trendYear = null;

  function trendAgg(year) {
    const monthly = Array.from({ length: 12 }, () => ({}));
    const cum = Array(12).fill(0);
    ACTIVITIES.forEach((a) => {
      if (!a.date.startsWith(year)) return;
      const km = a.distanceKm || 0;
      if (km <= 0 || !TREND_TYPES.includes(a.type)) return;
      const m = +a.date.slice(5, 7) - 1;
      monthly[m][a.type] = (monthly[m][a.type] || 0) + km;
      cum[m] += km;
    });
    for (let m = 1; m < 12; m++) cum[m] += cum[m - 1];
    return { monthly, cum };
  }

  // 月度里程堆叠柱状图
  function trendBarsSVG(year) {
    const { monthly } = trendAgg(year);
    const W = 720, H = 230, L = 40, R = 8, T = 16, B = 26;
    const totals = monthly.map((m) => Object.values(m).reduce((s, x) => s + x, 0));
    const maxKm = Math.max(...totals, 1);
    const iw = (W - L - R) / 12, bw = Math.min(38, iw * 0.62);
    let svg = `<svg class="trend-svg trend-bars" viewBox="0 0 ${W} ${H}" style="width:100%;display:block">
      <text x="${L - 6}" y="${T + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${Math.round(maxKm)}</text>
      <text x="${L - 6}" y="${H - B}" text-anchor="end" font-size="11" fill="var(--muted)">0</text>
      <line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" stroke="var(--border)"/>
      <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="var(--border)"/>`;
    monthly.forEach((seg, m) => {
      const x = L + m * iw + (iw - bw) / 2;
      let y = H - B;
      const ordered = TREND_TYPES.filter((k) => seg[k]).map((k) => [k, seg[k]]);
      ordered.forEach(([k, v]) => {
        const h = (v / maxKm) * (H - T - B);
        y -= h;
        svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h - 0.5, 0).toFixed(1)}"
          fill="${SPORT[k].color}" rx="1.5" opacity=".92"><title>${year}-${String(m + 1).padStart(2, '0')} ${sportLabel(k)} ${v.toFixed(1)}km</title></rect>`;
      });
      svg += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - B + 15}" text-anchor="middle" font-size="11" fill="var(--muted)">${m + 1}</text>`;
      if (totals[m] > 0) {
        svg += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="10.5" fill="var(--muted)">${totals[m].toFixed(0)}</text>`;
      }
    });
    svg += '</svg>';
    return svg;
  }

  // 累计里程对比折线（实线=所选年份，虚线=去年同期）
  function trendCumSVG(year) {
    const W = 720, H = 150, L = 40, R = 8, T = 18, B = 22;
    const { cum } = trendAgg(year);
    const prev = trendAgg(String(+year - 1)).cum;
    const cur = trendAgg(year).cum;
    let lastM = 0;
    for (let i = cur.length - 1; i >= 0; i--) {
      if (cur[i] > 0) { lastM = i; break; }
    }
    const maxV = Math.max(...cur, ...prev, 1);
    const px = (m) => L + (m / 11) * (W - L - R);
    const py = (v) => (H - B) - (v / maxV) * (H - T - B);
    const path = (arr, upto) => arr.slice(0, upto + 1).map((v, m) => `${m ? 'L' : 'M'}${px(m).toFixed(1)} ${py(v).toFixed(1)}`).join(' ');
    let svg = `<svg class="trend-svg trend-cum" viewBox="0 0 ${W} ${H}" style="width:100%;display:block;margin-top:6px">
      <text x="${L - 6}" y="${T + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${Math.round(maxV)}</text>
      <line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" stroke="var(--border)"/>
      <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="var(--border)"/>
      <path d="${path(prev, 11)}" fill="none" stroke="var(--muted)" stroke-width="1.6" stroke-dasharray="5 4" opacity=".75"/>`;
    svg += `<path d="${path(cur, lastM)}" fill="none" stroke="#2f80ed" stroke-width="2.4" stroke-linejoin="round"/>`;
    cur.slice(0, lastM + 1).forEach((v, m) => {
      svg += `<circle cx="${px(m).toFixed(1)}" cy="${py(v).toFixed(1)}" r="2.8" fill="#2f80ed"><title>${year}-${String(m + 1).padStart(2, '0')} ${v.toFixed(1)}km</title></circle>`;
    });
    svg += `<text x="${W - R}" y="${T}" text-anchor="end" font-size="11" fill="var(--muted)">` +
      `— ${year}  ·  -- ${year - 1} ${t('trendPrevYear')}</text></svg>`;
    return svg;
  }

  // 可选年份（有活动的年份，倒序）；trendYear 与日历一样用 ‹ 今年 › 切换
  function trendYears() {
    return [...new Set(ACTIVITIES.map((a) => a.date.slice(0, 4)))].sort().reverse();
  }

  function renderTrend() {
    const panel = $('#trendPanel');
    if (!panel) return;
    const years = trendYears();
    if (!years.length) { panel.innerHTML = ''; return; }
    if (!trendYear || !years.includes(trendYear)) trendYear = String(currentYear);
    const prev = $('#trendPrev'), next = $('#trendNext'), today = $('#trendToday');
    if (prev) prev.disabled = trendYear === years[years.length - 1]; // 最早年
    if (next) next.disabled = trendYear === years[0];                // 最新年
    if (today) today.textContent = `${t('calThisYear')} · ${trendYear}`;
    panel.innerHTML =
      `<div class="trend-title">${t('trendMonthly')} · ${trendYear} (${t('trendKmUnit')})</div>` +
      trendBarsSVG(trendYear) +
      `<div class="trend-title">${t('trendCum')} · ${trendYear}</div>` +
      trendCumSVG(trendYear);
    equalizeMonthRow();
  }

  // 月度区块：让「日历卡片」与「趋势卡片」等高，视觉对齐（内容顶部对齐、矮的一侧居中留白）
  function equalizeMonthRow() {
    const a = document.querySelector('#calPanel');
    const b = document.querySelector('#trendPanel');
    if (!a || !b) return;
    a.style.minHeight = ''; b.style.minHeight = '';
    a.style.display = 'flex'; a.style.flexDirection = 'column';
    a.style.justifyContent = 'center';
    const h = Math.max(a.offsetHeight, b.offsetHeight);
    a.style.minHeight = h + 'px';
    b.style.minHeight = h + 'px';
  }

  function bindTrendNav() {
    const years = trendYears();
    const prev = $('#trendPrev'), next = $('#trendNext'), today = $('#trendToday');
    if (prev) prev.addEventListener('click', () => {
      const i = years.indexOf(trendYear);
      if (i >= 0 && i < years.length - 1) { trendYear = years[i + 1]; renderTrend(); }
    });
    if (next) next.addEventListener('click', () => {
      const i = years.indexOf(trendYear);
      if (i > 0) { trendYear = years[i - 1]; renderTrend(); }
    });
    if (today) today.addEventListener('click', () => {
      trendYear = String(currentYear); renderTrend();
    });
  }

  /* ----------------------------- 月度日历 ----------------------------- */
  let calY = null, calM = null; // calM: 0-11

  // 每日运动量（km），供日历/周条用
  function dailyKmMap(year, month) {
    const map = {};
    ACTIVITIES.forEach((a) => {
      if (!a.date.startsWith(year)) return;
      if (month != null && +a.date.slice(5, 7) - 1 !== month) return;
      const day = a.date.slice(8, 10);
      const km = a.distanceKm || 0;
      const e = map[day] || { km: 0, items: [] };
      e.km += km;
      if (km > 0) e.items.push(`${actTitle(a)} · ${km.toFixed(1)}km`);
      else e.items.push(actTitle(a));
      map[day] = e;
    });
    return map;
  }

  function renderCalendar() {
    const panel = $('#calPanel');
    if (!panel) return;
    const now = new Date();
    if (calY == null) { calY = now.getFullYear(); calM = now.getMonth(); }
    const first = new Date(calY, calM, 1);
    const daysInMonth = new Date(calY, calM + 1, 0).getDate();
    const startDow = first.getDay(); // 周日=0（与年度热力图一致）
    const title = LANG === 'en'
      ? `${MON_EN[calM]} ${calY}`
      : `${calY} 年 ${calM + 1} 月`;
    const wds = (t('calWeekdays') || '').split(',');
    const byDay = dailyKmMap(String(calY), calM);
    const maxKm = Math.max(1, ...Object.values(byDay).map((e) => e.km));
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    let html = `<div class="trend-title" style="text-align:center">${title}</div>
      <div class="cal-grid">`;
    wds.forEach((w) => { html += `<div class="cal-wd">${w}</div>`; });
    for (let i = 0; i < startDow; i++) html += '<div></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${calY}-${String(calM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const e = byDay[ds.slice(8)];
      const km = e ? e.km : 0;
      const op = km > 0 ? Math.min(0.14 + (km / maxKm) * 0.5, 0.64) : 0;
      const isToday = ds === todayStr ? ' cal-today' : '';
      const tip = e ? e.items.map((x) => `${ds.slice(5)} ${x}`).join('\n') : '';
      html += `<div class="cal-cell${isToday}" style="${op ? `background:rgba(47,128,237,${op.toFixed(2)})` : ''}"
        title="${tip}"><b>${d}</b>${km > 0 ? `<span>${km >= 10 ? km.toFixed(0) : km.toFixed(1)}</span>` : ''}</div>`;
    }
    html += '</div>';
    panel.innerHTML = html;
    equalizeMonthRow();
  }

  function bindCalendarNav() {
    const prev = $('#calPrev'), next = $('#calNext'), today = $('#calToday');
    if (prev) prev.addEventListener('click', () => {
      calM--; if (calM < 0) { calM = 11; calY--; } renderCalendar();
    });
    if (next) next.addEventListener('click', () => {
      calM++; if (calM > 11) { calM = 0; calY++; } renderCalendar();
    });
    if (today) today.addEventListener('click', () => {
      const n = new Date(); calY = n.getFullYear(); calM = n.getMonth(); renderCalendar();
    });
  }

  /* ----------------------------- 周连续（周历） ----------------------------- */
  // 连续周数：周一为一周之始；本周有运动则从本周起算，否则从上周起算。
  // 注意：不能用 toISOString()（按 UTC 换算，东八区会退一天），需手动格式化本地日期。
  const _ymdLocal = (dt) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

  // 小周历锚定的那一周的「周一」：
  //   · 当年 → 真实本周（跟随真实日期，未来几天自然留空）；
  //   · 往年 → 该年最后一个「完整周」（整周 7 天都落在该年内，避免跨年取数）。
  // 此前 calcWeekStreak / weekStripHTML 都直接 new Date()，锚死在「真实本周」，
  // 导致切换年份时「连续周数」和小周历都永远显示本周、不随年份更新。
  function weekStripMonday(year) {
    const y = Number(year);
    const now = new Date();
    if (y === now.getFullYear()) {
      const d = new Date(now);
      d.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // 本周周一
      return d;
    }
    const lastDay = new Date(y, 11, 31);
    const mon = new Date(lastDay);
    mon.setDate(lastDay.getDate() - ((lastDay.getDay() + 6) % 7));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    if (sun > lastDay) mon.setDate(mon.getDate() - 7); // 该周跨年 → 退回上一个完整周
    return mon;
  }

  function calcWeekStreak(dates, year) {
    const set = new Set(dates);
    const wk = (d) => {
      const dt = new Date(d + 'T00:00:00');
      dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); // 回到本周周一
      return _ymdLocal(dt);
    };
    const weeks = new Set([...set].map(wk));
    let cur = _ymdLocal(weekStripMonday(year));
    let n = 0;
    if (!weeks.has(cur)) {
      const d = new Date(cur + 'T00:00:00');
      d.setDate(d.getDate() - 7);
      cur = _ymdLocal(d);
    }
    while (weeks.has(cur)) {
      n++;
      const d = new Date(cur + 'T00:00:00');
      d.setDate(d.getDate() - 7);
      cur = _ymdLocal(d);
    }
    return n;
  }

  // 按「完整日期」聚合某年里程：{ 'YYYY-MM-DD': {km, items} }
  // 不能用 dailyKmMap(year, null)——后者以「月内日号」为键，会把 9/5 命中成 8/5 的记录
  // （跨月串数据），且跨月周（如 8/31~9/6）取不到次月数据，导致周历数字错乱。
  function dateKmMap(year) {
    const map = {};
    ACTIVITIES.forEach((a) => {
      if (!String(a.date).startsWith(String(year))) return;
      const km = a.distanceKm || 0;
      const e = map[a.date] || { km: 0, items: [] };
      e.km += km;
      if (km > 0) e.items.push(`${actTitle(a)} · ${km.toFixed(1)}km`);
      else e.items.push(actTitle(a));
      map[a.date] = e;
    });
    return map;
  }

  // 锚定周（周一起）7 格小周历 —— 跟随 currentYear 变化
  function weekStripHTML(year) {
    const monday = weekStripMonday(year);
    const wds = (t('calWeekdays') || '').split(',');
    const order = [1, 2, 3, 4, 5, 6, 0]; // 周一起
    const byDate = dateKmMap(year);
    let html = '<div class="week-strip">';
    order.forEach((dw) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + order.indexOf(dw));
      const ds = _ymdLocal(d);
      const e = byDate[ds];
      const km = e ? e.km : 0;
      const on = km > 0;
      html += `<div class="ws-cell${on ? ' on' : ''}" title="${ds}${e && e.items.length ? '\n' + e.items.join('\n') : ''}">
        <i>${wds[dw]}</i>${on ? `<b>${km >= 10 ? km.toFixed(0) : km.toFixed(1)}</b>` : '<u>&nbsp;</u>'}</div>`;
    });
    html += '</div>';
    return html;
  }

  /* ----------------------------- 活动列表 ----------------------------- */
  let actFilter = 'all';
  let actLimit = 10;   // 最近活动列表只显示最近的 10 条；点击 PB 跳转时临时放大，确保目标活动出现在列表里

  function renderActivities() {
    const year = currentYear;
    let acts = ACTIVITIES.filter((a) => a.date.startsWith(year));
    if (actFilter !== 'all') acts = acts.filter((a) => activityCategory(a) === actFilter);
    acts = acts.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, actLimit);

    if (!acts.length) {
      const msg = actFilter === 'all' ? t('actEmptyAll') : t('actEmpty').replace('{type}', categoryLabel(actFilter));
      $('#activityList').innerHTML = `<li class="activity-item"><div class="activity-main">${msg}</div></li>`;
      return;
    }

    $('#activityList').innerHTML = acts
      .map((a) => {
        // 主标题用归并后的类别（"深圳市 跑步"/"深圳市 跑步"→ 户外跑步），
        // 真实活动名降为副标题，避免同一类运动被地点拆得七零八落
        const cat = activityCategory(a);
        const c = CATEGORIES[cat] || CATEGORIES.other;
        const sub = actTitle(a);
        const main = categoryLabel(cat);
        return `
        <li class="activity-item">
          <div class="activity-icon" style="background:${c.color}1a;color:${c.color}">${c.icon}</div>
          <div class="activity-main">
            <div class="activity-title">${main}</div>
            ${sub && sub !== main ? `<div class="activity-sub">${sub}</div>` : ''}
            <div class="activity-date">${fmtDate(a.date)}</div>
          </div>
          <div class="activity-metrics">
            ${a.distanceKm ? `<div><span class="v">${a.distanceKm.toFixed(1)}</span><span class="k">km</span></div>` : ''}
            <div><span class="v">${fmtDuration(a.movingTimeSec)}</span><span class="k">${t('actDuration')}</span></div>
            ${a.elevationM ? `<div><span class="v">${a.elevationM}</span><span class="k">${t('actElev')}</span></div>` : ''}
            ${a.avgHr ? `<div><span class="v">${a.avgHr}</span><span class="k">${t('actHr')}</span></div>` : ''}
          </div>
        </li>`;
      })
      .join('');
  }

  function bindActivityFilters() {
    $$('#activityFilters .chip').forEach((chip) =>
      chip.addEventListener('click', () => {
        $$('#activityFilters .chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        actFilter = chip.dataset.cat;
        renderActivities();
      })
    );
  }

  /* ----------------------------- 轨迹墙 ----------------------------- */
  // 相似路线聚合：同类型 + 起点相近(≤250m) + 距离相近(±max(0.3km,10%))
  // → 视为同一条路线（如每晚同一条环线），墙上只占一格，可翻看历史。
  // 入参按日期倒序；返回分组数组，天然按「最新成员日期」倒序。
  function groupRoutes(acts) {
    const dist = (p, q) => {
      const rad = Math.PI / 180;
      const dx = (p[1] - q[1]) * rad * Math.cos(p[0] * rad);
      const dy = (p[0] - q[0]) * rad;
      return Math.sqrt(dx * dx + dy * dy) * 6371000;
    };
    const groups = [];
    for (const a of acts) {
      let g = null;
      if (a.track && a.track.length >= 2) {
        for (const gr of groups) {
          const ref = gr.acts[0]; // 组内最新一条作为代表
          if (ref.type !== a.type || !ref.track || ref.track.length < 2) continue;
          if (Math.abs(a.distanceKm - ref.distanceKm) >
              Math.max(0.3, 0.10 * Math.max(a.distanceKm, ref.distanceKm))) continue;
          if (dist(a.track[0], ref.track[0]) > 250) continue;
          g = gr; break;
        }
      }
      if (!g) { g = { acts: [] }; groups.push(g); }
      g.acts.push(a);
    }
    return groups;
  }

  function renderTracks() {
    const year = currentYear;
    const acts = ACTIVITIES.filter(
      (a) => a.date.startsWith(year) &&
        ['run', 'walk', 'ride', 'hike', 'moto'].includes(a.type) &&
        a.distanceKm > 0 &&
        a.track && a.track.length >= 2   // 仅展示有真实 GPS 轨迹的，无轨迹（室内步行等）不放进轨迹墙
    )
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    // 相似路线聚合后取最近 12 条路线（而非 12 条活动），避免同一环线刷屏
    const groups = groupRoutes(acts).slice(0, 12);

    if (!groups.length) {
      $('#tracksGrid').innerHTML = `<p class="muted">${t('tracksEmpty')}</p>`;
      return;
    }

    currentTrackActs = groups;
    $('#tracksGrid').innerHTML = groups
      .map((g, i) => {
        const a = g.acts[0]; // 代表 = 最新一次
        const color = SPORT[a.type].color;
        const hasReal = typeof window !== 'undefined' && window.REALDATA;
        // 真实数据缺 GPS 时显示占位图；假曲线只用于内置示例数据
        const svg = (a.track && a.track.length >= 2) ? realTrackSVG(a.track, color)
          : (hasReal ? emptyTrackSVG(color) : routeSVG(color, a.date));
        const n = g.acts.length;
        const pager = n > 1
          ? `<span class="t-page" data-d="-1" title="${t('routePrev')}">‹</span>` +
            `<span class="t-page" data-d="1" title="${t('routeNext')}">›</span>`
          : '';
        return `
        <div class="track-card" data-idx="${i}" data-pos="0"
             title="${a.date} · ${actTitle(a)} · ${a.distanceKm.toFixed(1)}km${n > 1 ? ` · ${t('routeTimes').replace('{n}', n)}` : ''} ${t('tracksFocus')}">
          ${n > 1 ? `<span class="track-badge">×${n}</span>` : ''}
          <span class="t-svg">${svg}</span>
          <div class="t-title">${actTitle(a)}</div>
          <div class="t-meta">${a.distanceKm.toFixed(1)}km · ${fmtDate(a.date).split(' · ')[0]}${n > 1 ? ` · <span class="t-cur">1/${n}</span>` : ''}</div>
          <span class="t-nav">${pager}</span>
        </div>`;
      })
      .join('');

    const showMember = (card, pos, focus) => {
      const g = currentTrackActs[+card.dataset.idx];
      if (!g) return;
      pos = ((pos % g.acts.length) + g.acts.length) % g.acts.length;
      card.dataset.pos = String(pos);
      const a = g.acts[pos];
      const color = SPORT[a.type].color;
      const hasReal = typeof window !== 'undefined' && window.REALDATA;
      const svg = (a.track && a.track.length >= 2) ? realTrackSVG(a.track, color)
        : (hasReal ? emptyTrackSVG(color) : routeSVG(color, a.date));
      card.querySelector('.t-svg').innerHTML = svg;
      const n = g.acts.length;
      card.querySelector('.t-meta').innerHTML =
        `${a.distanceKm.toFixed(1)}km · ${fmtDate(a.date).split(' · ')[0]}${n > 1 ? ` · <span class="t-cur">${pos + 1}/${n}</span>` : ''}`;
      card.title = `${a.date} · ${actTitle(a)} · ${a.distanceKm.toFixed(1)}km${n > 1 ? ` · ${t('routeTimes').replace('{n}', n)}` : ''} ${t('tracksFocus')}`;
      if (focus) focusTrackOnMap(a);
    };

    // 点击卡片 → 在地图上聚焦当前成员；‹ › 仅翻看历史，不动地图
    $$('#tracksGrid .track-card').forEach((card) => {
      card.addEventListener('click', (ev) => {
        const pg = ev.target.closest('.t-page');
        const g = currentTrackActs[+card.dataset.idx];
        if (!g) return;
        if (pg) {
          ev.stopPropagation();
          showMember(card, +card.dataset.pos + Number(pg.dataset.d), false);
        } else {
          const a = g.acts[+card.dataset.pos || 0];
          if (a) focusTrackOnMap(a);
        }
      });
    });
  }

  // 由真实 GPS 轨迹 [[lat,lon],...] 绘制（按经纬度归一化到 viewBox）
  function realTrackSVG(track, color) {
    const W = 130, H = 80, pad = 8;
    const lats = track.map((p) => p[0]);
    const lons = track.map((p) => p[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const spanLat = maxLat - minLat || 1e-6;
    const spanLon = maxLon - minLon || 1e-6;
    const pts = track.map(([la, lo]) => [
      pad + ((lo - minLon) / spanLon) * (W - 2 * pad),
      pad + (1 - (la - minLat) / spanLat) * (H - 2 * pad),
    ]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const s = pts[0], e = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${s[0].toFixed(1)}" cy="${s[1].toFixed(1)}" r="3" fill="${color}" opacity=".9"/>
      <circle cx="${e[0].toFixed(1)}" cy="${e[1].toFixed(1)}" r="3.4" fill="${color}"/>
    </svg>`;
  }

  // 无真实 GPS 轨迹时的占位图（真实数据不画假曲线，避免误导）
  function emptyTrackSVG(color) {
    const W = 130, H = 80, y = H / 2;
    return `<svg viewBox="0 0 ${W} ${H}">
      <line x1="16" y1="${y}" x2="${W - 16}" y2="${y}" stroke="${color}" stroke-width="1.6"
        stroke-dasharray="5 5" opacity=".38" stroke-linecap="round"/>
      <circle cx="16" cy="${y}" r="2.6" fill="${color}" opacity=".5"/>
      <circle cx="${W - 16}" cy="${y}" r="2.6" fill="${color}" opacity=".5"/>
      <text x="${W / 2}" y="${y - 9}" text-anchor="middle" font-size="9.5"
        fill="${color}" opacity=".62">暂无轨迹</text>
    </svg>`;
  }

  // 由日期生成确定性的「伪轨迹」曲线（仅内置示例数据使用）
  function routeSVG(color, seedStr) {
    let seed = 0;
    for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) | 0;
    const rnd = mulberry32Safe(seed >>> 0);
    const W = 130, H = 80, pad = 8;
    let x = pad, y = H / 2 + (rnd() - 0.5) * 30;
    let d = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    const steps = 7;
    for (let i = 0; i < steps; i++) {
      x += (W - 2 * pad) / steps;
      y += (rnd() - 0.5) * 46;
      y = Math.max(pad, Math.min(H - pad, y));
      const cx = x - (W - 2 * pad) / steps / 2;
      d += ` Q ${cx.toFixed(1)} ${(y + (rnd() - 0.5) * 20).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return `<svg viewBox="0 0 ${W} ${H}">
      <path d="${d}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${pad}" cy="${(H/2)}" r="3" fill="${color}" opacity=".9"/>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4" fill="${color}"/>
    </svg>`;
  }

  function mulberry32Safe(seed) {    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ----------------------------- 轨迹地图 ----------------------------- */
  function mapTileUrl() {
    // CARTO 强制 API key（水印）、OSM 主站国内不稳定，改用 Esri Canvas 灰阶底图：
    // 无 key、全球 CDN 国内访问快，且自带亮/暗两套风格。
    // 注意 Esri 模板是 {z}/{y}/{x}（y 在前），最大层级 16。
    const dark = document.body.classList.contains('dark');
    const svc = dark ? 'Canvas/World_Dark_Gray_Base' : 'Canvas/World_Light_Gray_Base';
    return `https://server.arcgisonline.com/ArcGIS/rest/services/${svc}/MapServer/tile/{z}/{y}/{x}`;
  }
  function mapAttribution() {
    return 'Tiles &copy; Esri — Esri, HERE, Garmin, FAO, NOAA, USGS';
  }

  function initMap() {
    if (map) return;
    const el = $('#trackMap');
    if (!el) return;
    if (typeof L === 'undefined') {
      el.innerHTML =
        '<div style="height:100%;display:grid;place-items:center;text-align:center;padding:24px;color:var(--muted)">' +
        t('mapError') + '</div>';
      return;
    }
    map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
      .setView([22.55, 114.06], 11); // 默认深圳，随后按轨迹自适应
    mapTile = L.tileLayer(mapTileUrl(), {
      subdomains: 'abcd', maxZoom: 16, attribution: mapAttribution(),
      errorTileUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    }).addTo(map);
    // 瓦片因网络受限加载失败时给出提示（底图可能为空，但轨迹线仍会绘制）
    let tileErrors = 0;
    mapTile.on('tileerror', () => {
      tileErrors++;
      const hint = $('.map-hint');
      if (tileErrors > 8 && hint && !hint.dataset.warn) {
        hint.dataset.warn = '1';
        hint.textContent = t('mapTileError');
      }
    });
    mapTrackGroup = L.layerGroup().addTo(map);
    window.addEventListener('resize', () => map && map.invalidateSize());
  }

  function drawTracksOnMap() {
    if (!map || !mapTrackGroup) return;
    mapTrackGroup.clearLayers();
    mapTrackRefs = [];
    const year = currentYear;
    const acts = ACTIVITIES.filter(
      (a) => a.date.startsWith(year) && a.track && a.track.length >= 2 && mapFilter.has(a.type)
    );
    let bounds = null;
    acts.forEach((a) => {
      const color = SPORT[a.type].color;
      const latlngs = a.track.map((p) => [p[0], p[1]]);
      const layer = L.polyline(latlngs, { color, weight: 3, opacity: 0.85, lineCap: 'round', lineJoin: 'round' });
      layer.bindPopup(
        `<div style="min-width:172px">
          <div style="font-size:15px;font-weight:700;margin-bottom:2px">${SPORT[a.type].icon} ${actTitle(a)}</div>
          <div style="color:#5b6675;font-size:12px;margin-bottom:6px">${fmtDate(a.date)}</div>
          <div>${t('mapDistance')} <b>${a.distanceKm ? a.distanceKm.toFixed(1) : '—'}</b> km</div>
          <div>${t('mapDuration')} <b>${fmtDuration(a.movingTimeSec)}</b></div>
          ${a.elevationM ? `<div>${t('mapElev')} <b>${a.elevationM}</b> m</div>` : ''}
          ${a.avgHr ? `<div>${t('mapHr')} <b>${a.avgHr}</b> bpm</div>` : ''}
        </div>`
      );
      layer.addTo(mapTrackGroup);
      mapTrackRefs.push({ act: a, layer });
      const b = layer.getBounds();
      bounds = bounds ? bounds.extend(b) : b;
    });
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
    }
  }

  function renderMap() {
    initMap();
    if (!map) return;
    drawTracksOnMap();
  }

  function applyMapTheme() {
    if (map && mapTile) mapTile.setUrl(mapTileUrl());
    if (fpMap && fpTile) fpTile.setUrl(mapTileUrl());
  }

  function focusTrackOnMap(a) {
    if (!map) return;
    // 若该类型被过滤隐藏，先恢复显示再聚焦
    if (a.type && !mapFilter.has(a.type)) {
      mapFilter.add(a.type);
      const chip = $(`#mapFilters .chip[data-type="${a.type}"]`);
      if (chip) chip.classList.add('active');
      drawTracksOnMap();
    }
    if (!a.track || a.track.length < 2) return;
    const b = L.latLngBounds(a.track.map((p) => [p[0], p[1]]));
    const ref = mapTrackRefs.find((r) => r.act === a);
    map.flyToBounds(b, { padding: [60, 60], maxZoom: 16, duration: 0.8 });
    if (ref) setTimeout(() => ref.layer.openPopup(), 850);
    document.getElementById('trackmap').scrollIntoView({ behavior: 'smooth' });
  }

  function bindMapFilters() {
    $$('#mapFilters .chip[data-type]').forEach((chip) =>
      chip.addEventListener('click', () => {
        const t = chip.dataset.type;
        if (mapFilter.has(t)) { mapFilter.delete(t); chip.classList.remove('active'); }
        else { mapFilter.add(t); chip.classList.add('active'); }
        drawTracksOnMap();
      })
    );
    const reset = $('#mapReset');
    if (reset) reset.addEventListener('click', () => {
      if (map && mapTrackGroup) {
        const b = mapTrackGroup.getBounds();
        if (b.isValid()) map.fitBounds(b, { padding: [24, 24], maxZoom: 15 });
      }
    });
  }

  /* ----------------------------- 习惯打卡 ----------------------------- */
  // 打卡数值文案：有次数显示次数（冷水澡按"次"），否则显示时长
  function checkinVal(c) {
    if (!c) return '';
    if (c.reps) return `${c.reps} ${c.item === 'coldshower' ? t('habitUnitTimes') : t('habitUnitReps')}`;
    if (c.sec) return fmtDuration(c.sec);
    return '';
  }

  function renderHabits() {
    const section = document.getElementById('habits');
    // 没有任何打卡数据（如 Coros 不含习惯打卡，checkins=[]）时，整体隐藏该板块
    if (!CHECKINS || !CHECKINS.length) {
      if (section) section.style.display = 'none';
      return;
    }
    if (section) section.style.display = '';

    const year = currentYear;
    const wrapper = $('#habitCards');
    const yearItems = CHECKINS.filter((c) => c.date.startsWith(year));
    if (!yearItems.length) {
      wrapper.innerHTML = `<p class="muted">${t('habitEmpty')}</p>`;
      return;
    }
    wrapper.innerHTML = '';

    Object.keys(HABIT).forEach((key) => {
      const h = HABIT[key];
      const items = CHECKINS.filter((c) => c.item === key && c.date.startsWith(year));
      // 该习惯当年无任何打卡记录 → 跳过，不渲染卡片（如冷水澡暂未记录则隐藏）
      if (!items.length) return;
      const daySet = new Set(items.map((i) => i.date));
      // reps = 真实次数（俯卧撑/卷腹/深蹲）；sec = 时长秒数（含平板支撑）。
      // 两者严格分开统计：老记录可能只有 sec（当年 Keep 未记次数）。
      const totalReps = items.reduce((s, i) => s + (i.reps || 0), 0);
      const totalSec = items.reduce((s, i) => s + (i.sec || 0), 0);
      const hasReps = items.some((i) => i.reps);
      const hasSec = items.some((i) => i.sec);
      const byDay = {};
      items.forEach((i) => { byDay[i.date] = i; });
      const dayTip = (i) => {
        if (!i) return '';
        const parts = [];
        if (i.reps) parts.push(`${i.reps} ${key === 'coldshower' ? t('habitUnitTimes') : t('habitUnitReps')}`);
        if (i.sec) parts.push(fmtDuration(i.sec));
        return `${i.date.slice(5)} · ${parts.join(' · ')}`;
      };
      const days = items.length;
      const streak = calcStreak(items.map((i) => i.date));
      // 最近一次（不限当年）：日期 + 次数/时长
      const last = CHECKINS.reduce((m, c) => (c.item === key && (!m || c.date > m.date) ? c : m), null);
      const lval = checkinVal(last);
      const lastTxt = last ? `${t('habitLast')} ${last.date.slice(5)}${lval ? ` · ${lval}` : ''}` : '';

      // 小热力图（与年度热力图同布局）
      const first = new Date(year, 0, 1);
      const start = new Date(first); start.setDate(start.getDate() - first.getDay());
      const yEnd = new Date(year, 11, 31);  // 注意：last 已被上方"最近一次打卡"占用，勿重复声明
      const end = new Date(yEnd); end.setDate(end.getDate() + (6 - yEnd.getDay()));
      const cells = [];
      const cur = new Date(start);
      while (cur <= end) {
        const inYear = cur.getFullYear() === year;
        const on = inYear && daySet.has(ymd(cur));
        const tip = on ? dayTip(byDay[ymd(cur)]) : '';
        cells.push(`<div class="c ${on ? 'on' : ''}"${tip ? ` title="${tip}"` : ''}></div>`);
        cur.setDate(cur.getDate() + 1);
      }

      const card = document.createElement('div');
      card.className = 'habit-card';
      card.innerHTML = `
        <div class="habit-head">
          <span class="ico">${h.icon}</span>
          <h3>${habitLabel(key)}</h3>
          <span class="streak">${t('habitStreak').replace('{n}', streak)}</span>
        </div>
        <div class="habit-mini-grid">${cells.join('')}</div>
        <div class="habit-foot">
          <div><b>${days}</b>${t('habitDays')}</div>
          ${hasReps ? `<div><b>${totalReps.toLocaleString()}</b>${key === 'coldshower' ? t('habitUnitTimes') : t('habitUnitReps')}</div>` : ''}
          ${hasSec ? `<div><b>${fmtDuration(totalSec)}</b></div>` : ''}
        </div>
        <div class="habit-last">${lastTxt}</div>`;
      wrapper.appendChild(card);
    });
  }

  /* ----------------------------- 足迹地图 ----------------------------- */
  let fpMap = null, fpTile = null, fpClusterGroup = null, fpDetailGroup = null,
      fpCityGroup = null, fpLegend = null, fpMode = 'cluster';
  let fpData = null, _fpKey = null;  // 聚类缓存按 fpYear 分键，切年/轨迹注入后必须清
  let fpYear = null;                 // 年份筛选：null = 全部年份
  const _fpCityCache = {};           // 城市热度缓存：yearKey -> {byAd, maxN}
  let _fpGeoLoading = false;         // 城市边界脚本懒加载中

  // 聚类点 → 城市标注：在锚点匹配半径内取「归属度」最高者（dist/r 最小），
  // 无命中则不标注，避免大城市锚点把邻市活动抢走
  function fpCityFor(lat, lng) {
    const rad = Math.PI / 180;
    let best = null, bestScore = Infinity;
    for (const c of FOOTPRINT_CITIES) {
      const dx = (c.lng - lng) * rad * Math.cos(lat * rad);
      const dy = (c.lat - lat) * rad;
      const km = Math.sqrt(dx * dx + dy * dy) * 6371;
      if (km > (c.r || 25)) continue;
      const score = km / (c.r || 25);
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  // 参与足迹统计的活动（GPS 起点 + 有里程），按当前 fpYear 过滤
  function fpActs() {
    return ACTIVITIES.filter((a) =>
      (!fpYear || a.date.startsWith(fpYear)) &&
      a.track && a.track.length >= 2 && a.distanceKm > 0);
  }

  // 足迹可选年份（有 GPS 活动的年份，倒序）
  function fpYears() {
    return [...new Set(ACTIVITIES
      .filter((a) => a.track && a.track.length >= 2 && a.distanceKm > 0)
      .map((a) => a.date.slice(0, 4)))].sort().reverse();
  }

  // 全库带 GPS 的活动按 0.1°（约 11km）网格聚类为「足迹点」（随 fpYear 变化）
  function computeFootprint() {
    const key = fpYear || 'all';
    if (fpData && _fpKey === key) return fpData;
    const grid = new Map();
    fpActs().forEach((a) => {
      const la = a.track[0][0], lo = a.track[0][1];
      const key = `${la.toFixed(1)},${lo.toFixed(1)}`;
      let c = grid.get(key);
      if (!c) {
        c = { lat: 0, lng: 0, n: 0, km: 0, types: {}, first: a.date, last: a.date, acts: [] };
        grid.set(key, c);
      }
      c.lat += la; c.lng += lo; c.n += 1; c.km += a.distanceKm || 0;
      c.types[a.type] = (c.types[a.type] || 0) + 1;
      if (a.date < c.first) c.first = a.date;
      if (a.date > c.last) c.last = a.date;
      c.acts.push(a);
    });
    fpData = [];
    grid.forEach((c) => {
      c.lat /= c.n; c.lng /= c.n; c.km = Math.round(c.km * 10) / 10;
      const city = fpCityFor(c.lat, c.lng);
      if (city) { c.city = city; }
      fpData.push(c);
    });
    fpData.sort((a, b) => b.n - a.n);
    _fpKey = key;
    return fpData;
  }

  /* ---------- 城市热度（choropleth）：GPS 起点点在多边形内归属城市 ---------- */

  // 射线法：单环内判定（坐标 [lng, lat]）
  function pointInRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  // Polygon / MultiPolygon 奇偶规则（含洞）
  function pointInGeometry(x, y, geom) {
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : (geom.coordinates || []);
    for (const poly of polys) {
      let inPoly = false;
      for (const ring of poly) { if (pointInRing(x, y, ring)) inPoly = !inPoly; }
      if (inPoly) return true;
    }
    return false;
  }

  // 城市英文名：real_citygeo 的 name 是中文（"绍兴市"/"香港特别行政区"），
  // 用 FOOTPRINT_CITIES 的 zh 前缀匹配转 en，失败则去后缀用中文
  function cityNameEn(zhName) {
    for (const c of FOOTPRINT_CITIES) {
      if (zhName.startsWith(c.zh)) return c.en;
    }
    return zhName.replace(/(特别行政区|自治区|市|县|盟)$/, '');
  }

  // 城市热度聚合：{ byAd: Map(adcode -> agg), maxN, feats }
  function computeCityHeat() {
    const key = fpYear || 'all';
    if (_fpCityCache[key]) return _fpCityCache[key];
    const geo = window.REAL_CITYGEO;
    const feats = (geo && geo.features) || [];
    // 预计算 bbox 加速粗筛：[minLng, minLat, maxLng, maxLat]
    const idx = feats.map((f) => {
      let b = [181, 91, -181, -91];
      const walk = (ring) => ring.forEach(([x, y]) => {
        if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y;
        if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
      });
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      polys.forEach((poly) => poly[0] && walk(poly[0]));  // 仅外环即可粗筛
      return { f, b };
    });
    const byAd = new Map();
    fpActs().forEach((a) => {
      const x = a.track[0][1], y = a.track[0][0];  // track 是 [lat, lng]
      for (const it of idx) {
        if (x < it.b[0] || x > it.b[2] || y < it.b[1] || y > it.b[3]) continue;
        if (!pointInGeometry(x, y, it.f.geometry)) continue;
        let c = byAd.get(it.f.properties.adcode);
        if (!c) {
          c = { ad: it.f.properties.adcode, name: it.f.properties.name, n: 0, km: 0, types: {}, first: a.date, last: a.date };
          byAd.set(it.f.properties.adcode, c);
        }
        c.n += 1; c.km += a.distanceKm || 0;
        c.types[a.type] = (c.types[a.type] || 0) + 1;
        if (a.date < c.first) c.first = a.date;
        if (a.date > c.last) c.last = a.date;
        break;  // 归属第一个命中城市（地级市边界基本不重叠）
      }
    });
    let maxN = 1;
    byAd.forEach((c) => { if (c.n > maxN) maxN = c.n; c.km = Math.round(c.km); });
    const res = { byAd, maxN };
    _fpCityCache[key] = res;
    return res;
  }

  // 热度色：√ 比例，浅红 → 深红
  function heatColor(t) {
    return `hsl(6, 68%, ${(72 - t * 38).toFixed(1)}%)`;
  }

  // 城市多边形 bbox 中心（用于常驻城市名标注，城市近似凸形足够）
  function featCenter(f) {
    let b = [181, 91, -181, -91];
    const walk = (ring) => ring.forEach(([x, y]) => {
      if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
    });
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    polys.forEach((poly) => poly[0] && walk(poly[0]));
    return [(b[1] + b[3]) / 2, (b[0] + b[2]) / 2]; // [lat, lng]
  }

  // 城市边界脚本懒加载（304KB，与 real_tracks.js 同款异步注入）
  function loadCityGeo() {
    if (typeof window.REAL_CITYGEO !== 'undefined' || _fpGeoLoading) return;
    _fpGeoLoading = true;
    const s = document.createElement('script');
    s.src = 'assets/js/real_citygeo.js?v=20260830k';
    s.onload = () => { _fpGeoLoading = false; drawFootprint(); };
    s.onerror = () => { _fpGeoLoading = false; console.warn('real_citygeo.js 加载失败，城市热度模式不可用'); };
    document.head.appendChild(s);
  }

  function drawCityHeat() {
    if (typeof window.REAL_CITYGEO === 'undefined') {
      $('#fpStats').textContent = t('fpLoadingGeo');
      loadCityGeo();
      return;
    }
    const heat = computeCityHeat();
    const byAd = heat.byAd, maxN = heat.maxN;
    const nActs = [...byAd.values()].reduce((s, c) => s + c.n, 0);

    fpClusterGroup && fpMap.removeLayer(fpClusterGroup);
    fpDetailGroup && fpMap.removeLayer(fpDetailGroup);
    fpMap.removeLayer(fpCityGroup);
    if (fpLegend) fpLegend.getContainer().style.display = '';

    fpCityGroup.clearLayers();
    L.geoJSON(window.REAL_CITYGEO, {
      style: (feat) => {
        const h = byAd.get(feat.properties.adcode);
        const tt = h ? Math.sqrt(h.n / maxN) : 0;
        return {
          color: '#a83232', weight: tt > 0 ? 1.2 : 0.6,
          opacity: tt > 0 ? 0.9 : 0.35,
          fillColor: heatColor(tt),
          fillOpacity: tt > 0 ? 0.3 + tt * 0.45 : 0.05,
        };
      },
      onEachFeature: (feat, layer) => {
        const c = byAd.get(feat.properties.adcode);
        if (!c) return;
        const label = LANG === 'en' ? cityNameEn(c.name) : c.name;
        const typesTxt = Object.entries(c.types).sort((x, y) => y[1] - x[1])
          .map(([k, n]) => `${sportLabel(k)} ×${n}`).join(' · ');
        layer.bindPopup(
          `<b>${label}</b><br>${c.n} ${t('statWorkoutUnit')} · ${c.km.toLocaleString()} km` +
          `<br>${typesTxt}<br><span style="opacity:.65">${c.first} → ${c.last}</span>`);
        layer.on('mouseover', () => layer.setStyle({ weight: 2, opacity: 1 }));
        layer.on('mouseout', () => layer.setStyle({ weight: 1.2, opacity: 0.9 }));
        // 常驻城市名标签（浅色描边，叠在地图上清晰可读）
        const ctr = featCenter(feat);
        const mk = L.marker(ctr, {
          interactive: false,
          icon: L.divIcon({
            className: 'fp-city-pin',
            html: `<span>${label}</span>`,
            iconSize: [0, 0],
          }),
        });
        fpCityGroup.addLayer(mk);
      },
    }).addTo(fpCityGroup);
    fpCityGroup.addTo(fpMap);

    // 统计行 + 图例
    $('#fpStats').innerHTML =
      `<b>${byAd.size}</b> / ${FOOTPRINT_CITIES.length} ${t('fpInCities')} · ` +
      `<b>${nActs}</b> ${t('statWorkoutUnit')} · ${t('fpTotalKm')} ` +
      `<b>${[...byAd.values()].reduce((s, c) => s + c.km, 0).toLocaleString()} km</b>`;
    const lg = fpLegend && fpLegend.getContainer();
    if (lg) {
      lg.innerHTML =
        `<span>${t('fpHeatFew')}</span>` +
        `<span class="fp-legend-bar"></span>` +
        `<span>${t('fpHeatMany')} (${maxN})</span>`;
    }

    // 视角：有数据城市的整体范围（无数据则全国）
    const pts = [];
    window.REAL_CITYGEO.features.forEach((f) => {
      if (!byAd.get(f.properties.adcode)) return;
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      polys.forEach((poly) => poly[0] && poly[0].forEach(([x, y]) => pts.push([y, x])));
    });
    if (pts.length) {
      const b = L.latLngBounds(pts);
      if (b.isValid()) {
        const cur = fpMap.getBounds();
        if (!cur.intersects(b)) fpMap.fitBounds(b, { padding: [30, 30], maxZoom: 10 });
      }
    }
  }

  function initFootprint() {
    if (fpMap) return;
    const el = $('#footprintMap');
    if (!el) return;
    if (typeof L === 'undefined') {
      el.innerHTML =
        '<div style="height:100%;display:grid;place-items:center;text-align:center;padding:24px;color:var(--muted)">' +
        t('mapError') + '</div>';
      return;
    }
    fpMap = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    // 必须先给初始视图：无 center/zoom 时 add circleMarker 会抛 "Set map center and zoom first"，
    // 后续 fitBounds 只能调整、不能代替初始视图
    fpMap.setView([33.5, 110.0], 4);
    fpTile = L.tileLayer(mapTileUrl(), {
      subdomains: 'abcd', maxZoom: 16, attribution: mapAttribution(),
      errorTileUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    }).addTo(fpMap);
    fpClusterGroup = L.layerGroup();
    fpDetailGroup = L.layerGroup();
    fpCityGroup = L.layerGroup();
    // 城市热度图例（仅 city 模式显示）
    fpLegend = L.control({ position: 'bottomright' });
    fpLegend.onAdd = () => {
      const d = L.DomUtil.create('div', 'fp-legend');
      d.style.display = 'none';
      return d;
    };
    fpLegend.addTo(fpMap);
    window.addEventListener('resize', () => { fpMap && fpMap.invalidateSize(); equalizeMonthRow(); });
  }

  function drawFootprint() {
    initFootprint();
    if (!fpMap) return;
    renderFpYearSelect();   // 年份选项随轨迹注入/语言变化重建
    if (fpMode === 'city') { drawCityHeat(); return; }
    if (fpLegend) fpLegend.getContainer().style.display = 'none';
    const data = computeFootprint();
    if (!data.length) {
      $('#fpStats').textContent = t('tracksEmpty');
      return;
    }
    // 顶部统计：城市数 / 足迹点数 / 累计里程
    const cities = new Set(data.filter((c) => c.city).map((c) => c.city.zh));
    const totalKm = data.reduce((s, c) => s + c.km, 0);
    $('#fpStats').innerHTML =
      `<b>${cities.size}</b> ${t('fpCities')} · <b>${data.length}</b> ${t('fpSpots')} · ` +
      `${t('fpTotalKm')} <b>${totalKm.toFixed(0)} km</b>`;

    fpClusterGroup.clearLayers();
    fpDetailGroup.clearLayers();
    data.forEach((c) => {
      const mainType = Object.entries(c.types).sort((x, y) => y[1] - x[1])[0][0];
      const color = (SPORT[mainType] || {}).color || '#2f80ed';
      const placeLabel = c.city ? (LANG === 'en' ? c.city.en : c.city.zh) : t('fpSpot');
      const typesTxt = Object.entries(c.types).sort((x, y) => y[1] - x[1])
        .map(([k, n]) => `${sportLabel(k)} ×${n}`).join(' · ');
      const popup = `<b>${placeLabel}</b><br>${c.n} ${t('statWorkoutUnit')} · ${c.km.toFixed(1)} km` +
        `<br>${typesTxt}<br><span style="opacity:.65">${c.first} → ${c.last}</span>`;
      L.circleMarker([c.lat, c.lng], {
        radius: 7 + Math.sqrt(c.n) * 3, color, fillColor: color,
        fillOpacity: 0.32, weight: 1.5, opacity: 0.85,
      }).bindPopup(popup).addTo(fpClusterGroup);

      c.acts.forEach((a) => {
        const ac = (SPORT[a.type] || {}).color || '#2f80ed';
        L.circleMarker([a.track[0][0], a.track[0][1]], {
          radius: 3.5, color: ac, fillColor: ac, fillOpacity: 0.8, weight: 0,
        }).bindPopup(`${a.date} · ${actTitle(a)} · ${a.distanceKm.toFixed(1)}km`)
          .addTo(fpDetailGroup);
      });
    });
    // 切换视图：聚合 / 明细（先移除再挂，避免重复图层）
    fpMap.removeLayer(fpClusterGroup);
    fpMap.removeLayer(fpDetailGroup);
    fpMap.removeLayer(fpCityGroup);
    (fpMode === 'cluster' ? fpClusterGroup : fpDetailGroup).addTo(fpMap);
    const b = L.latLngBounds(data.map((c) => [c.lat, c.lng]));
    if (b.isValid()) {
      const cur = fpMap.getBounds();
      if (!cur.intersects(b) || fpMap.getZoom() == null) fpMap.fitBounds(b, { padding: [30, 30], maxZoom: 13 });
    }
  }

  // 年份下拉（select 比 10 个 chip 紧凑，且对三种模式统一生效）
  function renderFpYearSelect() {
    const sel = $('#fpYearSel');
    if (!sel) return;
    const years = fpYears();
    const cur = fpYear || 'all';
    sel.innerHTML =
      `<option value="all">${t('fpAllYears')}</option>` +
      years.map((y) => `<option value="${y}">${y}</option>`).join('');
    sel.value = cur;
    if (sel.value !== cur) { fpYear = null; sel.value = 'all'; }  // 选项缺失时回退
  }

  function bindFootprintFilters() {
    $$('#fpFilters .chip[data-fp]').forEach((chip) =>
      chip.addEventListener('click', () => {
        fpMode = chip.dataset.fp;
        $$('#fpFilters .chip').forEach((x) => x.classList.toggle('active', x === chip));
        drawFootprint();
      })
    );
    const sel = $('#fpYearSel');
    if (sel) {
      sel.addEventListener('change', () => {
        fpYear = sel.value === 'all' ? null : sel.value;
        drawFootprint();
      });
    }
  }

  /* ----------------------------- 轨迹数据按需加载 ----------------------------- */
  // real_data.js 只含摘要（首屏快）；GPS 轨迹在 real_tracks.js 里由这里异步注入，
  // 加载完成后重绘轨迹墙/地图/足迹。file:// 本地预览同样可用（script 注入不受 CORS 限制）。
  let _tracksLoading = false;
  function hydrateTracks() {
    const tr = window.REALTRACKS;
    if (!tr) return false;
    let n = 0;
    ACTIVITIES.forEach((a, i) => {
      if (!a.track && tr[i] && tr[i].length) { a.track = tr[i]; n++; }
    });
    return n > 0;
  }
  function redrawTrackViews() {
    fpData = null;      // 轨迹异步注入后必须清缓存，否则足迹地图永远停留在首跑时的空结果
    _fpKey = null;
    Object.keys(_fpCityCache).forEach((k) => delete _fpCityCache[k]);  // 城市热度同样需要重算
    renderTracks();
    renderMap();
    drawFootprint();
  }
  function loadTracks() {
    if (_tracksLoading || typeof window.REALDATA === 'undefined') return;
    if (typeof window.REALTRACKS !== 'undefined') {  // 已加载过（如语言切换）
      redrawTrackViews();
      return;
    }
    _tracksLoading = true;
    const s = document.createElement('script');
    s.src = 'assets/js/real_tracks.js?v=20260904a';
    s.onload = () => { if (hydrateTracks()) redrawTrackViews(); };
    s.onerror = () => console.warn('real_tracks.js 加载失败，轨迹墙/地图将显示占位图');
    document.head.appendChild(s);
  }

  /* ----------------------------- 主题切换 ----------------------------- */
  function bindTheme() {
    const btn = $('#themeToggle');
    const saved = localStorage.getItem('workouts-theme');
    if (saved === 'dark') document.body.classList.add('dark');
    btn.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
    btn.addEventListener('click', () => {
      document.body.classList.toggle('dark');
      const dark = document.body.classList.contains('dark');
      btn.textContent = dark ? '☀️' : '🌙';
      localStorage.setItem('workouts-theme', dark ? 'dark' : 'light');
      applyMapTheme();
    });
  }

  /* ----------------------------- 语言切换 ----------------------------- */
  function fillFilterChips(container) {
    $$(container + ' .chip[data-type]').forEach((chip) => {
      const ty = chip.dataset.type;
      if (ty === 'all') { chip.textContent = t('filterAll'); return; }
      const s = SPORT[ty];
      if (s) chip.textContent = s.icon + ' ' + sportLabel(ty);
    });
  }

  // 活动列表的类别筛选 chip（data-cat）。与 fillFilterChips 分开：
  // 后者还负责 #mapFilters 的 data-type 图例，不能混用选择器。
  function fillCategoryChips(container) {
    $$(container + ' .chip[data-cat]').forEach((chip) => {
      const k = chip.dataset.cat;
      if (k === 'all') { chip.textContent = t('filterAll'); return; }
      const c = CATEGORIES[k];
      if (c) chip.textContent = c.icon + ' ' + categoryLabel(k);
    });
  }

  function applyStaticLang() {
    document.documentElement.lang = LANG === 'en' ? 'en' : 'zh-CN';
    document.title = t('title');
    const meta = document.getElementById('metaDesc');
    if (meta) meta.setAttribute('content', t('desc'));
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
    const lb = document.getElementById('langToggle');
    if (lb) lb.textContent = LANG === 'en' ? '中' : 'EN';
    fillCategoryChips('#activityFilters');   // 活动列表按归并类别筛选
    fillFilterChips('#mapFilters');          // 地图仍按 type 图例筛选
    const reset = document.getElementById('mapReset');
    if (reset) reset.textContent = t('mapReset');
    // 统计作用域切换按钮文案（本年 / 累计）
    const sc1 = document.querySelector('#statScopeTabs .chip[data-scope="year"]');
    const sc2 = document.querySelector('#statScopeTabs .chip[data-scope="all"]');
    if (sc1) sc1.textContent = t('statScopeYear');
    if (sc2) sc2.textContent = t('statScopeAll');
  }

  function setLanguage(lang) {
    if (lang !== 'en' && lang !== 'zh') return;
    LANG = lang;
    try { localStorage.setItem('workouts-lang', lang); } catch (e) {}
    applyStaticLang();
    renderHero();
    renderHeatmap();
    renderStats();
    renderInsights();
    renderPB();
    renderFunFacts();
    renderActivities();
    renderTracks();
    renderHabits();
    renderMap();
    drawFootprint();   // 仅重绘（弹窗/统计文案随语言更新），不重复绑定事件
    renderTrend();
    renderCalendar();
  }

  function bindLang() {
    const lb = document.getElementById('langToggle');
    if (lb) lb.addEventListener('click', () => setLanguage(LANG === 'en' ? 'zh' : 'en'));
  }

  /* ----------------------------- 初始化 ----------------------------- */
  function init() {
    applyStaticLang();
    bindLang();
    renderHero();
    renderYearTabs();
    renderHeatmap();
    renderStats();
    renderInsights();
    renderPB();
    renderFunFacts();
    bindActivityFilters();
    renderActivities();
    renderTracks();
    bindMapFilters();
    bindTheme();        // 先应用主题（含深色模式），再初始化地图底图
    renderMap();
    renderTracks();
    renderHabits();
    renderMap();
    bindFootprintFilters();
    drawFootprint();
    loadTracks();       // 异步加载轨迹数据后自动重绘轨迹墙/地图/足迹
    renderTrend();      // 月度趋势（摘要数据即可渲染，无需等轨迹）
    bindTrendNav();     // 趋势年份 ‹ 今年 › 切换
    bindCalendarNav();
    renderCalendar();
    renderHabits();
    bindStatScope();    // 统计作用域（本年 / 累计）切换
    initHeatmapTip();   // 热力图自定义悬停提示
  }

  document.addEventListener('DOMContentLoaded', init);
})();
