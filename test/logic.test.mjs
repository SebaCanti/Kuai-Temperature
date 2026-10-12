import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const KT = createRequire(import.meta.url)('../js/logic.js');

test('parseCodes splits, uppercases, dedupes and rejects junk', () => {
  const r = KT.parseCodes('vb8dn022\nABC12345, abc12345; x\n\n  XYZ98765 ');
  assert.deepEqual(r.codes, ['VB8DN022', 'ABC12345', 'XYZ98765']);
  assert.deepEqual(r.rejected, ['X']);
  assert.equal(r.tooMany, false);
});

test('parseCodes caps at 30', () => {
  const many = Array.from({ length: 35 }, (_, i) => `CODE${i}`).join(' ');
  const r = KT.parseCodes(many);
  assert.equal(r.codes.length, 30);
  assert.equal(r.tooMany, true);
});

test('repoFromLocation reads GitHub Pages URLs', () => {
  assert.equal(KT.repoFromLocation({ hostname: 'sebacanti.github.io', pathname: '/Kuai-Temperature/' }, 'x/y'), 'sebacanti/Kuai-Temperature');
  assert.equal(KT.repoFromLocation({ hostname: 'localhost', pathname: '/' }, 'SebaCanti/Kuai-Temperature'), 'SebaCanti/Kuai-Temperature');
});

test('codeStates maps workflow jobs to board states', () => {
  const jobs = [
    { name: 'plan', status: 'completed', conclusion: 'success' },
    { name: 'DL AAA111', status: 'completed', conclusion: 'success', steps: [{ name: 'Invalid code', conclusion: 'skipped' }], started_at: '2026-10-12T10:00:00Z', completed_at: '2026-10-12T10:00:40Z' },
    { name: 'DL BBB222', status: 'completed', conclusion: 'success', steps: [{ name: 'Invalid code', conclusion: 'success' }] },
    { name: 'DL CCC333', status: 'completed', conclusion: 'failure', steps: [] },
    { name: 'DL DDD444', status: 'in_progress' },
  ];
  const s = KT.codeStates(['AAA111', 'BBB222', 'CCC333', 'DDD444', 'EEE555'], jobs);
  assert.deepEqual(s.map(x => x.state), ['done', 'invalid', 'failed', 'running', 'queued']);
  assert.equal(s[0].completedAt - s[0].startedAt, 40000);
  assert.deepEqual(KT.summary(s), { total: 5, done: 1, invalid: 1, failed: 1, finished: 3 });
});

test('fmtElapsed', () => {
  assert.equal(KT.fmtElapsed(65000), '01:05');
  assert.equal(KT.fmtElapsed(null), '--:--');
});

test('isoWeek', () => {
  assert.deepEqual(KT.isoWeek(new Date(2026, 9, 12)), { year: 2026, week: 42 });
  assert.deepEqual(KT.isoWeek(new Date(2026, 0, 1)), { year: 2026, week: 1 });
  assert.deepEqual(KT.isoWeek(new Date(2027, 0, 1)), { year: 2026, week: 53 });
});
