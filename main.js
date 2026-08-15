(function () {
  const OBLIQUITY_RADIANS = 23.4394 * Math.PI / 180;

  const EARTH = { orbitRadiusAU: 1.000, orbitPeriodDays: 365.25, initialPhaseDegrees: 180 };
  const planets = [
    { id: 'mercury', label: '水星', orbitPeriodDays: 87.97, orbitRadiusAU: 0.387, color: '#8fb3c9', markerRadiusPx: 3, initialPhaseDegrees: 10 },
    { id: 'venus', label: '金星', orbitPeriodDays: 224.70, orbitRadiusAU: 0.723, color: '#e0b06a', markerRadiusPx: 4, initialPhaseDegrees: 80 },
    { id: 'mars', label: '火星', orbitPeriodDays: 686.98, orbitRadiusAU: 1.524, color: '#c1583f', markerRadiusPx: 3.5, initialPhaseDegrees: 150 },
    { id: 'jupiter', label: '木星', orbitPeriodDays: 4332.6, orbitRadiusAU: 5.203, color: '#d8c39a', markerRadiusPx: 7, initialPhaseDegrees: 220 },
    { id: 'saturn', label: '土星', orbitPeriodDays: 10759, orbitRadiusAU: 9.537, color: '#a89a72', markerRadiusPx: 6, initialPhaseDegrees: 300 },
  ];
  const SUN_COLOR = '#f4e3a1';
  const EARTH_COLOR = '#5fa19a';

  const zodiacSignNames = ['おひつじ座', 'おうし座', 'ふたご座', 'かに座', 'しし座', 'おとめ座', 'てんびん座', 'さそり座', 'いて座', 'やぎ座', 'みずがめ座', 'うお座'];

  const dayOfYearSlider = document.getElementById('day-of-year-slider');
  const hourSlider = document.getElementById('hour-slider');
  const latitudeSlider = document.getElementById('latitude-slider');
  const hourAnimateButton = document.getElementById('hour-animate-button');
  const dayAnimateButton = document.getElementById('day-animate-button');
  const heliocentricButton = document.getElementById('heliocentric-button');
  const geocentricButton = document.getElementById('geocentric-button');
  const overheadCanvas = document.getElementById('overhead-canvas');
  const skyCanvas = document.getElementById('sky-canvas');
  const overheadContext = overheadCanvas.getContext('2d');
  const skyContext = skyCanvas.getContext('2d');
  const overheadSubtitle = document.getElementById('overhead-view-subtitle');

  // ---- 惑星表示チェックボックス ----
  const bodyVisibility = {};
  const toggleRow = document.getElementById('planet-visibility-toggles');
  planets.forEach(planet => {
    bodyVisibility[planet.id] = true;
    const label = document.createElement('label');
    label.innerHTML = `<span class="color-swatch" style="background:${planet.color}"></span>
      <input type="checkbox" checked data-planet-id="${planet.id}"> ${planet.label}`;
    toggleRow.appendChild(label);
  });
  toggleRow.addEventListener('change', event => {
    if (event.target.matches('input[type=checkbox]')) {
      bodyVisibility[event.target.dataset.planetId] = event.target.checked;
      render();
    }
  });

  // ---- 導円・周転円 拡大図パネルの惑星選択 ----
  const epicyclePlanetSelect = document.getElementById('epicycle-planet-select');
  planets.forEach(planet => {
    const option = document.createElement('option');
    option.value = planet.id;
    option.textContent = planet.label;
    if (planet.id === 'mars') option.selected = true;
    epicyclePlanetSelect.appendChild(option);
  });
  epicyclePlanetSelect.addEventListener('change', render);

  let hourAnimating = false;
  let dayAnimating = false;
  let hourAnimationTimerId = null;
  let dayAnimationTimerId = null;

  // ---- 地動説⇄天動説 の滑らかな切替 ----
  let geocentricBlend = 0, geocentricBlendTarget = 0, geocentricBlendFrom = 0, blendTransitionStart = null;
  const BLEND_TRANSITION_DURATION_MS = 750;
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function startModeTransition(switchToGeocentric) {
    geocentricBlendTarget = switchToGeocentric ? 1 : 0;
    geocentricBlendFrom = geocentricBlend;
    blendTransitionStart = performance.now();
    heliocentricButton.classList.toggle('active', !switchToGeocentric);
    geocentricButton.classList.toggle('active', switchToGeocentric);
    overheadSubtitle.textContent = switchToGeocentric
      ? '地球を中心に据えた見え方。惑星の軌跡（周転円）が薄く尾を引きます。中心からの距離は圧縮してあります。'
      : '円軌道による簡略モデル（離心率・軌道傾斜は無視）。中心からの距離は圧縮してあります。';
    requestAnimationFrame(animateModeTransition);
  }
  function animateModeTransition(now) {
    const progress = Math.min(1, (now - blendTransitionStart) / BLEND_TRANSITION_DURATION_MS);
    geocentricBlend = geocentricBlendFrom + (geocentricBlendTarget - geocentricBlendFrom) * easeInOutCubic(progress);
    render();
    if (progress < 1) requestAnimationFrame(animateModeTransition);
  }
  heliocentricButton.addEventListener('click', () => startModeTransition(false));
  geocentricButton.addEventListener('click', () => startModeTransition(true));

  function degreesToRadians(degrees) { return degrees * Math.PI / 180; }
  function radiansToDegrees(radians) { return radians * 180 / Math.PI; }
  function normalizeDegrees(degrees) { return ((degrees % 360) + 360) % 360; }

  function heliocentricPosition(orbitRadiusAU, orbitPeriodDays, dayOfYear, initialPhaseDegrees) {
    const orbitAngleRadians = degreesToRadians(normalizeDegrees(dayOfYear * (360 / orbitPeriodDays) + initialPhaseDegrees));
    return { x: orbitRadiusAU * Math.cos(orbitAngleRadians), y: orbitRadiusAU * Math.sin(orbitAngleRadians) };
  }

  function eclipticToEquatorial(eclipticLongitudeDegrees) {
    const eclipticLongitudeRadians = degreesToRadians(eclipticLongitudeDegrees);
    const declinationRadians = Math.asin(Math.sin(OBLIQUITY_RADIANS) * Math.sin(eclipticLongitudeRadians));
    const rightAscensionRadians = Math.atan2(
      Math.cos(OBLIQUITY_RADIANS) * Math.sin(eclipticLongitudeRadians),
      Math.cos(eclipticLongitudeRadians)
    );
    return { rightAscensionRadians, declinationRadians };
  }

  function equatorialToHorizontal(rightAscensionDegrees, declinationDegrees, latitudeDegrees, localSiderealTimeDegrees) {
    const hourAngleRadians = degreesToRadians(normalizeDegrees(localSiderealTimeDegrees - rightAscensionDegrees + 180) - 180);
    const declinationRadians = degreesToRadians(declinationDegrees);
    const latitudeRadians = degreesToRadians(latitudeDegrees);
    const sinAltitude = Math.sin(latitudeRadians) * Math.sin(declinationRadians)
      + Math.cos(latitudeRadians) * Math.cos(declinationRadians) * Math.cos(hourAngleRadians);
    const altitudeRadians = Math.asin(Math.max(-1, Math.min(1, sinAltitude)));
    let cosAzimuth = (Math.sin(declinationRadians) - Math.sin(latitudeRadians) * sinAltitude)
      / (Math.cos(latitudeRadians) * Math.cos(altitudeRadians));
    cosAzimuth = Math.max(-1, Math.min(1, cosAzimuth));
    const azimuthMagnitudeRadians = Math.acos(cosAzimuth);
    const azimuthRadians = Math.sin(hourAngleRadians) > 0 ? 2 * Math.PI - azimuthMagnitudeRadians : azimuthMagnitudeRadians;
    return { altitudeDegrees: radiansToDegrees(altitudeRadians), azimuthDegrees: radiansToDegrees(azimuthRadians) };
  }

  function computeCurrentState() {
    const dayOfYear = parseFloat(dayOfYearSlider.value);
    const hour = parseFloat(hourSlider.value);
    const latitudeDegrees = parseFloat(latitudeSlider.value);
    const earthPosition = heliocentricPosition(EARTH.orbitRadiusAU, EARTH.orbitPeriodDays, dayOfYear, EARTH.initialPhaseDegrees);
    const sunEclipticLongitudeDegrees = normalizeDegrees(radiansToDegrees(Math.atan2(-earthPosition.y, -earthPosition.x)));
    const sunEquatorial = eclipticToEquatorial(sunEclipticLongitudeDegrees);
    const sunRightAscensionDegrees = radiansToDegrees(sunEquatorial.rightAscensionRadians);
    const sunDeclinationDegrees = radiansToDegrees(sunEquatorial.declinationRadians);
    const sunHourAngleDegrees = 15 * (hour - 12);
    const localSiderealTimeDegrees = normalizeDegrees(sunRightAscensionDegrees + sunHourAngleDegrees);
    return {
      dayOfYear, hour, latitudeDegrees, earthPosition,
      sunEclipticLongitudeDegrees, sunRightAscensionDegrees, sunDeclinationDegrees,
      localSiderealTimeDegrees
    };
  }

  function formatDateLabel(dayOfYear) {
    const baseDate = new Date(2026, 2, 20);
    const targetDate = new Date(baseDate.getTime() + dayOfYear * 86400000);
    const yearSuffix = dayOfYear >= 365 ? " (" + (Math.floor(dayOfYear / 365) + 1) + "年目)" : "";
    return (targetDate.getMonth() + 1) + "月" + targetDate.getDate() + "日ごろ" + yearSuffix;
  }

  // ============ 俯瞰図 ============
  function drawOverheadView(state) {
    const width = overheadCanvas.width, height = overheadCanvas.height;
    overheadContext.clearRect(0, 0, width, height);
    const canvasCenterX = width / 2, canvasCenterY = height / 2;

    overheadContext.fillStyle = 'rgba(243,236,216,0.4)';
    for (let i = 0; i < 70; i++) {
      overheadContext.fillRect((i * 97.3) % width, (i * 53.7 + (i * i) % 37) % height, 1, 1);
    }

    const farthestOrbitAU = planets[planets.length - 1].orbitRadiusAU;
    const pixelsPerSqrtAU = (Math.min(width, height) / 2 - 34) / Math.sqrt(farthestOrbitAU + 1.1);

    function projectToScreen(pointAU) {
      const distanceFromOriginAU = Math.hypot(pointAU.x, pointAU.y);
      const angleRadians = Math.atan2(pointAU.y, pointAU.x);
      const projectedDistancePx =
        Math.sqrt(distanceFromOriginAU) * pixelsPerSqrtAU;

      return {
        x: canvasCenterX + projectedDistancePx * Math.cos(angleRadians),
        y: canvasCenterY - projectedDistancePx * Math.sin(angleRadians)
      };
    }

    // 「地動説⇄天動説の滑らかな切り替え」: 原点を太陽から地球へ geocentricBlend の割合だけ移す
    const earthCenterOffset = { x: geocentricBlend * state.earthPosition.x, y: geocentricBlend * state.earthPosition.y };
    function applyGeocentricOffset(heliocentricPointAU) {
      return { x: heliocentricPointAU.x - earthCenterOffset.x, y: heliocentricPointAU.y - earthCenterOffset.y };
    }

    // 軌道参照円(太陽中心時のみ濃く)
    const orbitReferenceAlpha = Math.max(0, 1 - geocentricBlend * 1.6);
    if (orbitReferenceAlpha > 0.02) {
      planets.forEach(planet => {
        if (!bodyVisibility[planet.id]) return;
        const orbitRadiusPx = Math.sqrt(planet.orbitRadiusAU) * pixelsPerSqrtAU;
        overheadContext.beginPath(); overheadContext.arc(canvasCenterX, canvasCenterY, orbitRadiusPx, 0, Math.PI * 2);
        overheadContext.strokeStyle = `rgba(201,162,75,${0.18 * orbitReferenceAlpha})`; overheadContext.lineWidth = 1; overheadContext.stroke();
      });
      const earthOrbitRadiusPx = Math.sqrt(EARTH.orbitRadiusAU) * pixelsPerSqrtAU;
      overheadContext.beginPath(); overheadContext.arc(canvasCenterX, canvasCenterY, earthOrbitRadiusPx, 0, Math.PI * 2);
      overheadContext.strokeStyle = `rgba(95,161,154,${0.22 * orbitReferenceAlpha})`; overheadContext.lineWidth = 1; overheadContext.stroke();
    }

    // 地球中心時: 太陽の見かけの軌道(半径=1AU)を薄く
    if (geocentricBlend > 0.55) {
      const fadeInAlpha = (geocentricBlend - 0.55) / 0.45;
      const sunApparentOrbitRadiusPx = Math.sqrt(EARTH.orbitRadiusAU) * pixelsPerSqrtAU;
      overheadContext.beginPath(); overheadContext.arc(canvasCenterX, canvasCenterY, sunApparentOrbitRadiusPx, 0, Math.PI * 2);
      overheadContext.strokeStyle = `rgba(244,227,161,${0.28 * fadeInAlpha})`;
      overheadContext.setLineDash([2, 4]); overheadContext.lineWidth = 1; overheadContext.stroke();
      overheadContext.setLineDash([]);
    }

    // 周転円の軌跡(地球中心へ寄っているときだけ)
    if (geocentricBlend > 0.15) {
      const trailAlpha = Math.min(1, (geocentricBlend - 0.15) / 0.5);
      planets.forEach(planet => {
        if (!bodyVisibility[planet.id]) return;
        const trailWindowDays = 900, trailStepDays = 3;
        overheadContext.beginPath();
        let isFirstPoint = true;
        for (let d = state.dayOfYear - trailWindowDays; d <= state.dayOfYear; d += trailStepDays) {
          const planetPos = heliocentricPosition(planet.orbitRadiusAU, planet.orbitPeriodDays, d, planet.initialPhaseDegrees);
          const earthPos = heliocentricPosition(EARTH.orbitRadiusAU, EARTH.orbitPeriodDays, d, EARTH.initialPhaseDegrees);
          const relativePoint = { x: planetPos.x - earthPos.x, y: planetPos.y - earthPos.y };
          const screenPoint = projectToScreen(relativePoint);
          if (isFirstPoint) { overheadContext.moveTo(screenPoint.x, screenPoint.y); isFirstPoint = false; }
          else overheadContext.lineTo(screenPoint.x, screenPoint.y);
        }
        overheadContext.strokeStyle = planet.color + Math.floor(trailAlpha * 90).toString(16).padStart(2, '0');
        overheadContext.lineWidth = 1;
        overheadContext.stroke();
      });
    }

    // 春分方向の基準線
    overheadContext.beginPath(); overheadContext.moveTo(canvasCenterX, canvasCenterY);
    overheadContext.lineTo(canvasCenterX + pixelsPerSqrtAU * Math.sqrt(farthestOrbitAU + 1.1), canvasCenterY);
    overheadContext.strokeStyle = 'rgba(201,162,75,0.25)'; overheadContext.setLineDash([3, 4]); overheadContext.stroke(); overheadContext.setLineDash([]);

    // 太陽
    const sunScreenPoint = projectToScreen(applyGeocentricOffset({ x: 0, y: 0 }));
    overheadContext.beginPath(); overheadContext.arc(sunScreenPoint.x, sunScreenPoint.y, 9, 0, Math.PI * 2);
    overheadContext.fillStyle = SUN_COLOR; overheadContext.shadowColor = SUN_COLOR; overheadContext.shadowBlur = 18;
    overheadContext.fill(); overheadContext.shadowBlur = 0;
    overheadContext.fillStyle = 'rgba(243,236,216,0.85)'; overheadContext.font = '10px "Zen Kaku Gothic New"';
    overheadContext.fillText('太陽', sunScreenPoint.x + 10, sunScreenPoint.y + 3);

    // 惑星
    planets.forEach(planet => {
      if (!bodyVisibility[planet.id]) return;
      const heliocentricPoint = heliocentricPosition(planet.orbitRadiusAU, planet.orbitPeriodDays, state.dayOfYear, planet.initialPhaseDegrees);
      const screenPoint = projectToScreen(applyGeocentricOffset(heliocentricPoint));
      overheadContext.beginPath(); overheadContext.arc(screenPoint.x, screenPoint.y, planet.markerRadiusPx, 0, Math.PI * 2);
      overheadContext.fillStyle = planet.color; overheadContext.fill();
      overheadContext.fillStyle = 'rgba(243,236,216,0.8)'; overheadContext.font = '10px "Zen Kaku Gothic New"';
      overheadContext.fillText(planet.label, screenPoint.x + 8, screenPoint.y + 3);
    });

    // 地球 + 昼夜 + 観測者
    const earthScreenPoint = projectToScreen(applyGeocentricOffset(state.earthPosition));
    overheadContext.beginPath(); overheadContext.arc(earthScreenPoint.x, earthScreenPoint.y, 4.5, 0, Math.PI * 2);
    overheadContext.fillStyle = EARTH_COLOR; overheadContext.fill();
    overheadContext.fillStyle = 'rgba(243,236,216,0.85)'; overheadContext.font = '10px "Zen Kaku Gothic New"';
    overheadContext.fillText('地球', earthScreenPoint.x + 8, earthScreenPoint.y + 3);

    const directionToSunRadians = degreesToRadians(state.sunEclipticLongitudeDegrees + 180);
    overheadContext.save();
    overheadContext.beginPath();
    overheadContext.arc(earthScreenPoint.x, earthScreenPoint.y, 4.5, directionToSunRadians - Math.PI / 2, directionToSunRadians + Math.PI / 2);
    overheadContext.closePath(); overheadContext.fillStyle = 'rgba(20,15,10,0.8)'; overheadContext.fill();
    overheadContext.restore();

    const observerRotationRadians = degreesToRadians(15 * (state.hour - 12) + 180);
    const observerX = earthScreenPoint.x + 4.6 * Math.cos(directionToSunRadians + Math.PI + observerRotationRadians);
    const observerY = earthScreenPoint.y + 4.6 * Math.sin(directionToSunRadians + Math.PI + observerRotationRadians);
    overheadContext.beginPath(); overheadContext.arc(observerX, observerY, 1.6, 0, Math.PI * 2);
    overheadContext.fillStyle = '#f4e3a1'; overheadContext.fill();
  }

  // ============ 空(円形パノラマ) ============
  function drawSkyPanorama(state) {
    const width = skyCanvas.width, height = skyCanvas.height;
    skyContext.clearRect(0, 0, width, height);
    const canvasCenterX = width / 2, canvasCenterY = height / 2 + 6;
    const horizonRadiusPx = Math.min(width, height) / 2 - 52;

    function toScreenXY(azimuthDegrees, altitudeDegrees) {
      const radiusPx = horizonRadiusPx * (1 - Math.max(0, altitudeDegrees) / 90);
      const azimuthRadians = degreesToRadians(azimuthDegrees);
      return { x: canvasCenterX + radiusPx * Math.sin(azimuthRadians), y: canvasCenterY - radiusPx * Math.cos(azimuthRadians) };
    }

    const skyGradient = skyContext.createRadialGradient(canvasCenterX, canvasCenterY, 0, canvasCenterX, canvasCenterY, horizonRadiusPx);
    skyGradient.addColorStop(0, '#050912'); skyGradient.addColorStop(1, '#132038');
    skyContext.beginPath(); skyContext.arc(canvasCenterX, canvasCenterY, horizonRadiusPx, 0, Math.PI * 2);
    skyContext.fillStyle = skyGradient; skyContext.fill();
    skyContext.lineWidth = 1.4; skyContext.strokeStyle = 'rgba(201,162,75,0.55)'; skyContext.stroke();

    skyContext.fillStyle = 'rgba(243,236,216,0.35)';
    for (let i = 0; i < 160; i++) {
      const starRadiusPx = horizonRadiusPx * Math.sqrt(((i * 53) % 97) / 97);
      const starAzimuthDegrees = (i * 137.5) % 360;
      const point = toScreenXY(starAzimuthDegrees, 90 - 90 * (starRadiusPx / horizonRadiusPx));
      skyContext.fillRect(point.x, point.y, 1, 1);
    }

    skyContext.strokeStyle = 'rgba(201,162,75,0.15)'; skyContext.lineWidth = 1;
    [30, 60].forEach(altitudeDegrees => {
      skyContext.beginPath(); skyContext.arc(canvasCenterX, canvasCenterY, horizonRadiusPx * (1 - altitudeDegrees / 90), 0, Math.PI * 2); skyContext.stroke();
    });

    skyContext.font = '12px "Zen Kaku Gothic New"'; skyContext.fillStyle = 'rgba(243,236,216,0.8)';
    [[0, '北'], [90, '東'], [180, '南'], [270, '西']].forEach(([azimuthDegrees, label]) => {
      const labelRadiusPx = horizonRadiusPx + 18, azimuthRadians = degreesToRadians(azimuthDegrees);
      skyContext.fillText(label, canvasCenterX + labelRadiusPx * Math.sin(azimuthRadians) - 6, canvasCenterY - labelRadiusPx * Math.cos(azimuthRadians) + 4);
    });

    function drawArcAcrossHorizon(points, strokeColor, lineWidth) {
      skyContext.strokeStyle = strokeColor; skyContext.lineWidth = lineWidth;
      skyContext.beginPath();
      let previousScreenPoint = null;
      points.forEach(point => {
        if (point.altitudeDegrees < 0) { previousScreenPoint = null; return; }
        const screenPoint = toScreenXY(point.azimuthDegrees, point.altitudeDegrees);
        if (!previousScreenPoint) { skyContext.moveTo(screenPoint.x, screenPoint.y); }
        else {
          const jumpDistancePx = Math.hypot(screenPoint.x - previousScreenPoint.x, screenPoint.y - previousScreenPoint.y);
          if (jumpDistancePx > horizonRadiusPx * 0.6) { skyContext.moveTo(screenPoint.x, screenPoint.y); }
          else { skyContext.lineTo(screenPoint.x, screenPoint.y); }
        }
        previousScreenPoint = screenPoint;
      });
      skyContext.stroke();
    }

    // 天の赤道
    const celestialEquatorPoints = [];
    for (let rightAscensionDegrees = 0; rightAscensionDegrees <= 360; rightAscensionDegrees += 3) {
      const horizontal = equatorialToHorizontal(rightAscensionDegrees, 0, state.latitudeDegrees, state.localSiderealTimeDegrees);
      celestialEquatorPoints.push({ azimuthDegrees: horizontal.azimuthDegrees, altitudeDegrees: horizontal.altitudeDegrees });
    }
    celestialEquatorPoints.sort((p, q) => p.azimuthDegrees - q.azimuthDegrees);
    drawArcAcrossHorizon(celestialEquatorPoints, 'rgba(95,161,154,0.75)', 1.4);

    // 黄道
    const eclipticPoints = [];
    for (let eclipticLongitudeDegrees = 0; eclipticLongitudeDegrees <= 360; eclipticLongitudeDegrees += 3) {
      const equatorial = eclipticToEquatorial(eclipticLongitudeDegrees);
      const horizontal = equatorialToHorizontal(
        radiansToDegrees(equatorial.rightAscensionRadians), radiansToDegrees(equatorial.declinationRadians),
        state.latitudeDegrees, state.localSiderealTimeDegrees);
      eclipticPoints.push({ azimuthDegrees: horizontal.azimuthDegrees, altitudeDegrees: horizontal.altitudeDegrees });
    }
    eclipticPoints.sort((p, q) => p.azimuthDegrees - q.azimuthDegrees);
    drawArcAcrossHorizon(eclipticPoints, 'rgba(201,162,75,0.9)', 2.2);

    // 黄道十二宮ラベル
    skyContext.font = '9.5px "Zen Kaku Gothic New"'; skyContext.fillStyle = 'rgba(201,162,75,0.75)';
    for (let signIndex = 0; signIndex < 12; signIndex++) {
      const eclipticLongitudeDegrees = signIndex * 30 + 15;
      const equatorial = eclipticToEquatorial(eclipticLongitudeDegrees);
      const horizontal = equatorialToHorizontal(
        radiansToDegrees(equatorial.rightAscensionRadians), radiansToDegrees(equatorial.declinationRadians),
        state.latitudeDegrees, state.localSiderealTimeDegrees);
      if (horizontal.altitudeDegrees > 2) {
        const point = toScreenXY(horizontal.azimuthDegrees, horizontal.altitudeDegrees);
        skyContext.fillText(zodiacSignNames[signIndex], point.x - 13, point.y - 8);
      }
    }

    function drawCelestialBody(eclipticLongitudeDegrees, color, label, markerSizePx) {
      const equatorial = eclipticToEquatorial(eclipticLongitudeDegrees);
      const horizontal = equatorialToHorizontal(
        radiansToDegrees(equatorial.rightAscensionRadians), radiansToDegrees(equatorial.declinationRadians),
        state.latitudeDegrees, state.localSiderealTimeDegrees);
      if (horizontal.altitudeDegrees < 0) return null;
      const point = toScreenXY(horizontal.azimuthDegrees, horizontal.altitudeDegrees);
      skyContext.beginPath(); skyContext.arc(point.x, point.y, markerSizePx, 0, Math.PI * 2);
      skyContext.fillStyle = color; skyContext.shadowColor = color; skyContext.shadowBlur = markerSizePx * 1.8;
      skyContext.fill(); skyContext.shadowBlur = 0;
      skyContext.fillStyle = 'rgba(243,236,216,0.85)'; skyContext.font = '10px "Zen Kaku Gothic New"';
      skyContext.fillText(label, point.x + 7, point.y + 3);
      return horizontal;
    }

    planets.forEach(planet => {
      if (!bodyVisibility[planet.id]) return;
      const heliocentricPoint = heliocentricPosition(planet.orbitRadiusAU, planet.orbitPeriodDays, state.dayOfYear, planet.initialPhaseDegrees);
      const eclipticLongitudeDegrees = normalizeDegrees(radiansToDegrees(Math.atan2(
        heliocentricPoint.y - state.earthPosition.y, heliocentricPoint.x - state.earthPosition.x)));
      drawCelestialBody(eclipticLongitudeDegrees, planet.color, planet.label, 5);
    });

    const sunHorizontal = drawCelestialBody(state.sunEclipticLongitudeDegrees, SUN_COLOR, '太陽', 8);
    return sunHorizontal || equatorialToHorizontal(
      state.sunRightAscensionDegrees, state.sunDeclinationDegrees, state.latitudeDegrees, state.localSiderealTimeDegrees);
  }

  function currentZodiacIndex(eclipticLongitudeDegrees) { return Math.floor(normalizeDegrees(eclipticLongitudeDegrees) / 30); }

  // ============ III. 導円・周転円の拡大図(1惑星だけを地球中心・線形スケールで) ============
  const epicycleCanvas = document.getElementById('epicycle-canvas');
  const epicycleContext = epicycleCanvas.getContext('2d');

  function drawEpicycleDetail(state) {
    const width = epicycleCanvas.width, height = epicycleCanvas.height;
    epicycleContext.clearRect(0, 0, width, height);
    const canvasCenterX = width / 2, canvasCenterY = height / 2;

    const planet = planets.find(p => p.id === epicyclePlanetSelect.value) || planets.find(p => p.id === 'mars');

    const planetOwnAngleRadians = degreesToRadians(normalizeDegrees(
      state.dayOfYear * (360 / planet.orbitPeriodDays) + planet.initialPhaseDegrees));
    const sunAsSeenFromEarthAngleRadians = degreesToRadians(normalizeDegrees(
      state.dayOfYear * (360 / EARTH.orbitPeriodDays) + EARTH.initialPhaseDegrees + 180));

    const planetIsOuter = planet.orbitRadiusAU > EARTH.orbitRadiusAU;
    const deferentRadiusAU = planetIsOuter ? planet.orbitRadiusAU : EARTH.orbitRadiusAU;
    const deferentAngleRadians = planetIsOuter ? planetOwnAngleRadians : sunAsSeenFromEarthAngleRadians;
    const epicycleRadiusAU = planetIsOuter ? EARTH.orbitRadiusAU : planet.orbitRadiusAU;
    const epicycleAngleRadians = planetIsOuter ? sunAsSeenFromEarthAngleRadians : planetOwnAngleRadians;

    // 地球からの距離だけを基準にした、圧縮なしの線形スケール
    // (導円半径+周転円半径 は常に planet.orbitRadiusAU + EARTH.orbitRadiusAU に等しい)
    const totalExtentAU = deferentRadiusAU + epicycleRadiusAU;
    const pixelsPerAU = (Math.min(width, height) / 2 - 30) / totalExtentAU;

    function toScreen(pointAU) {
      return { x: canvasCenterX + pointAU.x * pixelsPerAU, y: canvasCenterY - pointAU.y * pixelsPerAU };
    }

    // 背景の目盛り円(1AUごと)
    epicycleContext.strokeStyle = 'rgba(201,162,75,0.1)'; epicycleContext.lineWidth = 1;
    for (let auRing = 1; auRing * pixelsPerAU < Math.min(width, height) / 2 - 10; auRing++) {
      epicycleContext.beginPath();
      epicycleContext.arc(canvasCenterX, canvasCenterY, auRing * pixelsPerAU, 0, Math.PI * 2);
      epicycleContext.stroke();
    }

    // 導円(破線)
    epicycleContext.beginPath();
    for (let stepDeg = 0; stepDeg <= 360; stepDeg += 4) {
      const stepRad = degreesToRadians(stepDeg);
      const point = toScreen({ x: deferentRadiusAU * Math.cos(stepRad), y: deferentRadiusAU * Math.sin(stepRad) });
      stepDeg === 0 ? epicycleContext.moveTo(point.x, point.y) : epicycleContext.lineTo(point.x, point.y);
    }
    epicycleContext.strokeStyle = 'rgba(95,161,154,0.6)';
    epicycleContext.setLineDash([5, 4]); epicycleContext.lineWidth = 1.3; epicycleContext.stroke(); epicycleContext.setLineDash([]);

    const deferentPointAU = { x: deferentRadiusAU * Math.cos(deferentAngleRadians), y: deferentRadiusAU * Math.sin(deferentAngleRadians) };
    const deferentScreenPoint = toScreen(deferentPointAU);

    // 周転円(実線)
    epicycleContext.beginPath();
    for (let stepDeg = 0; stepDeg <= 360; stepDeg += 4) {
      const stepRad = degreesToRadians(stepDeg);
      const point = toScreen({
        x: deferentPointAU.x + epicycleRadiusAU * Math.cos(stepRad),
        y: deferentPointAU.y + epicycleRadiusAU * Math.sin(stepRad)
      });
      stepDeg === 0 ? epicycleContext.moveTo(point.x, point.y) : epicycleContext.lineTo(point.x, point.y);
    }
    epicycleContext.strokeStyle = planet.color; epicycleContext.lineWidth = 1.4; epicycleContext.stroke();

    // 地球→導円上の点→惑星、の2本の半径線
    const planetPointAU = {
      x: deferentPointAU.x + epicycleRadiusAU * Math.cos(epicycleAngleRadians),
      y: deferentPointAU.y + epicycleRadiusAU * Math.sin(epicycleAngleRadians)
    };
    const planetScreenPoint = toScreen(planetPointAU);
    const earthScreenPoint = toScreen({ x: 0, y: 0 });

    epicycleContext.beginPath();
    epicycleContext.moveTo(earthScreenPoint.x, earthScreenPoint.y);
    epicycleContext.lineTo(deferentScreenPoint.x, deferentScreenPoint.y);
    epicycleContext.strokeStyle = 'rgba(243,236,216,0.55)'; epicycleContext.lineWidth = 1; epicycleContext.stroke();
    epicycleContext.beginPath();
    epicycleContext.moveTo(deferentScreenPoint.x, deferentScreenPoint.y);
    epicycleContext.lineTo(planetScreenPoint.x, planetScreenPoint.y);
    epicycleContext.strokeStyle = 'rgba(243,236,216,0.85)'; epicycleContext.lineWidth = 1.2; epicycleContext.stroke();

    // 地球
    epicycleContext.beginPath(); epicycleContext.arc(earthScreenPoint.x, earthScreenPoint.y, 5, 0, Math.PI * 2);
    epicycleContext.fillStyle = EARTH_COLOR; epicycleContext.fill();
    epicycleContext.fillStyle = 'rgba(243,236,216,0.9)'; epicycleContext.font = '11px "Zen Kaku Gothic New"';
    epicycleContext.fillText('地球', earthScreenPoint.x + 9, earthScreenPoint.y + 4);

    // 内惑星の場合、導円上の点はそのまま太陽の位置でもある
    if (!planetIsOuter) {
      epicycleContext.beginPath(); epicycleContext.arc(deferentScreenPoint.x, deferentScreenPoint.y, 7, 0, Math.PI * 2);
      epicycleContext.fillStyle = SUN_COLOR; epicycleContext.shadowColor = SUN_COLOR; epicycleContext.shadowBlur = 14;
      epicycleContext.fill(); epicycleContext.shadowBlur = 0;
      epicycleContext.fillStyle = 'rgba(243,236,216,0.9)';
      epicycleContext.fillText('太陽(周転円の中心点でもある)', deferentScreenPoint.x + 10, deferentScreenPoint.y - 8);
    } else {
      epicycleContext.beginPath(); epicycleContext.arc(deferentScreenPoint.x, deferentScreenPoint.y, 2.5, 0, Math.PI * 2);
      epicycleContext.fillStyle = 'rgba(243,236,216,0.7)'; epicycleContext.fill();
      epicycleContext.fillStyle = 'rgba(243,236,216,0.6)'; epicycleContext.font = '9.5px "Zen Kaku Gothic New"';
      epicycleContext.fillText('周転円の中心(幾何学的な点)', deferentScreenPoint.x + 8, deferentScreenPoint.y - 6);
    }

    // 惑星本体
    epicycleContext.beginPath(); epicycleContext.arc(planetScreenPoint.x, planetScreenPoint.y, 5.5, 0, Math.PI * 2);
    epicycleContext.fillStyle = planet.color; epicycleContext.shadowColor = planet.color; epicycleContext.shadowBlur = 10;
    epicycleContext.fill(); epicycleContext.shadowBlur = 0;
    epicycleContext.fillStyle = 'rgba(243,236,216,0.95)'; epicycleContext.font = '12px "Zen Kaku Gothic New"';
    epicycleContext.fillText(planet.label + '(今日の位置)', planetScreenPoint.x + 10, planetScreenPoint.y + 4);

    // 注記
    epicycleContext.fillStyle = 'rgba(201,162,75,0.7)'; epicycleContext.font = '10.5px "Zen Kaku Gothic New"';
    epicycleContext.fillText(
      `導円半径=${deferentRadiusAU.toFixed(2)}AU　周転円半径=${epicycleRadiusAU.toFixed(2)}AU　(${planetIsOuter ? '外惑星:導円=自身の公転' : '内惑星:導円=太陽の見かけの軌道'})`,
      10, height - 10
    );
  }

  function render() {
    const state = computeCurrentState();
    document.getElementById('date-value-label').textContent = formatDateLabel(state.dayOfYear);
    const wholeHours = Math.floor(state.hour), minutes = Math.round((state.hour - wholeHours) * 60);
    document.getElementById('hour-value-label').textContent = String(wholeHours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
    document.getElementById('latitude-value-label').textContent =
      (state.latitudeDegrees >= 0 ? '+' : '') + state.latitudeDegrees.toFixed(1) + '°' +
      (Math.abs(state.latitudeDegrees - 35.7) < 0.01 ? '(東京)' : '');

    drawOverheadView(state);
    const sunHorizontal = drawSkyPanorama(state);
    drawEpicycleDetail(state);

    document.getElementById('readout-ecliptic-longitude').textContent = state.sunEclipticLongitudeDegrees.toFixed(1) + '°';
    document.getElementById('readout-declination').textContent = state.sunDeclinationDegrees.toFixed(1) + '°';
    document.getElementById('readout-altitude').textContent =
      sunHorizontal.altitudeDegrees.toFixed(1) + '°' + (sunHorizontal.altitudeDegrees < 0 ? '(地平線下)' : '');
    document.getElementById('readout-azimuth').textContent = sunHorizontal.azimuthDegrees.toFixed(0) + '°';
    document.getElementById('readout-zodiac-sign').textContent = zodiacSignNames[currentZodiacIndex(state.sunEclipticLongitudeDegrees)];
  }

  [dayOfYearSlider, hourSlider, latitudeSlider].forEach(el => el.addEventListener('input', render));

  function stopHourAnimation() {
    hourAnimating = false;
    hourAnimateButton.classList.remove('active');
    hourAnimateButton.textContent = '▶ 時刻を進める';
    dayAnimateButton.classList.remove('is-disabled');
    clearTimeout(hourAnimationTimerId);
  }
  function stopDayAnimation() {
    dayAnimating = false;
    dayAnimateButton.classList.remove('active');
    dayAnimateButton.textContent = '▶ 日を進める';
    hourAnimateButton.classList.remove('is-disabled');
    clearTimeout(dayAnimationTimerId);
  }

  hourAnimateButton.addEventListener('click', () => {
    if (dayAnimating) stopDayAnimation();
    hourAnimating = !hourAnimating;
    hourAnimateButton.classList.toggle('active', hourAnimating);
    hourAnimateButton.textContent = hourAnimating ? '■ 停止' : '▶ 時刻を進める';
    dayAnimateButton.classList.toggle('is-disabled', hourAnimating);
    if (hourAnimating) tickHourAnimation();
  });
  dayAnimateButton.addEventListener('click', () => {
    if (hourAnimating) stopHourAnimation();
    dayAnimating = !dayAnimating;
    dayAnimateButton.classList.toggle('active', dayAnimating);
    dayAnimateButton.textContent = dayAnimating ? '■ 停止' : '▶ 日を進める';
    hourAnimateButton.classList.toggle('is-disabled', dayAnimating);
    if (dayAnimating) tickDayAnimation();
  });

  function tickHourAnimation() {
    if (!hourAnimating) return;
    let hour = parseFloat(hourSlider.value) + 0.15;
    if (hour >= 24) {
      hour -= 24;
      const maxDay = parseFloat(dayOfYearSlider.max);
      dayOfYearSlider.value = (parseFloat(dayOfYearSlider.value) + 1) % (maxDay + 1);
    }
    hourSlider.value = hour.toFixed(2);
    render();
    hourAnimationTimerId = setTimeout(tickHourAnimation, 40);
  }
  function tickDayAnimation() {
    if (!dayAnimating) return;
    let day = parseFloat(dayOfYearSlider.value) + 1.0;
    const maxDay = parseFloat(dayOfYearSlider.max);
    if (day >= maxDay) day = 0;
    dayOfYearSlider.value = day.toFixed(2);
    render();
    dayAnimationTimerId = setTimeout(tickDayAnimation, 40);
  }

  render();
})();
