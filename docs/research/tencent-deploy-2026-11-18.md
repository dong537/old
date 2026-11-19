# 腾讯云养老信源站发布记录（2026-11-18）

## 目标与边界

将当前本地已验收的静态目录发布到 124.223.86.157 的 `/eldercare/`，保持根站论文审核平台与 `/tk-license/` 服务可用。此次只发布 `out/` 打成的静态包，不上传 `data/private/`、原始表格、原型或本地预览服务。站点继续 `noindex`；机构资料仍是带来源日期的快照，不宣称全国同一时点全量在营、实时空床或在线预约。B4 私有新采集页不在公开包内。

## Source of Truth 与部署数据流

- 本地 `data/raw/` 和受授权的企查查原表经构建器投影到 `public/data/`，`NEXT_PUBLIC_ELDERCARE_BASE_PATH=/eldercare` 的 Next 静态导出为 `out/`。本次待上传包为 `output/deploy/eldercare-local-20261118-final.tar.gz`；已有校验元数据记录 10,733 文件和 SHA-256 `e2c2dd9e54b6807e031bf7dde743c4b67d70331e40553897783e3ce072911ecf`，发布前重新核对。
- 远端 ` /var/www/eldercare/releases/<release-id>/eldercare/` 保存不可变版本，`/var/www/eldercare/current` 指向当前版本；现有 Nginx `/eldercare/` location 读取该符号链接。切换只改此链接，不改 `/` 与 `/tk-license/` 的 location、不重启其他容器。
- 公开目录的来源/版本以包内 JSON manifest 为准；用户浏览器 URL 路由与资源路径均带 `/eldercare/`。回滚将 `current` 原子切回部署前记录的旧目标。

## 发布前检查

1. 复核当前源码相对静态包的变更范围、`npm run verify:local-release` 的当日成功日志和当前 TypeScript 门禁；重新核对归档 SHA、逐文件与 `out/` 一致及无原始/私有文件。
2. 记录远端旧 `current`、Nginx 配置哈希、磁盘空间以及 `/`、`/tk-license/`、`/eldercare/` 的 HTTP 基线。确认 SSH 批处理连接。
3. 上传到新的临时目录并在远端核对包 SHA、解包路径、文件数和关键页面，再原子切换 `current`。既有站点配置不改则不重载 Nginx。
4. 切换后核 `/eldercare/` 首页、全国目录、机构详情、JSON、JS/CSS、404、安全/noindex 头及根站、许可服务。失败立即切回旧版本并再次做 smoke。

## 风险与状态

当前工作树有大量既有未提交改动，发布对象锁定为已校验静态包而非 Git HEAD。旧版本完整保留。

## 实际发布与验收（2026-11-18 18:59 CST）

- 本地归档 SHA-256 为 `e2c2dd9e54b6807e031bf7dde743c4b67d70331e40553897783e3ce072911ecf`；归档与当前 `out/` 的 10,733 个文件逐一比较，缺失 0、多余 0、内容一致。远端上传后 SHA-256 相同，解包目录含 10,733 个文件。
- 发布前 `/var/www/eldercare/current` 指向 `/var/www/eldercare/releases/qcc-20261116-dadc439b`。新版本解包至 `/var/www/eldercare/releases/national-20261118-e2c2dd9e` 后，原子切换 `current` 指向新目录。未修改或重载 Nginx；主配置与养老片段发布前后 SHA-256 分别保持 `17ced91a565060e6260d7d1781a5047d0a2dc14bf80cb8c197b829d51dcfd11b`、`701ad7dd096da8129ac072946af7791d5f789ba57688f65cd17481beefbefbe2`。
- `https://124.223.86.157/eldercare/` 和全国官方来源、全国机构线索、两条广州机构详情、三份 JSON manifest、JS/CSS 均返回 200 且内容类型正确；不存在的养老路由返回 404。根站 `/` 与 `/tk-license/` 发布前后均返回 200。HTTP 自动跳转 HTTPS，正常证书验证通过。养老首页返回 `X-Robots-Tag: noindex, nofollow` 与 `X-Content-Type-Options: nosniff` 等既有安全头。
- 真实 Chromium 自测：首页→全国机构线索→广东省 1,746 条来源行→广州市祈福护老公寓有限公司详情，页面加载完成，浏览器控制台错误 0、警告 0。截图为 Git 忽略的 `.playwright-cli/page-2026-11-18T10-58-04-499Z.png`；这是开发者自测，未替代家属用户验收。
- 回滚：在服务器建立指向旧目录 `/var/www/eldercare/releases/qcc-20261116-dadc439b` 的临时符号链接，再用 `sudo mv -Tf` 原子替换 `/var/www/eldercare/current`，随后复测上述路由。旧版本未删除。
- 限制：站点仍 `noindex`；B4 私有采集页未上线；全国数据是不同时间与口径的来源线索/观察，不能称为同一时点、全量、当前在营机构。Python 全套尚有 6 项私有历史审计失败，原生浏览器 200% 缩放未验收，公众纠错渠道尚未设立。
