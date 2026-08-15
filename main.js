(function () {
  const OBLIQUITY = 23.4394 * Math.PI / 180;

  const EARTH = { a: 1.000, period: 365.25, phaseOffset: 180 };
  const bodies = [
    { key: 'mercury', name: '水星', period: 87.97, a: 0.387, color: '#8fb3c9', r: 3, phaseOffset: 10 },
    { key: 'venus', name: '金星', period: 224.70, a: 0.723, color: '#e0b06a', r: 4, phaseOffset: 80 },
    { key: 'mars', name: '火星', period: 686.98, a: 1.524, color: '#c1583f', r: 3.5, phaseOffset: 150 },
    { key: 'jupiter', name: '木星', period: 4332.6, a: 5.203, color: '#d8c39a', r: 7, phaseOffset: 220 },
    { key: 'saturn', name: '土星', period: 10759, a: 9.537, color: '#a89a72', r: 6, phaseOffset: 300 },
  ];
  const SUN_COLOR = '#f4e3a1';
  const EARTH_COLOR = '#5fa19a';

  const zodiac = ['おひつじ座', 'おうし座', 'ふたご座', 'かに座', 'しし座', 'おとめ座', 'てんびん座', 'さそり座', 'いて座', 'やぎ座', 'みずがめ座', 'うお座'];

  const dayEl = document.getElementById('dayOfYear');
  const hourEl = document.getElementById('hour');
  const latEl = document.getElementById('lat');
  const animBtn = document.getElementById('animBtn');
  const animDayBtn = document.getElementById('animDayBtn');
  const btnHelio = document.getElementById('btnHelio');
  const btnGeo = document.getElementById('btnGeo');
  const topCv = document.getElementById('topView');
  const skyCv = document.getElementById('skyView');
  const tctx = topCv.getContext('2d');
  const sctx = skyCv.getContext('2d');
  const topSub = document.getElementById('topSub');

  // ---- 惑星表示チェックボックス ----
  const visible = {};
  const toggleWrap = document.getElementById('bodyToggles');
  bodies.forEach(b => {
    visible[b.key] = true;
    const label = document.createElement('label');
    label.innerHTML = `<span class="swatch" style="background:${b.color}"></span>
      <input type="checkbox" checked data-key="${b.key}"> ${b.name}`;
    toggleWrap.appendChild(label);
  });
  toggleWrap.addEventListener('change', e => {
    if (e.target.matches('input[type=checkbox]')) {
      visible[e.target.dataset.key] = e.target.checked;
      render();
    }
  });

  let animating = false;
  let dayAnimating = false;
  let timerId = null;
  let dayTimerId = null;

  // ---- 地動説⇄天動説 の滑らかな切替 ----
  let sVal = 0, sTarget = 0, sFrom = 0, sStart = null;
  const S_DURATION = 750;
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function setGeo(isGeo) {
    sTarget = isGeo ? 1 : 0;
    sFrom = sVal;
    sStart = performance.now();
    btnHelio.classList.toggle('active', !isGeo);
    btnGeo.classList.toggle('active', isGeo);
    topSub.textContent = isGeo
      ? '地球を中心に据えた見え方。惑星の軌跡(周転円)が薄く尾を引きます。'
      : '円軌道による簡略モデル(離心率・軌道傾斜は無視)。';
    requestAnimationFrame(stepTransition);
  }
  function stepTransition(now) {
    const t = Math.min(1, (now - sStart) / S_DURATION);
    sVal = sFrom + (sTarget - sFrom) * easeInOutCubic(t);
    render();
    if (t < 1) requestAnimationFrame(stepTransition);
  }
  btnHelio.addEventListener('click', () => setGeo(false));
  btnGeo.addEventListener('click', () => setGeo(true));

  function deg2rad(d) { return d * Math.PI / 180; }
  function rad2deg(r) { return r * 180 / Math.PI; }
  function norm360(d) { return ((d % 360) + 360) % 360; }

  function helioPos(a, period, dayOfYear, phaseOffset) {
    const theta = deg2rad(norm360(dayOfYear * (360 / period) + phaseOffset));
    return { x: a * Math.cos(theta), y: a * Math.sin(theta) };
  }

  function eclipticToEquatorial(lambdaDeg) {
    const lambda = deg2rad(lambdaDeg);
    const delta = Math.asin(Math.sin(OBLIQUITY) * Math.sin(lambda));
    const alpha = Math.atan2(Math.cos(OBLIQUITY) * Math.sin(lambda), Math.cos(lambda));
    return { alpha, delta };
  }

  function equatorialToHorizontal(alphaDeg, deltaDeg, latDeg, lstDeg) {
    const H = deg2rad(norm360(lstDeg - alphaDeg + 180) - 180);
    const dec = deg2rad(deltaDeg), lat = deg2rad(latDeg);
    const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
    const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
    let cosA = (Math.sin(dec) - Math.sin(lat) * sinAlt) / (Math.cos(lat) * Math.cos(alt));
    cosA = Math.max(-1, Math.min(1, cosA));
    let A = Math.acos(cosA);
    const az = Math.sin(H) > 0 ? 2 * Math.PI - A : A;
    return { alt: rad2deg(alt), az: rad2deg(az) };
  }

  function getState() {
    const dayOfYear = parseFloat(dayEl.value);
    const hour = parseFloat(hourEl.value);
    const lat = parseFloat(latEl.value);
    const earthPos = helioPos(EARTH.a, EARTH.period, dayOfYear, EARTH.phaseOffset);
    const lambdaSun = norm360(rad2deg(Math.atan2(-earthPos.y, -earthPos.x)));
    const eqSun = eclipticToEquatorial(lambdaSun);
    const alphaSunDeg = rad2deg(eqSun.alpha), deltaSunDeg = rad2deg(eqSun.delta);
    const H_sun = 15 * (hour - 12);
    const lst = norm360(alphaSunDeg + H_sun);
    return { dayOfYear, hour, lat, earthPos, lambdaSun, alphaSunDeg, deltaSunDeg, lst };
  }

  function fmtDate(dayOfYear) {
    const base = new Date(2026, 2, 20);
    const d = new Date(base.getTime() + dayOfYear * 86400000);
    return (d.getMonth() + 1) + "月" + d.getDate() + "日ごろ" + (dayOfYear >= 365 ? " (" + (Math.floor(dayOfYear / 365) + 1) + "年目)" : "");
  }

  // ============ 俯瞰図 ============
  function drawTop(state) {
    const W = topCv.width, H = topCv.height;
    tctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;

    tctx.fillStyle = 'rgba(243,236,216,0.4)';
    for (let i = 0; i < 70; i++) { tctx.fillRect((i * 97.3) % W, (i * 53.7 + (i * i) % 37) % H, 1, 1); }

    const scale = (Math.min(W, H) / 2 - 34) / Math.sqrt(bodies[bodies.length - 1].a + 1.1);

    function project(p) {
      const mag = Math.hypot(p.x, p.y);
      const ang = Math.atan2(p.y, p.x);
      const dm = Math.sqrt(mag) * scale;
      return { x: cx + dm * Math.cos(ang), y: cy + dm * Math.sin(ang) };
    }

    // 「地動説⇄天動説の滑らかな切り替え」を実現
    const offset = { x: sVal * state.earthPos.x, y: sVal * state.earthPos.y };
    function displayPos(helio) { return { x: helio.x - offset.x, y: helio.y - offset.y }; }

    // 軌道参照円(太陽中心時のみ濃く)
    const orbitAlpha = Math.max(0, 1 - sVal * 1.6);
    if (orbitAlpha > 0.02) {
      bodies.forEach(b => {
        if (!visible[b.key]) return;
        const R = Math.sqrt(b.a) * scale;
        tctx.beginPath(); tctx.arc(cx, cy, R, 0, Math.PI * 2);
        tctx.strokeStyle = `rgba(201,162,75,${0.18 * orbitAlpha})`; tctx.lineWidth = 1; tctx.stroke();
      });
      const RE = Math.sqrt(EARTH.a) * scale;
      tctx.beginPath(); tctx.arc(cx, cy, RE, 0, Math.PI * 2);
      tctx.strokeStyle = `rgba(95,161,154,${0.22 * orbitAlpha})`; tctx.lineWidth = 1; tctx.stroke();
    }

    // 地球中心時: 太陽の見かけの軌道(半径=1AU)を薄く
    if (sVal > 0.55) {
      const a = (sVal - 0.55) / 0.45;
      const r = Math.sqrt(EARTH.a) * scale;
      tctx.beginPath(); tctx.arc(cx, cy, r, 0, Math.PI * 2);
      tctx.strokeStyle = `rgba(244,227,161,${0.28 * a})`; tctx.setLineDash([2, 4]); tctx.lineWidth = 1; tctx.stroke();
      tctx.setLineDash([]);
    }

    // 周転円の軌跡(地球中心へ寄っているときだけ)
    if (sVal > 0.15) {
      const trailAlpha = Math.min(1, (sVal - 0.15) / 0.5);
      bodies.forEach(b => {
        if (!visible[b.key]) return;
        const window = 900, step = 3;
        tctx.beginPath();
        let first = true;
        for (let dd = state.dayOfYear - window; dd <= state.dayOfYear; dd += step) {
          const bp = helioPos(b.a, b.period, dd, b.phaseOffset);
          const ep = helioPos(EARTH.a, EARTH.period, dd, EARTH.phaseOffset);
          const rel = { x: bp.x - ep.x, y: bp.y - ep.y };
          const pr = project(rel);
          if (first) { tctx.moveTo(pr.x, pr.y); first = false; } else tctx.lineTo(pr.x, pr.y);
        }
        tctx.strokeStyle = b.color + Math.floor(trailAlpha * 90).toString(16).padStart(2, '0');
        tctx.lineWidth = 1;
        tctx.stroke();
      });
    }

    // 春分方向の基準線
    tctx.beginPath(); tctx.moveTo(cx, cy);
    tctx.lineTo(cx + scale * Math.sqrt(bodies[bodies.length - 1].a + 1.1) * 1.0, cy);
    tctx.strokeStyle = 'rgba(201,162,75,0.25)'; tctx.setLineDash([3, 4]); tctx.stroke(); tctx.setLineDash([]);

    // 太陽
    const sunDisp = project(displayPos({ x: 0, y: 0 }));
    tctx.beginPath(); tctx.arc(sunDisp.x, sunDisp.y, 9, 0, Math.PI * 2);
    tctx.fillStyle = SUN_COLOR; tctx.shadowColor = SUN_COLOR; tctx.shadowBlur = 18; tctx.fill(); tctx.shadowBlur = 0;
    tctx.fillStyle = 'rgba(243,236,216,0.85)'; tctx.font = '10px "Zen Kaku Gothic New"'; tctx.fillText('太陽', sunDisp.x + 10, sunDisp.y + 3);

    // 惑星
    bodies.forEach(b => {
      if (!visible[b.key]) return;
      const hp = helioPos(b.a, b.period, state.dayOfYear, b.phaseOffset);
      const dp = project(displayPos(hp));
      tctx.beginPath(); tctx.arc(dp.x, dp.y, b.r, 0, Math.PI * 2);
      tctx.fillStyle = b.color; tctx.fill();
      tctx.fillStyle = 'rgba(243,236,216,0.8)'; tctx.font = '10px "Zen Kaku Gothic New"';
      tctx.fillText(b.name, dp.x + 8, dp.y + 3);
    });

    // 地球 + 昼夜 + 観測者
    const earthDisp = project(displayPos(state.earthPos));
    tctx.beginPath(); tctx.arc(earthDisp.x, earthDisp.y, 4.5, 0, Math.PI * 2);
    tctx.fillStyle = EARTH_COLOR; tctx.fill();
    tctx.fillStyle = 'rgba(243,236,216,0.85)'; tctx.font = '10px "Zen Kaku Gothic New"';
    tctx.fillText('地球', earthDisp.x + 8, earthDisp.y + 3);

    const dirToSun = deg2rad(state.lambdaSun + 180); // 地球から見た太陽と反対方向=夜側の中心角
    tctx.save();
    tctx.beginPath();
    tctx.arc(earthDisp.x, earthDisp.y, 4.5, dirToSun - Math.PI / 2, dirToSun + Math.PI / 2);
    tctx.closePath(); tctx.fillStyle = 'rgba(20,15,10,0.8)'; tctx.fill();
    tctx.restore();

    const rot = deg2rad(15 * (state.hour - 12) + 180);
    const ox = earthDisp.x + 4.6 * Math.cos(dirToSun + Math.PI + rot);
    const oy = earthDisp.y + 4.6 * Math.sin(dirToSun + Math.PI + rot);
    tctx.beginPath(); tctx.arc(ox, oy, 1.6, 0, Math.PI * 2); tctx.fillStyle = '#f4e3a1'; tctx.fill();
  }

  // ============ 空(円形パノラマ) ============
  function drawSky(state) {
    const W = skyCv.width, H = skyCv.height;
    sctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2 + 6;
    const R = Math.min(W, H) / 2 - 52;

    function toXY(az, alt) {
      const r = R * (1 - Math.max(0, alt) / 90);
      const a = deg2rad(az);
      return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
    }

    // 空の円盤
    const grad = sctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, '#050912'); grad.addColorStop(1, '#132038');
    sctx.beginPath(); sctx.arc(cx, cy, R, 0, Math.PI * 2); sctx.fillStyle = grad; sctx.fill();
    sctx.lineWidth = 1.4; sctx.strokeStyle = 'rgba(201,162,75,0.55)'; sctx.stroke();

    // 星
    sctx.fillStyle = 'rgba(243,236,216,0.35)';
    for (let i = 0; i < 160; i++) {
      const rr = R * Math.sqrt(((i * 53) % 97) / 97);
      const aa = (i * 137.5) % 360;
      const p = toXY(aa, 90 - 90 * (rr / R));
      sctx.fillRect(p.x, p.y, 1, 1);
    }

    // 高度リング(30,60度)
    sctx.strokeStyle = 'rgba(201,162,75,0.15)'; sctx.lineWidth = 1;
    [30, 60].forEach(alt => {
      sctx.beginPath(); sctx.arc(cx, cy, R * (1 - alt / 90), 0, Math.PI * 2); sctx.stroke();
    });

    // 方位ラベル
    sctx.font = '12px "Zen Kaku Gothic New"'; sctx.fillStyle = 'rgba(243,236,216,0.8)';
    [[0, '北'], [90, '東'], [180, '南'], [270, '西']].forEach(([az, label]) => {
      const p = toXY(az, -4);
      const rr = R + 18, a = deg2rad(az);
      sctx.fillText(label, cx + rr * Math.sin(a) - 6, cy - rr * Math.cos(a) + 4);
    });

    function polyOnCircle(pts, color, width) {
      sctx.strokeStyle = color; sctx.lineWidth = width;
      sctx.beginPath();
      let prev = null;
      pts.forEach(pt => {
        if (pt.alt < 0) { prev = null; return; }
        const xy = toXY(pt.az, pt.alt);
        if (!prev) { sctx.moveTo(xy.x, xy.y); } else {
          const d = Math.hypot(xy.x - prev.x, xy.y - prev.y);
          if (d > R * 0.6) { sctx.moveTo(xy.x, xy.y); } else { sctx.lineTo(xy.x, xy.y); }
        }
        prev = xy;
      });
      sctx.stroke();
    }

    // 天の赤道
    let eqPts = [];
    for (let a = 0; a <= 360; a += 3) { eqPts.push({ az: 0, alt: 0, ...equatorialToHorizontal(a, 0, state.lat, state.lst) }); }
    eqPts.sort((p, q) => p.az - q.az);
    polyOnCircle(eqPts, 'rgba(95,161,154,0.75)', 1.4);

    // 黄道
    let eclPts = [];
    for (let lam = 0; lam <= 360; lam += 3) {
      const eq = eclipticToEquatorial(lam);
      const h = equatorialToHorizontal(rad2deg(eq.alpha), rad2deg(eq.delta), state.lat, state.lst);
      eclPts.push({ ...h, lam });
    }
    eclPts.sort((p, q) => p.az - q.az);
    polyOnCircle(eclPts, 'rgba(201,162,75,0.9)', 2.2);

    // 黄道十二宮ラベル
    sctx.font = '9.5px "Zen Kaku Gothic New"'; sctx.fillStyle = 'rgba(201,162,75,0.75)';
    for (let i = 0; i < 12; i++) {
      const lam = i * 30 + 15;
      const eq = eclipticToEquatorial(lam);
      const h = equatorialToHorizontal(rad2deg(eq.alpha), rad2deg(eq.delta), state.lat, state.lst);
      if (h.alt > 2) { const p = toXY(h.az, h.alt); sctx.fillText(zodiac[i], p.x - 13, p.y - 8); }
    }

    function placeBody(lambdaDeg, color, name, size) {
      const eq = eclipticToEquatorial(lambdaDeg);
      const h = equatorialToHorizontal(rad2deg(eq.alpha), rad2deg(eq.delta), state.lat, state.lst);
      if (h.alt < 0) return;
      const p = toXY(h.az, h.alt);
      sctx.beginPath(); sctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      sctx.fillStyle = color; sctx.shadowColor = color; sctx.shadowBlur = size * 1.8; sctx.fill(); sctx.shadowBlur = 0;
      sctx.fillStyle = 'rgba(243,236,216,0.85)'; sctx.font = '10px "Zen Kaku Gothic New"';
      sctx.fillText(name, p.x + 7, p.y + 3);
      return { ...h };
    }

    // 惑星
    bodies.forEach(b => {
      if (!visible[b.key]) return;
      const hp = helioPos(b.a, b.period, state.dayOfYear, b.phaseOffset);
      const lam = norm360(rad2deg(Math.atan2(hp.y - state.earthPos.y, hp.x - state.earthPos.x)));
      placeBody(lam, b.color, b.name, 5);
    });

    // 太陽
    const sunH = placeBody(state.lambdaSun, SUN_COLOR, '太陽', 8);

    return sunH || equatorialToHorizontal(state.alphaSunDeg, state.deltaSunDeg, state.lat, state.lst);
  }

  function currentZodiacIndex(lambdaSun) { return Math.floor(norm360(lambdaSun) / 30); }

  function render() {
    const state = getState();
    document.getElementById('dateVal').textContent = fmtDate(state.dayOfYear);
    const hh = Math.floor(state.hour), mm = Math.round((state.hour - hh) * 60);
    document.getElementById('hourVal').textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    document.getElementById('latVal').textContent = (state.lat >= 0 ? '+' : '') + state.lat.toFixed(1) + '°' + (Math.abs(state.lat - 35.7) < 0.01 ? '(東京)' : '');

    drawTop(state);
    const sunH = drawSky(state);

    document.getElementById('roLambda').textContent = state.lambdaSun.toFixed(1) + '°';
    document.getElementById('roDec').textContent = state.deltaSunDeg.toFixed(1) + '°';
    document.getElementById('roAlt').textContent = sunH.alt.toFixed(1) + '°' + (sunH.alt < 0 ? '(地平線下)' : '');
    document.getElementById('roAz').textContent = sunH.az.toFixed(0) + '°';
    document.getElementById('roZodiac').textContent = zodiac[currentZodiacIndex(state.lambdaSun)];
  }

  [dayEl, hourEl, latEl].forEach(el => el.addEventListener('input', render));

  animBtn.addEventListener('click', () => {
    animating = !animating;
    animBtn.classList.toggle('active', animating);
    animBtn.textContent = animating ? '■ 停止' : '▶ 時刻を進める';
    animDayBtn.classList.toggle('disabled', animating);
    if (animating) tick();
  });
  animDayBtn.addEventListener('click', () => {
    dayAnimating = !dayAnimating;
    animDayBtn.classList.toggle('active', dayAnimating);
    animDayBtn.textContent = dayAnimating ? '■ 停止' : '▶ 日を進める';
    animBtn.classList.toggle('disabled', dayAnimating);
    if (dayAnimating) dayTick();
  });
  function tick() {
    if (!animating) return;
    let h = parseFloat(hourEl.value) + 0.15;
    if (h >= 24) { h -= 24; dayEl.value = (parseFloat(dayEl.value)+1) % (parseFloat(dayEl.max)+1); }
    hourEl.value = h.toFixed(2);
    render();
    timerId = setTimeout(tick, 40);
  }
  function dayTick() {
    if (!dayAnimating) return;
    let d = parseFloat(dayEl.value) + 1.0;
    if (d >= parseFloat(dayEl.max)) d = 0;
    dayEl.value = d.toFixed(2);
    render();
    dayTimerId = setTimeout(dayTick, 40);
  }

  render();
})();