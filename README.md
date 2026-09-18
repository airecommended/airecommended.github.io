# 2026 API 中转站推荐

GitHub Pages 静态站点：每页 1000 家的完整站点目录和七个模型专题，桌面每排 4 家、平板 2 家、手机 1 家。卡片展示名称、检测成功率、累计检测次数、成功次数和最近检测日期；无检测样本时展示简短公开介绍。

站点还包含渠道分组科普、选站避坑、关于本站和 AI 新闻模块：`/guides/channel-groups/`、`/pitfalls/`、`/about/`、`/news/`。新闻目录包含来源站点的文章详情并生成静态分页，内容同步后直接写入 HTML，便于搜索引擎抓取。首页会明确显示数据快照日期；`sitemap.xml` 的 `lastmod` 使用本次静态构建日期，因此每日任务即使上游快照没有变化，也能反映页面确实重新构建。

## 本地更新

```bash
npm run sync:all   # 导出本地数据库 + 拉取公开榜单 + 构建
npm test
python3 -m http.server 4173
```

- `npm run sync`：只更新公开榜单，并使用已有数据库快照构建。
- `npm run sync:db`：只更新数据库快照并构建。
- `npm run build`：从现有两个快照构建，不访问网络或数据库。可用 `BUILD_DATE=YYYY-MM-DD` 固定 sitemap 的构建日期；不设置时使用构建当天日期。

`npm run sync` 还会同步上述内容页面和新闻文章；内容缓存保存在 `scripts/editorial-cache.json`，普通 `npm run build` 使用缓存重新生成 HTML。

默认数据库：`localhost:55432`，用户 `postgres`，库 `hvoyverify`。需要系统安装 `psql`；可通过 `PSQL_BIN`、`PGHOST`、`PGPORT`、`PGUSER`、`PGDATABASE`、`PGPASSWORD` 或 `.pgpass` 配置。导出使用只读一致性事务，失败保留原文件。

## 部署与持续更新

GitHub Actions 在推送 main、手动触发、每天 UTC 02:17 时重新拉取最新公开榜单、构建、测试并部署。Pages API 临时返回 500 时，部署步骤会自动重试三次。检测卡片的“最近检测”显示构建当天日期，每日任务会自动刷新。Pages Source 设为 GitHub Actions。数据只嵌入生成的 HTML 页面；JSON 文件仅作为构建中间快照，不参与页面访问。
