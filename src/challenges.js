export const PROGRESS_KEY = 'suzanne-challenges-v1';
export const DAILY_KEY = 'suzanne-daily-v1';

const DAILY_WEATHER = ['clear', 'rain', 'snow', 'fog', 'typhoon', 'thunderstorm'];
const DAILY_DIRECTIONS = ['front', 'left', 'right'];

export function getDailyChallenge(date = new Date()) {
  const dateKey = typeof date === 'string' ? date : new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
  let seed = [...dateKey].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 17);
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const weather = DAILY_WEATHER[Math.floor(random() * DAILY_WEATHER.length)];
  const direction = DAILY_DIRECTIONS[Math.floor(random() * DAILY_DIRECTIONS.length)];
  const wind = 1 + Math.floor(random() * 8);
  const target = Number((7 + random() * 6).toFixed(1));
  const obstacle = { x: 8 + Math.floor(random() * 8), y: 1.4 + random() * 2.2, z: random() > 0.5 ? 1 : -1, width: 1.35, height: 1.8 };
  return { date: dateKey, weather, direction, wind, target, obstacle, weatherLevel: Math.min(3, Math.max(0, Math.floor(random() * 4))) };
}

export function loadDailyRecord(storage, date) {
  try {
    const saved = JSON.parse(storage.getItem(DAILY_KEY) ?? '{}');
    if (saved.date !== date) return { date, attempts: 0, best: null };
    return {
      date,
      attempts: Number.isSafeInteger(saved.attempts) && saved.attempts >= 0 ? saved.attempts : 0,
      best: Number.isSafeInteger(saved.best) && saved.best > 0 ? saved.best : null
    };
  } catch { return { date, attempts: 0, best: null }; }
}

export function recordDailyAttempt(record, result, target) {
  const attempts = record.attempts + 1;
  const success = !result.collision && result.distance >= target;
  return {
    record: { date: record.date, attempts, best: success ? Math.min(record.best ?? attempts, attempts) : record.best },
    success
  };
}

export function collidesWithObstacle(points, obstacle) {
  return Boolean(obstacle && points.some(point =>
    Math.abs(point.x - obstacle.x) <= obstacle.width / 2 &&
    Math.abs(point.y - obstacle.y) <= obstacle.height / 2 &&
    Math.abs(point.z - obstacle.z) <= 0.9
  ));
}

export const STAGES = [
  { id: 1, title: '基礎操控', subtitle: '第 1–10 關', focus: '投擲角度、力道與迴紋針配重', unlock: '完成上一關即可解鎖下一關。' },
  { id: 2, title: '機型調校', subtitle: '第 11–20 關', focus: '開放機翼與機身尺寸調整', unlock: '取得第 10 關至少 1 星後解鎖。' },
  { id: 3, title: '進階推進', subtitle: '第 21–30 關', focus: '加入螺旋槳設計，應對複合天候與障礙', unlock: '取得第 20 關至少 1 星後解鎖。' }
];

const levelDefinitions = [
  // Stage 1: keep the original five challenges, then add five introductory scenarios.
  [
    ['起飛練習', 'far', 'distance', [5, 7, 9], 'clear', 1, 0, 'front', '起飛新手', '調整角度與力道，讓飛機飛得更遠。'],
    ['遠距飛行', 'far', 'distance', [10, 12, 14], 'clear', 1, 0, 'front', '遠航好手', '調整投擲與配重，挑戰更遠的距離。'],
    ['高度挑戰', 'high', 'peak', [3, 4, 5], 'clear', 1, 0, 'front', '高空探索者', '改變仰角與配重，試著增加最高高度。'],
    ['側風平衡', 'far', 'deviation', [3, 2, 1], 'clear', 1, 2, 'left', '抗風高手', '飛行距離至少 8 公尺，同時減少落點側偏。', null, 8],
    ['雨中飛行', 'far', 'distance', [10, 12, 14], 'rain', 0, 2, 'front', '雨中飛行家', '運用配重與仰角，完成雨天遠航。'],
    ['右側微風', 'far', 'distance', [8, 10, 12], 'clear', 1, 3, 'right', '微風掌舵員', '觀察右側風如何改變落點，微調配重保持方向。'],
    ['避開低障礙', 'far', 'distance', [8, 10, 12], 'clear', 1, 0, 'front', '障礙觀察員', '看準障礙物高度，調整仰角避開碰撞。', { x: 9.5, y: 1.3, z: 1, width: 1.5, height: 1.5 }],
    ['雪地滑翔', 'far', 'distance', [7, 9, 11], 'snow', 1, 2, 'front', '雪中滑翔者', '雪勢會增加擾動，嘗試讓飛行保持穩定。'],
    ['濃霧定向', 'far', 'deviation', [4, 2.5, 1.5], 'fog', 1, 3, 'left', '霧中導航員', '依照側風方向調整配重，讓飛機沿著目標方向前進。', null, 7],
    ['基礎綜合測驗', 'far', 'distance', [10, 12, 14], 'rain', 1, 2, 'right', '基礎飛行專家', '綜合運用角度、力道與配重，通過最後的基礎考驗。', { x: 12, y: 2.3, z: -1, width: 1.4, height: 1.8 }]
  ],
  // Stage 2: airframe tuning joins throw and ballast controls.
  [
    ['翼展起步', 'far', 'distance', [9, 11, 13], 'clear', 1, 0, 'front', '翼展調校員', '調整翼展，觀察升力與距離的變化。'],
    ['寬翼攀高', 'high', 'peak', [3.5, 4.5, 5.5], 'clear', 1, 2, 'front', '高空翼型師', '比較翼面寬度與仰角，挑戰更高的飛行軌跡。'],
    ['側風翼端', 'far', 'deviation', [3.5, 2.5, 1.5], 'clear', 1, 4, 'left', '側風調校師', '調整左右翼端，減少側風造成的偏移。', null, 8],
    ['雨幕穿越', 'far', 'distance', [9, 11, 13], 'rain', 1, 3, 'front', '雨幕飛行員', '調整機翼並控制投擲，穿過降雨與亂流。', { x: 11, y: 2.6, z: 1, width: 1.5, height: 1.8 }],
    ['風向切換', 'far', 'distance', [9, 11, 13], 'clear', 1, 5, 'right', '風場判讀員', '利用翼型調校，克服右側強風。'],
    ['雪中迴避', 'far', 'peak', [3, 4, 5], 'snow', 2, 3, 'left', '雪地領航員', '調整翼型與仰角，從障礙物上方通過。', { x: 10.5, y: 1.6, z: 1, width: 1.6, height: 1.8 }],
    ['霧雨巡航', 'far', 'distance', [10, 12, 14], 'fog', 2, 2, 'front', '低能見度飛行員', '保持機翼平衡，穩定完成低能見度飛行。'],
    ['雷雨側航', 'far', 'deviation', [4, 3, 2], 'thunderstorm', 1, 4, 'right', '雷雨平衡師', '在雷雨與側風中維持航向並避免障礙。', { x: 13, y: 2.1, z: -1, width: 1.5, height: 1.9 }, 8],
    ['颱風迎風', 'far', 'distance', [8, 10, 12], 'typhoon', 0, -4, 'front', '強風試飛員', '逆風會降低前進速度，嘗試以翼型增加穩定。'],
    ['機型綜合測驗', 'far', 'distance', [11, 13, 15], 'rain', 2, 4, 'left', '機型設計專家', '整合機身、翼展與配重設定，通過進階機型考驗。', { x: 14, y: 2.4, z: 1, width: 1.6, height: 2 }]
  ],
  // Stage 3: propeller design is added to the full airframe toolkit.
  [
    ['推進器初試', 'far', 'distance', [10, 12, 14], 'clear', 1, 2, 'front', '推進器學徒', '設定螺旋槳推進效率，並留意重量對重心的影響。'],
    ['機頭配重', 'far', 'distance', [11, 13, 15], 'clear', 1, 3, 'right', '機頭推進工程師', '比較機頭螺旋槳與機身配重的組合。'],
    ['高空推進', 'high', 'peak', [4, 5, 6], 'clear', 1, 2, 'front', '雲端飛行工程師', '配合翼展與推力，達成指定高度。'],
    ['雨中穿門', 'far', 'distance', [10, 12, 14], 'rain', 2, 4, 'left', '雨中穿越專家', '調整機翼與推進器，穿過障礙並達成距離。', { x: 12, y: 2.6, z: -1, width: 1.6, height: 1.9 }],
    ['亂流穩定', 'far', 'deviation', [4, 3, 2], 'thunderstorm', 2, 5, 'right', '亂流控制專家', '在雷雨側風中調整兩側翼端與推進器位置。', null, 8],
    ['雪暴穿梭', 'far', 'distance', [9, 11, 13], 'snow', 3, 4, 'front', '雪暴領航員', '使用完整機型工具避開障礙，在雪暴中穩定飛行。', { x: 11.5, y: 2.2, z: 1, width: 1.8, height: 2 }],
    ['濃霧迴避', 'far', 'peak', [3.5, 4.5, 5.5], 'fog', 2, 4, 'left', '霧中穿越專家', '從障礙物上方越過，維持高度與前進速度。', { x: 13, y: 1.7, z: -1, width: 1.5, height: 1.8 }],
    ['颱風航線', 'far', 'distance', [9, 11, 13], 'typhoon', 1, -5, 'front', '颱風航線設計師', '調整推力與機翼，迎著強風通過航線。', { x: 12, y: 2.1, z: 1, width: 1.7, height: 1.9 }],
    ['多重障礙', 'far', 'deviation', [4, 3, 2], 'rain', 3, 5, 'right', '障礙賽飛行員', '保持距離達標，同時避開障礙並減少側偏。', { x: 14, y: 2.6, z: -1, width: 1.8, height: 2 }, 9],
    ['Suzanne 飛行大師', 'far', 'distance', [12, 14, 16], 'thunderstorm', 3, 5, 'left', 'Suzanne 飛行大師', '運用所有已解鎖的機型調整技巧，完成最終挑戰。', { x: 15, y: 2.8, z: 1, width: 1.8, height: 2.1 }]
  ]
];

const weatherNames = { clear: '晴天', rain: '雨天', snow: '雪天', fog: '濃霧', typhoon: '颱風', thunderstorm: '雷雨' };
const directionNames = { front: '正面風', left: '左側風', right: '右側風' };

export const LEVELS = levelDefinitions.flatMap((definitions, stageIndex) => definitions.map((definition, index) => {
  const [name, goal, metric, thresholds, weather, weatherLevel, wind, direction, achievement, instruction, obstacle = null, minimumDistance] = definition;
  const id = stageIndex * 10 + index + 1;
  const windDescription = wind === 0 ? '無風' : `${directionNames[direction]} ${Math.abs(wind)} m/s`;
  return {
    id, stage: stageIndex + 1, name, goal, metric, thresholds, unit: '公尺', weather, weatherLevel, wind, direction,
    achievement, instruction, obstacle, minimumDistance,
    environment: `${weatherNames[weather]}・${windDescription}${obstacle ? '・有障礙物' : ''}`
  };
}));

export function rateFlight(level, result) {
  if (result.collision || (level.minimumDistance && result.distance < level.minimumDistance)) return 0;
  const value = level.metric === 'deviation' ? Math.abs(result.deviation) : result[level.metric];
  if (!Number.isFinite(value)) return 0;
  return level.thresholds.filter(threshold => level.metric === 'deviation' ? value <= threshold : value >= threshold).length;
}

export const isUnlocked = (progress, id) => id === 1 || (progress[id - 1]?.stars ?? 0) >= 1;

export function recordFlight(progress, level, result, date = new Date().toISOString()) {
  const stars = rateFlight(level, result);
  const previous = progress[level.id] ?? {};
  const value = level.metric === 'deviation' ? Math.abs(result.deviation) : result[level.metric];
  const best = stars > 0 && (previous.best == null || (level.metric === 'deviation' ? value < previous.best : value > previous.best)) ? value : previous.best;
  const next = { ...progress, [level.id]: { ...previous, stars: Math.max(previous.stars ?? 0, stars), attempts: (previous.attempts ?? 0) + 1,
    ...(best != null ? { best } : {}),
    ...(stars >= 1 && !previous.completedAt ? { completedAt: date } : {}),
    ...(stars === 3 && !previous.masteredAt ? { masteredAt: date } : {}) } };
  const stage = STAGES[level.stage - 1];
  const stageLevels = LEVELS.filter(item => item.stage === level.stage);
  if (level.id === stage.id * 10 && stars >= 1) {
    const stageAwards = { ...(next.achievements ?? {}) };
    if (!stageAwards[`stage${stage.id}CompletedAt`]) stageAwards[`stage${stage.id}CompletedAt`] = date;
    if (stageLevels.every(item => (next[item.id]?.stars ?? 0) >= 3) && !stageAwards[`stage${stage.id}MasteredAt`]) stageAwards[`stage${stage.id}MasteredAt`] = date;
    next.achievements = stageAwards;
  }
  return next;
}

export function loadProgress(storage) {
  try {
    const data = JSON.parse(storage.getItem(PROGRESS_KEY) ?? '{}');
    const progress = {};
    for (const level of LEVELS) {
      const item = data?.[level.id];
      if (!item || !Number.isInteger(item.stars) || item.stars < 0 || item.stars > 3 || !isUnlocked(progress, level.id)) continue;
      progress[level.id] = { stars: item.stars, attempts: Number.isSafeInteger(item.attempts) && item.attempts >= 0 ? item.attempts : 0 };
      if (Number.isFinite(item.best) && item.best >= 0) progress[level.id].best = item.best;
      for (const key of ['completedAt', 'masteredAt']) {
        if (typeof item[key] === 'string' && Number.isFinite(Date.parse(item[key])) && item.stars >= (key === 'masteredAt' ? 3 : 1)) progress[level.id][key] = item[key];
      }
    }
    const stageAwards = {};
    for (const stage of STAGES) {
      for (const key of ['CompletedAt', 'MasteredAt']) {
        const field = `stage${stage.id}${key}`;
        if (typeof data?.achievements?.[field] === 'string' && Number.isFinite(Date.parse(data.achievements[field]))) stageAwards[field] = data.achievements[field];
      }
    }
    if (Object.keys(stageAwards).length) progress.achievements = stageAwards;
    return progress;
  } catch { return {}; }
}

export function starRule(level, index) {
  const metric = level.metric === 'deviation' ? `距離 ≥ ${level.minimumDistance ?? 0} 公尺，側偏 ≤` : level.metric === 'peak' ? '高度 ≥' : '距離 ≥';
  return `${'★'.repeat(index + 1)} ${metric} ${level.thresholds[index]} ${level.unit}`;
}

export function getAchievementCount(progress) {
  const levelAwards = Object.values(progress).filter(item => item && typeof item === 'object').reduce((sum, item) => sum + Boolean(item.completedAt) + Boolean(item.masteredAt), 0);
  const stageAwards = Object.values(progress.achievements ?? {}).filter(Boolean).length;
  return { earned: levelAwards + stageAwards, total: LEVELS.length * 2 + STAGES.length * 2 };
}
