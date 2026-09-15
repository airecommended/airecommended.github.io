import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mergeSources } from '../scripts/data-sources.mjs';
const primary = { generatedAt: '2026-09-15T00:00:00Z', sites: [{ name: 'A', url: 'https://www.hvoy.ai/sites/a/', rank: 1, uptime: 98, models: ['GPT'], supportsRefund: true, modelCount: 12 }] };
const row = { name: 'A', slug: 'a', domain: 'a.example', url: 'https://www.hvoy.ai/sites/a/', updatedAt: '2026-08-24', rankingUpdatedAt: '2026-08-24', rank: 20, uptime: 40, models: ['gpt-5'], supportsRefund: false, detection: { runs: 3, passed: 1, failed: 1, errors: 1 } };
test('旧数据库补全模型和检测，不覆盖较新榜单指标', () => {
  const result = mergeSources(primary, { updatedAt: row.updatedAt, sites: [row] });
  assert.equal(result.sites.length, 1);
  assert.equal(result.sites[0].uptime, 98);
  assert.equal(result.sites[0].rank, 1);
  assert.equal(result.sites[0].supportsRefund, true);
  assert.equal(result.sites[0].modelCount, 12);
  assert.equal(result.sites[0].detection.runs, 3);
  assert.deepEqual(result.sites[0].models, ['GPT', 'gpt-5']);
  assert.equal(result.updatedDate, '2026-09-15');
});
test('新数据库可更新明确的 false 和零值；保留所有独有站点', () => {
  const newer = { ...row, updatedAt: '2026-09-16', rankingUpdatedAt: '2026-09-16', uptime: 0 };
  const result = mergeSources(primary, { updatedAt: newer.updatedAt, sites: [newer, { ...newer, slug: 'b', domain: 'b.example', name: 'B' }] });
  assert.equal(result.sites.length, 2);
  assert.equal(result.sites[0].uptime, 0);
  assert.equal(result.sites[0].supportsRefund, false);
  assert.equal(result.sites[0].rank, 20);
});
test('快照不含账户、凭据、原始响应或访问者信息；完整目录已生成', async () => {
  const snapshot = await readFile(new URL('../database.json', import.meta.url), 'utf8');
  assert.doesNotMatch(snapshot, /"(?:admin_account|admin_password_enc|ip_hash|endpoint_url|notes_json|response_excerpt|source_json|user_email_snapshot)"\s*:/);
  const merged = JSON.parse(await readFile(new URL('../combined-data.json', import.meta.url), 'utf8'));
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(merged.sites.length > 500);
  assert.match(html, /AI API 站点目录/);
  assert.equal(merged.sources.length, 2);
});
