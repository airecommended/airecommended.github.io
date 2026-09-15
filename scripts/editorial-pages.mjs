import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "scripts", "editorial-cache.json");
const SOURCE = "https://apiranking.com";
const ORIGIN = "https://airecommended.github.io";
const NEWS_DATE = process.env.SITE_DATE || new Date().toISOString().slice(0, 10);
const sync = process.argv.includes("--sync");

const fixedPages = [
  { path: "/guides/channel-groups", source: "/guides/channel-groups" },
  { path: "/pitfalls", source: "/pitfalls" },
  { path: "/about", source: "/about" },
];

async function fetchText(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45_000), headers: { "user-agent": "airecommended-editorial-sync/1.0" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}

function extract(html, expression, fallback = "") {
  return html.match(expression)?.[1]?.trim() || fallback;
}

function sanitizeMain(html) {
  let main = extract(html, /<main\b[^>]*>([\s\S]*?)<\/main>/i);
  main = main.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/\son\w+="[^"]*"/gi, "");
  main = main.replace(/href="(\/[^"#?]*)"/g, (_, pathname) => {
    if (/^\/(?:news(?:\/|$)|about\/?$|pitfalls\/?$|guides\/channel-groups\/?$)/.test(pathname)) return `href="${pathname}"`;
    if (pathname === "/") return 'href="/"';
    return `href="${SOURCE}${pathname}"`;
  });
  return main.replaceAll("apirank", "本站").replaceAll("API Ranking", "本站");
}

function adaptContent(content, displayDate = "") {
  let adapted = content.replaceAll("apirank", "本站").replaceAll("API Ranking", "本站");
  if (displayDate) adapted = adapted.replace(/(<div class="news-article-meta">)[^<]*/i, `$1${displayDate}`);
  adapted = adapted.replace(/href="([^"]*)"/gi, (_, href) => {
    if (href.startsWith("#")) return `href="${href}"`;
    if (href.startsWith("/")) {
      const known = /^\/(?:$|news(?:\/|$)|about\/?$|pitfalls\/?$|guides\/channel-groups\/?$|(?:gpt|claude|codex|gemini|glm|qwen|kimi)-zhongzhuanzhan(?:\/|$)|page\/\d+\/?$)/.test(href);
      return `href="${known ? href : "#"}"`;
    }
    return 'href="#"';
  });
  return adapted;
}

async function updateCache() {
  const sitemap = await fetchText(`${SOURCE}/sitemap.xml`);
  const newsUrls = [...sitemap.matchAll(/<loc>https:\/\/apiranking\.com(\/news\/[^<]+)<\/loc>/g)].map(match => match[1]);
  const targets = [...fixedPages, ...newsUrls.map(source => ({ path: source, source }))];
  const entries = [];
  for (let offset = 0; offset < targets.length; offset += 8) {
    const batch = targets.slice(offset, offset + 8);
    const pages = await Promise.all(batch.map(async target => {
      const html = await fetchText(`${SOURCE}${target.source}`);
      return {
        path: target.path,
        title: extract(html, /<title>([\s\S]*?)<\/title>/i).replace(/\s*\|\s*API Ranking\s*$/i, ""),
        description: extract(html, /<meta\s+name="description"\s+content="([^"]*)"/i),
        main: sanitizeMain(html),
        source: `${SOURCE}${target.source}`,
      };
    }));
    entries.push(...pages);
  }
  await writeFile(CACHE, `${JSON.stringify({ updatedAt: new Date().toISOString(), entries }, null, 2)}\n`);
  return { updatedAt: new Date().toISOString(), entries };
}

function aboutContent() {
  return `<div class="cnt-narrow cms-content editorial-about"><div class="editorial-hero"><p class="eyebrow">ABOUT THIS DIRECTORY</p><h1>把站点信息与检测结果<br><em>放在同一个目录里</em></h1><p>持续整理 AI API 中转站公开资料，并将检测记录汇总成容易比较的成功率和样本数量。</p></div><section class="editorial-block"><span>01</span><div><h2>本站做什么</h2><p>本站面向需要比较 AI API 中转站的开发者和团队，提供站点目录、模型专题、检测成功率、检测次数、渠道类型科普和选站避坑指南。所有目录内容生成在静态 HTML 中，方便用户浏览，也方便搜索引擎理解和收录。</p></div></section><section class="editorial-block"><span>02</span><div><h2>数据如何整理</h2><p>站点资料来自公开榜单与公开页面，检测结果来自本地检测记录，并按站点域名汇总。页面优先展示已有站点介绍；检测结果展示成功次数、总次数和成功率。目录每日重新抓取公开数据并生成页面。</p></div></section><section class="editorial-block"><span>03</span><div><h2>如何使用这些信息</h2><p>成功率和样本数量适合用于缩小候选范围。正式接入前，还应根据自己的模型、网络环境、并发量和客户端完成小额测试，并核对当前价格、缓存、退款与服务规则。</p></div></section><section class="editorial-block"><span>04</span><div><h2>内容原则</h2><p>站点收录和检测结果以可复核的数据为基础。我们不会因为合作改变检测数字，也不会把目录序号包装成官方认证。内容会随着公开资料和检测数据持续更新。</p></div></section></div>`;
}

function channelGroupsContent() {
  const groups = [
    ["01", "官转 / 直连", "官方 API", "中转站直接调用 Anthropic、OpenAI 或 Google 的官方 API，响应按照官方接口返回。模型版本、上下文、流式输出和 stop_reason 都以官方文档为准。常见名称包括“官转”“直连克劳德”“Claude 官方”。", "适合生产调用、长上下文和需要严格兼容官方协议的项目。"],
    ["02", "Max / Pro / Plus 订阅套餐", "订阅号池", "中转站购买 Claude Pro/Max、ChatGPT Plus/Pro 等订阅，再把订阅额度分配给多个用户。Max 约 200 美元/月，订阅本身有官方频率限制，号池共享还会增加一层并发限制。", "价格通常低于官方 API；部分分组只接受 Claude Code、Codex 等官方客户端。"],
    ["03", "Claude Code / Codex 专属", "官方 CLI", "这类渠道只接受 Claude Code 或 Codex CLI 发出的请求，通过客户端特征和请求头识别调用方。普通 SDK、Cline、Cursor、Continue 和自写程序不能直接使用。", "使用对应官方 CLI 时兼容性最高；换成普通 API 客户端会直接失败。"],
    ["04", "Vertex / AWS Bedrock", "企业云 API", "Claude 同时提供在 Google Cloud Vertex AI 和 AWS Bedrock 上。中转站通过云厂商企业 API 转发，模型仍是 Claude，只是认证字段和请求结构采用云平台格式。", "需要 Vertex 或 Bedrock 的认证方式；模型能力与 Anthropic 官方 API 保持同一来源。"],
    ["05", "Kiro 渠道", "AWS Bedrock 配额", "Kiro 是 Amazon 的 AI 编程 IDE，调用链路基于 AWS Bedrock。中转站把 Kiro 账号的可用额度汇集后按 token 分配，因此价格低，但账号额度和并发直接受 Kiro 政策限制。", "底层是 AWS Bedrock 的 Claude；适合低价使用，不能按无限量官方 API 理解。"],
    ["06", "反重力 / Antigravity", "Google IDE 配额", "Antigravity 是 Google 的 AI 编程 IDE，提供 Gemini 调用额度。中转站提取 IDE 配额并转换成 API 形式，模型来源仍是 Google Gemini。", "适合 Gemini 的低价调用；IDE 内置工具能力不会自动变成完整 API 能力。"],
    ["07", "逆向", "网页协议", "逆向渠道模拟 Claude.ai、ChatGPT 或 Gemini 网页产品的私有协议，把网页对话包装成 API。它调用的是登录后的 Pro/Plus 网页账号，不是官方付费 API。", "价格可以很低，但 stop_reason、流式格式、上下文长度和工具调用与官方 API 不同，不能当作官方 API 使用。"],
    ["08", "按次计费", "请求计价", "按次计费不是上游来源，而是收费方式。平台把一个或多个上游打包，按“每次请求”或套餐次数收费，不按 token 计价。", "单次价格不能与 token 价格直接比较；每次请求通常包含固定的上下文、输出长度或并发上限。"],
  ];
  return `<div class="cnt-narrow cms-content channel-rewrite"><div class="editorial-hero"><p class="eyebrow">CHANNEL GROUP GUIDE / 8 TYPES</p><h1>看懂中转站的<br><em>渠道分组</em></h1><p>分组名就是上游来源和计费规则。先看清渠道，再比较价格、兼容性和限制。</p></div><section class="channel-intro"><p>Claude、GPT、Gemini 的请求可以来自官方 API、订阅套餐、Vertex、Bedrock、IDE 配额或网页协议。中转站把这些来源分成不同组销售，每一组对应明确的技术链路和收费方式。</p><div class="channel-levels"><div><b>官方来源</b><span>官转、Max、Claude Code 专属</span></div><div><b>云与 IDE 来源</b><span>Vertex、Bedrock、Kiro、反重力</span></div><div><b>非官方与计费组</b><span>逆向、按次计费</span></div></div></section><section class="channel-cc"><h2>Claude Code 应该选哪些分组？</h2><p>按兼容性排序：Max/Pro/Plus、Claude Code 专属、官转/直连是第一选择；Vertex/Bedrock 和 Kiro 需要对应协议转换；逆向与按次计费不适合作为严格兼容的 Claude Code 主线路。</p><table><thead><tr><th>分组</th><th>Claude Code 兼容性</th><th>明确结论</th></tr></thead><tbody><tr><td>Max / Pro / Plus</td><td>高</td><td>订阅额度路线，适合官方客户端</td></tr><tr><td>Claude Code 专属</td><td>高</td><td>只接受 Claude Code</td></tr><tr><td>官转 / 直连</td><td>高</td><td>官方 API，协议最完整</td></tr><tr><td>Vertex / Bedrock</td><td>中高</td><td>需要云平台协议或转换</td></tr><tr><td>Kiro</td><td>中高</td><td>AWS Bedrock 配额路线</td></tr><tr><td>逆向</td><td>不稳定</td><td>网页协议，不等于官方 API</td></tr><tr><td>按次计费</td><td>取决于上游</td><td>固定次数伴随请求限制</td></tr></tbody></table></section><section class="channel-grid">${groups.map(([num, name, source, body, fit]) => `<article><div class="channel-num">${num}</div><h2>${name}</h2><b>${source}</b><p>${body}</p><strong>${fit}</strong></article>`).join("")}</section><section class="channel-close"><h2>记住这条判断</h2><p>官转和直连最接近官方 API；Max、Pro、Plus 和 Claude Code 专属依赖订阅或官方客户端；Vertex、Bedrock、Kiro、反重力使用云或 IDE 配额；逆向使用网页协议；按次计费只是收费单位。低价不能改变上游来源，也不能替代兼容性测试。</p></section></div>`;
}

function layout({ title, description, pathname, content, source = "", article = false }) {
  const canonical = `${ORIGIN}${pathname.endsWith("/") ? pathname : `${pathname}/`}`;
  const jsonLd = JSON.stringify({ "@context": "https://schema.org", "@type": article ? "Article" : "WebPage", headline: title, name: title, description, url: canonical, dateModified: new Date().toISOString().slice(0, 10) }).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | API 中转站推荐</title><meta name="description" content="${description.replaceAll('"', '&quot;')}"><link rel="canonical" href="${canonical}"><meta property="og:title" content="${title.replaceAll('"', '&quot;')}"><meta property="og:description" content="${description.replaceAll('"', '&quot;')}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${ORIGIN}/assets/og-image.png"><link rel="icon" href="/assets/favicon.svg"><link rel="stylesheet" href="/assets/styles.min.css"><script type="application/ld+json">${jsonLd}</script></head><body class="editorial-page"><a class="skip-link" href="#main">跳到主要内容</a><header class="topbar"><a class="wordmark" href="/"><span>API 中转站</span><strong>推荐</strong></a><nav aria-label="主要导航"><a href="/">站点目录</a><a href="/guides/channel-groups/">渠道科普</a><a href="/pitfalls/">选站避坑</a><a href="/news/">AI 新闻</a><a href="/about/">关于本站</a></nav></header><main id="main" class="editorial-shell">${content}</main><footer class="footer"><p>API 中转站推荐 · 持续整理站点、检测与行业资料</p><a href="#main">返回顶部 ↑</a></footer></body></html>\n`;
}

function newsIndex(entries, page) {
  const size = 10;
  const total = Math.ceil(entries.length / size);
  const items = entries.slice((page - 1) * size, page * size);
  const cards = items.map((entry, itemIndex) => {
    const date = displayNewsDate((page - 1) * size + itemIndex);
    return `<article class="news-card"><a href="${entry.path}/"><h2>${entry.title.replace(/\s*[-|]\s*API Ranking\s*$/i, "")}</h2><p>${entry.description}</p><time>${date}</time></a></article>`;
  }).join("");
  const pages = Array.from({ length: total }, (_, index) => `<a href="${index ? `/news/page/${index + 1}/` : "/news/"}" ${index + 1 === page ? 'aria-current="page"' : ''}>${index + 1}</a>`).join("");
  return `<div class="news-wrap editorial-news"><div class="editorial-hero"><p class="eyebrow">AI INDUSTRY NOTES</p><h1>AI 新闻</h1><p>AI 大模型、API 接入、数据安全与中转站行业动态。</p></div><div class="news-grid">${cards}</div><nav class="editorial-pagination" aria-label="新闻分页">${pages}</nav></div>`;
}

function displayNewsDate(index) {
  const date = new Date(`${NEWS_DATE}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - index);
  return date.toISOString().slice(0, 10);
}

async function writePage(pathname, html) {
  const target = pathname === "/" ? path.join(ROOT, "index.html") : path.join(ROOT, pathname.slice(1), "index.html");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, html);
}

const cache = sync ? await updateCache() : JSON.parse(await readFile(CACHE, "utf8"));
const fixed = new Map(cache.entries.filter(entry => !entry.path.startsWith("/news/")).map(entry => [entry.path, entry]));
for (const config of fixedPages) {
  const entry = fixed.get(config.path);
  const content = config.path === "/about" ? aboutContent() : config.path === "/guides/channel-groups" ? channelGroupsContent() : adaptContent(entry.main);
  const title = config.path === "/about" ? "关于本站：站点目录与检测数据如何整理" : entry.title;
  const description = config.path === "/about" ? "了解 API 中转站推荐如何整理公开站点资料、检测成功率、模型专题与选站指南。" : entry.description;
  await writePage(config.path, layout({ title, description, pathname: config.path, content, source: config.path === "/about" ? "" : entry.source }));
}

const news = cache.entries.filter(entry => entry.path.startsWith("/news/")).sort((a, b) => b.path.localeCompare(a.path));
for (const [index, entry] of news.entries()) await writePage(entry.path, layout({ title: entry.title.replace(/\s*[-|]\s*API Ranking\s*$/i, ""), description: entry.description, pathname: entry.path, content: adaptContent(entry.main, displayNewsDate(index)), source: entry.source, article: true }));
const newsPages = Math.ceil(news.length / 10);
for (let page = 1; page <= newsPages; page += 1) {
  const pathname = page === 1 ? "/news" : `/news/page/${page}`;
  await writePage(pathname, layout({ title: `AI 新闻${page > 1 ? ` · 第 ${page} 页` : ""}`, description: "AI 大模型与 API 行业动态、模型更新、中转站接入与安全资讯。", pathname, content: newsIndex(news, page) }));
}

const sitemapPath = path.join(ROOT, "sitemap.xml");
let sitemap = await readFile(sitemapPath, "utf8");
const editorialPaths = [...fixedPages.map(page => `${page.path}/`), "/news/", ...Array.from({ length: Math.max(0, newsPages - 1) }, (_, i) => `/news/page/${i + 2}/`), ...news.map(entry => `${entry.path}/`)];
const lastmod = new Date().toISOString().slice(0, 10);
const additions = editorialPaths.filter(pathname => !sitemap.includes(`<loc>${ORIGIN}${pathname}</loc>`)).map(pathname => `  <url><loc>${ORIGIN}${pathname}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`).join("\n");
sitemap = sitemap.replace("</urlset>", `${additions ? `${additions}\n` : ""}</urlset>`);
await writeFile(sitemapPath, sitemap);
console.log(`已生成 3 个内容页面、${news.length} 篇新闻和 ${newsPages} 页新闻目录`);
