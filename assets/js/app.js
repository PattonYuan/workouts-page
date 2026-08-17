/* =========================================================================
 * app.js — 运动主页渲染与交互
 * 依赖 data.js 提供的 PROFILE / ACTIVITIES / CHECKINS / SPORT / HABIT
 * ========================================================================= */
(function () {
  'use strict';

  /* ----------------------------- 工具函数 ----------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  function fmtDuration(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}小时${m}分`;
    return `${m}分钟`;
  }
  function fmtDate(s) {
    const d = new Date(s + 'T00:00:00');
    const wk = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return `${d.getMonth() + 1}月${d.getDate()}日 · 周${wk}`;
  }

  /* ----------------------------- Hero ----------------------------- */
  function renderHero() {
    $('#heroAvatar').textContent = PROFILE.avatar || '🏃';
    $('#heroName').textContent = PROFILE.name;
    $('#heroTagline').textContent = PROFILE.tagline || '';
    $('#heroLocation').textContent = PROFILE.location || '';
    $('#heroSince').textContent = PROFILE.since || new Date().getFullYear();

    const years = availableYears();
    const thisYear = years.length ? years[0] : new Date().getFullYear();
    const yActs = ACTIVITIES.filter((a) => a.date.startsWith(thisYear));
    const totalKm = yActs.reduce((s, a) => s + (a.distanceKm || 0), 0);
    const totalTime = yActs.reduce((s, a) => s + a.movingTimeSec, 0);
    const streak = calcStreak(ACTIVITIES.map((a) => a.date));

    const stats = [
      { num: totalKm.toFixed(0), lbl: `${thisYear} 里程(km)` },
      { num: yActs.length, lbl: `${thisYear} 活动` },
      { num: fmtDuration(totalTime), lbl: '总时长' },
      { num: streak, lbl: '连续打卡(天)' },
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
          `<div class="hm-cell lv${lv}" title="${key} · ${info.count} 项 · ${km.toFixed(1)}km"></div>`
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
        monthLabels.push({ col: c, label: `${mo + 1}月` });
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
    SPORT_ORDER.forEach((t) => {
      const cfg = SPORT[t];
      const arr = byType[t] || [];
      if (t === 'workout') {
        cards.push({
          color: cfg.color, title: `${cfg.icon} ${cfg.label}`,
          big: arr.length, unit: '次',
          sub: `时长 ${fmtDuration(sumTime(arr))}`,
        });
      } else {
        cards.push({
          color: cfg.color, title: `${cfg.icon} ${cfg.label}`,
          big: sumKm(arr).toFixed(0), unit: 'km',
          sub: `${arr.length} 次 · 爬升 ${sumEle(arr)}m`,
        });
      }
    });

    cards.push({
      color: 'var(--accent)', title: '📊 年度合计',
      big: acts.length, unit: '次',
      sub: `总里程 ${sumKm(acts).toFixed(0)}km · 时长 ${fmtDuration(sumTime(acts))}`,
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
      $('#activityList').innerHTML = `<li class="activity-item"><div class="activity-main">今年暂无「${actFilter === 'all' ? '运动' : SPORT[actFilter].label}」记录</div></li>`;
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
            <div class="activity-title">${a.title}</div>
            <div class="activity-date">${fmtDate(a.date)}</div>
          </div>
          <div class="activity-metrics">
            ${a.distanceKm ? `<div><span class="v">${a.distanceKm.toFixed(1)}</span><span class="k">km</span></div>` : ''}
            <div><span class="v">${fmtDuration(a.movingTimeSec)}</span><span class="k">时长</span></div>
            ${a.elevationM ? `<div><span class="v">${a.elevationM}</span><span class="k">爬升m</span></div>` : ''}
            ${a.avgHr ? `<div><span class="v">${a.avgHr}</span><span class="k">心率</span></div>` : ''}
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
      $('#tracksGrid').innerHTML = `<p class="muted">今年暂无带轨迹的运动记录。</p>`;
      return;
    }

    currentTrackActs = acts;
    $('#tracksGrid').innerHTML = acts
      .map((a, i) => {
        const color = SPORT[a.type].color;
        const svg = (a.track && a.track.length >= 2) ? realTrackSVG(a.track, color) : routeSVG(color, a.date);
        return `
        <div class="track-card" data-idx="${i}" title="${a.date} · ${a.title} · ${a.distanceKm.toFixed(1)}km（点击在地图上聚焦）">
          ${svg}
          <div class="t-title">${a.title}</div>
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
        '地图组件加载失败（需要联网加载 Leaflet 与地图瓦片）。<br>可继续使用上方「轨迹墙」查看路线轮廓。</div>';
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
        hint.textContent = '⚠️ 地图底图加载失败（当前网络无法访问瓦片服务）。轨迹线仍可显示，联网后底图会自动出现。';
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
          <div style="font-size:15px;font-weight:700;margin-bottom:2px">${SPORT[a.type].icon} ${a.title}</div>
          <div style="color:#5b6675;font-size:12px;margin-bottom:6px">${fmtDate(a.date)}</div>
          <div>距离 <b>${a.distanceKm ? a.distanceKm.toFixed(1) : '—'}</b> km</div>
          <div>时长 <b>${fmtDuration(a.movingTimeSec)}</b></div>
          ${a.elevationM ? `<div>爬升 <b>${a.elevationM}</b> m</div>` : ''}
          ${a.avgHr ? `<div>心率 <b>${a.avgHr}</b> bpm</div>` : ''}
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
      wrapper.innerHTML = '<p class="muted">今年暂无习惯打卡记录。</p>';
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
          <h3>${h.label}</h3>
          <span class="streak">连续 <b>${streak}</b> 天</span>
        </div>
        <div class="habit-mini-grid">${cells.join('')}</div>
        <div class="habit-foot">
          <div><b>${days}</b>打卡天数</div>
          <div><b>${totalReps.toLocaleString()}</b>${key === 'coldshower' ? '次' : '个'}</div>
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

  /* ----------------------------- 初始化 ----------------------------- */
  function init() {
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
