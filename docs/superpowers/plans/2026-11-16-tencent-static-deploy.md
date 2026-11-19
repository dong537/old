# Tencent Cloud Static Deployment Implementation Plan

> **For agentic workers:** Use the approved implementation workflow task by task; keep the existing server application available throughout deployment.

**Goal:** 将广州真实养老机构静态目录部署到 124.223.86.157 的 /eldercare/，同时保留现有论文审核平台及 /tk-license/ 服务。

**Architecture:** 本机官方 CSV 和归档 HTML 是目录数据源；构建生成 out/ 静态 HTML、JS、JSON。Nginx 仅把 /eldercare/ 映射到独立的版本目录，不部署 Next/Node 常驻服务、演示原型或本机私有工商数据。

**Tech Stack:** Next.js 15.5 静态导出、React 19、Nginx 1.24、Ubuntu；现有 443 TLS 站点。

## Global Constraints

- 现有 443 根路径反向代理论文审核平台，/tk-license/ 代理另一服务；不得覆盖或重启其容器。
- 发布构建必须通过 npm run verify:release，含类型检查、测试、静态构建和私有字段扫描。
- 仅发布真实目录 out/；prototype/ 为含虚构资料的本机演示，禁止上传。
- IP 站点保持 noindex；没有域名和公开纠错渠道时不声称生产运营或当前全省在营。
- 私钥仅在项目目录外由 SSH 客户端读取；不得写入仓库、构建或服务器。

## 数据流与接口

官方原件 → data/raw/ → data:build → public/data/ 与静态路由 → out/ → 版本化远端目录 → Nginx /eldercare/。页面站内链接、表单、客户端历史状态和静态资产均以 /eldercare 为统一前缀；默认本机无前缀构建须保持兼容。无动态 API、账号、写入或业务审核。源文件更新必须重新构建和部署，不能把快照当实时资料。

## 执行步骤

### Task 1: 路径前缀与构建

- [x] 为真实静态目录增加构建时 /eldercare 前缀，避免原生链接或客户端路由逃出该前缀。
- [x] 跑默认构建测试及带前缀的 npm run verify:release；审计导出 HTML 的 href、src、action 和关键客户端跳转。
- [x] 记录 out/ 文件数、大小与哈希；确认公开产物不含私有工商字段。

### Task 2: 远端旁路发布

- [x] 只读记录现有 Nginx 配置、根站点与 /tk-license/ 的 HTTP 基线，并保存配置备份。
- [x] 将 out/ 上传到 /var/www/eldercare/releases/ 下的新版本目录，核对文件数和内容哈希后以 current 符号链接选中版本。
- [x] 仅在现有 443 server 中新增 /eldercare/ 静态 location，配置原 out/_headers 的安全头与 noindex；保留现有 location 不变。
- [x] 运行 nginx -t 成功后 reload，不重启其他业务。

### Task 3: 验收与回滚

- [x] 验证 /eldercare/、/eldercare/guangzhou/jigou/、机构档案、服务记录、JSON 与静态资产均为 200，未知路由为 404。
- [x] 核对 noindex 与安全响应头，并复查根站点和 /tk-license/ 仍正常。
- [x] 留存原 Nginx 配置备份与版本化目录切换机制；本次未触发故障回滚。
- [x] 记录构建命令、产物摘要、部署路径、HTTP/browser 自测与未解决的浏览器访问限制。

## 失败模式

SSH、上传或哈希核对失败时不修改 Nginx；配置语法失败时不 reload；路由或静态资源越过 /eldercare/ 时先修正构建再部署。站点没有公众纠错渠道且数据为历史快照，部署后仍按带 noindex 的验收站点标注。
