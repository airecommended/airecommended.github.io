# 2026 API 中转站推荐

面向 GitHub Pages 的原生静态 HTML 选型指南。首页只展示数据源排名前 5 家 AI API 中转站，并提供主流模型价格区间、场景化推荐、渠道风险和接入验收方法。

## 本地运行

```bash
npm run sync
npm test
python3 -m http.server 4173
```

访问 `http://localhost:4173/`。

## 数据和排序

- 默认从 `https://raw.githubusercontent.com/hvoyai/awesome-ai-api/main/data.json` 获取公开快照。
- 构建阶段保留最多 500 条作为专题匹配数据池，首页严格展示原始榜单前 5 名。
- 不对原始排名做随机扰动，不生成长榜单分页。
- GPT、Claude、Codex、Gemini、GLM、Qwen、Kimi 专题页各展示匹配结果前 5 名。

## 部署

GitHub Actions 在推送到 `main`、手动触发以及每天 UTC 02:17 / 14:17 时同步数据、生成 HTML、测试并部署到 GitHub Pages。仓库的 Pages Source 需要设置为 **GitHub Actions**。

生成内容包含 canonical、Open Graph、Twitter Card、JSON-LD、FAQ、Breadcrumb、ItemList、robots.txt 和 sitemap.xml。
