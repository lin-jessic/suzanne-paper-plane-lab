import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Brain, CheckCircle2, CloudRain, Crosshair, Eye, EyeOff, Gauge, Info, Lock, Plane, Rewind, RotateCcw, Ruler, Scale, Sparkles, Sun, Unlock, Wind } from 'lucide-react';
import './styles.css';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const WORLD_X_SCALE = 1.25;
const WORLD_Y_SCALE = 1.1;
const WORLD_Z_SCALE = 1.35;
const START_HEIGHT = 1.35 * WORLD_Y_SCALE;

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
    const turbulence = weather === 'typhoon' ? gustWave * (0.7 + Math.abs(wind) * 0.075) : 0;
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
  else if (longitudinalWind > 3) verdict = '順風很強，軌跡會變遠，但真實飛行也更難控制。';
  else if (longitudinalWind < -3) verdict = '逆風很強，飛機前進速度下降，但可能增加滯空時間。';

  const peakIndex = points.reduce((best, point, index) => point.y > points[best].y ? index : best, 0);
  const events = [{ progress: peakIndex / Math.max(1, points.length - 1), label: '到達最高點', detail: `${peak.toFixed(1)} 公尺`, tone: 'peak' }];
  if (weather === 'typhoon') {
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
  const count = isMobile ? 80 : 200;
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

function updateRainStreaks(rain, weather, wind, windDirection, delta) {
  if (weather === 'clear') {
    rain.visible = false;
    return;
  }
  const typhoon = weather === 'typhoon';
  rain.visible = true;
  rain.material.opacity = typhoon ? 0.62 : 0.38;
  const fallSpeed = typhoon ? 23 : 14;
  const slant = wind * (typhoon ? 0.16 : 0.08);
  const directionX = windDirection === 'front' ? 1 : 0;
  const directionZ = windDirection === 'left' ? 1 : windDirection === 'right' ? -1 : 0;
  const length = typhoon ? 1.7 : 0.9;
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
    sceneRef.current = {
      scene, camera, renderer, controls, plane, clips, pathLine, pathMaterial,
      propeller,
      previousPathLine, previousPathMaterial, forceGroup, forceArrows,
      windStreaks, rainStreaks, windSpeed: 0, windDirection: 'front', weather: 'clear',
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
      typhoon: { sky: new THREE.Color('#5d7076'), ground: new THREE.Color('#91a997'), sun: 0.65, hemisphere: 1.05, roughness: 0.48 }
    };
    let previousFrame = performance.now();
    const animate = () => {
      const now = performance.now();
      const delta = Math.min(0.05, (now - previousFrame) / 1000);
      previousFrame = now;
      const state = sceneRef.current;
      updateWindStreaks(state.windStreaks, state.windSpeed, state.windDirection, delta);
      updateRainStreaks(state.rainStreaks, state.weather, state.windSpeed, state.windDirection, delta);
      const look = weatherLooks[state.weather];
      scene.background.lerp(look.sky, 0.035);
      scene.fog.color.lerp(look.sky, 0.035);
      state.ground.material.color.lerp(look.ground, 0.035);
      state.ground.material.roughness = THREE.MathUtils.lerp(state.ground.material.roughness, look.roughness, 0.04);
      state.sun.intensity = THREE.MathUtils.lerp(state.sun.intensity, look.sun, 0.04);
      state.hemisphere.intensity = THREE.MathUtils.lerp(state.hemisphere.intensity, look.hemisphere, 0.04);
      const swayStrength = state.weather === 'typhoon' ? 0.075 : state.weather === 'rain' ? 0.012 : 0;
      state.trees.forEach((tree, index) => {
        const windLean = state.weather === 'typhoon' ? state.windSpeed * 0.0035 : 0;
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
    const looks = {
      clear: { sky: '#dfeee8', ground: '#e5f0df', sun: 3.2, hemisphere: 2.3, roughness: 1 },
      rain: { sky: '#a9bec2', ground: '#c6d7c0', sun: 1.45, hemisphere: 1.6, roughness: 0.72 },
      typhoon: { sky: '#5d7076', ground: '#91a997', sun: 0.65, hemisphere: 1.05, roughness: 0.48 }
    };
    const look = looks[settings.weather];
    state.scene.background.set(look.sky);
    state.scene.fog.color.set(look.sky);
    state.ground.material.color.set(look.ground);
    state.ground.material.roughness = look.roughness;
    state.sun.intensity = look.sun;
    state.hemisphere.intensity = look.hemisphere;
  }, [settings.weather]);

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
      const stormShake = settings.weather === 'typhoon' ? (p.turbulence || 0) * 0.035 * motionFade : 0;
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
  const [settings, setSettings] = useState({ goal: 'far', clipCount: 1, clipPosition: 22, clipPlacement: 'body', throwAngle: 10, throwPower: 55, wind: 0, windDirection: 'front', weather: 'clear', airframe: { ...DEFAULT_AIRFRAME }, propeller: { ...DEFAULT_PROPELLER } });
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

  const setWeatherMode = weather => {
    setSettings(current => ({
      ...current,
      weather,
      wind: weather === 'typhoon' ? 10 : weather === 'clear' ? 0 : current.wind
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
    setSettings({ goal: 'far', clipCount: 1, clipPosition: 22, clipPlacement: 'body', throwAngle: 10, throwPower: 55, wind: 0, windDirection: 'front', weather: 'clear', airframe: { ...DEFAULT_AIRFRAME }, propeller: { ...DEFAULT_PROPELLER } });
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
