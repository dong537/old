# GitHub CI/CD 方案（2026-11-21）

## 目标与边界

- 用户：维护全国养老信源目录的开发者；目标是让每次提交接受既有验证，并能从 GitHub 手动发布一个可回滚的静态版本到腾讯云验收站。
- 成功标准：PR 和推送仍通过现有 Verify release；手动发布仅允许 main，使用 /eldercare 前缀构建、运行完整门禁、保留归档、校验远端文件并以版本标记完成 HTTP 验收；失败时切回旧版本。
- 本次不自动在 main 推送时切换线上站点，不更改 Nginx、根站、/tk-license/、采集脚本或数据。当前站点仍带 noindex，不把验收站宣称为正式生产发布。

## Source of Truth 与接口

- GitHub main 提交及已纳入 Git 的公开来源文件是构建输入；本机 data/private、私有 XLSX、未提交采集结果和缓存不进入 Actions。已有 npm run verify:release 是类型检查、测试、静态构建及公开产物扫描的权威门禁。
- 构建时 NEXT_PUBLIC_ELDERCARE_BASE_PATH=/eldercare；Next.js output: export 生成 out/，在 out/release.txt 写入本次提交 SHA，归档并生成 SHA-256。该标记只用于发布验收。
- 部署作业只从同一工作流的构建作业下载归档，GitHub Environment 名为 tencent-preview。部署目标固定为 124.223.86.157 的 /var/www/eldercare；端口可由 ELDERCARE_SSH_PORT 变量设定，账号由 ELDERCARE_SSH_USER 变量设定。私钥 ELDERCARE_SSH_PRIVATE_KEY 和经独立核对的主机公钥记录 ELDERCARE_SSH_KNOWN_HOSTS 只能放 Environment Secrets。
- 远端 deploy-release.sh 只接受数字 run ID 与重试次数构成的 run key、40 位十六进制提交 SHA 和归档目录。先校验 SHA-256、静态首页和 release.txt，写入 releases/gha-<run-key>-<sha>/eldercare/，再原子切换 current 软链接。Nginx 只读 current/eldercare/；已发布目录不原地覆盖。测试时允许用 ELDERCARE_DEPLOY_ROOT 指向临时目录，工作流不传此变量。

## 数据流、失败与回滚

main → Actions checkout → npm ci → verify:release → out/ + release.txt → tar.gz/SHA-256 → Actions artifact → SSH 上传 → releases/新版本 → current 软链接 → HTTPS release.txt 对照提交 SHA。

- 缺少 Environment 变量/密钥、SSH 连接或主机密钥不匹配时，在切换前失败；不使用临时 ssh-keyscan 结果跳过校验。
- 校验和、归档内容或首页检查失败时不切换；版本目录可以保留供审计。发布与回滚共用服务器端 flock 锁，切换前还会复核 current；其他管理员也应通过同一脚本发布。若 HTTP 标记检查失败，只有 current 仍指向本次版本时才原子恢复上一个软链接，避免覆盖其他人的后续发布。
- 发布用户仅需对 /var/www/eldercare 下的版本和 current 软链接有写权限，不需要修改 Nginx 或其他站点。不能用本机私钥或对话中出现的密钥填入仓库。

## 验证与未决条件

- 本地验证部署脚本的正常发布、哈希失败和回滚；解析 Actions YAML；推送后核对 GitHub CI 运行结果。
- 真正远端发布前，还须在 GitHub Environment 配置专用 SSH 账号、私钥、可信 known_hosts，确认 SSH 端口连通，并在 GitHub 设置需要的审批人。没有这些条件时，CD 是可手动触发的发布流程，但不能声称已完成线上部署。
- Actions 从 Git 中构建，不运行依赖本机私有原件的 verify:local-release；数据版本升级仍需独立复核后提交公开快照。

## GitHub 与服务器配置步骤

1. 在仓库 Settings → Environments 建立 tencent-preview，按团队需要设置 Required reviewers；手动触发本身已阻止普通推送自动部署。
2. 在该 Environment 的 Variables 中设置 ELDERCARE_SSH_USER；SSH 若不在 22 端口，另设 ELDERCARE_SSH_PORT。主机和公开验收 URL 由工作流固定为现有 IP，不从用户输入拼接。
3. 在 Environment Secrets 中设置专用部署私钥 ELDERCARE_SSH_PRIVATE_KEY，以及从服务器控制台独立核对指纹后的完整 known_hosts 行 ELDERCARE_SSH_KNOWN_HOSTS。非 22 端口的行应使用 [124.223.86.157]:端口 格式。不得把私钥、聊天记录里的旧凭据或未经核对的 ssh-keyscan 输出提交到仓库。
4. 服务器部署账号须能写 /var/www/eldercare/releases/ 及 /var/www/eldercare/current 所在目录，并已有指向旧版本的 current 软链接；只授予该目录的权限，不授予改动 Nginx、根站或 /tk-license/ 的权限。先从 Actions Runner 确认 SSH 端口可达。
5. 在 Actions → Deploy eldercare preview → Run workflow 选择 main；构建作业先验证并保存 14 天的归档。若 Environment 已配置 Required reviewers，部署作业先等待审批；否则手动触发后直接上传并切换。成功日志应显示提交 SHA，公开 release.txt 与之相同。失败时查看回滚作业与 current 指向；不要因为归档已生成就认定已上线。
