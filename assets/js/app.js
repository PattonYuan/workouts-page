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
    '香港特别行政区': 'Hong Kong',
  };
  const SPORT_EN = {
    '徒步': 'Hike', '跑步': 'Run', '健走': 'Walk', '步行': 'Walk', '行走': 'Walk',
    '骑行': 'Ride', '公路骑行': 'Road Cycling', '摩托骑行': 'Motorcycle Ride',
    '呼狗崖徒步': 'Hugouya Hike',
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
  function translateTitleEn(title) {
    if (!title || !/[一-鿿]/.test(title)) return title || '';
    if (PHRASE_EN[title]) return PHRASE_EN[title];
    // 「城市 运动类型/英文短语」模式：深圳市 跑步 → Shenzhen Run；广州市 GPS Cardio → Guangzhou GPS Cardio
    const m = title.match(/^(\S+?)\s+(.+)$/);
    if (m && CITY_EN[m[1]]) return CITY_EN[m[1]] + ' ' + (SPORT_EN[m[2]] || m[2]);
    // 其余模式：轻松跑→Easy Run、长距离跑→Long Run、热身跑→Warm-up Run
    const out = title
      .replace(/轻松跑/g, ' Easy Run')
      .replace(/长距离跑/g, ' Long Run')
      .replace(/热身跑/g, 'Warm-up Run')
      .replace(/\s+/g, ' ').trim();
    return /[一-鿿]/.test(out) ? (title || '') : out;
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
  function renderStats() {
    const acts = actsInScope();

    const byType = {};
    SPORT_ORDER.forEach((t) => (byType[t] = []));
    acts.forEach((a) => { if (byType[a.type]) byType[a.type].push(a); });

    const sumKm = (arr) => arr.reduce((s, a) => s + (a.distanceKm || 0), 0);
    const sumTime = (arr) => arr.reduce((s, a) => s + a.movingTimeSec, 0);
    const sumEle = (arr) => arr.reduce((s, a) => s + (a.elevationM || 0), 0);

    const cards = [];
    SPORT_ORDER.forEach((type) => {
      const cfg = SPORT[type];
      const arr = byType[type] || [];
      if (type === 'workout') {
        cards.push({
          color: cfg.color, title: `${cfg.icon} ${sportLabel(type)}`,
          big: arr.length, unit: t('statWorkoutUnit'),
          sub: `${t('actDuration')} ${fmtDuration(sumTime(arr))}`,
        });
      } else {
        cards.push({
          color: cfg.color, title: `${cfg.icon} ${sportLabel(type)}`,
          big: sumKm(arr).toFixed(0), unit: 'km',
          sub: `${arr.length} ${t('statTimes')} · ${t('statElev').replace('{n}', sumEle(arr))}m`,
        });
      }
    });

    cards.push({
      color: 'var(--accent)', title: statScope === 'all' ? t('statTotalAll') : t('statTotal'),
      big: acts.length, unit: t('statWorkoutUnit'),
      sub: t('statTotalSub').replace('{km}', sumKm(acts).toFixed(0)).replace('{dur}', fmtDuration(sumTime(acts))),
    });

    $('#statCards').innerHTML = cards
      .map(
        (c) => `
        <div class="stat-card">
          <div class="bar" style="background:${c.color}"></div>
          <h3>${c.title}</h3>
          <div><span class="big">${c.big}</span><span class="unit">${c.unit}</span></div>
          <div class="sub">${c.sub}</div>
        </div>`
      )
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
      { color: '#27ae60', ico: '🗓️', title: t('insStreakWeeks'), big: calcWeekStreak(allDates), unit: t('insWeeksUnit'), sub: weekStripHTML() },
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
    let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block">
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
    let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;margin-top:6px">
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

  function renderTrend() {
    const tabs = $('#trendYearTabs');
    const panel = $('#trendPanel');
    if (!tabs || !panel) return;
    const years = [...new Set(ACTIVITIES.map((a) => a.date.slice(0, 4)))].sort().reverse();
    if (!years.length) { panel.innerHTML = ''; return; }
    if (!trendYear || !years.includes(trendYear)) trendYear = String(currentYear);
    tabs.innerHTML = years.map((y) =>
      `<button class="${y === trendYear ? 'active' : ''}" data-y="${y}">${y}</button>`).join('');
    $$('#trendYearTabs button').forEach((b) =>
      b.addEventListener('click', () => { trendYear = b.dataset.y; renderTrend(); }));
    panel.innerHTML =
      `<div class="trend-title">${t('trendMonthly')} · ${trendYear} (${t('trendKmUnit')})</div>` +
      trendBarsSVG(trendYear) +
      `<div class="trend-title">${t('trendCum')} · ${trendYear}</div>` +
      trendCumSVG(trendYear);
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

  function calcWeekStreak(dates) {
    const set = new Set(dates);
    const wk = (d) => {
      const dt = new Date(d + 'T00:00:00');
      dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); // 回到本周周一
      return _ymdLocal(dt);
    };
    const weeks = new Set([...set].map(wk));
    const now = new Date();
    let cur = wk(_ymdLocal(now));
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

  // 本周（周一起）7 格小周历
  function weekStripHTML() {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const wds = (t('calWeekdays') || '').split(',');
    const order = [1, 2, 3, 4, 5, 6, 0]; // 周一起
    const byDay = dailyKmMap(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, null);
    let html = '<div class="week-strip">';
    order.forEach((dw) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + order.indexOf(dw));
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const e = byDay[ds.slice(8, 10)];
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
    if (actFilter !== 'all') acts = acts.filter((a) => a.type === actFilter);
    acts = acts.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, actLimit);

    if (!acts.length) {
      const msg = actFilter === 'all' ? t('actEmptyAll') : t('actEmpty').replace('{type}', sportLabel(actFilter));
      $('#activityList').innerHTML = `<li class="activity-item"><div class="activity-main">${msg}</div></li>`;
      return;
    }

    $('#activityList').innerHTML = acts
      .map((a) => {
        const s = SPORT[a.type];
        const iconBg = `${s.color}1a`;
        return `
        <li class="activity-item">
          <div class="activity-icon" style="background:${iconBg};color:${s.color}">${s.icon}</div>
          <div class="activity-main">
            <div class="activity-title">${actTitle(a)}</div>
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
        actFilter = chip.dataset.type;
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
        ['run', 'walk', 'ride', 'hike', 'moto'].includes(a.type) && a.distanceKm > 0
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
    const dark = document.body.classList.contains('dark');
    const base = dark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/'
      : 'https://{s}.basemaps.cartocdn.com/light_all/';
    return base + '{z}/{x}/{y}{r}.png';
  }
  function mapAttribution() {
    return '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
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
      subdomains: 'abcd', maxZoom: 19, attribution: mapAttribution(),
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

  // Hero 下的「最新打卡」摘要条：最近一次打卡日期 + 当天全部动作，免滚动一眼可见
  function renderLatestStrip() {
    const el = $('#latestStrip');
    if (!el) return;
    if (!CHECKINS.length) { el.style.display = 'none'; return; }
    const latest = CHECKINS.reduce((m, c) => (c.date > m ? c.date : m), '');
    const items = CHECKINS.filter((c) => c.date === latest);
    if (!items.length) { el.style.display = 'none'; return; }
    const now = new Date();
    const yd = new Date(now); yd.setDate(now.getDate() - 1);
    const rel = latest === _ymdLocal(now) ? t('relToday')
      : latest === _ymdLocal(yd) ? t('relYesterday')
      : fmtDate(latest).split(' · ')[0];
    const parts = items.map((c) => {
      const val = checkinVal(c);
      return `<span class="ls-item"><b>${habitLabel(c.item)}</b>${val ? ` ${val}` : ''}</span>`;
    }).join('<span class="ls-sep">·</span>');
    el.innerHTML =
      `<span class="ls-title">🕐 ${t('latestTitle')}</span>` +
      `<span class="ls-date">${rel}</span>${parts}`;
    el.style.display = '';
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
  let fpMap = null, fpTile = null, fpClusterGroup = null, fpDetailGroup = null, fpMode = 'cluster';
  let fpData = null;

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

  // 全库带 GPS 的活动按 0.1°（约 11km）网格聚类为「足迹点」
  function computeFootprint() {
    if (fpData) return fpData;
    const grid = new Map();
    ACTIVITIES.forEach((a) => {
      if (!a.track || a.track.length < 2 || !(a.distanceKm > 0)) return;
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
    return fpData;
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
      subdomains: 'abcd', maxZoom: 19, attribution: mapAttribution(),
      errorTileUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    }).addTo(fpMap);
    fpClusterGroup = L.layerGroup();
    fpDetailGroup = L.layerGroup();
    window.addEventListener('resize', () => fpMap && fpMap.invalidateSize());
  }

  function drawFootprint() {
    initFootprint();
    if (!fpMap) return;
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
    (fpMode === 'cluster' ? fpClusterGroup : fpDetailGroup).addTo(fpMap);
    const b = L.latLngBounds(data.map((c) => [c.lat, c.lng]));
    if (b.isValid()) {
      const cur = fpMap.getBounds();
      if (!cur.intersects(b) || fpMap.getZoom() == null) fpMap.fitBounds(b, { padding: [30, 30], maxZoom: 13 });
    }
  }

  function bindFootprintFilters() {
    $$('#fpFilters .chip[data-fp]').forEach((chip) =>
      chip.addEventListener('click', () => {
        fpMode = chip.dataset.fp;
        $$('#fpFilters .chip').forEach((x) => x.classList.toggle('active', x === chip));
        drawFootprint();
      })
    );
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
    fpData = null;  // 轨迹异步注入后必须清缓存，否则足迹地图永远停留在首跑时的空结果
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
    s.src = 'assets/js/real_tracks.js?v=20260830';
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

  function applyStaticLang() {
    document.documentElement.lang = LANG === 'en' ? 'en' : 'zh-CN';
    document.title = t('title');
    const meta = document.getElementById('metaDesc');
    if (meta) meta.setAttribute('content', t('desc'));
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
    const lb = document.getElementById('langToggle');
    if (lb) lb.textContent = LANG === 'en' ? '中' : 'EN';
    fillFilterChips('#activityFilters');
    fillFilterChips('#mapFilters');
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
    renderLatestStrip();
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
    bindCalendarNav();
    renderCalendar();
    renderLatestStrip();
    renderHabits();
    bindStatScope();    // 统计作用域（本年 / 累计）切换
    initHeatmapTip();   // 热力图自定义悬停提示
  }

  document.addEventListener('DOMContentLoaded', init);
})();
