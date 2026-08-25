# MovieHome 开发完成概览

## 已完成

- 增加 SQLite 数据库，存储用户、会话和每个用户独立的追剧数据。
- 首次启动没有管理员时，前端自动显示管理员创建页。
- 增加管理员创建、登录、退出、当前用户接口。
- 使用 httpOnly、sameSite Cookie 保存会话，不把会话令牌放到 localStorage。
- 增加管理员用户管理：创建、禁用、启用、删除普通用户。
- 增加登录限流、密码 scrypt 哈希、输入校验、Helmet 安全头、错误处理中间件。
- Docker 改为持久化挂载 `/app/data`，SQLite 数据不随容器重建丢失。
- 增加 Node 原生接口测试，覆盖首次初始化、登录、鉴权、管理员权限和追剧数据隔离。

## 验证结果

- `npm run check` 通过。
- `npm test` 通过，1 个集成测试套件、6 个核心断言流程全部通过。
- `/health` 正常返回 SQLite 状态和首次初始化状态。
- Docker CLI 当前环境未安装，未能执行 `docker compose config`。

## GitHub

- 仓库：`https://github.com/GaoAB1/moviehome`
