# MovieHome 项目交付概览

## 已完成

- 完成 MovieHome 影视聚合 Web 应用，工作区位于 `D:\Code\影视聚合`。
- 使用 Apple 风格暗色影院视觉：玻璃导航、深色背景、系统字体、响应式布局和浅色/深色主题切换。
- 首页包含精选 Hero、接着看、新上电影、新上剧集、正在热门、值得重温等分区。
- 详情弹窗展示 TMDB 基础信息，并预留豆瓣、烂番茄、爆米花、TMDB 四类评分卡片。
- 追剧页支持加入/移除收藏、状态筛选、修改已看集数、进度条和自动状态更新。
- 服务端提供 TMDB 代理、健康检查、首页聚合、详情、追剧增删改接口；未配置 TMDB Key 时使用演示数据。
- 数据层已从 JSON 迁移到 SQLite，支持用户、会话和追剧数据隔离。
- 已增加首次启动管理员创建、登录/退出、基于 HttpOnly Cookie 的会话、管理员用户管理和普通用户权限隔离。
- 使用 `scrypt` 密码摘要、`timingSafeEqual` 密码校验、Helmet 安全响应头、Cookie 安全属性和登录频率限制。
- 提供 `Dockerfile`（多阶段构建）、`docker-compose.yml`、`.env.example`；SQLite 数据目录通过 Docker Volume 持久化。
- 新增 GitHub Actions CI（`.github/workflows/ci.yml`）：push/PR 自动执行语法检查与接口测试；main 分支推送自动构建 Docker 镜像并推送到 GHCR。
- GitHub 仓库：<https://github.com/GaoAB1/moviehome>。

## 验证结果

- `npm run check` 通过，服务端、数据库、前端和测试文件均可通过 Node 语法检查。
- `npm test` 通过：1 个串行接口测试通过，覆盖首次管理员初始化、登录、用户创建、数据隔离和权限校验。
- GitHub Actions `语法检查与接口测试` job 通过（npm ci + check + test 全绿）。
- GitHub Actions `构建 Docker 镜像并推送 GHCR` job 通过，镜像推送至 `ghcr.io/gaoab1/moviehome`。
- GitHub 远程全部关键文件已与本地逐字节一致（ci.yml / Dockerfile / app.js / index.html / styles.css / server.js / database.js / overview.md / test/api.test.js / package-lock.json）。
- Docker Compose 未在当前环境本机运行验证（本机无 Docker CLI）；容器配置与多阶段 Dockerfile 已由 GitHub Actions 实际构建验证。

## 使用方式

```bash
npm install
npm start
```

打开 `http://localhost:3000`。首次启动时按页面提示创建管理员账户；生产环境请设置随机的 `PASSWORD_PEPPER`，并在 HTTPS 环境启用 `COOKIE_SECURE=true`。

Docker 部署（或直接拉取 GHCR 镜像）：

```bash
docker pull ghcr.io/gaoab1/moviehome:latest
docker compose up -d --build
```

## 后续建议

1. 配置 `TMDB_API_KEY` 接入真实 TMDB 数据。
2. 通过合规授权 API 或数据服务补齐豆瓣、烂番茄、爆米花评分适配器。
3. 在具备 Docker CLI 的机器上执行 `docker compose up -d`，验证容器内首次初始化和 SQLite 持久化。
