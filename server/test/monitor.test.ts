import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMonitor } from '../src/jobs/monitor.ts';

function makeMonitor(threshold = 3, cooldownMs = 1000) {
  const alerts: string[] = [];
  let clock = 0;
  const m = createMonitor({
    threshold,
    cooldownMs,
    alert: async (msg) => { alerts.push(msg); },
    now: () => clock,
  });
  return { m, alerts, tick: (ms: number) => { clock += ms; } };
}

test('alarm tek posle praga uzastopnih grešaka iste vrste', async () => {
  const { m, alerts } = makeMonitor(3);
  await m.recordFailure('parse', 'g1');
  await m.recordFailure('parse', 'g2');
  assert.equal(alerts.length, 0);
  await m.recordFailure('parse', 'g3');
  assert.equal(alerts.length, 1);
  assert.ok(alerts[0]!.includes('Uzastopnih grešaka: 3'));
});

test('uspeh resetuje brojače', async () => {
  const { m, alerts } = makeMonitor(3);
  await m.recordFailure('parse', 'g1');
  await m.recordFailure('parse', 'g2');
  m.recordSuccess();
  await m.recordFailure('parse', 'g3');
  assert.equal(alerts.length, 0);
  assert.equal(m.state.consecutive.parse, 1);
});

test('cooldown sprečava ponovni alarm, a posle isteka pušta', async () => {
  const { m, alerts, tick } = makeMonitor(2, 1000);
  await m.recordFailure('block', 'g1');
  await m.recordFailure('block', 'g2'); // alarm 1
  await m.recordFailure('block', 'g3'); // u cooldownu — ništa
  assert.equal(alerts.length, 1);
  tick(1500);
  await m.recordFailure('block', 'g4'); // cooldown istekao — alarm 2
  assert.equal(alerts.length, 2);
});

test('vrste grešaka se broje odvojeno', async () => {
  const { m, alerts } = makeMonitor(2);
  await m.recordFailure('parse', 'p1');
  await m.recordFailure('block', 'b1');
  assert.equal(alerts.length, 0);
  await m.recordFailure('parse', 'p2');
  assert.equal(alerts.length, 1);
});

test('pad samog alarma ne baca grešku dalje', async () => {
  const m = createMonitor({
    threshold: 1,
    alert: async () => { throw new Error('telegram pao'); },
    now: () => 0,
  });
  await assert.doesNotReject(() => m.recordFailure('other', 'x'));
});
