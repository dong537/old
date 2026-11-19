# 养老信息网正常访问核查（2026-11-18）

## 结论与范围

本轮只核查 C01 养老信息网的公开访问和已下载内容，没有枚举全站、调用隐藏接口、登录、提交咨询表单或支付。先读取 `commercial-institution-matches-2026-11-18.md`，没有重复核查其中的武汉文章。本轮请求涉及 3 个不同源站 URL，共 7 次顶层探测/导航（工具 robots 1、默认 requests 2、正常浏览器 1、直连 requests 3），低频单并发。没有收到 HTTP 403/429 或验证码。

标准 Python requests 继承环境设置时，robots 和首页都在取得 HTTP 响应前超时；正常 headed 浏览器打开广州详情也显示 `ERR_TIMED_OUT`。只将 requests 的 `trust_env` 改为 `False` 后，robots、首页和广州详情均返回 HTTP 200。没有配置代理、切换 IP、修改 user-agent、禁用 TLS 校验或采取挑战绕过；这说明访问存在网络路由差异，不能把早先的连接失败当作 robots 禁止。

成功取得的 robots 文件另有明确规则：通配 `User-agent: *` 允许 `/`，但针对 `GPTBot`、`ChatGPT-User`、`ClaudeBot` 等命名抓取器分别禁止 `/`。三页在同一小批次中串行保存，随后人工审读 robots 时发现命名限制；发现后停止了所有新增源站自动请求。默认 requests 的 200 不是绕过命名规则后继续抓取或批量复用的依据。

## 访问证据

响应正文原件、HTTP headers、URL、UTC 取得时间、SHA-256 与派生文件都保存在 Git 已忽略的 `data/private/yanglaocn-20261118/access/`。`response.bin` 是 requests 交付的响应实体字节，gzip 由 requests 正常解压，不是网络线上的压缩流。

| URL | 通道与结果 | 原件 SHA-256 |
| --- | --- | --- |
| `https://www.yanglaocn.com/robots.txt` | 默认 requests 超时；`trust_env=False` 在 2026-11-18 07:16:17 UTC 发起并取得 200，964 字节 | `8cc266e533e333c801a4b29393cfe9689e824be116e41017188b87745a35b1af` |
| `https://www.yanglaocn.com/` | 默认 requests 超时；`trust_env=False` 在 07:16:18 UTC 发起并取得 200，424,933 字节 | `57022a5ed5f32f05eb6adc3ee2b91e8c46d39ea37df44f177b16bc0f9c5ab6c6` |
| `https://www.yanglaocn.com/ylyxx/y30396.html` | 正常浏览器导航超时；`trust_env=False` 在 07:16:21 UTC 发起并取得 200，85,508 字节 | `4209a17418183c9ca28c0839c8d78e8d76d5ceb0b3b00a87691a5387481768ac` |

`manifest.jsonl` 记录 5 次 requests 的成功或错误；`browser-observation.json`、`browser-detail-snapshot.log` 记录浏览器失败。浏览器截图命令本身在 5 秒后超时，没有产生截图，不能声称有成功截图。最初工具读取 robots 未返回可用正文/状态，未据此判定规则。`artifact-checksums.json` 供本地重验。

## 目录、下载与条款入口

已下载首页包含养老院推荐、养老院查询和热门城市入口，并直接包含机构详情链接。从首页和广州详情**离线**提取到 62 个去重详情 URL，保存为 `discovered-links.json`，每条标记 `link-only`，不代表这些页已访问、机构已核验或仍在营。仅广州 y30396 另有本轮正文观察记录。

| 入口 | 证据与状态 |
| --- | --- |
| `https://www.yanglaocn.com/list/` | 首页链接文字为“养老院查询”，是正常目录入口；本轮未继续访问。 |
| `https://www.yanglaocn.com/yanglaoyuan/` | 首页链接文字为“养老院”；本轮未继续访问。 |
| `https://www.yanglaocn.com/yanglaoyuan/gz/` | 首页和已取详情出现的广州养老院入口；本轮未继续访问。 |
| `https://www.yanglaocn.com/sitemap_index.xml` | 成功取得的 robots 明确声明；本轮未继续读取或计数。 |
| `https://www.yanglaocn.com/webmap/` | 已下载详情页的“网站地图”链接；未访问。 |
| `https://www.yanglaocn.com/disclaimer/` | 首页的“免责声明”链接；发现命名抓取限制后未访问，条款内容未确认。 |
| `https://www.yanglaocn.com/contactus/` | 首页“联系我们/商务合作”；可供人工联系授权，未发送消息。 |

首页页脚显示“版权所有：养老信息网”，并声明部分信息及图片来自网络、可联系删除侵权内容。该声明不是字段复制、商用再展示或批量下载许可。本轮已取页面没有发现明确的机构数据库导出/批量下载链接；这不证明全站不存在此类入口。由于免责声明全文和再使用许可未确认，不将这些内容加入公开目录。

## 广州详情的离线字段观察

`detail-observation.json` 保留 HTML hash、取得时间、独立的 `sourceDate`、字段原文、CSS selectors、文本锚点及涉及床位/地址的来源段落。`sourceDate=2026-11-02` 来自 `.ylyxx_base_update` 展示，和本轮取得日期、HTTP `Last-Modified` 分开保存。

| 字段 | 已观察到的页面声明 | 使用边界 |
| --- | --- | --- |
| 名称、区域 | 广州鹏瑞利康养护社区；广东、广州、黄埔区 | 商业页面场所线索，法律运营主体未核。 |
| 地址 | 广汕路以南、开创大道以西的黄陂东创广场 | 正文描述位置，没有取得门牌号；不是坐标核验。 |
| 类型、性质 | 养老社区、民营 | 保留来源措辞，不推断经营许可。 |
| 服务、收住对象 | 标签含医养结合、康复护理；收住对象含自理、半护、全护、特护、专护 | 页面自述，未证明医疗资质或实时服务能力。 |
| 费用 | 价格容器与 JSON-LD `priceRange` 均为空 | 保存为 `null`；相关搜索的“5001–10000元”不是该机构报价。 |
| 床位 | 表头“1600张”，正文说明是规划的医疗及养老床位合计 | 不能当作当前运营的纯养老床位或可入住空床；规范数值字段设为 `null` 并保留原文。 |
| 电话 | 原始 HTML 为未解析的 Vue 模板，含点击查看/登记流程 | 保存为 `null`；没有点击揭号、登记或访问号码接口。 |

报告和私有 JSON 是查漏、交叉核验的证据，不构成站方信息独立核实。首页和详情的备案号展示还存在新旧模板差异，未据此判断主体变更。

## 验证与剩余限制

- 三份响应实体的 SHA-256 已重新计算并与 manifest 比对；离线解析断言名称、完整描述位置、床位口径和页面日期存在于保存 HTML。
- 62 条发现链接只做本地 URL 形状校验、去重和来源回溯，没有跟进请求；没有尝试北京市页和旧路径页。
- robots 命名限制、免责声明全文未确认、商业信息可能过时及混合床位口径，是继续扩展前的实际边界。建议改用官方来源补证，或由人工向站方确认合法访问和再使用权限。
- 未修改 `public/`、`out/`、`app/`，未部署、未调用工商付费 API。
