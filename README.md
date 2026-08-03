# 2026最全中转站推荐

面向 GitHub Pages 的原生静态 HTML 排名站。站点最多展示 500 家 AI API 中转站，并为每 50 条数据生成一个可直接索引的静态分页。

## 本地运行

```bash
npm run sync
npm test
python3 -m http.server 4173
```

访问 `http://localhost:4173/`。

## 数据和排序

- 默认从 `https://raw.githubusercontent.com/hvoyai/awesome-ai-api/main/data.json` 获取公开快照。
- 构建阶段最多取原始榜单前 500 条。
- 排名按数据日期做稳定的小幅扰动，只影响相邻名次，并在生成后重新编号。
- 每页 50 条，另生成 GPT、Claude、Codex、Gemini、GLM、Qwen、Kimi 专题页面。

## 部署

GitHub Actions 在推送到 `main`、手动触发以及每天 UTC 02:17 / 14:17 时同步数据、生成 HTML、测试并部署到 GitHub Pages。仓库的 Pages Source 需要设置为 **GitHub Actions**。

生成内容包含 canonical、Open Graph、Twitter Card、JSON-LD、FAQ、Breadcrumb、ItemList、robots.txt、sitemap.xml 和语义化分页。
