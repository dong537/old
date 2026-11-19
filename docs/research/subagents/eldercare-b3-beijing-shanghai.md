# B3 北京养老服务网、上海市养老服务平台采集报告（2026-11-18）

## 结论与口径

仅核查 https://www.beijingweilao.cn/ 与 https://shyl.mzj.sh.gov.cn/ 。原件、每页请求记录和逐名候选结果仅保存在 data/private/eldercare-multisource-b3-20261118/beijing-shanghai/；本轮没有修改公开目录或业务代码。

| 站点 | 本轮实际取得的机构来源观察行 | 既有北京官方目录同名候选 | 未命中北京官方目录的名称候选 | 其中既有企查查机构线索同名 | 两套名称索引均未命中 | 已确认新增机构 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 北京养老服务网 | 512（52 页，全部原始列表响应） | 397 | 115 | 53 | 62 | 0 |
| 上海市养老服务平台 | 0（robots 与首页均返回 403） | 不适用 | 0 | 0 | 0 | 0 |

512 是平台在每页响应中报告的总数，本轮恰好取得 512 个列表来源行和 512 个唯一 organId；它仍不能直接代表北京当前在营机构数。115 和 62 是名称索引的查漏候选数，**不是已核实的新机构数**。北京两次采集会话组成全部页面，非事务性快照；总数与 ID 校验不能证明采集期间所有字段未变。

## 访问与原件

- 北京 robots.txt 于 2026-11-18 08:54:22 UTC 复核为 HTTP 200，SHA-256 cad52f939f9d1565d75b8260444335fdd72a6e8607fa482b02c1b844a515c24f，与初次原件相同，原文仅“User-agent: *”、无 Disallow。首页和机构照护页均为 200，原件、URL、取得时间和哈希见上级目录的 capture-manifest.json。所见页面仅有版权页脚，没有明确第三方逐字段再展示许可；页面说明信息由养老机构提供，详情应与机构联系。因此原始响应只留 Git 忽略的私有目录。
- 北京列表入口：https://www.beijingweilao.cn/pensionService/organizationCare?type=jgylfw 。匿名浏览器经可见分页控件逐页操作；页面正常发出 POST https://www.beijingweilao.cn/prod-api/api/v1/portal/organInfo/getOrganInfoList 。未猜测新接口或隐藏参数、未绕登录/验证码。第 1 页与第 52 页原件及哈希保留在上级目录，完全未覆盖；新建 beijing-full/ 保存第 2–51 页各自的原始响应 JSON、请求体、请求与响应 UTC 时间、HTTP 状态、字节数、SHA-256。新采的中间 50 次分页请求，实测相邻请求最短间隔 1.519 秒、最长 4.945 秒。beijing-full/raw-manifest.json 汇总 52 页路径与哈希；capture-complete.json 记录完成页段与请求次数。
- 北京第 1 页原始响应 SHA-256 为 2afd12ef9cac5af8937106c6d8dcf06dd6a18e88683465d397ae6b0c82302672，后续采集会话中的第 1 页响应哈希再次相同；第 52 页原始响应 SHA-256 为 521c02c8005dc4ea17b131595360439c7c5b53fc6b9b599bf7ed70f86a128752。两页早期取得时间及请求信息见 beijing-list-page1-meta.json、beijing-list-page52-meta.json。第 1 页早期请求体未录制，不拿末页请求体反填；后续会话的第 1 页请求体见 beijing-full/initial-page-request.json。
- 上海 https://shyl.mzj.sh.gov.cn/robots.txt 与首页 https://shyl.mzj.sh.gov.cn/ 在本轮 Python 匿名访问均返回 HTTP 403（HTML）；检查发生于 2026-11-18、北京首次归档 08:38:56 UTC 之前，原始脚本未精确打点，因此不伪造秒级取得时间。记录见 access-check.json。据此停止，没有请求 /agencyQuery 或数据接口，也没有更换身份或规避限制。既有 docs/research/subagents/beijing-shanghai-institution-search-2026-11-18.md 的上海浏览器样本是另一轮观察，不算本轮实得行。

## 完整性与字段

- 离线校验覆盖 1–52 页，每页 JSON 内码为 200、报告总数为 512；第 1–51 页每页 10 行、末页 2 行，合计 512 行。52 份原件 SHA-256 均与记录一致，512 个 organId 均非空且唯一，原始 institutionName 均非空。未发现同名 institutionName 组。第 2–51 页请求体与页面实际发出的已观察筛选结构一致，只变化 pageNum，保留 provinceCode=110000、pageSize=10。
- 原始响应全部字段及 null 原值逐页保留，未把未知值补零。512 行的原始字段并集为 177 个，其中 140 个字段在样本中全为 null；名称、地址、总床位等字段可在私有核对文件中按源页/行定位。所有名称含 Time/Date 的原始字段均无非空值，资料日期继续记为 null，访问时间不能代替资料截止日。字段存在性统计见 beijing-full/field-presence.json。原始响应含联系方式及身份类字段，只能留私有原件；报告不展示这些逐行字段。

## 查重结果

对照 public/data/national-official/beijing/beijing/index.v1.json 的 459 条北京民政局星级名单来源行，以及 public/data/qcc-institutions/p-18910c0427ac/c-2e69daaa1cec/index.v1.json 的 578 条北京企查查机构线索行。分别对原始 institutionName 与平台展示名 sfInstitutionName 做 Unicode 宽窄字符、空白及常见分隔符规范化后同名匹配；两个字段保留原值，名称相似仅生成候选，绝不自动确认同一场所。

- 对官方名单，原始 institutionName 命中 392 行；另有 5 行仅展示名命中，合计 397 行同名候选、115 行未命中。
- 对企查查机构线索，原始 institutionName 命中 431 行；计入展示名共 439 行同名候选。官方名单未命中的 115 行里，53 行已在企查查机构线索中同名，62 行两套名称索引都未命中。62 仅是继续人工复核的优先候选，不等于项目新增 62 家机构，也不排除别名、其他现有来源或不同时间口径。
- 例如北京瑞颐安养老服务中心（平台 organId 37320）位于两套名称索引均未命中的 62 行内；北京华夏厚德养老中心（organId 34458）未命中官方星级名单，但已同名命中企查查机构线索 qi-6bc157e26959-575。两条均不作当期运营或场所身份确认。

逐行白名单对账见 beijing-full/full-name-reconciliation.json；两类查漏清单分别见 official-gap-name-candidates.json 与 new-to-both-name-indexes.json。每行指向原始响应文件、页码、行位置和 SHA-256；原始响应仍为全部源字段的权威副本。任何价格、可订床位、资质标签或个人联系方式均未进入公开数据。

## 复核与剩余边界

在项目根目录运行：

    python data/private/eldercare-multisource-b3-20261118/beijing-shanghai/beijing-full/reconcile_full.py

脚本校验 52 份原件的哈希/行数/总数、512 个唯一 organId、第 1 页跨会话相同哈希、50 次中间页请求间隔、两套既有名称索引以及核对产物可重复性；原始响应写入采用不覆盖模式。字段级许可、北京逐行资料日期、跨会话原子性、上海本轮机构列表及真实场所身份/运营状态仍未证实。上海 403 消失后须先重新核查 robots 与条款；本批次不接入 public/。
