# B3 全国官方双入口核查（2026-11-18）

## 结论

本轮对指定的两处全国官方入口实得机构级记录 **0 行**、去重后新增机构候选 **0 条**，也没有可直接下载的机构明细附件。此处的 0 表示「没有取得逐家正文」，不是断言两平台没有记录，亦不是查得某机构不存在。未写入 public 或业务代码。

## 访问与原件

| 平台 | robots 与访问状态 | 本轮原件 | 机构数据边界 |
| --- | --- | --- | --- |
| 全国养老服务信息平台 https://yanglao.mca.gov.cn/ | https://yanglao.mca.gov.cn/robots.txt 经匿名 GET 于 2026-11-18 08:37:39 UTC 出现 TLS 握手超时；网页提取工具亦连接失败，故没有拿到可解释的 robots 规则。根目录 GET 200。尝试以普通浏览器打开机构列表时，浏览器宿主返回 “The browser access host is unavailable”。 | 主页 HTML 11,891 字节，SHA-256 9942cdf9ed3b3cb25d547c93ecfe1b3f9b674ca33d8965835b5e43718c26b5e4；是需 JavaScript 运行的 Vue 应用壳，不含逐家结果。原件与请求日志见 national/mca-entry.raw、national/mca-entry.json、national/mca-robots.json。 | 机构列表路由 https://yanglao.mca.gov.cn/#/index/institutionList 可作人工核验入口，但本轮未正常读取列表、附件、使用条款或授权说明。因 robots 与实际结果未核得，不继续页面枚举或调用数据接口。 |
| 国家政务服务平台「全国养老机构信息查询」 https://app.gjzwfw.gov.cn/jmopen/webapp/html5/qgyljgxxcx/index.html | https://app.gjzwfw.gov.cn/robots.txt 返回 HTTP 200，但实际跳到 http://app.gjzwfw.gov.cn/fwmhapp/error/index.html，正文是「您访问的页面正在维护中」，并非 robots 规则。指定查询入口 GET 200。 | robots 地址响应 864 字节，SHA-256 60989ce3e01b06b587bbe26421f2c6f3af1a94949e6fb250a68884e9b0aaf84f；查询 HTML 7,814 字节，SHA-256 daefa90dfbea1de78c4e0e8aa98df80c39e7df73c4272ed0094870126ec5f646。原件与请求日志见 national/gjzwfw-robots.raw、national/gjzwfw-robots.json、national/gjzwfw-entry.raw、national/gjzwfw-entry.json。 | 页面要求养老机构名称、所属区划和四位图形验证码；结果表头为地区、机构名称、统一社会信用代码、地址、床位数，但初始结果 tbody 为空。未填写验证码，未提交查询，不访问受保护结果接口。静态表头不能计作机构行。 |

以上取得时间以各 JSON 文件的 fetched_at_utc 为准；两份入口 HTML 未给可核的机构资料截止日。本轮检查的入口 HTML 未提供可直接下载的 XLSX/CSV 附件或明确的第三方逐项再展示许可；这不证明平台其他位置不存在此类资料。未遇到登录、403 的进一步交互，也未尝试绕过验证或访问控制。Brave 站点限定搜索本轮失败，仅作发现尝试，不作为来源正文。

## 解析与对账

- 原件数：3 个有正文的 HTTP 响应（民政平台主页、政务平台 robots 地址维护页、政务平台查询页）；另有 1 个 robots TLS 超时日志。机构级原件数 0，解析行数 0，机构名称键数 0，新增候选数 0。
- 既有项目文档曾记录在民政平台人工检索「云浮市福利院」看到同名卡，见 docs/research/subagents/beijing-shanghai-institution-search-2026-11-18.md；本轮未复现、未取原件，因此不把该历史观察算成本轮新增行，也不与地方官方目录自动合并。
- 因没有逐家记录，没有可执行的机构身份去重；既有全国官方来源清单 data/raw/national-official-source-manifest.json 未变更。名称相似、客户端表头与站外搜索摘要均未用于生成记录。

## 可复核与后续边界

在项目根目录运行：python data/private/eldercare-multisource-b3-20261118/national/verify_capture.py。该检查复算 3 个原件哈希和字节数、确认政务页验证码及空结果表体，输出机构行数 0。运行 python data/private/eldercare-multisource-b3-20261118/national/probe_sources.py 会复用现有捕获元数据，不会再次请求或覆盖已归档原件。

后续若能通过正常浏览器使用民政平台，应先重新核 robots、站点使用条款与公开列表，再以少量已知官方名称人工核验可见的逐家记录，分别记录 URL、时间、原文及身份证据。政务平台需按正常人工流程使用验证码；未经明确许可，不做自动查询、页码枚举或批量再展示。本轮没有对全国覆盖率、实时在营、空床、床位/价格时效作推断。
