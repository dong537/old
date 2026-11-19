# 湖南省养老服务机构公开附件核验（2026-11-19）

## 目的与范围

仅寻找无需申请的湖南省官方逐家名录，用作全国养老服务信息平台（MCA）采集结果的省级漏采对照；不替代 MCA 原始列表/详情，不推断当前在营，不进入网站 `public/`。本轮未请求 MCA 数据接口。

## 已核实的官方页面

- 页面：<https://mzt.hunan.gov.cn/mzt/xxgk/tzgg/202604/t20260414_33953898.html>。2026-11-19T02:19:01Z 匿名普通 GET 返回 HTTP 200、`text/html`，原始 HTML 18,350 字节，SHA-256 `016a4a6909e1c5900e5ca7458e101f4c2aac759f739db09a3d7bbd2a0501c88e`。原件及元数据在 Git 忽略的 `data/private/mca-hunan-crosscheck-20261119/`。
- 页面标题与附件文字均为《养老服务机构信息表（2025年版）》。正文写明根据“金民工程”全国养老服务信息系统**截至 2026-01-09** 的数据公示本省信息；页面可见时间为 **2026-01-12 10:38**。URL 的 `/202604/` 不作为发布日期。页面页脚标示主办单位湖南省民政厅。
- 官方 HTML 中直接链接相对路径 `33953898/files/20e64faae4254f05a710b719aa04ab88.xlsx`；解析后的附件 URL 为 <https://mzt.hunan.gov.cn/mzt/xxgk/tzgg/202604/33953898/files/20e64faae4254f05a710b719aa04ab88.xlsx>。
- 对该站 `/robots.txt` 一次普通 GET 返回 HTTP 404；没有取得可解析 robots 规则。页面正文/页脚未见逐行商用再分发许可或限制声明，**公开可读不等于获准批量再展示**。

## 附件结果与停止点

初次对官方 HTML 中的附件 URL 尝试一次匿名 GET，PowerShell `Invoke-WebRequest` 在收到完整 HTTP 响应前报 `IOException: 从传输流收到意外的 EOF 或 0 个字节。`；没有源站 HTTP 状态码或文件字节。初次记录在 `attachment-attempt.json`。

后续获准对**同一 URL** 再作一次普通匿名传输重试：系统 `curl.exe` 设置 `--retry 0`，不更换代理/IP/身份，不绕证书或挑战。2026-11-19T02:25:50—02:25:55Z 返回退出码 **35**，报 `schannel: failed to receive handshake, SSL/TLS connection failed`。记录中的 `HTTP/1.1 200 Connection established` 是代理 CONNECT 成功，**不是附件源站 HTTP 200**；源站状态未知，下载字节为 0，没有 XLSX 或部分文件。原始响应头及 `attachment-retry.json` 保存在同一私有目录。两次不同客户端都在 TLS/传输阶段失败，仍不能定性为站点拒绝、限流、WAF 或文件损坏。本轮停止继续请求。

因此**本轮无法解析工作表、条数、字段或设施类型，也无法与 MCA 名称/ID 做逐家匹配**。不得将链接或页面公示语当成已取得的湖南机构数据。以后网络条件允许时，应先复核页面与附件是否仍公开，保存真实原件及 SHA，再离线按设施类型、名称、地址和地区做候选对照；无平台 ID 的同名匹配不能自动确认为同一家机构。
