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
    '徒步': 'Hike', '跑步': 'Run', '健走': 'Walk', '骑行': 'Ride', '公路骑行': 'Road Cycling',
    '摩托骑行': 'Motorcycle Ride', '呼狗崖徒步': 'Hugouya Hike',
  };
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
    const since = PROFILE.since || new Date().getFullYear();
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

  /* ----------------------------- 轨迹地图状态 ----------------------------- */
  let map = null;
  let mapTile = null;
  let mapTrackGroup = null;
  const mapFilter = new Set(['run', 'walk', 'ride', 'hike', 'moto']);
  let mapTrackRefs = [];        // [{ act, layer }]
  let currentTrackActs = [];    // 轨迹墙当前展示的 12 条，用于点击联动

  /* ----------------------------- 热力图 ----------------------------- */
  let currentYear = new Date().getFullYear();

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
        renderYearTabs();
        renderHeatmap();
        renderStats();
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

    const last = new Date(year, 11, 31);
    const end = new Date(last);
    end.setDate(end.getDate() + (6 - last.getDay())); // 补齐到周六

    const cells = [];
    const firstDataCol = {};   // 每月首个「有数据」的列
    const firstCalCol = {};    // 每月 1 号所在列（无数据时兜底）
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
        // 标签对齐到「当月首个有数据的列」，避免月底活动贴着下月标签造成歧义
        if (info && firstDataCol[mo] === undefined) firstDataCol[mo] = col;
      }

      if (!inYear || !info) {
        cells.push(`<div class="hm-cell empty" title="${key}"></div>`);
      } else {
        const km = info.km;
        let lv = 0;
        if (info.count >= 1) lv = 1;
        if (km >= 5 || info.count >= 2) lv = 2;
        if (km >= 15 || info.count >= 3) lv = 3;
        if (km >= 30 || info.count >= 4) lv = 4;
        cells.push(
          `<div class="hm-cell lv${lv}" title="${key} · ${t('hmCell').replace('{count}', info.count).replace('{km}', km.toFixed(1))}"></div>`
        );
      }

      cursor.setDate(cursor.getDate() + 1);
      if (cursor.getDay() === 0) col++;
    }

    // 月份标签对齐：优先落在「当月首个有数据的列」，无数据则回退到 1 号所在列；
    // 仅当与上一个标签不在同一列时才显示，避免重叠
    const monthLabels = [];
    let lastLabelCol = -1;
    for (let mo = 0; mo < 12; mo++) {
      if (firstCalCol[mo] === undefined) continue;
      const c = firstDataCol[mo] !== undefined ? firstDataCol[mo] : firstCalCol[mo];
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
    $('#heatmapGrid').innerHTML = cells.join('');
  }

  /* ----------------------------- 统计卡片 ----------------------------- */
  function renderStats() {
    const year = currentYear;
    const acts = ACTIVITIES.filter((a) => a.date.startsWith(year));

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
      color: 'var(--accent)', title: t('statTotal'),
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

  /* ----------------------------- 活动列表 ----------------------------- */
  let actFilter = 'all';

  function renderActivities() {
    const year = currentYear;
    let acts = ACTIVITIES.filter((a) => a.date.startsWith(year));
    if (actFilter !== 'all') acts = acts.filter((a) => a.type === actFilter);
    acts = acts.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 40);

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
  function renderTracks() {
    const year = currentYear;
    const acts = ACTIVITIES.filter(
      (a) => a.date.startsWith(year) &&
        ['run', 'walk', 'ride', 'hike', 'moto'].includes(a.type) && a.distanceKm > 0
    )
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 12);

    if (!acts.length) {
      $('#tracksGrid').innerHTML = `<p class="muted">${t('tracksEmpty')}</p>`;
      return;
    }

    currentTrackActs = acts;
    $('#tracksGrid').innerHTML = acts
      .map((a, i) => {
        const color = SPORT[a.type].color;
        const svg = (a.track && a.track.length >= 2) ? realTrackSVG(a.track, color) : routeSVG(color, a.date);
        return `
        <div class="track-card" data-idx="${i}" title="${a.date} · ${actTitle(a)} · ${a.distanceKm.toFixed(1)}km ${t('tracksFocus')}">
          ${svg}
          <div class="t-title">${actTitle(a)}</div>
          <div class="t-meta">${a.distanceKm.toFixed(1)}km · ${fmtDate(a.date).split(' · ')[0]}</div>
        </div>`;
      })
      .join('');

    // 点击轨迹卡片 → 在地图上聚焦该轨迹
    $$('#tracksGrid .track-card').forEach((card) => {
      card.addEventListener('click', () => {
        const a = currentTrackActs[+card.dataset.idx];
        if (a) focusTrackOnMap(a);
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

  // 由日期生成确定性的「伪轨迹」曲线（无真实 GPS 时使用）
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
    if (!map || !mapTile) return;
    mapTile.setUrl(mapTileUrl());
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
      const daySet = new Set(items.map((i) => i.date));
      const totalReps = items.reduce((s, i) => s + i.reps, 0);
      const days = items.length;
      const streak = calcStreak(items.map((i) => i.date));

      // 小热力图（与年度热力图同布局）
      const first = new Date(year, 0, 1);
      const start = new Date(first); start.setDate(start.getDate() - first.getDay());
      const last = new Date(year, 11, 31);
      const end = new Date(last); end.setDate(end.getDate() + (6 - last.getDay()));
      const cells = [];
      const cur = new Date(start);
      while (cur <= end) {
        const inYear = cur.getFullYear() === year;
        const on = inYear && daySet.has(ymd(cur));
        cells.push(`<div class="c ${on ? 'on' : ''}"></div>`);
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
          <div><b>${totalReps.toLocaleString()}</b>${key === 'coldshower' ? t('habitUnitTimes') : t('habitUnitReps')}</div>
        </div>`;
      wrapper.appendChild(card);
    });
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
  }

  function setLanguage(lang) {
    if (lang !== 'en' && lang !== 'zh') return;
    LANG = lang;
    try { localStorage.setItem('workouts-lang', lang); } catch (e) {}
    applyStaticLang();
    renderHero();
    renderHeatmap();
    renderStats();
    renderActivities();
    renderTracks();
    renderHabits();
    renderMap();
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
    bindActivityFilters();
    renderActivities();
    renderTracks();
    bindMapFilters();
    bindTheme();        // 先应用主题（含深色模式），再初始化地图底图
    renderMap();
    renderHabits();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
