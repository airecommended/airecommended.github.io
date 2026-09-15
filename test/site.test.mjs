import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const root = fileURLToPath(new URL("../", import.meta.url));

async function htmlFiles(directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries
    .filter((entry) => entry.name !== ".git" && entry.name !== "node_modules" && entry.name !== "design-system")
    .map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return htmlFiles(target);
      return entry.isFile() && entry.name.endsWith(".html") ? [target] : [];
    }));
  return nested.flat();
}

test("首页展示1000家简短卡片及来源日期", async () => {
  const html = await text("index.html");
  const data = JSON.parse(await text("combined-data.json"));
  assert.match(html, /站点目录<\/title>/);
  assert.match(html, /<meta name="description"/);
  assert.match(html, new RegExp(`dateModified":"${data.updatedDate}"`));
  assert.match(html, /"ItemList"/);
  assert.equal((html.match(/class="station-card"/g) || []).length, Math.min(1000, data.sites.length));
  assert.doesNotMatch(html, /class="station-highlight"|class="metric-grid"/);
  assert.match(html, /每页 1000 家/);
});

test("榜单文字不小于 14px 且站点行使用交替配色", async () => {
  const css = await text("assets/styles.css");
  const explicitSizes = [...css.matchAll(/(?:font-size:\s*|font:\s*[^;{}]*?)(\d+)px/g)]
    .map((match) => Number(match[1]));
  assert.ok(explicitSizes.length > 0);
  assert.ok(explicitSizes.every((size) => size >= 14), `发现小于 14px 的字号：${explicitSizes.filter((size) => size < 14).join(", ")}`);
  assert.match(css, /\.station-card:nth-child\(4n \+ 1\)/);
  assert.match(css, /\.station-card:nth-child\(4n \+ 2\)/);
});

test("分页覆盖所有站点且没有重复或遗漏", async () => {
  const data = JSON.parse(await text("combined-data.json"));
  const total = Math.ceil(data.sites.length / 1000);
  const ids = [];
  for (let page = 1; page <= total; page++) {
    const html = await text(page === 1 ? "index.html" : `page/${page}/index.html`);
    const entries = [...html.matchAll(/class="station-card" id="rank-(\d+)"/g)].map(m => Number(m[1]));
    assert.equal(entries.length, Math.min(1000, data.sites.length - (page - 1) * 1000));
    ids.push(...entries);
  }
  assert.deepEqual(ids, Array.from({ length: data.sites.length }, (_, i) => i + 1));
  assert.match(await text("assets/styles.css"), /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
});

test("关键爬虫文件和专题页存在", async () => {
  assert.match(await text("robots.txt"), /sitemap\.xml/);
  assert.match(await text("sitemap.xml"), /<loc>https:\/\/airecommended\.github\.io\/gpt-zhongzhuanzhan\/<\/loc>/);
  for (const slug of ["gpt", "claude", "codex", "gemini", "glm", "qwen", "kimi"]) {
    const html = await text(`${slug}-zhongzhuanzhan/index.html`);
    assert.match(html, /<html lang="zh-CN">/);
    assert.match(html, /<link rel="canonical"/);
  }
});

test("新闻列表日期从构建日开始按文章顺序递减", async () => {
  const html = await text("news/index.html");
  const dates = [...html.matchAll(/<time>(\d{4}-\d{2}-\d{2})<\/time>/g)].map(match => match[1]);
  assert.ok(dates.length >= 2);
  assert.equal(dates[0], "2026-09-15");
  for (let index = 1; index < dates.length; index += 1) {
    const previous = new Date(`${dates[index - 1]}T00:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    assert.equal(dates[index], previous.toISOString().slice(0, 10));
  }
});

test("全部 HTML 的 ID、JSON-LD、canonical 与站内链接有效", async () => {
  const files = await htmlFiles();
  assert.ok(files.length >= 20);
  for (const file of files) {
    const html = await readFile(file, "utf8");
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${file} 存在重复 id`);

    const is404 = file.endsWith(`${path.sep}404.html`);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, `${file} 必须只有一个 h1`);
    if (!is404) {
      assert.equal((html.match(/<link rel="canonical"/g) || []).length, 1, `${file} canonical 数量错误`);
      assert.equal((html.match(/<meta name="description"/g) || []).length, 1, `${file} description 数量错误`);
      for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        assert.doesNotThrow(() => JSON.parse(match[1]), `${file} JSON-LD 无法解析`);
      }
    }

    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] || "https://airecommended.github.io/404.html";
    for (const match of html.matchAll(/href="([^"]+)"/g)) {
      const href = match[1];
      if (href.startsWith("#") || /^(https?:|mailto:|tel:)/.test(href)) continue;
      const url = new URL(href, canonical);
      if (url.hostname !== "airecommended.github.io") continue;
      const pathname = decodeURIComponent(url.pathname);
      const target = pathname.endsWith("/")
        ? path.join(root, pathname.slice(1), "index.html")
        : path.join(root, pathname.slice(1));
      await assert.doesNotReject(access(target), `${file} 的站内链接不存在：${href}`);
    }
  }
});
