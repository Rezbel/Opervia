import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localIsoDate, periodError, presetPeriod } from '../src/lib/datePeriod.ts';

test('today uses the local calendar day even near midnight', () => {
  const today = new Date(2026, 9, 7, 23, 59);
  assert.equal(localIsoDate(today), '2026-10-07');
  assert.deepEqual(presetPeriod('today', today), { from: '2026-10-07', to: '2026-10-07' });
});
test('30 days includes today and crosses a year boundary', () => {
  assert.deepEqual(presetPeriod('30days', new Date(2026, 0, 1)), { from: '2025-12-03', to: '2026-01-01' });
});
test('month and year start on day one and end today', () => {
  const today = new Date(2024, 1, 29);
  assert.deepEqual(presetPeriod('month', today), { from: '2024-02-01', to: '2024-02-29' });
  assert.deepEqual(presetPeriod('year', today), { from: '2024-01-01', to: '2024-02-29' });
});
test('invalid, incomplete and reversed dates cannot be applied', () => {
  for (const range of [
    { from: '', to: '2026-10-07' },
    { from: '2026-02-30', to: '2026-10-07' },
    { from: '2026-10-08', to: '2026-10-07' },
    { from: '2026-01-01', to: '9999-12-31' },
  ]) assert.notEqual(periodError(range), '');
  assert.equal(periodError({ from: '2024-02-29', to: '2024-02-29' }), '');
});
