import test from 'node:test';
import assert from 'node:assert/strict';
import { visualMonth } from '../src/lib/visual.js';
import { planFromWindow, planFromCalendar } from '../src/lib/simulate.js';
import { syntheticReplay, syntheticCalendar } from './synthetic-replay.js';
test('visual frame keeps unknown cover and missing weather unavailable', () => {
 const {replay} = syntheticReplay();
 replay.series.PRECTOTCORR[0] = null;
 const frame = visualMonth(replay, planFromWindow(4,8), 1981,0);
 assert.equal(frame.rain,null);
 assert.equal(frame.protection,null);
 assert.equal(frame.exposedRain,null);
});
test('visual frame uses explicit assumption and exact monthly precipitation', () => {
 const {replay} = syntheticReplay();
 replay.series.PRECTOTCORR.fill(2);
 const plan = planFromCalendar(syntheticCalendar('cash',20),{source:'farmer_confirmed'});
 const frame = visualMonth(replay,plan,1981,0);
 assert.equal(frame.rain,62);
 assert.equal(frame.protection,80);
 assert.equal(frame.exposedRain,12.4);
});
