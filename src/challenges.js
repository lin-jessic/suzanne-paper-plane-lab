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

export const LEVELS = [
  { id: 1, name: '起飛練習', goal: 'far', weather: 'clear', wind: 0, direction: 'front', metric: 'distance', thresholds: [5, 7, 9], unit: '公尺', achievement: '起飛新手', environment: '晴天・無風', instruction: '調整角度與力道，讓飛機飛得更遠。' },
  { id: 2, name: '遠距飛行', goal: 'far', weather: 'clear', wind: 0, direction: 'front', metric: 'distance', thresholds: [10, 12, 14], unit: '公尺', achievement: '遠航好手', environment: '晴天・無風', instruction: '調整投擲與配重，挑戰更遠的距離。' },
  { id: 3, name: '高度挑戰', goal: 'high', weather: 'clear', wind: 0, direction: 'front', metric: 'peak', thresholds: [3, 4, 5], unit: '公尺', achievement: '高空探索者', environment: '晴天・無風', instruction: '開放機型調整，試著增加最高高度。' },
  { id: 4, name: '側風平衡', goal: 'far', weather: 'clear', wind: 2, direction: 'left', metric: 'deviation', thresholds: [3, 2, 1], unit: '公尺', achievement: '抗風高手', environment: '晴天・左側風 2 m/s', instruction: '距離至少 8 公尺，並減少落點側偏。' },
  { id: 5, name: '雨中飛行', goal: 'far', weather: 'rain', wind: 2, direction: 'front', metric: 'distance', thresholds: [10, 12, 14], unit: '公尺', achievement: '雨中飛行家', environment: '小雨・順風 2 m/s', instruction: '運用配重與機翼調整，完成雨天遠航。' }
];

export function rateFlight(level, result) {
  if (level.id === 4 && result.distance < 8) return 0;
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
  return { ...progress, [level.id]: { ...previous, stars: Math.max(previous.stars ?? 0, stars), attempts: (previous.attempts ?? 0) + 1,
    ...(best != null ? { best } : {}),
    ...(stars >= 1 && !previous.completedAt ? { completedAt: date } : {}),
    ...(stars === 3 && !previous.masteredAt ? { masteredAt: date } : {}) } };
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
    return progress;
  } catch { return {}; }
}

export function starRule(level, index) {
  return `${'★'.repeat(index + 1)} ${level.metric === 'deviation' ? '距離 ≥ 8 公尺，側偏 ≤' : level.metric === 'peak' ? '高度 ≥' : '距離 ≥'} ${level.thresholds[index]} ${level.unit}`;
}
