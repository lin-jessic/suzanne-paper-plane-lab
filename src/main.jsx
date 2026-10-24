import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Brain, CheckCircle2, CloudFog, CloudLightning, CloudRain, Crosshair, Eye, EyeOff, Gauge, Info, Lock, Plane, Rewind, RotateCcw, Ruler, Scale, Snowflake, Sparkles, Sun, Unlock, Wind } from 'lucide-react';
import './styles.css';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const WORLD_X_SCALE = 1.25;
const WORLD_Y_SCALE = 1.1;
const WORLD_Z_SCALE = 1.35;
const START_HEIGHT = 1.35 * WORLD_Y_SCALE;

const weatherProfiles = {
      clear: { wind: 0, description: '天空晴朗，適合觀察基本飛行軌跡。' },
      rain: { wind: 3, description: '降雨伴隨微風，飛行時注意側風。' },
      typhoon: { wind: 10, description: '強風、斜向暴雨與不規則亂流。' },
      snow: { wind: 4, description: '緩慢飄雪與間歇陣風，飛機容易輕微晃動。' },
      fog: { wind: 2, description: '濃霧降低能見度，遠處的飛行軌跡較難觀察。' },
      thunderstorm: { wind: 8, description: '雷雨伴隨短暫強陣風和閃電。' }
    };

    const weather_v2_profiles = {
      clear: [
        { label: '柔和陽光', intensity: 0.55, wind: 0 },
        { label: '一般晴天', intensity: 1, wind: 0 },
        { label: '烈日', intensity: 1.5, wind: 1 },
        { label: '酷熱烈日', intensity: 1.9, wind: 2 }
      ],
      rain: [
        { label: '小雨', intensity: 0.4, wind: 2 },
        { label: '大雨', intensity: 0.85, wind: 4 },
        { label: '大豪雨', intensity: 1.35, wind: 7 },
        { label: '超大豪雨', intensity: 1.8, wind: 10 }
      ],
      typhoon: [
        { label: '輕度颱風', intensity: 0.6, wind: 5 },
        { label: '中度颱風', intensity: 1, wind: 7 },
        { label: '強烈颱風', intensity: 1.45, wind: 9 },
        { label: '超級強颱（遊戲情境）', intensity: 1.9, wind: 10 }
      ],
      snow: [
        { label: '小雪', intensity: 0.4, wind: 1 },
        { label: '中雪', intensity: 0.8, wind: 3 },
        { label: '大雪', intensity: 1.35, wind: 6 },
        { label: '暴風雪', intensity: 1.9, wind: 9 }
      ],
      fog: [
        { label: '薄霧', intensity: 0.4, wind: 1 },
        { label: '中霧', intensity: 0.9, wind: 2 },
        { label: '濃霧', intensity: 1.4, wind: 2 },
        { label: '極濃霧', intensity: 1.9, wind: 3 }
      ],
      thunderstorm: [
        { label: '偶發閃電', intensity: 0.45, wind: 3, flashes: 0.2 },
        { label: '一般雷雨', intensity: 0.9, wind: 5, flashes: 0.5 },
        { label: '頻繁落雷', intensity: 1.4, wind: 8, flashes: 1 },
        { label: '劇烈雷暴', intensity: 1.9, wind: 10, flashes: 1.8 }
      ]
    };

    const weatherKnowledge = {
      clear: '日照強度主要改變視覺亮度；酷熱可能影響空氣密度，但本模擬只加入輕微熱對流擾動。',
      rain: '臺灣的「大雨、豪雨、大豪雨、超大豪雨」依特定時段的累積雨量判定，並非單看瞬間雨滴密度。本遊戲以不同雨勢做情境示意。',
      typhoon: '臺灣官方颱風強度分輕度、中度、強烈三級，依中心附近最大持續風速判定。「超級強颱」是額外遊戲情境，場內風速不等於颱風中心風速。',
      snow: '降雪時，風和亂流會讓飛機難以維持穩定；真實飛機還可能面臨結冰，但本紙飛機模型不模擬積冰質量。',
      fog: '霧主要降低能見度，未必伴隨強風。偏黃的霾可能與懸浮微粒有關，和單純水滴形成的霧不同。',
      thunderstorm: '雷暴通常伴隨強烈對流、陣風和閃電。遊戲以畫面閃光和較大亂流示意，不預測真實落雷位置。'
    };

    const weatherPlaces = [
      { name: '桃園', lat: 24.9937, lon: 121.3010 },
      { name: '臺北', lat: 25.0330, lon: 121.5654 },
      { name: '新北', lat: 25.0124, lon: 121.4657 },
      { name: '新竹', lat: 24.8138, lon: 120.9675 },
      { name: '臺中', lat: 24.1477, lon: 120.6736 },
      { name: '臺南', lat: 22.9999, lon: 120.2270 },
      { name: '高雄', lat: 22.6273, lon: 120.3014 },
      { name: '宜蘭', lat: 24.7570, lon: 121.7533 },
      { name: '花蓮', lat: 23.9911, lon: 121.6112 },
      { name: '臺東', lat: 22.7583, lon: 121.1444 },
      { name: '基隆', lat: 25.1276, lon: 121.7392 },
      { name: '屏東', lat: 22.6829, lon: 120.4879 }
    ];

    function classifyLiveWeather(current) {
      const code = current.weather_code ?? 0;
      const wind = current.wind_speed_10m ?? 0;
      const precipitation = current.precipitation ?? 0;
      const visibility = current.visibility ?? 10000;
      if ([95, 96, 99].includes(code)) return 'thunderstorm';
      if ([45, 48].includes(code) || visibility < 1000) return 'fog';
      if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
      if (wind >= 20 && precipitation >= 1) return 'typhoon';
      if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code) || precipitation > 0) return 'rain';
      return 'clear';
    }

    const DEFAULT_AIRFRAME = {
  bodyLength: 100,
  wingSpan: 100,
  wingChord: 100,
  tipLength: 70,
  leftTipAngle: 8,
  rightTipAngle: 8
};

const DEFAULT_PROPELLER = {
  enabled: false,
  placement: 'nose',
  length: 100,
  weight: 0.8,
  thrust: 45
};

const clipMultiplier = placement => placement === 'both' ? 2 : 1;
const lateralSign = placement => placement === 'left' ? 1 : placement === 'right' ? -1 : 0;
const propellerLateralSign = placement => placement === 'left' ? 1 : placement === 'right' ? -1 : 0;

function simulateFlight(settings) {
  const { clipCount, clipPosition, clipPlacement, throwAngle, throwPower, wind, windDirection, weather, goal } = settings;
      const weatherLevel = settings.weatherLevel ?? 1;
      const weatherStrength = weather_v2_profiles[weather]?.[weatherLevel]?.intensity ?? 1;
  const airframe = { ...DEFAULT_AIRFRAME, ...(settings.airframe ?? {}) };
  const propeller = { ...DEFAULT_PROPELLER, ...(settings.propeller ?? {}) };
  const lengthFactor = airframe.bodyLength / 100;
  const spanFactor = airframe.wingSpan / 100;
  const chordFactor = airframe.wingChord / 100;
  const wingAreaFactor = spanFactor * chordFactor;
  const averageTipAngle = (airframe.leftTipAngle + airframe.rightTipAngle) / 2;
  const tipAsymmetry = (airframe.leftTipAngle - airframe.rightTipAngle) / 18;
  const tipLengthFactor = airframe.tipLength / 100;
  const propellerLengthFactor = propeller.length / 100;
  const propellerWeight = propeller.enabled ? propeller.weight * 0.001 : 0;
  const propellerThrust = propeller.enabled ? 0.72 * (propeller.thrust / 100) * (0.72 + propellerLengthFactor * 0.28) : 0;
  const propellerSideWeight = propeller.enabled ? propellerLateralSign(propeller.placement) * clamp(propeller.weight / 1.6, 0, 1) : 0;
  const propellerCgShift = propeller.enabled
    ? ({ nose: 3.4, tail: -3.4, left: 0.9, right: 0.9 }[propeller.placement] ?? 0) * clamp(propeller.weight / 1.2, 0.2, 2)
    : 0;
  const effectiveClipCount = clipCount * clipMultiplier(clipPlacement);
  const sideWeight = lateralSign(clipPlacement);
  const crosswindSign = windDirection === 'left' ? 1 : windDirection === 'right' ? -1 : 0;
  const longitudinalWind = windDirection === 'front' ? wind : 0;
  const crosswind = crosswindSign * Math.abs(wind);
  const mass = 0.005 * (0.9 + lengthFactor * 0.1 + wingAreaFactor * 0.08) + effectiveClipCount * 0.00045 + propellerWeight;
  const targetCg = 30;
  const cg = (effectiveClipCount === 0 ? 37 : 37 - effectiveClipCount * (45 - clipPosition) * 0.11) - propellerCgShift;
  const geometryStability = clamp(1 + (lengthFactor - 1) * 0.14 + (averageTipAngle / 18) * 0.14 - Math.abs(tipAsymmetry) * 0.22, 0.72, 1.2);
  const stability = clamp((1 - Math.abs(cg - targetCg) / 24) * geometryStability, 0.35, 1);
  const noseHeavy = clamp((30 - cg) / 13, -0.75, 0.75);
  const speed0 = 5.8 + throwPower * 0.12;
  const angle = THREE.MathUtils.degToRad(throwAngle);
  let x = 0;
  let y = 1.35;
  let z = 0;
  let vx = speed0 * Math.cos(angle);
  let vy = speed0 * Math.sin(angle);
  let vz = 0;
  let t = 0;
  let peak = y;
  const liftFactor = clamp(0.84 + wingAreaFactor * 0.28 + (averageTipAngle / 18) * 0.08 + tipLengthFactor * 0.08 - (lengthFactor - 1) * 0.08, 0.66, 1.3);
  const dragFactor = clamp(0.84 + wingAreaFactor * 0.24 + (lengthFactor - 1) * 0.2 + (averageTipAngle / 18) * 0.06 + (tipLengthFactor - 0.7) * 0.08 + (propeller.enabled ? propellerLengthFactor * 0.12 : 0), 0.72, 1.72);
  const rollDamping = clamp(1.15 - (averageTipAngle / 18) * 0.48, 0.48, 1.2);
  const lateralLoad = clamp(sideWeight * clamp(0.14 + clipCount * 0.065, 0, 0.38) + propellerSideWeight * 0.12, -0.42, 0.42);
  const maxBank = (lateralLoad + tipAsymmetry * 0.06) * rollDamping;
  const points = [{ x, y, z, t, roll: 0, lift: 0, drag: 0, speed: speed0, turbulence: 0 }];

  while (y > 0 && t < 12) {
    const dt = 0.04;
    const relativeV = Math.max(0.2, vx - longitudinalWind * 0.25);
    const speedRatio = relativeV / speed0;
    const massFactor = clamp(0.00545 / mass, 0.82, 1.08);
    const lift = 8.65 * liftFactor * speedRatio * speedRatio * stability * massFactor;
    const drag = 0.025 * dragFactor * relativeV * relativeV * (1 + (1 - stability) * 1.6);
    const goalLift = goal === 'high' ? 1.04 : 1;
    const gustWave = weather === 'typhoon'
      ? Math.sin(t * 5.1 + 0.7) * 0.56 + Math.sin(t * 11.7 + 1.9) * 0.3 + Math.sin(t * 2.3) * 0.22
      : 0;
    const snowGust = Math.sin(t * 3.4) * 0.28 + Math.sin(t * 7.1 + 1.4) * 0.12;
        const thunderGust = Math.sin(t * 7.8) * 0.48 + Math.sin(t * 15.6 + 0.8) * 0.35 + Math.sin(t * 2.5) * 0.2;
        const turbulence = weather === 'typhoon' ? gustWave * (0.7 + Math.abs(wind) * 0.075) * weatherStrength
          : weather === 'thunderstorm' ? thunderGust * (0.6 + Math.abs(wind) * 0.065) * weatherStrength
          : weather === 'snow' ? snowGust * (0.35 + Math.abs(wind) * 0.04) * weatherStrength : weather === 'rain' ? Math.sin(t * 4.6) * 0.13 * weatherStrength : weather === 'clear' ? Math.sin(t * 2.7) * 0.055 * Math.max(0, weatherStrength - 1) : 0;
    const roll = maxBank * (1 - Math.exp(-t * 2.4))
      + sideWeight * Math.sin(t * 7) * 0.018
      + crosswind * 0.012 * (1 - Math.exp(-t * 1.8))
      + turbulence * 0.085;
    vx += ((longitudinalWind * 0.3) + propellerThrust - drag + turbulence * 0.12) * dt;
    vy += (lift * goalLift - 9.81 - noseHeavy * 2.5 - vy * 0.12 + turbulence * 1.25) * dt;
    vz += (Math.sin(roll) * lift * 1.8 + tipAsymmetry * lift * 0.34 + crosswind * 0.46 + turbulence * 2.2 - vz * (0.38 + (averageTipAngle / 18) * 0.12)) * dt;
    x += Math.max(0, vx) * dt;
    y += vy * dt;
    z += vz * dt;
    t += dt;
    peak = Math.max(peak, y);
    points.push({ x, y: Math.max(0, y), z, t, roll, lift, drag, speed: Math.max(0, vx), turbulence });
  }

  const distance = points.at(-1).x;
  const airtime = points.at(-1).t;
  const deviation = points.at(-1).z;
  let verdict = '配重接近穩定區，適合進行真實試飛。';
  if (clipCount === 0) verdict = '目前沒有配重，機頭可能抬起後失速。';
  else if (sideWeight !== 0) verdict = `${clipPlacement === 'left' ? '左翼' : '右翼'}較重，飛機會向同側傾斜並偏移約 ${Math.abs(deviation).toFixed(1)} 公尺。`;
  else if (propeller.enabled && propeller.weight > 1.8) verdict = '螺旋槳偏重，飛機前進較慢，重心也更靠近安裝側。';
  else if (propeller.enabled && propeller.thrust > 65) verdict = '螺旋槳推進效率較高，前進距離增加，但槳葉阻力也會上升。';
  else if (Math.abs(tipAsymmetry) > 0.2) verdict = `${tipAsymmetry > 0 ? '左翼' : '右翼'}翼端上翹較高，飛機會產生持續側滾與偏移。`;
  else if (cg < 23) verdict = '機頭偏重，飛機可能很快向下俯衝。';
  else if (cg > 36) verdict = '重心偏後，飛機可能抬頭並左右搖晃。';
  else if (crosswindSign !== 0 && Math.abs(wind) > 2) verdict = `${windDirection === 'left' ? '左側風' : '右側風'}讓落點側偏約 ${Math.abs(deviation).toFixed(1)} 公尺。`;
  else if (weather === 'typhoon') verdict = '颱風亂流使高度與方向持續改變，落點最難預測。';
      else if (weather === 'thunderstorm') verdict = '雷雨中的陣風讓飛機高度與落點出現較明顯的變化。';
      else if (weather === 'snow') verdict = '雪天的間歇陣風讓飛機產生輕微晃動。';
      else if (weather === 'fog') verdict = '濃霧影響觀察距離，實際飛行仍受風向和風速影響。';
  else if (longitudinalWind > 3) verdict = '順風很強，軌跡會變遠，但真實飛行也更難控制。';
  else if (longitudinalWind < -3) verdict = '逆風很強，飛機前進速度下降，但可能增加滯空時間。';

  const peakIndex = points.reduce((best, point, index) => point.y > points[best].y ? index : best, 0);
  const events = [{ progress: peakIndex / Math.max(1, points.length - 1), label: '到達最高點', detail: `${peak.toFixed(1)} 公尺`, tone: 'peak' }];
  if (weather === 'typhoon' || weather === 'thunderstorm') {
    const gustIndex = points.reduce((best, point, index) => Math.abs(point.turbulence) > Math.abs(points[best].turbulence) ? index : best, 0);
    events.push({ progress: gustIndex / Math.max(1, points.length - 1), label: '強烈亂流', detail: '高度與姿態突然改變', tone: 'danger' });
  }
  if (crosswindSign !== 0 && Math.abs(wind) > 1) {
    events.push({ progress: 0.58, label: '側風推動', detail: `飛機向${crosswindSign > 0 ? '左' : '右'}側偏移`, tone: 'wind' });
  }
  if (stability < 0.72) events.push({ progress: 0.38, label: '重心不穩', detail: '機身開始明顯搖擺', tone: 'warning' });
  if (Math.abs(tipAsymmetry) > 0.2) events.push({ progress: 0.48, label: '翼端不對稱', detail: '左右上翹角度造成側滾', tone: 'warning' });
  if (propeller.enabled && propeller.thrust > 65) events.push({ progress: 0.3, label: '螺旋槳推進', detail: `額外前進推力 ${(propellerThrust * 100).toFixed(0)}%`, tone: 'peak' });
  events.sort((a, b) => a.progress - b.progress);

  return { points, distance, peak, airtime, deviation, cg, stability, verdict, events };
}

function getCg(settings) {
  const airframe = { ...DEFAULT_AIRFRAME, ...(settings.airframe ?? {}) };
  const propeller = { ...DEFAULT_PROPELLER, ...(settings.propeller ?? {}) };
  const lengthBias = (airframe.bodyLength - 100) * 0.025;
  const propellerCgShift = propeller.enabled
    ? ({ nose: 3.4, tail: -3.4, left: 0.9, right: 0.9 }[propeller.placement] ?? 0) * clamp(propeller.weight / 1.2, 0.2, 2)
    : 0;
  const clipCg = settings.clipCount === 0
    ? 37
    : 37 - settings.clipCount * clipMultiplier(settings.clipPlacement) * (45 - settings.clipPosition) * 0.11;
  return clipCg - lengthBias - propellerCgShift;
}

function makePlane(airframe = DEFAULT_AIRFRAME) {
  const group = new THREE.Group();
  const paper = new THREE.MeshStandardMaterial({ color: '#f8fbf8', roughness: 0.72, side: THREE.DoubleSide });
  const creaseMaterial = new THREE.LineBasicMaterial({ color: '#92aaa1', transparent: true, opacity: 0.5 });
  const makeWing = (side) => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(-4.6, side * 1.25);
    shape.lineTo(-3.2, side * 5.2);
    shape.lineTo(4.8, side * 0.55);
    shape.lineTo(5.35, 0);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    const mesh = new THREE.Mesh(geo, paper);
    mesh.userData.isAirframeWing = true;
    mesh.userData.side = side;
    const wing = new THREE.Group();
    wing.add(mesh);

    return wing;
  };
  group.add(makeWing(1), makeWing(-1));

  const keelGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-4.5, 0, 0), new THREE.Vector3(5.35, 0, 0), new THREE.Vector3(-2.2, 0, -0.55), new THREE.Vector3(-4.5, 0, 0)
  ]);
  const keel = new THREE.Mesh(keelGeo, new THREE.MeshStandardMaterial({ color: '#dce9e3', side: THREE.DoubleSide }));
  keel.userData.isAirframeKeel = true;
  keel.rotation.x = Math.PI / 2;
  group.add(keel);

  [-1, 1].forEach(side => {
    const crease = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-3.9, side * 1.15, 0.02), new THREE.Vector3(4.95, side * 0.45, 0.02)
    ]);
    const creaseLine = new THREE.Line(crease, creaseMaterial);
    creaseLine.userData.isAirframeCrease = true;
    group.add(creaseLine);
  });
  group.rotation.x = -Math.PI / 2;
  const carrier = new THREE.Group();
  carrier.add(group);
  carrier.userData.paperModel = group;
  carrier.userData.applyAirframe = nextAirframe => {
    const next = { ...DEFAULT_AIRFRAME, ...(nextAirframe ?? {}) };
    const lengthScale = next.bodyLength / 100;
    const spanScale = next.wingSpan / 100;
    const chordScale = next.wingChord / 100;
    const tipExtent = 0.55 + (next.tipLength / 100) * 0.45;
    group.traverse(object => {
      if (object.userData.isAirframeWing) {
        object.scale.set(lengthScale * chordScale, spanScale, 1);
        const tipAngle = object.userData.side === 1 ? next.leftTipAngle : next.rightTipAngle;
        object.rotation.x = object.userData.side * THREE.MathUtils.degToRad(tipAngle) * tipExtent;
      }
      if (object.userData.isAirframeKeel) object.scale.set(lengthScale, 1, 1);
      if (object.userData.isAirframeCrease) object.scale.set(lengthScale * chordScale, spanScale, 1);
    });
    group.userData.airframe = next;
  };
  carrier.userData.applyAirframe(airframe);
  return carrier;
}

function makePropeller(propeller = DEFAULT_PROPELLER, airframe = DEFAULT_AIRFRAME) {
  const propellerGroup = new THREE.Group();
  const rotor = new THREE.Group();
  const hubMaterial = new THREE.MeshStandardMaterial({ color: '#2f6757', metalness: 0.35, roughness: 0.38 });
  const bladeMaterial = new THREE.MeshStandardMaterial({ color: '#e34e38', roughness: 0.55, side: THREE.DoubleSide });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.3, 14), hubMaterial);
  hub.rotation.z = Math.PI / 2;
  rotor.add(hub);
  for (let index = 0; index < 3; index += 1) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.65, 0.18), bladeMaterial);
    blade.position.y = 0.82;
    blade.rotation.z = index * (Math.PI * 2 / 3);
    blade.castShadow = true;
    rotor.add(blade);
  }
  rotor.traverse(object => { if (object.isMesh) object.castShadow = true; });
  propellerGroup.add(rotor);
  propellerGroup.userData.rotor = rotor;
  propellerGroup.userData.applyPropeller = (nextPropeller, nextAirframe) => {
    const next = { ...DEFAULT_PROPELLER, ...(nextPropeller ?? {}) };
    const frame = { ...DEFAULT_AIRFRAME, ...(nextAirframe ?? {}) };
    const spanScale = frame.wingSpan / 100;
    const position = {
      nose: [5.55, 0.08, 0],
      tail: [-4.7, 0.08, 0],
      left: [1.1, 0.08, 2.2 * spanScale],
      right: [1.1, 0.08, -2.2 * spanScale]
    }[next.placement] ?? [5.55, 0.08, 0];
    propellerGroup.visible = next.enabled;
    propellerGroup.position.set(...position);
    rotor.scale.setScalar(0.42 * (next.length / 100));
    propellerGroup.userData.spinRate = next.enabled ? 10 + next.thrust * 0.12 : 0;
    propellerGroup.userData.config = next;
  };
  propellerGroup.userData.applyPropeller(propeller, airframe);
  return propellerGroup;
}

function makeClip() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.38, -0.12, 0), new THREE.Vector3(-0.45, 0.14, 0),
    new THREE.Vector3(-0.2, 0.3, 0), new THREE.Vector3(0.35, 0.28, 0),
    new THREE.Vector3(0.48, 0.03, 0), new THREE.Vector3(0.28, -0.26, 0),
    new THREE.Vector3(-0.18, -0.24, 0), new THREE.Vector3(-0.28, -0.08, 0),
    new THREE.Vector3(0.2, 0.08, 0)
  ]);
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 42, 0.035, 6, false),
    new THREE.MeshStandardMaterial({ color: '#354944', metalness: 0.78, roughness: 0.25 })
  );
}

function makeTree(height = 4.5, color = '#3f8b59') {
  const tree = new THREE.Group();
  tree.userData.isTree = true;
  tree.userData.swayPhase = height * 1.7;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.28, height * 0.42, 8),
    new THREE.MeshStandardMaterial({ color: '#806044', roughness: 1 })
  );
  trunk.position.y = height * 0.21;
  const crown = new THREE.Mesh(
    new THREE.IcosahedronGeometry(height * 0.3, 1),
    new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true })
  );
  crown.scale.set(1, 1.25, 1);
  crown.position.y = height * 0.68;
  tree.add(trunk, crown);
  tree.traverse(object => { if (object.isMesh) object.castShadow = true; });
  return tree;
}

function makeCar(color = '#d94f3d') {
  const car = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.65 });
  const dark = new THREE.MeshStandardMaterial({ color: '#243a3a', roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.75, 1.75), bodyMaterial);
  body.position.y = 0.65;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 1.55), dark);
  cabin.position.set(-0.25, 1.3, 0);
  car.add(body, cabin);
  [-1.25, 1.25].forEach(x => [-0.92, 0.92].forEach(z => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 14), dark);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, 0.36, z);
    car.add(wheel);
  }));
  car.traverse(object => { if (object.isMesh) object.castShadow = true; });
  return car;
}

function makeDistanceMarker(distance) {
  const marker = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 1.5, 8),
    new THREE.MeshStandardMaterial({ color: '#48665d', roughness: 0.9 })
  );
  pole.position.y = 0.75;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 112;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(248,252,249,0.96)';
  context.roundRect(8, 8, 240, 96, 18);
  context.fill();
  context.strokeStyle = '#48665d';
  context.lineWidth = 5;
  context.stroke();
  context.fillStyle = '#173d32';
  context.font = '700 48px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(`${distance} m`, 128, 57);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  label.scale.set(2.4, 1.05, 1);
  label.position.y = 1.65;
  marker.add(pole, label);
  return marker;
}

function makeGrassTexture(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = '#7fb373';
  context.fillRect(0, 0, canvas.width, canvas.height);
  let seed = 94721;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const patchColors = ['#73a969', '#8cbd7d', '#679b60', '#95c687'];
  for (let index = 0; index < 2200; index += 1) {
    context.fillStyle = patchColors[Math.floor(random() * patchColors.length)];
    const size = 1 + random() * 2.4;
    context.fillRect(random() * 256, random() * 256, size, size);
  }
  const bladeColors = ['#4f8950', '#5f9858', '#a4cd8f'];
  context.lineWidth = 0.7;
  for (let index = 0; index < 1700; index += 1) {
    const x = random() * 256;
    const y = random() * 256;
    context.strokeStyle = bladeColors[Math.floor(random() * bladeColors.length)];
    context.beginPath();
    context.moveTo(x, y + 2.5);
    context.lineTo(x + (random() - 0.5) * 2, y - 2 - random() * 3);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(32, 14);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function makeWindStreaks(isMobile) {
  const count = isMobile ? 60 : 130;
  const bases = new Float32Array(count * 3);
  const positions = new Float32Array(count * 6);
  let seed = 13579;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let index = 0; index < count; index += 1) {
    bases[index * 3] = -18 + random() * 88;
    bases[index * 3 + 1] = 0.45 + random() * 8.5;
    bases[index * 3 + 2] = -18 + random() * 36;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: '#d5f2ef', transparent: true, opacity: 0, depthWrite: false });
  const streaks = new THREE.LineSegments(geometry, material);
  streaks.visible = false;
  streaks.frustumCulled = false;
  streaks.userData.bases = bases;
  streaks.userData.count = count;
  return streaks;
}

function updateWindStreaks(streaks, wind, windDirection, delta) {
  const strength = Math.abs(wind);
  if (strength < 0.05) {
    streaks.visible = false;
    return;
  }
  streaks.visible = true;
  streaks.material.opacity = clamp(0.14 + strength * 0.065, 0.14, 0.8);
  const directionX = windDirection === 'front' ? Math.sign(wind) : 0;
  const directionZ = windDirection === 'left' ? 1 : windDirection === 'right' ? -1 : 0;
  const speed = strength * (1.2 + strength * 0.22);
  const length = 0.35 + strength * 0.22;
  const bases = streaks.userData.bases;
  const positions = streaks.geometry.attributes.position.array;
  for (let index = 0; index < streaks.userData.count; index += 1) {
    const offset = index * 3;
    bases[offset] += directionX * speed * delta;
    bases[offset + 2] += directionZ * speed * delta;
    if (bases[offset] > 70) bases[offset] = -18;
    if (bases[offset] < -18) bases[offset] = 70;
    if (bases[offset + 2] > 20) bases[offset + 2] = -20;
    if (bases[offset + 2] < -20) bases[offset + 2] = 20;
    const vertex = index * 6;
    positions[vertex] = bases[offset];
    positions[vertex + 1] = bases[offset + 1];
    positions[vertex + 2] = bases[offset + 2];
    positions[vertex + 3] = bases[offset] - directionX * length;
    positions[vertex + 4] = bases[offset + 1] + Math.sin(index * 1.7) * 0.035 * strength;
    positions[vertex + 5] = bases[offset + 2] - directionZ * length;
  }
  streaks.geometry.attributes.position.needsUpdate = true;
}

function makeRainStreaks(isMobile) {
  const count = isMobile ? 95 : 170;
  const bases = new Float32Array(count * 3);
  const positions = new Float32Array(count * 6);
  let seed = 86421;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let index = 0; index < count; index += 1) {
    bases[index * 3] = -18 + random() * 88;
    bases[index * 3 + 1] = 0.3 + random() * 13;
    bases[index * 3 + 2] = -20 + random() * 40;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: '#c7e4ea', transparent: true, opacity: 0, depthWrite: false });
  const rain = new THREE.LineSegments(geometry, material);
  rain.visible = false;
  rain.frustumCulled = false;
  rain.userData.bases = bases;
  rain.userData.count = count;
  return rain;
}

function updateRainStreaks(rain, weather, wind, windDirection, delta, intensity = 1) {
  if (!['rain', 'typhoon', 'thunderstorm'].includes(weather)) {
    rain.visible = false;
    return;
  }
const typhoon = weather === 'typhoon';
      const storm = weather === 'thunderstorm';
      rain.visible = true;
      rain.material.opacity = Math.min(0.48, (typhoon ? 0.33 : storm ? 0.3 : 0.24) * intensity);
      const fallSpeed = (typhoon ? 23 : storm ? 20 : 14) * (0.7 + intensity * 0.25);
      const slant = wind * (typhoon ? 0.16 : storm ? 0.12 : 0.08);
  const directionX = windDirection === 'front' ? 1 : 0;
  const directionZ = windDirection === 'left' ? 1 : windDirection === 'right' ? -1 : 0;
  const length = (typhoon ? 0.46 : 0.3) * (0.8 + intensity * 0.2);
  const bases = rain.userData.bases;
  const positions = rain.geometry.attributes.position.array;
  for (let index = 0; index < rain.userData.count; index += 1) {
    const offset = index * 3;
    bases[offset] += directionX * wind * delta * (typhoon ? 0.72 : 0.25);
    bases[offset + 2] += directionZ * Math.abs(wind) * delta * (typhoon ? 0.72 : 0.25);
    bases[offset + 1] -= fallSpeed * delta;
    if (bases[offset + 1] < 0.15) bases[offset + 1] = 13;
    if (bases[offset] > 70) bases[offset] = -18;
    if (bases[offset] < -18) bases[offset] = 70;
    if (bases[offset + 2] > 20) bases[offset + 2] = -20;
    if (bases[offset + 2] < -20) bases[offset + 2] = 20;
    const vertex = index * 6;
    positions[vertex] = bases[offset];
    positions[vertex + 1] = bases[offset + 1];
    positions[vertex + 2] = bases[offset + 2];
    positions[vertex + 3] = bases[offset] - directionX * slant;
    positions[vertex + 4] = bases[offset + 1] + length;
    positions[vertex + 5] = bases[offset + 2] - directionZ * Math.abs(slant);
  }
  rain.geometry.attributes.position.needsUpdate = true;
}

function makeSnowflakes(isMobile) {
      const count = isMobile ? 90 : 210;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i += 1) {
        positions[i * 3] = Math.random() * 78 - 16;
        positions[i * 3 + 1] = Math.random() * 15;
        positions[i * 3 + 2] = Math.random() * 38 - 19;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({ color: '#ffffff', size: 0.13, transparent: true, opacity: 0.9, depthWrite: false });
      const snow = new THREE.Points(geometry, material);
      snow.frustumCulled = false;
      snow.visible = false;
      return snow;
    }

    function updateSnowflakes(snow, weather, wind, windDirection, delta, time, intensity = 1) {
      snow.visible = weather === 'snow';
  if (!snow.visible) return;
  snow.material.opacity = Math.min(1, 0.55 + intensity * 0.22);
  snow.material.size = 0.09 + intensity * 0.05;
  const positions = snow.geometry.attributes.position.array;
      const driftX = windDirection === 'front' ? wind * 0.22 : 0;
      const driftZ = windDirection === 'left' ? Math.abs(wind) * 0.22 : windDirection === 'right' ? -Math.abs(wind) * 0.22 : 0;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] += (driftX + Math.sin(time * 0.0015 + i) * 0.3) * delta;
        positions[i + 1] -= (1.2 + (i % 9) * 0.13) * delta * (0.6 + intensity * 0.3);
        positions[i + 2] += (driftZ + Math.cos(time * 0.001 + i) * 0.2) * delta;
        if (positions[i + 1] < 0) positions[i + 1] = 14;
        if (positions[i] > 70) positions[i] = -16;
        if (positions[i] < -16) positions[i] = 70;
        if (positions[i + 2] > 19) positions[i + 2] = -19;
        if (positions[i + 2] < -19) positions[i + 2] = 19;
      }
      snow.geometry.attributes.position.needsUpdate = true;
    }

    function makeEnvironment() {
  const environment = new THREE.Group();
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 4.2),
    new THREE.MeshStandardMaterial({ color: '#7d8987', roughness: 1 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(32, 0.012, 12);
  environment.add(road);
  [-1.45, 1.45].forEach(z => {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(90, 0.025, 0.09), new THREE.MeshStandardMaterial({ color: '#eef1dc' }));
    stripe.position.set(32, 0.035, 12 + z);
    environment.add(stripe);
  });

  const car = makeCar();
  car.position.set(17 * WORLD_X_SCALE, 0, 12);
  car.rotation.y = Math.PI;
  environment.add(car);

  const rearRoad = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 3.6),
    new THREE.MeshStandardMaterial({ color: '#899391', roughness: 1 })
  );
  rearRoad.rotation.x = -Math.PI / 2;
  rearRoad.position.set(32, 0.01, -17.5);
  environment.add(rearRoad);
  const rearCar = makeCar('#3978b8');
  rearCar.scale.setScalar(0.78);
  rearCar.position.set(9.5 * WORLD_X_SCALE, 0, -17.5);
  environment.add(rearCar);

  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(6.2, 48),
    new THREE.MeshStandardMaterial({ color: '#6eb9c2', roughness: 0.35, metalness: 0.05, transparent: true, opacity: 0.9 })
  );
  lake.rotation.x = -Math.PI / 2;
  lake.scale.x = 1.65;
  lake.position.set(27 * WORLD_X_SCALE, 0.018, -12);
  environment.add(lake);

  const treeData = [
    [4, -9, 3.8, '#3f8b59'], [8, -12, 4.8, '#347951'], [12, -8.5, 4.2, '#4b9660'],
    [18, -11, 5.1, '#367b4f'], [23, -8.8, 4.0, '#4f9560'], [29, -12, 5.4, '#35764d'],
    [35, -9, 4.7, '#438b58']
  ];
  treeData.forEach(([meters, z, height, color]) => {
    const tree = makeTree(height, color);
    tree.position.set(meters * WORLD_X_SCALE, 0, z);
    environment.add(tree);
  });

  [5, 10, 15, 20, 25, 30].forEach((distance, index) => {
    const marker = makeDistanceMarker(distance);
    marker.position.set(distance * WORLD_X_SCALE, 0, index % 2 ? -4.3 : -3.9);
    environment.add(marker);
  });

  const grassMaterial = new THREE.MeshStandardMaterial({ color: '#5f9d62', roughness: 1 });
  for (let index = 0; index < 24; index += 1) {
    const grass = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55 + (index % 3) * 0.12, 5), grassMaterial);
    const x = 2 + index * 2.15;
    grass.position.set(x, 0.28, index % 2 ? 4.3 + (index % 4) : -4.5 - (index % 3));
    environment.add(grass);
  }

  const flowerColors = ['#f3cf46', '#e96b68', '#f3f1ee'];
  for (let index = 0; index < 12; index += 1) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6), grassMaterial);
    stem.position.y = 0.275;
    const bloom = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 8, 6),
      new THREE.MeshStandardMaterial({ color: flowerColors[index % flowerColors.length], roughness: 0.8 })
    );
    bloom.position.y = 0.58;
    const flower = new THREE.Group();
    flower.add(stem, bloom);
    flower.position.set(3 + index * 3.1, 0, index % 2 ? 4.8 : -5.2);
    environment.add(flower);
  }

  const startLine = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 5.5), new THREE.MeshStandardMaterial({ color: '#f7faf4' }));
  startLine.position.set(0, 0.035, 0);
  environment.add(startLine);
  return environment;
}

function FlightScene({ settings, flightRequest, replayResult, onResult, onFlightComplete, onFlightState, onFlightEvent, showForces, cameraMode, cameraLocked, cameraResetRequest }) {
  const host = useRef(null);
  const sceneRef = useRef(null);
  const cameraModeRef = useRef(cameraMode);
  const cameraLockedRef = useRef(cameraLocked);

  useEffect(() => {
    const el = host.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#dfeee8');
    scene.fog = new THREE.Fog('#dfeee8', 45, 120);
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.1, 180);
    camera.position.set(14, 9, 17);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const getRenderPixelRatio = () => {
      const deviceRatio = window.devicePixelRatio || 1;
      return el.clientWidth < 760
        ? Math.min(deviceRatio, 1.5)
        : Math.min(Math.max(deviceRatio, 1.25), 2);
    };
    renderer.setPixelRatio(getRenderPixelRatio());
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.shadowMap.enabled = el.clientWidth >= 760;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 8;
    controls.maxDistance = 34;
    controls.target.set(2, 2.5, 0);

    const hemisphere = new THREE.HemisphereLight('#ffffff', '#789187', 2.3);
    scene.add(hemisphere);
    const sun = new THREE.DirectionalLight('#fff6d6', 3.2);
    sun.position.set(-8, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 90;
    sun.shadow.camera.left = -42;
    sun.shadow.camera.right = 42;
    sun.shadow.camera.top = 32;
    sun.shadow.camera.bottom = -22;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(150, 64),
      new THREE.MeshStandardMaterial({ map: makeGrassTexture(renderer), color: '#e5f0df', roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(60, 60, '#6f9683', '#86ae98');
    grid.position.y = 0.005;
    grid.position.x = 20;
    grid.material.transparent = true;
    grid.material.opacity = 0.28;
    scene.add(grid);
    const environment = makeEnvironment();
    scene.add(environment);
    const trees = [];
    environment.traverse(object => { if (object.userData.isTree) trees.push(object); });

    const plane = makePlane(settings.airframe);
    plane.scale.setScalar(0.3);
    plane.position.set(0, START_HEIGHT, 0);
    plane.traverse(obj => { if (obj.isMesh) obj.castShadow = true; });
    scene.add(plane);
    const propeller = makePropeller(settings.propeller, settings.airframe);
    plane.add(propeller);

    const clips = new THREE.Group();
    plane.userData.paperModel.add(clips);

    const pathMaterial = new THREE.LineBasicMaterial({ color: '#e24e36', transparent: true, opacity: 0 });
    const pathLine = new THREE.Line(new THREE.BufferGeometry(), pathMaterial);
    scene.add(pathLine);
    const previousPathMaterial = new THREE.LineDashedMaterial({ color: '#596d66', dashSize: 0.35, gapSize: 0.22, transparent: true, opacity: 0 });
    const previousPathLine = new THREE.Line(new THREE.BufferGeometry(), previousPathMaterial);
    scene.add(previousPathLine);

    const forceGroup = new THREE.Group();
    const forceArrows = {
      lift: new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, '#2185d0', 0.28, 0.15),
      weight: new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(), 1, '#e44f39', 0.28, 0.15),
      thrust: new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, '#15966b', 0.28, 0.15),
      drag: new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(), 1, '#d49a23', 0.28, 0.15)
    };
    Object.values(forceArrows).forEach(arrow => forceGroup.add(arrow));
    forceGroup.visible = false;
    scene.add(forceGroup);
    const windStreaks = makeWindStreaks(el.clientWidth < 760);
    scene.add(windStreaks);
    const rainStreaks = makeRainStreaks(el.clientWidth < 760);
    scene.add(rainStreaks);
        const snowflakes = makeSnowflakes(el.clientWidth < 760);
        scene.add(snowflakes);
        sceneRef.current = {
      scene, camera, renderer, controls, plane, clips, pathLine, pathMaterial,
      propeller,
      previousPathLine, previousPathMaterial, forceGroup, forceArrows,
      windStreaks, rainStreaks, snowflakes, windSpeed: 0, windDirection: 'front', weather: 'clear', weatherLevel: 1, haze: false, lightningRate: 0.5,
      hemisphere, sun, ground, trees,
      cameraGoal: camera.position.clone(), targetGoal: controls.target.clone(),
      isFlying: false, raf: 0, flightRaf: 0
    };

    const resize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(getRenderPixelRatio());
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    const weatherLooks = {
      clear: { sky: new THREE.Color('#dfeee8'), ground: new THREE.Color('#e5f0df'), sun: 3.2, hemisphere: 2.3, roughness: 1 },
      rain: { sky: new THREE.Color('#a9bec2'), ground: new THREE.Color('#c6d7c0'), sun: 1.45, hemisphere: 1.6, roughness: 0.72 },
      typhoon: { sky: new THREE.Color('#5d7076'), ground: new THREE.Color('#91a997'), sun: 0.65, hemisphere: 1.05, roughness: 0.48, fogNear: 45, fogFar: 120 },
          snow: { sky: new THREE.Color('#c5d6df'), ground: new THREE.Color('#e5ebed'), sun: 1.85, hemisphere: 2.0, roughness: 0.95, fogNear: 35, fogFar: 95 },
          fog: { sky: new THREE.Color('#c3ccca'), ground: new THREE.Color('#bfcfca'), sun: 1.25, hemisphere: 1.65, roughness: 0.88, fogNear: 6, fogFar: 30 },
          thunderstorm: { sky: new THREE.Color('#495b6a'), ground: new THREE.Color('#819896'), sun: 0.45, hemisphere: 0.85, roughness: 0.5, fogNear: 22, fogFar: 75 }
    };
    let previousFrame = performance.now();
    const animate = () => {
      const now = performance.now();
      const delta = Math.min(0.05, (now - previousFrame) / 1000);
      previousFrame = now;
      const state = sceneRef.current;
      updateWindStreaks(state.windStreaks, state.windSpeed, state.windDirection, delta);
      const intensity = weather_v2_profiles[state.weather]?.[state.weatherLevel]?.intensity ?? 1;
          updateRainStreaks(state.rainStreaks, state.weather, state.windSpeed, state.windDirection, delta, intensity);
          updateSnowflakes(state.snowflakes, state.weather, state.windSpeed, state.windDirection, delta, now, intensity);
          state.windStreaks.visible = false;
      const look = weatherLooks[state.weather];
      const targetSky = state.weather === 'fog' && state.haze ? new THREE.Color('#c0ac86') : look.sky;
          const sunshine = state.weather === 'clear' ? [0.65, 1, 1.25, 1.52][state.weatherLevel ?? 1] : 1;
          const skyColor = state.weather === 'clear'
            ? targetSky.clone().lerp(new THREE.Color('#ffffff'), [0, 0.03, 0.16, 0.3][state.weatherLevel ?? 1])
            : targetSky;
          state.renderer.toneMappingExposure = THREE.MathUtils.lerp(
            state.renderer.toneMappingExposure,
            state.weather === 'clear' ? [0.75, 1, 1.23, 1.45][state.weatherLevel ?? 1] : 1,
            0.05
          );
          scene.background.lerp(skyColor, 0.035);
      scene.fog.color.lerp(targetSky, 0.035);
          const fogNear = state.weather === 'fog' ? Math.max(1, 20 - intensity * 9) : look.fogNear ?? 45;
          const fogFar = state.weather === 'fog' ? Math.max(9, 64 - intensity * 25) : look.fogFar ?? 120;
          scene.fog.near = THREE.MathUtils.lerp(scene.fog.near, fogNear, 0.035);
          scene.fog.far = THREE.MathUtils.lerp(scene.fog.far, fogFar, 0.035);
      state.ground.material.color.lerp(state.weather === 'fog' && state.haze ? new THREE.Color('#a9a087') : look.ground, 0.035);
      state.ground.material.roughness = THREE.MathUtils.lerp(state.ground.material.roughness, look.roughness, 0.04);
      state.sun.intensity = THREE.MathUtils.lerp(state.sun.intensity, state.weather === 'clear' ? look.sun * sunshine : look.sun, 0.04);
      state.hemisphere.intensity = THREE.MathUtils.lerp(state.hemisphere.intensity, look.hemisphere, 0.04);
      const swayStrength = state.weather === 'typhoon' ? 0.075 : state.weather === 'thunderstorm' ? 0.05 : state.weather === 'snow' ? 0.017 : state.weather === 'rain' ? 0.012 : 0;
          const flash = state.weather === 'thunderstorm' && Math.sin(now * 0.0017 * (0.8 + state.lightningRate)) > (0.999 - state.lightningRate * 0.025) && Math.sin(now * 0.0061) > 0.15;
          if (flash) {
            state.sun.intensity = 4.6;
            state.hemisphere.intensity = 3.0;
          }
      state.trees.forEach((tree, index) => {
        const windLean = ['typhoon', 'thunderstorm'].includes(state.weather) ? state.windSpeed * 0.0035 : 0;
        const sway = windLean + Math.sin(now * 0.004 + tree.userData.swayPhase + index) * swayStrength;
        tree.rotation.z = THREE.MathUtils.lerp(tree.rotation.z, sway, 0.08);
      });
      // In overview mode the user owns the camera. Leave it untouched so
      // OrbitControls can rotate freely without snapping back.
      if (sceneRef.current.cameraGoal && cameraModeRef.current !== 'overview') {
        camera.position.lerp(sceneRef.current.cameraGoal, 0.075);
        controls.target.lerp(sceneRef.current.targetGoal, 0.075);
      }
      controls.update();
      if (state.propeller.visible && state.propeller.userData.rotor) {
        state.propeller.userData.rotor.rotation.x += state.propeller.userData.spinRate * delta;
      }
      renderer.render(scene, camera);
      sceneRef.current.raf = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(sceneRef.current?.raf);
      cancelAnimationFrame(sceneRef.current?.flightRaf);
      controls.dispose();
      renderer.dispose();
          snowflakes.geometry.dispose();
          snowflakes.material.dispose();
          el.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
    if (!sceneRef.current) return;
    const { cameraGoal, targetGoal, controls } = sceneRef.current;
    controls.enabled = cameraMode === 'overview' && !cameraLockedRef.current;
    if (sceneRef.current.isFlying) return;
    if (cameraMode === 'side') {
      cameraGoal.set(7, 6.5, 22);
      targetGoal.set(4, 2, 0);
    } else if (cameraMode === 'follow') {
      cameraGoal.set(-4, 4.2, 8);
      targetGoal.set(2, 1.5, 0);
    } else {
      cameraGoal.set(11, 11, 22);
      targetGoal.set(6, 1.8, 0);
      // Entering overview establishes its starting composition once. After
      // that, the controls retain every manual rotation and zoom.
      if (!sceneRef.current.isFlying) {
        sceneRef.current.camera.position.copy(cameraGoal);
        controls.target.copy(targetGoal);
        controls.update();
      }
    }
  }, [cameraMode]);

  useEffect(() => {
    cameraLockedRef.current = cameraLocked;
    if (!sceneRef.current) return;
    sceneRef.current.controls.enabled = cameraModeRef.current === 'overview' && !cameraLocked;
  }, [cameraLocked]);

  useEffect(() => {
    if (!sceneRef.current || cameraResetRequest === 0) return;
    const state = sceneRef.current;
    const { camera, controls, cameraGoal, targetGoal } = state;
    if (cameraModeRef.current === 'side') {
      cameraGoal.set(7, 6.5, 22);
      targetGoal.set(4, 2, 0);
    } else if (cameraModeRef.current === 'follow') {
      cameraGoal.set(-4, 4.2, 8);
      targetGoal.set(2, 1.5, 0);
    } else {
      cameraGoal.set(11, 11, 22);
      targetGoal.set(6, 1.8, 0);
    }
    camera.position.copy(cameraGoal);
    controls.target.copy(targetGoal);
    controls.update();
  }, [cameraResetRequest]);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.forceGroup.visible = showForces && sceneRef.current.isFlying;
  }, [showForces, flightRequest.id]);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.windSpeed = settings.wind;
      sceneRef.current.windDirection = settings.windDirection;
    }
  }, [settings.wind, settings.windDirection]);

  useEffect(() => {
    if (!sceneRef.current) return;
    const state = sceneRef.current;
    state.weather = settings.weather;
        state.weatherLevel = settings.weatherLevel ?? 1;
        state.haze = Boolean(settings.haze);
        state.lightningRate = settings.lightningRate ?? 0.5;
    const looks = {
      clear: { sky: '#dfeee8', ground: '#e5f0df', sun: 3.2, hemisphere: 2.3, roughness: 1 },
      rain: { sky: '#a9bec2', ground: '#c6d7c0', sun: 1.45, hemisphere: 1.6, roughness: 0.72 },
      typhoon: { sky: '#5d7076', ground: '#91a997', sun: 0.65, hemisphere: 1.05, roughness: 0.48 },
          snow: { sky: '#c5d6df', ground: '#e5ebed', sun: 1.85, hemisphere: 2.0, roughness: 0.95 },
          fog: { sky: '#c3ccca', ground: '#bfcfca', sun: 1.25, hemisphere: 1.65, roughness: 0.88 },
          thunderstorm: { sky: '#495b6a', ground: '#819896', sun: 0.45, hemisphere: 0.85, roughness: 0.5 }
    };
    const look = looks[settings.weather];
    state.scene.background.set(look.sky);
    state.scene.fog.color.set(look.sky);
    state.ground.material.color.set(look.ground);
    state.ground.material.roughness = look.roughness;
    state.sun.intensity = look.sun;
    state.hemisphere.intensity = look.hemisphere;
  }, [settings.weather, settings.weatherLevel, settings.haze, settings.lightningRate]);

  useEffect(() => {
    if (!sceneRef.current || sceneRef.current.isFlying) return;
    sceneRef.current.plane.userData.applyAirframe(settings.airframe);
  }, [settings.airframe, settings.airframe?.bodyLength, settings.airframe?.wingSpan, settings.airframe?.wingChord, settings.airframe?.tipLength, settings.airframe?.leftTipAngle, settings.airframe?.rightTipAngle]);

  useEffect(() => {
    if (!sceneRef.current || sceneRef.current.isFlying) return;
    sceneRef.current.propeller.userData.applyPropeller(settings.propeller, settings.airframe);
  }, [settings.propeller, settings.propeller?.enabled, settings.propeller?.placement, settings.propeller?.length, settings.propeller?.weight, settings.propeller?.thrust, settings.airframe?.wingSpan]);

  useEffect(() => {
    if (!sceneRef.current) return;
    const { clips } = sceneRef.current;
    clips.clear();
    const airframe = { ...DEFAULT_AIRFRAME, ...(settings.airframe ?? {}) };
    const lengthScale = airframe.bodyLength / 100;
    const spanScale = airframe.wingSpan / 100;
    const x = (4.9 - (settings.clipPosition / 100) * 9.4) * lengthScale;
    const wingOffset = clamp((0.65 + (4.9 - x) * 0.35) * spanScale, 0.65, 3.8);
    const sides = settings.clipPlacement === 'both'
      ? [1, -1]
      : settings.clipPlacement === 'left'
        ? [1]
        : settings.clipPlacement === 'right'
          ? [-1]
          : [0];
    sides.forEach(side => {
      for (let i = 0; i < settings.clipCount; i += 1) {
        const clip = makeClip();
        const spread = (i - (settings.clipCount - 1) / 2) * 0.24;
        clip.position.set(x, side === 0 ? spread : side * wingOffset + spread, 0.11 + i * 0.025);
        clip.scale.setScalar(0.85);
        clips.add(clip);
      }
    });
  }, [settings.clipCount, settings.clipPosition, settings.clipPlacement, settings.airframe?.bodyLength, settings.airframe?.wingSpan]);

  useEffect(() => {
    if (!sceneRef.current || flightRequest.id === 0) return;
    if (flightRequest.mode === 'return') {
      const state = sceneRef.current;
      cancelAnimationFrame(state.flightRaf);
      state.isFlying = false;
      state.forceGroup.visible = false;
      state.plane.position.set(0, START_HEIGHT, 0);
      state.plane.rotation.set(0, 0, 0);
      state.plane.userData.paperModel.rotation.set(-Math.PI / 2, 0, 0);
      state.pathLine.geometry.setDrawRange(0, 0);
      state.pathMaterial.opacity = 0;
      state.previousPathMaterial.opacity = 0;
      state.controls.enabled = cameraModeRef.current === 'overview' && !cameraLockedRef.current;
      if (cameraModeRef.current === 'side') {
        state.cameraGoal.set(7, 6.5, 22);
        state.targetGoal.set(4, 2, 0);
      } else if (cameraModeRef.current === 'follow') {
        state.cameraGoal.set(-4, 4.2, 8);
        state.targetGoal.set(2, 1.5, 0);
      } else {
        state.cameraGoal.set(11, 11, 22);
        state.targetGoal.set(6, 1.8, 0);
      }
      onFlightState(false);
      onFlightEvent(null);
      return;
    }
    const isReplay = flightRequest.mode === 'replay' && Boolean(replayResult);
    const result = isReplay ? replayResult : simulateFlight(settings);
    onFlightState(true);
    onFlightEvent(isReplay ? { label: '慢動作重播', detail: '觀察姿態與路徑變化', tone: 'replay' } : null);
    const {
      plane, pathLine, pathMaterial, previousPathLine, previousPathMaterial,
      forceGroup, forceArrows, controls, cameraGoal, targetGoal
    } = sceneRef.current;
    cancelAnimationFrame(sceneRef.current.flightRaf);
    if (!isReplay && pathLine.geometry.getAttribute('position')) {
      previousPathLine.geometry.dispose();
      previousPathLine.geometry = pathLine.geometry.clone();
      previousPathLine.geometry.setDrawRange(0, Infinity);
      previousPathLine.computeLineDistances();
      previousPathMaterial.opacity = pathMaterial.opacity > 0 ? 0.58 : 0;
    }
    const coords = result.points.map(p => new THREE.Vector3(p.x * WORLD_X_SCALE, p.y * WORLD_Y_SCALE, p.z * WORLD_Z_SCALE));
    const flightCurve = new THREE.CatmullRomCurve3(coords, false, 'centripetal', 0.35);
    const trailPoints = flightCurve.getPoints(Math.max(140, coords.length * 2));
    pathLine.geometry.dispose();
    pathLine.geometry = new THREE.BufferGeometry().setFromPoints(trailPoints);
    pathLine.geometry.setDrawRange(0, 1);
    pathMaterial.opacity = 0.8;
    forceGroup.visible = showForces;
    sceneRef.current.isFlying = true;
    controls.enabled = cameraModeRef.current === 'overview' && !cameraLockedRef.current;
    const paperModel = plane.userData.paperModel;
    const duration = clamp(result.airtime * 1050, 1900, 4400) * (isReplay ? 1.85 : 1);
    const landingDuration = isReplay ? 820 : 520;
    const endPoint = flightCurve.getPoint(1);
    const sceneDistance = result.distance * WORLD_X_SCALE;
    const scenePeak = result.peak * WORLD_Y_SCALE;
    const midpoint = sceneDistance * 0.5;
    const startTime = performance.now();
    let eventIndex = 0;

    const step = now => {
      const elapsed = now - startTime;
      const progress = clamp(elapsed / duration, 0, 1);
      const point = flightCurve.getPoint(progress);
      const tangent = flightCurve.getTangent(Math.min(0.999, progress + 0.002));
      const sourceIndex = Math.min(result.points.length - 1, Math.floor(progress * (result.points.length - 1)));
      const p = result.points[sourceIndex];
      if (isReplay && eventIndex < result.events.length && progress >= result.events[eventIndex].progress) {
        onFlightEvent(result.events[eventIndex]);
        eventIndex += 1;
      }
      plane.position.copy(point);
      const targetPitch = Math.atan2(tangent.y, tangent.x);
      const targetYaw = -Math.atan2(tangent.z, tangent.x);
      plane.rotation.z = THREE.MathUtils.lerp(plane.rotation.z, targetPitch, 0.14);
      plane.rotation.y = THREE.MathUtils.lerp(plane.rotation.y, targetYaw, 0.12);
      const motionFade = Math.sin(progress * Math.PI);
      const rollStrength = clamp((1 - result.stability) * 0.075 + Math.abs(settings.wind) * 0.006, 0.004, 0.075);
      const naturalMotion = Math.sin(progress * Math.PI * 3) * rollStrength * motionFade;
      const stormShake = ['typhoon', 'thunderstorm', 'snow'].includes(settings.weather) ? (p.turbulence || 0) * 0.035 * motionFade : 0;
      const roll = (p.roll || 0) + naturalMotion + stormShake;
      paperModel.rotation.x = -Math.PI / 2 + roll;
      pathLine.geometry.setDrawRange(0, Math.max(2, Math.ceil(progress * trailPoints.length)));
      forceGroup.position.copy(plane.position);
      forceArrows.lift.setLength(clamp((p.lift || 0) * 0.16, 0.35, 2.2), 0.28, 0.15);
      forceArrows.weight.setLength(1.55, 0.28, 0.15);
      forceArrows.thrust.setLength(clamp((p.speed || 0) * 0.12, 0.35, 1.9), 0.28, 0.15);
      forceArrows.drag.setLength(clamp((p.drag || 0) * 0.28, 0.3, 1.7), 0.28, 0.15);

      if (cameraModeRef.current === 'follow') {
        cameraGoal.set(point.x - 5.2, point.y + 3.1, point.z + 13);
        targetGoal.set(point.x + 2.5, point.y + 0.1, point.z);
      } else if (cameraModeRef.current === 'side') {
        cameraGoal.set(midpoint + 1.5, Math.max(5.5, scenePeak + 3.5), Math.max(24, sceneDistance * 1.25));
        targetGoal.set(midpoint + 1.5, Math.max(1.5, scenePeak * 0.42), 0);
      }

      if (progress < 1) {
        sceneRef.current.flightRaf = requestAnimationFrame(step);
        return;
      }

      const landingProgress = clamp((elapsed - duration) / landingDuration, 0, 1);
      const settle = 1 - Math.pow(1 - landingProgress, 3);
      plane.position.set(endPoint.x + settle * 0.48, THREE.MathUtils.lerp(endPoint.y, 0.12, settle), endPoint.z);
      plane.rotation.z = THREE.MathUtils.lerp(plane.rotation.z, 0, 0.12);
      paperModel.rotation.x = THREE.MathUtils.lerp(paperModel.rotation.x, -Math.PI / 2, 0.14);
      pathLine.geometry.setDrawRange(0, trailPoints.length);
      if (landingProgress < 1) {
        sceneRef.current.flightRaf = requestAnimationFrame(step);
      } else {
        sceneRef.current.isFlying = false;
        forceGroup.visible = false;
        controls.enabled = cameraModeRef.current === 'overview' && !cameraLockedRef.current;
        if (!isReplay) onResult(result);
        onFlightComplete();
        onFlightState(false);
        onFlightEvent(null);
      }
    };
    sceneRef.current.flightRaf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(sceneRef.current?.flightRaf);
      if (sceneRef.current) {
        sceneRef.current.isFlying = false;
        sceneRef.current.forceGroup.visible = false;
      }
      onFlightState(false);
      onFlightEvent(null);
    };
  }, [flightRequest.id]);

  return <div className="scene" ref={host} aria-label="Suzanne 紙飛機 3D 飛行模擬畫面" />;
}

function Slider({ label, value, min, max, step = 1, unit, onChange, disabled = false }) {
  return (
    <label className="slider-row">
      <span>{label}<strong>{value}{unit}</strong></span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={e => onChange(Number(e.target.value))} />
    </label>
  );
}

function App() {
  const [settings, setSettings] = useState({ weatherLevel: 1, haze: false, lightningRate: 0.5, goal: 'far', clipCount: 1, clipPosition: 22, clipPlacement: 'body', throwAngle: 10, throwPower: 55, wind: 0, windDirection: 'front', weather: 'clear', airframe: { ...DEFAULT_AIRFRAME }, propeller: { ...DEFAULT_PROPELLER } });
  const [livePlace, setLivePlace] = useState('桃園');
  const [liveStatus, setLiveStatus] = useState('');
  const [liveMode, setLiveMode] = useState(false);
  const [liveRefresh, setLiveRefresh] = useState(0);
  const [flightRequest, setFlightRequest] = useState({ id: 0, mode: 'launch' });
  const [result, setResult] = useState(null);
  const [previousResult, setPreviousResult] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [predictionFeedback, setPredictionFeedback] = useState(null);
  const [showForces, setShowForces] = useState(true);
  const [cameraMode, setCameraMode] = useState('side');
  const [cameraLocked, setCameraLocked] = useState(false);
  const [cameraResetRequest, setCameraResetRequest] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [flightEvent, setFlightEvent] = useState(null);
  const [returnPrompt, setReturnPrompt] = useState(false);
  const update = (key, value) => {
    setSettings(current => ({ ...current, [key]: value }));
    setPrediction(null);
    setPredictionFeedback(null);
  };
  const updateAirframe = (key, value) => {
    setSettings(current => ({ ...current, airframe: { ...current.airframe, [key]: value } }));
    setPrediction(null);
    setPredictionFeedback(null);
  };
  const updatePropeller = (key, value) => {
    setSettings(current => ({ ...current, propeller: { ...current.propeller, [key]: value } }));
    setPrediction(null);
    setPredictionFeedback(null);
  };
  const liveCg = getCg(settings);
  const cgText = `${liveCg.toFixed(0)}%`;
  const score = useMemo(() => result ? (settings.goal === 'far' ? result.distance : result.peak) : null, [result, settings.goal]);
  const comparison = result && previousResult ? {
    distance: result.distance - previousResult.distance,
    peak: result.peak - previousResult.peak,
    airtime: result.airtime - previousResult.airtime,
    deviation: Math.abs(result.deviation) - Math.abs(previousResult.deviation)
  } : null;

  const handleResult = next => {
    if (result) {
      setPreviousResult(result);
      const correct = prediction === 'farther'
        ? next.distance > result.distance + 0.01
        : prediction === 'higher'
          ? next.peak > result.peak + 0.01
          : next.airtime > result.airtime + 0.01;
      setPredictionFeedback(correct ? '預測正確！你找到了參數與飛行的關係。' : '結果和預測不同，觀察力量箭頭找找原因。');
      setPrediction(null);
    }
    setResult(next);
  };

  const handleFlightComplete = () => setReturnPrompt(true);

  const launch = () => {
    if (isAnimating || (result && !prediction)) return;
    setFlightRequest(current => ({ id: current.id + 1, mode: 'launch' }));
  };

  const replay = () => {
    if (isAnimating || !result) return;
    setFlightRequest(current => ({ id: current.id + 1, mode: 'replay' }));
  };

  const returnToStart = () => {
    if (isAnimating) return;
    setReturnPrompt(false);
    setPrediction(null);
    setPredictionFeedback(null);
    setFlightEvent(null);
    setFlightRequest(current => ({ id: current.id + 1, mode: 'return' }));
  };

  const setWindDirection = windDirection => {
    setSettings(current => ({
      ...current,
      windDirection,
      wind: windDirection === 'front' ? current.wind : Math.abs(current.wind) || 6
    }));
    setPrediction(null);
    setPredictionFeedback(null);
  };

  useEffect(() => {
        if (!liveMode) return;
        let active = true;
        const loadWeather = async () => {
          const place = weatherPlaces.find(item => item.name === livePlace);
          if (!place) return;
          setLiveStatus('正在讀取最新天氣…');
          try {
            const params = new URLSearchParams({
              latitude: String(place.lat), longitude: String(place.lon),
              current: 'weather_code,precipitation,wind_speed_10m,wind_direction_10m,visibility',
              wind_speed_unit: 'ms', timezone: 'Asia/Taipei', forecast_days: '1'
            });
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { cache: 'no-store' });
            if (!response.ok) throw new Error('API unavailable');
            const data = await response.json();
            if (!data.current || !active) return;
            const current = data.current;
            const weather = classifyLiveWeather(current);
            const wind = clamp(Number(current.wind_speed_10m ?? 0), 0, 10);
            const level = wind >= 8 || (current.precipitation ?? 0) >= 8 ? 3 : wind >= 5 || (current.precipitation ?? 0) >= 3 ? 2 : 1;
            const bearing = current.wind_direction_10m ?? 0;
            setSettings(previous => ({ ...previous, weather, weatherLevel: level,
              wind, windDirection: bearing > 45 && bearing < 180 ? 'left' : bearing >= 180 && bearing < 315 ? 'right' : 'front' }));
            setLiveStatus(`${place.name}｜資料時間 ${current.time.replace('T', ' ')}｜風速 ${Number(current.wind_speed_10m ?? 0).toFixed(1)} m/s｜降水 ${current.precipitation ?? 0} mm`);
          } catch {
            if (active) setLiveStatus('無法取得天氣資料，請確認網路後再試。');
          }
        };
        loadWeather();
        const timer = window.setInterval(loadWeather, 10 * 60 * 1000);
        return () => { active = false; window.clearInterval(timer); };
      }, [liveMode, livePlace, liveRefresh]);

      const setWeatherLevel = level => {
        setSettings(current => ({ ...current, weatherLevel: level, wind: weather_v2_profiles[current.weather][level].wind }));
        setPrediction(null);
        setPredictionFeedback(null);
      };

      const setWeatherMode = weather => {
        setLiveMode(false);
    setSettings(current => ({
      ...current,
      weather,
      weatherLevel: 1,
      wind: weather_v2_profiles[weather][1].wind
    }));
    setPrediction(null);
    setPredictionFeedback(null);
  };

  const setClipFromPointer = (clientX, element) => {
    const rect = element.getBoundingClientRect();
    const position = clamp(5 + ((clientX - rect.left) / rect.width) * 70, 5, 75);
    update('clipPosition', Math.round(position));
  };

  const resetAirframe = () => {
    setSettings(current => ({ ...current, airframe: { ...DEFAULT_AIRFRAME } }));
    setPrediction(null);
    setPredictionFeedback(null);
  };

  const resetPropeller = () => {
    setSettings(current => ({ ...current, propeller: { ...DEFAULT_PROPELLER } }));
    setPrediction(null);
    setPredictionFeedback(null);
  };

  const reset = () => {
    setLiveMode(false);
    setSettings({ weatherLevel: 1, haze: false, lightningRate: 0.5, goal: 'far', clipCount: 1, clipPosition: 22, clipPlacement: 'body', throwAngle: 10, throwPower: 55, wind: 0, windDirection: 'front', weather: 'clear', airframe: { ...DEFAULT_AIRFRAME }, propeller: { ...DEFAULT_PROPELLER } });
    setResult(null);
    setPreviousResult(null);
    setPrediction(null);
    setPredictionFeedback(null);
    setCameraMode('side');
    setCameraLocked(false);
    setIsAnimating(false);
    setFlightRequest({ id: 0, mode: 'launch' });
    setFlightEvent(null);
    setReturnPrompt(false);
  };

  return (
    <main className="app-shell">
      <FlightScene settings={settings} flightRequest={flightRequest} replayResult={result} onResult={handleResult} onFlightComplete={handleFlightComplete} onFlightState={setIsAnimating} onFlightEvent={setFlightEvent} showForces={showForces} cameraMode={cameraMode} cameraLocked={cameraLocked} cameraResetRequest={cameraResetRequest} />
      <header className="topbar">
        <div className="brand"><Plane size={22} /><span>Suzanne <b>飛行實驗室</b></span></div>
        <div className="record">世界紀錄機型 · 教學模擬</div>
        <button className="force-toggle" aria-pressed={showForces} onClick={() => setShowForces(value => !value)}>
          {showForces ? <Eye size={17} /> : <EyeOff size={17} />}受力
        </button>
        <button className="icon-button" onClick={reset} title="重設所有參數" aria-label="重設所有參數"><RotateCcw size={19} /></button>
      </header>

      {showForces && <div className="force-legend" aria-label="飛行力量圖例">
        <span><i className="lift-dot" />升力</span><span><i className="weight-dot" />重力</span>
        <span><i className="thrust-dot" />前進</span><span><i className="drag-dot" />阻力</span>
      </div>}

      <div className="view-modes" aria-label="觀看模式">
        <button className={cameraMode === 'side' ? 'active' : ''} onClick={() => setCameraMode('side')}>側視</button>
        <button className={cameraMode === 'follow' ? 'active' : ''} onClick={() => setCameraMode('follow')}>跟隨</button>
        <button className={cameraMode === 'overview' ? 'active' : ''} onClick={() => setCameraMode('overview')}>全景</button>
      </div>

      {flightEvent && <div className={`flight-event ${flightEvent.tone}`} role="status">
        <strong>{flightEvent.label}</strong><span>{flightEvent.detail}</span>
      </div>}

      <aside className={`control-panel ${isAnimating ? 'is-flying' : ''}`} aria-busy={isAnimating}>
        <div className="panel-head">
          <div><small>任務 01</small><h1>調整 Suzanne</h1></div>
          <Info size={19} />
        </div>

        <div className="camera-actions" aria-label="視角控制">
          <span>視角控制</span>
          <div>
            <button
              type="button"
              className={cameraLocked ? 'selected' : ''}
              disabled={cameraMode !== 'overview'}
              aria-pressed={cameraLocked}
              title={cameraMode === 'overview' ? (cameraLocked ? '解除視角鎖定' : '鎖定視角') : '請先切換到全景模式'}
              onClick={() => setCameraLocked(value => !value)}
            >
              {cameraLocked ? <Lock size={14} /> : <Unlock size={14} />}
              {cameraLocked ? '已鎖定' : '鎖定視角'}
            </button>
            <button type="button" onClick={() => setCameraResetRequest(value => value + 1)} title="視角重置">
              <RotateCcw size={14} />視角重置
            </button>
          </div>
        </div>

        <div className="segmented" aria-label="飛行目標">
          <button className={settings.goal === 'far' ? 'active' : ''} onClick={() => update('goal', 'far')}><Crosshair size={16} />飛更遠</button>
          <button className={settings.goal === 'high' ? 'active' : ''} onClick={() => update('goal', 'high')}><Sparkles size={16} />飛更高</button>
        </div>

        <section className="airframe-section">
          <div className="section-heading-row"><h2><Ruler size={15} />機型調整</h2><button className="mini-reset" type="button" onClick={resetAirframe}>恢復預設</button></div>
          <p className="section-note">調整紙飛機尺寸與翼端折角；參數會同時影響 3D 模型、升力、阻力、穩定度與落點。</p>
          <Slider label="機身長度" value={settings.airframe.bodyLength} min={75} max={125} unit="%" onChange={v => updateAirframe('bodyLength', v)} />
          <Slider label="翼展長度" value={settings.airframe.wingSpan} min={70} max={140} unit="%" onChange={v => updateAirframe('wingSpan', v)} />
          <Slider label="翼面寬度" value={settings.airframe.wingChord} min={70} max={130} unit="%" onChange={v => updateAirframe('wingChord', v)} />
          <Slider label="翼端上翹程度" value={settings.airframe.tipLength} min={35} max={100} unit="%" onChange={v => updateAirframe('tipLength', v)} />
          <div className="dual-slider-heading"><span>左右翼端上翹角度</span><small>分開控制平衡</small></div>
          <Slider label="左翼" value={settings.airframe.leftTipAngle} min={0} max={18} unit="°" onChange={v => updateAirframe('leftTipAngle', v)} />
          <Slider label="右翼" value={settings.airframe.rightTipAngle} min={0} max={18} unit="°" onChange={v => updateAirframe('rightTipAngle', v)} />
          <div className={`airframe-balance ${Math.abs(settings.airframe.leftTipAngle - settings.airframe.rightTipAngle) > 3 ? 'warning' : ''}`}>
            <span>翼端平衡</span><strong>{Math.abs(settings.airframe.leftTipAngle - settings.airframe.rightTipAngle) > 3 ? '不對稱，會側滾' : '左右對稱'}</strong>
          </div>
        </section>

        <section className={`propeller-section ${settings.propeller.enabled ? '' : 'is-disabled'}`}>
          <div className="section-heading-row"><h2><RotateCcw size={15} />螺旋槳調整</h2><button className="mini-reset" type="button" onClick={resetPropeller}>恢復預設</button></div>
          <p className="section-note">可選擇安裝位置、槳葉長度與重量；啟用後會同步影響模型、重心、阻力與前進推力。</p>
          <div className="propeller-toggle"><span>安裝螺旋槳</span><button type="button" className={settings.propeller.enabled ? 'selected' : ''} onClick={() => updatePropeller('enabled', !settings.propeller.enabled)}>{settings.propeller.enabled ? '已安裝' : '未安裝'}</button></div>
          <div className="propeller-controls">
            <div className="propeller-label">安裝位置</div>
            <div className="placement-options propeller-placement-options" aria-label="螺旋槳安裝位置">
              {[
                ['nose', '機頭'],
                ['left', '左翼'],
                ['right', '右翼'],
                ['tail', '機尾']
              ].map(([placement, label]) => <button key={placement} type="button" disabled={!settings.propeller.enabled} className={settings.propeller.placement === placement ? 'selected' : ''} onClick={() => updatePropeller('placement', placement)}>{label}</button>)}
            </div>
            <Slider label="螺旋槳長度" value={settings.propeller.length} min={60} max={140} unit="%" onChange={v => updatePropeller('length', v)} disabled={!settings.propeller.enabled} />
            <Slider label="螺旋槳重量" value={settings.propeller.weight.toFixed(1)} min={0.2} max={3} step={0.1} unit=" g" onChange={v => updatePropeller('weight', v)} disabled={!settings.propeller.enabled} />
            <Slider label="推進效率" value={settings.propeller.thrust} min={0} max={100} unit="%" onChange={v => updatePropeller('thrust', v)} disabled={!settings.propeller.enabled} />
          </div>
          <div className="propeller-status">{settings.propeller.enabled ? `目前裝在${({ nose: '機頭', left: '左翼', right: '右翼', tail: '機尾' })[settings.propeller.placement]}，重量 ${settings.propeller.weight.toFixed(1)} g` : '未安裝時不會改變原本的飛行結果'}</div>
        </section>

        <section>
          <h2>迴紋針配重</h2>
          <div className="placement-options" aria-label="迴紋針放置區域">
            <button className={settings.clipPlacement === 'body' ? 'selected' : ''} onClick={() => update('clipPlacement', 'body')}>機身</button>
            <button className={settings.clipPlacement === 'left' ? 'selected' : ''} onClick={() => update('clipPlacement', 'left')}>左翼</button>
            <button className={settings.clipPlacement === 'right' ? 'selected' : ''} onClick={() => update('clipPlacement', 'right')}>右翼</button>
            <button className={settings.clipPlacement === 'both' ? 'selected' : ''} onClick={() => update('clipPlacement', 'both')}>左右對稱</button>
          </div>
          <div className="stepper-row"><span>{settings.clipPlacement === 'both' ? '每側數量' : '數量'}</span><div className="stepper"><button onClick={() => update('clipCount', clamp(settings.clipCount - 1, 0, 3))}>−</button><strong>{settings.clipCount}</strong><button onClick={() => update('clipCount', clamp(settings.clipCount + 1, 0, 3))}>＋</button></div></div>
          <Slider label="位置" value={settings.clipPosition} min={5} max={75} unit="%" onChange={v => update('clipPosition', v)} />
          <div className="plane-map"><span className="nose">機頭</span><div
            className="mini-plane"
            role="slider"
            tabIndex={0}
            aria-label="拖曳迴紋針位置"
            aria-valuemin={5}
            aria-valuemax={75}
            aria-valuenow={settings.clipPosition}
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setClipFromPointer(e.clientX, e.currentTarget); }}
            onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setClipFromPointer(e.clientX, e.currentTarget); }}
            onPointerUp={e => e.currentTarget.releasePointerCapture(e.pointerId)}
            onKeyDown={e => {
              if (e.key === 'ArrowLeft') update('clipPosition', clamp(settings.clipPosition - 1, 5, 75));
              if (e.key === 'ArrowRight') update('clipPosition', clamp(settings.clipPosition + 1, 5, 75));
            }}
          >
            <span className="safe-zone" title="建議重心區" />
            <i className="clip-marker" style={{ left: `${((settings.clipPosition - 5) / 70) * 100}%` }} />
            <i className={`cg-marker ${liveCg < 23 || liveCg > 36 ? 'warning' : ''}`} style={{ left: `${liveCg}%` }} />
          </div><span>機尾</span></div>
          <div className={`cg-status ${liveCg < 23 || liveCg > 36 ? 'warning' : ''}`}>
            <Scale size={15} /><span>重心 {liveCg.toFixed(0)}%</span><strong>{liveCg < 23 ? '機頭偏重' : liveCg > 36 ? '機尾偏重' : '穩定區'}</strong>
          </div>
          <div className={`balance-status ${settings.clipPlacement === 'left' || settings.clipPlacement === 'right' ? 'warning' : ''}`}>
            <Crosshair size={15} /><span>左右平衡</span><strong>{settings.clipPlacement === 'left' ? '左側較重' : settings.clipPlacement === 'right' ? '右側較重' : '平衡'}</strong>
          </div>
        </section>

        <section>
          <h2>投擲設定</h2>
          <Slider label="仰角" value={settings.throwAngle} min={0} max={30} unit="°" onChange={v => update('throwAngle', v)} />
          <Slider label="力道" value={settings.throwPower} min={20} max={100} unit="%" onChange={v => update('throwPower', v)} />
          <Slider label="風速" value={settings.wind} min={settings.windDirection === 'front' ? -10 : 0} max={10} unit=" m/s" onChange={v => update('wind', v)} />
          <div className="wind-presets" aria-label="風速快速設定">
            {settings.windDirection === 'front' ? <>
              <button className={settings.wind === -6 ? 'selected' : ''} onClick={() => update('wind', -6)}>逆風 −6</button>
              <button className={settings.wind === 0 ? 'selected' : ''} onClick={() => update('wind', 0)}>無風</button>
              <button className={settings.wind === 6 ? 'selected' : ''} onClick={() => update('wind', 6)}>順風 ＋6</button>
            </> : <>
              <button className={settings.wind === 3 ? 'selected' : ''} onClick={() => update('wind', 3)}>微風 3</button>
              <button className={settings.wind === 6 ? 'selected' : ''} onClick={() => update('wind', 6)}>強風 6</button>
              <button className={settings.wind === 10 ? 'selected' : ''} onClick={() => update('wind', 10)}>烈風 10</button>
            </>}
          </div>
          <div className="wind-direction" aria-label="風向">
            <span>風向</span>
            <div>
              <button className={settings.windDirection === 'left' ? 'selected' : ''} onClick={() => setWindDirection('left')}>左側</button>
              <button className={settings.windDirection === 'front' ? 'selected' : ''} onClick={() => setWindDirection('front')}>正面</button>
              <button className={settings.windDirection === 'right' ? 'selected' : ''} onClick={() => setWindDirection('right')}>右側</button>
            </div>
          </div>
          {settings.windDirection !== 'front' && <p className="wind-note">側風使用風速的絕對值，會改變傾斜方向與落點。</p>}
          <h2 className="environment-title">環境</h2>
          <div className="weather-options" aria-label="環境模式">
            <button className={settings.weather === 'clear' ? 'selected' : ''} onClick={() => setWeatherMode('clear')}><Sun size={15} />晴天</button>
            <button className={settings.weather === 'rain' ? 'selected' : ''} onClick={() => setWeatherMode('rain')}><CloudRain size={15} />下雨</button>
            <button className={settings.weather === 'typhoon' ? 'selected' : ''} onClick={() => setWeatherMode('typhoon')}><Wind size={15} />颱風</button>
                <button className={settings.weather === 'snow' ? 'selected' : ''} onClick={() => setWeatherMode('snow')}><Snowflake size={15} />下雪</button>
                <button className={settings.weather === 'fog' ? 'selected' : ''} onClick={() => setWeatherMode('fog')}><CloudFog size={15} />濃霧</button>
                <button className={settings.weather === 'thunderstorm' ? 'selected' : ''} onClick={() => setWeatherMode('thunderstorm')}><CloudLightning size={15} />雷雨</button>
          </div>
          <div className="weather-settings">
                <label htmlFor="weather-level">天氣強度</label>
                <select id="weather-level" value={settings.weatherLevel ?? 1} onChange={event => setWeatherLevel(Number(event.target.value))}>
                  {weather_v2_profiles[settings.weather].map((item, index) => <option key={index} value={index}>{item.label}</option>)}
                </select>
                {settings.weather === 'fog' && <label className="weather-check"><input type="checkbox" checked={Boolean(settings.haze)} onChange={event => update('haze', event.target.checked)} /> 偏黃霾霧效果</label>}
                {settings.weather === 'thunderstorm' && <label className="weather-extra">落雷頻率
                  <input type="range" min="0.2" max="1.8" step="0.2" value={settings.lightningRate ?? 0.5} onChange={event => update('lightningRate', Number(event.target.value))} />
                  <small>{(settings.lightningRate ?? 0.5) < 0.7 ? '偶發' : (settings.lightningRate ?? 0.5) < 1.3 ? '頻繁' : '非常頻繁'}</small>
                </label>}
                <p className="weather-description">{weatherProfiles[settings.weather].description}<span>目前風速 {settings.wind} m/s；{weather_v2_profiles[settings.weather][settings.weatherLevel ?? 1].label}</span></p>
                <div className="weather-science"><b>天氣科普</b><p>{weatherKnowledge[settings.weather]}</p><b>對飛行的影響</b><p>{settings.weather === 'fog' ? '能見度下降；風速仍決定飛行偏移。' : settings.weather === 'clear' ? '陽光強弱主要影響光照，烈日加入微弱熱對流。' : settings.weather === 'snow' ? '雪越大，風與亂流擾動越明顯。' : settings.weather === 'rain' ? '雨勢越強，飛行軌跡會受到越明顯的亂流擾動。' : settings.weather === 'typhoon' ? '隨風速及颱風強度增加，飛機更容易側翻和偏離。' : '落雷視覺頻率與風暴強度可分別調整；亂流會影響高度和姿態。'}</p></div>
              </div>
              <div className="weather-live">
                <label className="weather-check"><input type="checkbox" checked={liveMode} onChange={event => setLiveMode(event.target.checked)} /> 使用即時天氣模擬</label>
                {liveMode && <><div className="weather-live-row"><select aria-label="城市" value={livePlace} onChange={event => setLivePlace(event.target.value)}>{weatherPlaces.map(place => <option key={place.name} value={place.name}>{place.name}</option>)}</select><button type="button" onClick={() => setLiveRefresh(n => n + 1)}>立即更新</button></div><p>{liveStatus}</p><small>來源：Open-Meteo。頁面開啟時讀取並每 10 分鐘更新；依測站附近的模式格點資料近似分類，非氣象署颱風警報。</small></>}
              </div>
              {settings.weather === 'typhoon' && <p className="typhoon-warning">颱風模式：強風 10 m/s、斜向暴雨、陣風亂流與不規則側翻。</p>}
        </section>

        {result && <section className="prediction-section">
          <h2><Brain size={15} />先預測，再試飛</h2>
          <div className="prediction-options">
            <button className={prediction === 'farther' ? 'selected' : ''} onClick={() => setPrediction('farther')}>距離增加</button>
            <button className={prediction === 'higher' ? 'selected' : ''} onClick={() => setPrediction('higher')}>高度增加</button>
            <button className={prediction === 'longer' ? 'selected' : ''} onClick={() => setPrediction('longer')}>滯空增加</button>
          </div>
          {predictionFeedback && <p className="prediction-feedback"><CheckCircle2 size={15} />{predictionFeedback}</p>}
        </section>}

        {returnPrompt && result && !isAnimating && <div className="return-prompt" role="dialog" aria-label="試飛完成">
          <p>試飛完成，要回到起點繼續調整飛機造型嗎？</p>
          <button type="button" onClick={returnToStart}><RotateCcw size={16} />回到起點繼續調整</button>
        </div>}

        <div className="flight-actions">
          <button className="launch" disabled={isAnimating || Boolean(result && !prediction)} onClick={launch}><Plane size={20} />{isAnimating ? '飛行中…' : result && !prediction ? '請先選擇預測' : result ? '再次試飛' : '建立基準試飛'}</button>
          {result && <button className="replay" disabled={isAnimating} onClick={replay}><Rewind size={18} />慢動作重播</button>}
        </div>
      </aside>

      <section className="telemetry" aria-live="polite">
        <div><Gauge size={17} /><span>預估{settings.goal === 'far' ? '距離' : '高度'}</span><strong>{score === null ? '--' : score.toFixed(1)}<small> m</small></strong></div>
        <div><Wind size={17} /><span>滯空時間</span><strong>{result ? result.airtime.toFixed(1) : '--'}<small> s</small></strong></div>
        <div><Crosshair size={17} /><span>重心位置</span><strong>{cgText}</strong></div>
        <p>{comparison
          ? `和上次相比：距離 ${comparison.distance >= 0 ? '+' : ''}${comparison.distance.toFixed(1)} m，高度 ${comparison.peak >= 0 ? '+' : ''}${comparison.peak.toFixed(1)} m，側偏 ${comparison.deviation >= 0 ? '+' : ''}${comparison.deviation.toFixed(1)} m。`
          : result?.verdict ?? '先建立基準試飛，再修改一個參數並預測結果。'}</p>
      </section>

      <div className="hint">全景模式可拖曳旋轉 · 雙指縮放 · 可鎖定／重置視角</div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
