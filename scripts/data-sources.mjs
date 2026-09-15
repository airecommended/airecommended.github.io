const payments = { wechat_pay: '微信', alipay: '支付宝', usdt: 'USDT', credit_card: '信用卡', bank_transfer: '银行转账' };
const time = value => Date.parse(value || '') || 0;
const present = value => value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0);
function identity(site) {
  if (site.slug) return `slug:${site.slug}`;
  try {
    const url = new URL(site.url);
    const slug = url.pathname.match(/^\/sites\/([^/]+)\/?$/)?.[1];
    return slug ? `slug:${slug}` : `host:${url.hostname.replace(/^www\./, '').toLowerCase()}`;
  } catch { return `host:${site.domain}`; }
}
export function mergeSources(primary, database) {
  if (!primary.sites?.length || !database.sites?.length) throw new Error('两路数据源都必须包含站点');
  const sites = primary.sites.map(site => ({ ...site, sources: ['data.json'] }));
  const index = new Map(sites.map(site => [identity(site), site]));
  const hosts = new Map(sites.filter(s => s.domain).map(s => [s.domain, s]));
  const primaryTime = time(primary.generatedAt || primary.updatedDate);
  for (const row of database.sites) {
    const key = identity(row);
    let site = index.get(key) || hosts.get(row.domain);
    const exists = Boolean(site);
    if (!site) { site = { rank: Number.MAX_SAFE_INTEGER, sources: [] }; sites.push(site); }
    const newer = time(row.updatedAt) >= primaryTime;
    for (const field of ['name', 'url', 'description', 'establishedDate', 'userRating', 'ratingCount', 'supportsRefund', 'supportsInvoice', 'modelCount']) {
      if (present(row[field]) && (newer || !present(site[field]))) site[field] = row[field];
    }
    for (const field of ['rank', 'uptime', 'latencyMs']) {
      if (present(row[field]) && (time(row.rankingUpdatedAt) >= primaryTime || !exists || !present(site[field]))) site[field] = row[field];
    }
    site.models = [...new Set([...(site.models || []), ...(row.models || [])])].sort();
    const incomingPayments = (row.paymentMethods || []).map(item => payments[item.trim()] || item.trim());
    if (incomingPayments.length && (newer || !site.paymentMethods?.length)) site.paymentMethods = incomingPayments;
    site.modelCount = site.modelCount ?? site.models.length;
    site.historicalOnly = row.historicalOnly === true;
    site.domain = row.domain;
    site.detection = row.detection;
    site.priceCatalog = row.priceCatalog;
    site.updatedAt = row.updatedAt;
    site.sources.push('database.json');
    index.set(key, site);
    hosts.set(row.domain, site);
  }
  const updatedAt = [primary.generatedAt || primary.updatedDate, database.updatedAt].sort((a, b) => time(b) - time(a))[0];
  return { updatedDate: new Date(time(updatedAt)).toISOString().slice(0, 10),
    sources: [{ name: 'data.json', updatedAt: primary.generatedAt || primary.updatedDate, count: primary.sites.length },
      { name: 'database.json', updatedAt: database.updatedAt, exportedAt: database.exportedAt, count: database.sites.length }], sites };
}
