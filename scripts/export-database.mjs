import { isIP } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Credentials stay in libpq environment variables / .pgpass, never in the snapshot.
const { stdout } = await promisify(execFile)(process.env.PSQL_BIN || 'psql',
  ['-X', '-q', '-w', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-f', fileURLToPath(new URL('./export-database.sql', import.meta.url))], {
    env: { ...process.env, PGHOST: process.env.PGHOST || 'localhost', PGPORT: process.env.PGPORT || '55432', PGUSER: process.env.PGUSER || 'postgres', PGDATABASE: process.env.PGDATABASE || 'hvoyverify', PGCONNECT_TIMEOUT: '10' },
    maxBuffer: 64 * 1024 * 1024,
  });
const snapshot = JSON.parse(stdout);
if (!snapshot.sites?.length || !snapshot.updatedAt) throw new Error('数据库未返回有效公开站点，保留原快照');
// Historical endpoints are published as hostnames only; exclude local/internal and IP targets.
const history = (snapshot.historicalSites || []).filter(site => {
  const host = site.domain;
  return host.length <= 253 && !isIP(host) && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(host)
    && !/(?:^|\.)(localhost|local|internal|test|invalid|example|lan|home|arpa)$/.test(host);
});
snapshot.sites.push(...history);
delete snapshot.historicalSites;
const target = new URL('../database.json', import.meta.url);
try {
  const previous = JSON.parse(await readFile(target, 'utf8'));
  if (Date.parse(previous.updatedAt) > Date.parse(snapshot.updatedAt)) throw new Error('拒绝数据库快照时间倒退');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await writeFile(new URL('../database.json.tmp', import.meta.url), JSON.stringify(snapshot, null, 2) + '\n');
await rename(new URL('../database.json.tmp', import.meta.url), target);
console.log(`数据库快照：${snapshot.sites.length} 家公开站点，数据时间 ${snapshot.updatedAt}`);
