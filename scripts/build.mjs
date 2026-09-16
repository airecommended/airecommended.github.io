import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { detectionSummary } from "./detection-summary.mjs";
import { mergeSources } from "./data-sources.mjs";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = path.join(ROOT, "data.json");
const PAGE_ROOT = path.join(ROOT, "page");
const STYLES_PATH = path.join(ROOT, "assets", "styles.css");
const MINIFIED_STYLES_PATH = path.join(ROOT, "assets", "styles.min.css");
const SOURCE_URL = process.env.DATA_SOURCE_URL
  || "https://raw.githubusercontent.com/hvoyai/awesome-ai-api/main/data.json";
const ORIGIN = "https://airecommended.github.io";
const SITE_NAME = "2026 API 中转站推荐";
const BAIDU_TONGJI_SCRIPT = [
  "<script>",
  "var _hmt = _hmt || [];",
  "(function() {",
  "  var hm = document.createElement(\"script\");",
  "  hm.src = \"https://hm.baidu.com/hm.js?bac81b3d5c24340ed0a078e8c4cbc0c4\";",
  "  var s = document.getElementsByTagName(\"script\")[0];",
  "  s.parentNode.insertBefore(hm, s);",
  "})();",
  "</script>",
].join("\n");
const DISPLAY_DATE = process.env.SITE_DATE || new Date().toISOString().slice(0, 10);
const PAGE_SIZE = 1000;
let sourceSummary = "";
const SHOULD_SYNC = process.argv.includes("--sync");
const number = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });

const TOPICS = [
  {
    slug: "gpt-zhongzhuanzhan",
    label: "GPT 中转站",
    short: "GPT / OpenAI",
    terms: ["gpt", "openai", "chatgpt"],
    intro: "GPT 中转站通常提供 OpenAI 兼容接口，适合对话、代码、结构化输出、工具调用和多模态任务。除了模型名称，还要核对 Responses API、Chat Completions、上下文长度、缓存和具体版本映射。",
    focus: ["确认 GPT 具体版本与上下文长度", "测试 Responses API 和工具调用", "验证图片、文件与结构化输出", "分别复算输入、输出和缓存费用"],
  },
  {
    slug: "claude-zhongzhuanzhan",
    label: "Claude 中转站",
    short: "Claude / Anthropic",
    terms: ["claude", "anthropic"],
    intro: "Claude 中转站常用于长文本、代码和 Agent 任务。选择时应确认 Anthropic 原生协议或兼容层差异，并重点测试 Prompt Caching、工具调用、长输出稳定性以及 Sonnet、Opus 等版本映射。",
    focus: ["核对 Claude 版本和模型映射", "测试长输出与工具调用断流", "检查缓存写入和读取明细", "确认 Anthropic 原生协议兼容性"],
  },
  {
    slug: "codex-zhongzhuanzhan",
    label: "Codex 中转站",
    short: "Codex",
    terms: ["codex"],
    intro: "Codex 中转站面向代码生成、仓库分析和编程 Agent。普通聊天可用不代表长任务稳定，应使用真实代码仓库测试工具调用、上下文缓存、并发、错误恢复以及 Codex 客户端所需的接口能力。",
    focus: ["验证 Codex 客户端接入方式", "用多文件任务测试完整成功率", "检查长上下文、缓存和并发", "准备可快速切换的备用接口"],
  },
  {
    slug: "gemini-zhongzhuanzhan",
    label: "Gemini 中转站",
    short: "Gemini / Google",
    terms: ["gemini"],
    intro: "Gemini 中转站常用于多模态、长上下文、代码和文档处理。需要区分 Gemini 原生接口与 OpenAI 兼容接口，并分别测试图片、文件、工具调用、安全过滤和具体模型版本。",
    focus: ["确认原生 Gemini 或兼容协议", "测试图片、文件和多模态输入", "核对安全过滤与错误返回", "检查模型版本和上下文限制"],
  },
  {
    slug: "glm-zhongzhuanzhan",
    label: "GLM 中转站",
    short: "GLM / 智谱",
    terms: ["glm", "智谱"],
    intro: "GLM 中转站主要提供智谱 GLM 系列模型的统一 API 接入。应确认具体型号、工具调用、结构化输出、视觉能力和上下文限制，并检查兼容接口是否完整保留智谱原生能力。",
    focus: ["核对 GLM 具体型号", "测试工具调用、JSON 和视觉能力", "确认上下文、并发与限流", "检查原生能力在兼容层的差异"],
  },
  {
    slug: "qwen-zhongzhuanzhan",
    label: "Qwen 中转站",
    short: "Qwen / 通义千问",
    terms: ["qwen", "通义", "千问"],
    intro: "Qwen 中转站覆盖通义千问文本、代码和多模态模型。选择时要区分不同尺寸与用途，确认上下文、视觉或音频能力、工具调用、兼容协议和实际调用价格。",
    focus: ["区分 Qwen 不同尺寸和用途", "测试文本、代码与多模态能力", "确认原生协议和兼容层差异", "核对上下文、限流和调用价格"],
  },
  {
    slug: "kimi-zhongzhuanzhan",
    label: "Kimi 中转站",
    short: "Kimi / 月之暗面",
    terms: ["kimi", "moonshot", "月之暗面"],
    intro: "Kimi 中转站常用于中文长文本、文件处理和对话场景。应核对 Moonshot 或 Kimi 具体模型、上下文长度、文件能力、工具调用和费用，避免直接用网页会员体验推断 API 能力。",
    focus: ["确认 Kimi 与 Moonshot 模型映射", "测试中文长文本和文件处理", "检查上下文长度与超限行为", "区分网页会员能力和 API 计费"],
  },
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBoolean(value) {
  return value === true ? true : value === false ? false : null;
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== text ? "" : text;
}

function formatChineseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function normalizeSite(site, index) {
  const models = Array.isArray(site.models) ? site.models.map(String).map((item) => item.trim()).filter(Boolean) : [];
  const payments = Array.isArray(site.paymentMethods)
    ? site.paymentMethods.map(String).map((item) => item.trim()).filter(Boolean)
    : [];
  return {
    historicalOnly: site.historicalOnly === true,
    sources: site.sources || [],
    detection: site.detection,
    rank: Math.max(1, Math.round(finite(site.rank) || index + 1)),
    name: String(site.name || "未命名站点").trim(),
    url: safeUrl(site.url),
    description: String(site.description || "").trim(),
    establishedDate: normalizeDate(site.establishedDate),
    modelCount: Math.max(0, Math.round(finite(site.modelCount) || models.length)),
    models: [...new Set(models)],
    uptime: finite(site.uptime),
    latencyMs: finite(site.latencyMs),
    userRating: finite(site.userRating),
    ratingCount: Math.max(0, Math.round(finite(site.ratingCount) || 0)),
    paymentMethods: [...new Set(payments)],
    supportsRefund: normalizeBoolean(site.supportsRefund),
    supportsInvoice: normalizeBoolean(site.supportsInvoice),
  };
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.sites) || !payload.sites.length) {
    throw new Error("data.json 缺少非空 sites 数组");
  }
  payload.sites.forEach((site, index) => {
    if (!site || typeof site !== "object" || !String(site.name || "").trim()) {
      throw new Error(`第 ${index + 1} 条站点缺少名称`);
    }
    if (!safeUrl(site.url)) throw new Error(`第 ${index + 1} 条站点链接无效`);
  });
}

async function atomicWrite(target, content) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, target);
}

async function fetchAndSaveSnapshot() {
  const response = await fetch(SOURCE_URL, {
    headers: { "user-agent": "airecommended-static-builder/1.0" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`同步失败：HTTP ${response.status}`);
  const text = await response.text();
  const incoming = JSON.parse(text);
  const capped = incoming;
  validatePayload(capped);
  try {
    const current = JSON.parse(await readFile(DATA_PATH, "utf8"));
    if (current.updatedDate && capped.updatedDate && capped.updatedDate < current.updatedDate) {
      throw new Error(`拒绝使用旧快照：${capped.updatedDate} < ${current.updatedDate}`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await atomicWrite(DATA_PATH, `${JSON.stringify(capped, null, 2)}\n`);
}

async function syncData() {
  let failure;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { await fetchAndSaveSnapshot(); return; }
    catch (error) {
      failure = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 1200));
    }
  }
  const current = JSON.parse(await readFile(DATA_PATH, "utf8"));
  validatePayload(current);
  console.warn(`同步失败，保留已验证快照（${current.updatedDate}）：${failure.message}`);
  if (process.env.GITHUB_ACTIONS) console.warn(`::warning::公开数据同步失败，当前使用 ${current.updatedDate} 快照`);
}

function formatDate(value) {
  if (!value) return "暂未收录";
  const [year, month, day] = value.split("-").map(Number);
  return `${year} 年 ${month} 月 ${day} 日`;
}

function formatUptime(value) {
  return value === null ? "暂无" : `${number.format(value)}%`;
}

function formatLatency(value) {
  if (value === null) return "暂无";
  return value >= 1000 ? `${number.format(value / 1000)} 秒` : `${Math.round(value)} 毫秒`;
}

function status(value) {
  return value === true ? "支持" : value === false ? "不支持" : "待确认";
}

function rankSites(sites) {
  return sites
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((site, index) => ({ ...site, sourceRank: site.rank, rank: index + 1 }));
}

function descriptionSummary(text, limit = 86) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit).trim()}…` : compact;
}

function renderSite(site) {
  const detection = detectionSummary(site.detection);
  const summary = site.description ? descriptionSummary(site.description, 66)
    : detection ? detection.text
    : site.models.length ? `收录 ${site.models.slice(0, 3).join('、')} 等模型，可前往站点了解接入方式。` : '公开站点目录收录，可前往站点查看服务介绍。';
  const detail = detection ? `${detection.text} 最近检测 ${DISPLAY_DATE}`
    : site.supportsRefund ? '支持退款' : site.paymentMethods.slice(0, 2).join(' / ') || '公开站点资料';
  return `<article class="station-card" id="rank-${site.rank}" aria-labelledby="station-${site.rank}"><div class="compact-card-top"><span class="catalog-number">${String(site.rank).padStart(4, '0')}</span><span class="catalog-kind">${detection ? '检测统计' : '公开站点'}</span></div><h2 id="station-${site.rank}"><a href="${escapeHtml(site.url)}" target="_blank" rel="nofollow noopener">${escapeHtml(site.name)} <span aria-hidden="true">↗</span></a></h2><p class="compact-description">${escapeHtml(descriptionSummary(summary, 84))}</p><p class="compact-card-foot">${escapeHtml(detail)}</p></article>`;
}

function pagePath(page) {
  return page === 1 ? "/" : `/page/${page}/`;
}

function relativeRoot(page) {
  return page === 1 ? "." : "../..";
}

function renderBreadcrumbs(page, root) {
  if (page === 1) {
    return `<nav class="breadcrumbs" aria-label="面包屑"><span aria-current="page">${SITE_NAME}</span></nav>`;
  }
  return `<nav class="breadcrumbs" aria-label="面包屑"><a href="${root}/">${SITE_NAME}</a><span aria-hidden="true">/</span><span aria-current="page">第 ${page} 页</span></nav>`;
}

function renderPagination(current, total, pathForPage = pagePath) {
  const pages = new Set([1, total]);
  for (let page = Math.max(1, current - 2); page <= Math.min(total, current + 2); page += 1) pages.add(page);
  const sorted = [...pages].sort((a, b) => a - b);
  const links = [];
  let previous = 0;
  for (const page of sorted) {
    if (page - previous > 1) links.push('<span class="page-gap" aria-hidden="true">…</span>');
    links.push(page === current
      ? `<span class="page-number is-current" aria-current="page">${page}</span>`
      : `<a class="page-number" href="${pathForPage(page)}" aria-label="前往第 ${page} 页">${page}</a>`);
    previous = page;
  }
  return `<nav class="pagination" aria-label="榜单分页">
            ${current > 1 ? `<a class="page-step" href="${pathForPage(current - 1)}">← 上一页</a>` : '<span class="page-step is-disabled">← 上一页</span>'}
            <div class="page-numbers">${links.join("")}</div>
            ${current < total ? `<a class="page-step" href="${pathForPage(current + 1)}">下一页 →</a>` : '<span class="page-step is-disabled">下一页 →</span>'}
          </nav>`;
}

function topicMatches(site, topic) {
  const searchable = [site.name, site.description, ...site.models].join(" ").toLowerCase();
  return topic.terms.some((term) => searchable.includes(term.toLowerCase()));
}

function renderPage({ page, totalPages, sites, allSites, updatedDate, topic = null }) {
  const pathForPage = topic ? n => `/${topic.slug}/${n === 1 ? '' : `page/${n}/`}` : pagePath;
  const canonical = `${ORIGIN}${pathForPage(page)}`;
  const title = `${topic ? topic.label : "最宇宙全API中转站导航"}：${number.format(allSites.length)} 家站点目录${page > 1 ? ` · 第 ${page} 页` : ''}`;
  const description = `${topic ? "AI API" : "最宇宙全API"} 中转站导航，收录 ${allSites.length} 家站点，每页展示 1000 家，提供检测成功率、检测次数和站点特色。`;
  const schema = JSON.stringify({ '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: canonical, dateModified: updatedDate,
    mainEntity: { '@type': 'ItemList', numberOfItems: sites.length, itemListElement: sites.map(site => ({ '@type': 'ListItem', position: site.rank, name: site.name, url: site.url })) } }).replaceAll('<', '\\u003c');
  const hero = topic
    ? `<div><p class="eyebrow">API RELAY DIRECTORY / 2026</p><h1>${escapeHtml(topic.label)}<span>模型相关站点目录</span></h1><p>汇集公开榜单与逐次检测记录，用成功率和样本数量比较站点表现。</p></div><aside><strong>${number.format(allSites.length)}</strong><span>个独立站点 · ${totalPages} 页</span></aside>`
    : `<div><p class="eyebrow">API RELAY DIRECTORY / 2026</p><h1>最宇宙全API中转站导航<span><strong>${number.format(allSites.length)}</strong> 个中转站已收录</span></h1><p class="directory-hero__tagline">最全收录 <i aria-hidden="true">·</i> 最专业</p><p>汇集公开榜单与逐次检测记录，用成功率和样本数量比较站点表现。</p></div><aside><strong>${number.format(allSites.length)}</strong><span>实时目录 · ${totalPages} 页</span></aside>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${canonical}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${ORIGIN}/assets/og-image.png"><link rel="icon" href="/assets/favicon.svg"><link rel="stylesheet" href="/assets/styles.min.css"><script type="application/ld+json">${schema}</script>${BAIDU_TONGJI_SCRIPT}</head><body class="directory-page"><a class="skip-link" href="#main">跳到主要内容</a><header class="topbar"><a class="wordmark" href="/"><span>API 中转站</span><strong>推荐</strong></a><nav aria-label="主要导航"><a href="/#ranking">站点目录</a><a href="/#topics">模型专题</a><a href="/guides/channel-groups/">渠道科普</a><a href="/pitfalls/">选站避坑</a><a href="/news/">AI 新闻</a><a href="/about/">关于本站</a></nav></header><main id="main">${topic ? `<nav class="breadcrumbs" aria-label="面包屑"><a href="/">站点目录</a><span>${escapeHtml(topic.label)} · 第 ${page} 页</span></nav>` : renderBreadcrumbs(page, relativeRoot(page))}<section class="directory-hero${topic ? '' : ' directory-hero--home'}">${hero}</section><nav class="directory-topics" id="topics" aria-label="模型专题"><a href="/" ${!topic ? 'aria-current="page"' : ''}>全部站点</a>${TOPICS.map(t => `<a href="/${t.slug}/" ${topic?.slug === t.slug ? 'aria-current="page"' : ''}>${escapeHtml(t.short)}</a>`).join('')}</nav><section id="ranking" class="directory-ranking"><div class="ranking-head"><h2>全部站点 <span>/ 第 ${page} 页</span></h2><p>${sites[0]?.rank || 0}–${sites.at(-1)?.rank || 0} · 每页 1000 家</p></div>${renderPagination(page, totalPages, pathForPage)}<div class="station-list">${sites.map(renderSite).join('')}</div>${renderPagination(page, totalPages, pathForPage)}</section><section id="guide" class="directory-note"><h2>用数据比较站点表现</h2><p>结合成功率和检测次数选择站点，再按所需模型、价格与支付方式筛选。</p></section><section id="faq" class="directory-note"><h2>检测结果</h2><p>页面展示已完成检测的成功次数、总次数和成功率，便于直接比较不同站点的检测表现。</p></section></main><footer class="footer"><p>API 中转站推荐 · 站点目录</p><a href="#main">返回顶部 ↑</a></footer></body></html>`;
}

function minifyHtml(html) {
  return html
    .replace("<!doctype html>", "<!DOCTYPE html>")
    .replace(/<(meta|link|br)([^>]*) \/>/g, "<$1$2>")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("")
    .replace(/>\s+</g, "><")
    .concat("\n");
}

function minifyCss(css) {
  const strings = [];
  const protectedCss = css.replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, (match) => {
    const token = `___CSS_STRING_${strings.length}___`;
    strings.push(match);
    return token;
  });
  let minified = protectedCss
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
  strings.forEach((value, index) => {
    minified = minified.replace(`___CSS_STRING_${index}___`, value);
  });
  return `${minified}\n`;
}

function renderSitemap(totalPages, updatedDate, topicUrls = []) {
  const urls = [
    ...Array.from({ length: totalPages }, (_, index) => `${ORIGIN}${pagePath(index + 1)}`),
    ...topicUrls.map(url => `${ORIGIN}${url}`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url, index) => `  <url>
    <loc>${url}</loc>
    <lastmod>${updatedDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${index === 0 ? "1.0" : index < totalPages ? "0.8" : "0.9"}</priority>
  </url>`).join("\n")}
</urlset>
`;
}

async function cleanOldPages(totalPages) {
  let entries = [];
  try { entries = await readdir(PAGE_ROOT, { withFileTypes: true }); } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await Promise.all(entries
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name) && Number(entry.name) > totalPages)
    .map((entry) => rm(path.join(PAGE_ROOT, entry.name), { recursive: true, force: true })));
}

async function build() {
  if (SHOULD_SYNC) await syncData();
  const primary = JSON.parse(await readFile(DATA_PATH, "utf8"));
  const database = JSON.parse(await readFile(path.join(ROOT, "database.json"), "utf8"));
  const payload = mergeSources(primary, database);
  sourceSummary = "";
  await atomicWrite(path.join(ROOT, "combined-data.json"), JSON.stringify(payload, null, 2) + "\n");
  validatePayload(payload);
  const updatedDate = normalizeDate(payload.updatedDate) || new Date().toISOString().slice(0, 10);
  const normalizedSites = payload.sites.map(normalizeSite).sort((a, b) => a.rank - b.rank);
  const sites = rankSites(normalizedSites);
  const totalPages = Math.ceil(sites.length / PAGE_SIZE);
  const topicPages = TOPICS.flatMap(topic => {
    const matches = sites.filter(site => topicMatches(site, topic));
    return Array.from({ length: Math.max(1, Math.ceil(matches.length / PAGE_SIZE)) }, (_, index) => {
      const page = index + 1;
      return { topic, path: `/${topic.slug}/${page === 1 ? '' : `page/${page}/`}`, html: renderPage({ topic, page, totalPages: Math.max(1, Math.ceil(matches.length / PAGE_SIZE)), sites: matches.slice(index * PAGE_SIZE, page * PAGE_SIZE), allSites: matches, updatedDate }) };
    });
  });
  // Regenerate nested topic pagination so shrinking datasets cannot leave stale pages.
  for (const topic of TOPICS) await rm(path.join(ROOT, topic.slug, 'page'), { recursive: true, force: true });
  await cleanOldPages(totalPages);
  await atomicWrite(MINIFIED_STYLES_PATH, minifyCss(await readFile(STYLES_PATH, "utf8")));

  for (let page = 1; page <= totalPages; page += 1) {
    const target = page === 1 ? path.join(ROOT, 'index.html') : path.join(PAGE_ROOT, String(page), 'index.html');
    await atomicWrite(target, minifyHtml(renderPage({ page, totalPages, sites: sites.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), allSites: sites, updatedDate })));
  }
  for (const { path: pageUrl, html } of topicPages) {
    await atomicWrite(path.join(ROOT, pageUrl.slice(1), "index.html"), minifyHtml(html));
  }
  await atomicWrite(path.join(ROOT, "sitemap.xml"), renderSitemap(totalPages, updatedDate, topicPages.map(p => p.path)));
  process.stdout.write(`已生成 ${totalPages} 页站点目录、${TOPICS.length} 个模型专题（${topicPages.length} 页）；数据池 ${sites.length} 家，数据日期 ${updatedDate}\n`);
}

await build();
