import test from 'node:test';
import assert from 'node:assert/strict';
import { detectionSummary } from '../scripts/detection-summary.mjs';
test('成功率包含失败和错误样本，并显示统计数量与日期', () => {
  assert.deepEqual(detectionSummary({ runs: 10, passed: 7, failed: 1, errors: 2, latestAt: '2026-08-24T19:00:00Z' }), {
    text: '检测成功率 70.0%；累计检测 10 次，成功 7 次。', date: '2026-08-24',
  });
});
test('准确区分全失败、全成功、无样本及不合法计数', () => {
  assert.match(detectionSummary({ runs: 10, passed: 0 }).text, /成功率 0%/);
  assert.match(detectionSummary({ runs: 10, passed: 10 }).text, /成功率 100%/);
  assert.doesNotMatch(detectionSummary({ runs: 10000, passed: 9999 }).text, /成功率 100%/);
  for (const d of [null, { runs: 0, passed: 0 }, { runs: 10, passed: 11 }, { runs: 10, passed: null }]) assert.equal(detectionSummary(d), null);
});
