# MovieHome

MovieHome 是一个 Apple 风格的影视聚合 Web 应用，支持 TMDB 聚合、用户登录、管理员初始化、用户管理、追剧进度和 SQLite 持久化。

## 首次启动

第一次启动且 SQLite 中没有管理员账户时，访问首页会自动显示管理员创建页。创建成功后自动登录并进入首页。

## 本地运行

```bash
npm install
npm start
```

打开 `http://localhost:3000`。

## 环境变量

复制 `.env.example` 为 `.env`：

```env
TMDB_API_KEY=你的TMDB_API_KEY
TMDB_LANGUAGE=zh-CN
PORT=3000
DATA_DIR=./data
COOKIE_SECURE=false
PASSWORD_PEPPER=随机长字符串
```

生产环境建议：

- 使用 HTTPS，并将 `COOKIE_SECURE=true`
- 设置高强度 `PASSWORD_PEPPER`
- 备份 `data/moviehome.sqlite`
- 不要将 `.env` 提交到 Git

## Docker

```bash
docker compose up -d --build
```

SQLite 数据保存在 Docker volume `moviehome_data` 中。

## API 概览

- `GET /health`
- `GET /api/setup-status`
- `POST /api/setup/admin`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/users`（管理员）
- `POST /api/users`（管理员）
- `PATCH /api/users/:id`（管理员）
- `DELETE /api/users/:id`（管理员）
- `GET /api/home`（登录后）
- `GET /api/title/:mediaType/:id`（登录后）
- `GET /api/watchlist`（登录后）
- `POST /api/watchlist`（登录后）
- `PATCH /api/watchlist/:id`（登录后）
- `DELETE /api/watchlist/:id`（登录后）

## 评分源说明

TMDB 已接入。豆瓣、烂番茄和爆米花评分保留独立适配器展示位，正式接入时建议使用合规授权 API 或数据服务。
