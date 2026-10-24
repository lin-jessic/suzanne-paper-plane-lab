import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { LEVELS, rateFlight, recordFlight, isUnlocked, loadProgress } from './challenges.js';

test('rating boundaries and sidewind require all conditions on the same flight', () => {
  for (const level of LEVELS) {
    for (let index = 0; index < 3; index++) {
      const result = { distance: 8, deviation: 0, [level.metric]: level.thresholds[index] };
      assert.equal(rateFlight(level, result), index + 1);
    }
  }
  assert.equal(rateFlight(LEVELS[3], { distance: 7.99, deviation: 0 }), 0);
  assert.equal(rateFlight(LEVELS[3], { distance: 8, deviation: -2 }), 2);
  assert.equal(rateFlight(LEVELS[0], { distance: 4.99 }), 0);
});

test('progress unlocks sequentially and preserves stars, bests and achievement dates', () => {
  let progress = {};
  const date = '2026-10-24T00:00:00.000Z';
  assert.equal(isUnlocked(progress, 1), true);
  assert.equal(isUnlocked(progress, 2), false);
  progress = recordFlight(progress, LEVELS[0], { distance: 9 }, date);
  assert.equal(isUnlocked(progress, 2), true);
  assert.equal(isUnlocked(progress, 3), false);
  progress = recordFlight(progress, LEVELS[0], { distance: 2 }, '2026-10-25T00:00:00.000Z');
  assert.equal(progress[1].stars, 3);
  assert.equal(progress[1].best, 9);
  assert.equal(progress[1].attempts, 2);
  assert.equal(progress[1].completedAt, date);
  assert.equal(progress[1].masteredAt, date);
  assert.deepEqual(loadProgress({ getItem: () => JSON.stringify(progress) }), progress);
  assert.deepEqual(loadProgress({ getItem: () => '{broken' }), {});
  assert.deepEqual(loadProgress({ getItem: () => { throw Error('denied'); } }), {});
  assert.deepEqual(loadProgress({ getItem: () => '{"5":{"stars":3}}' }), {});
});

// Exercise the actual flight model without mounting the WebGL scene.
const source = readFileSync(new URL('./main.jsx', import.meta.url), 'utf8');
const model = source.slice(source.indexOf('const DEFAULT_AIRFRAME'), source.indexOf('function getCg'));
const context = vm.createContext({ THREE: { MathUtils: { degToRad: value => value * Math.PI / 180 } },
  clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  weather_v2_profiles: { clear: [{ intensity: 0.55 }, { intensity: 1 }], rain: [{ intensity: 0.4 }] } });
vm.runInContext(`${model}; this.simulate = simulateFlight;`, context);

test('all five three-star goals are attainable with allowed settings', () => {
  for (const level of LEVELS) {
    let achieved = false;
    for (const angle of [10, 20, 30]) {
      for (const clipCount of level.id === 1 ? [1] : [1, 2, 3]) {
        for (const placement of level.id < 4 ? ['body'] : ['body', 'right']) {
          for (const leftTipAngle of level.id < 3 ? [8] : [0, 8, 18]) {
            const result = context.simulate({ clipCount, clipPosition: 22, clipPlacement: placement,
              throwAngle: angle, throwPower: 100, wind: level.wind, windDirection: level.direction,
              weather: level.weather, weatherLevel: level.weather === 'rain' ? 0 : 1, goal: level.goal,
              airframe: { leftTipAngle }, propeller: { enabled: false } });
            if (rateFlight(level, result) === 3) achieved = true;
          }
        }
      }
    }
    assert.ok(achieved, `Level ${level.id} must have a reachable three-star result`);
  }
});
