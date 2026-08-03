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

test("首页包含完整 SEO 和静态榜单", async () => {
  const html = await text("index.html");
  assert.match(html, /<title>AI 中转站推荐/);
  assert.match(html, /<meta name="description"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/airecommended\.github\.io\/"/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /"FAQPage"/);
  assert.match(html, /"ItemList"/);
  assert.equal((html.match(/class="station-card"/g) || []).length, 50);
});

test("展示数据最多 500 条且分页不超过 10 页", async () => {
  const data = JSON.parse(await text("data.json"));
  assert.ok(data.sites.length >= 50);
  const dirs = (await readdir(new URL("../page", import.meta.url), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name));
  assert.ok(dirs.length <= 9);
  const pages = [await text("index.html"), ...await Promise.all(dirs.map((entry) => text(`page/${entry.name}/index.html`)))];
  const cards = pages.reduce((sum, html) => sum + (html.match(/class="station-card"/g) || []).length, 0);
  assert.equal(cards, Math.min(500, data.sites.length));
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

test("全部 HTML 的 ID、JSON-LD、canonical 与站内链接有效", async () => {
  const files = await htmlFiles();
  assert.equal(files.length, 18);
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
