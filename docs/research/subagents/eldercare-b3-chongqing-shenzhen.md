# 九站信源 B3：重庆市民政局与深圳民政在线（2026-11-18）

## 结论与口径

本轮没有重新下载两张已冻结的机构表，也没有把搜索摘要计作来源正文。对既有官方 HTML 原件离线重解析，实得重庆 **1,725 条来源观察**、深圳 **95 条来源观察**，合计 1,820 条；原件版本分别发布于 2025-12-22、2026-10-08，逐家资料截至日均未明示。与本站已有官方快照核对，这两张表带来的**新候选行均为 0**；这不说明两市目前没有新机构，也不代表已穷尽两站全部栏目或后续版本。来源观察不是去重、在营的住宿机构数。

| 站点与原文 | 本轮离线实得 | 原件 / SHA-256 | 已有快照核对 | 新候选 |
| --- | ---: | --- | --- | ---: |
| [重庆市民政局《养老服务机构》](https://mzj.cq.gov.cn/mzbm/mzjg/ylfwjg/202512/t20251222_15260877.html)，发布 2025-12-22 12:14 | 1,725 行；1,719 个原文名称键 | data/private/national-official-source/raw/chongqing-20251222.html / 157ef38646c9c47a1cae4e802bbb9ffe079f1e087a1591a34bd10095d1c8e76e | public/data/national-official/chongqing/chongqing/index.v1.json 的 1,725 行按序号、名称、地址和床位逐行相同 | 0 |
| [深圳民政在线《深圳市养老机构基本信息》](https://mzj.sz.gov.cn/szmz/pc/bmxx/mzfwzy/ylfw/bmxx/content/post_2939842.html)，发布 2026-10-08 14:49 | 95 行；95 个原文名称键 | data/private/guangdong-eldercare-source/research-batch5/pearl/raw/shenzhen-roster-canonical.html / 2268ca2011cebb0db1d616a3e29cc9e041f423327295f599eaa8ccb4d62cb686 | public/data/guangdong-source-records.v1.json 深圳 95 行，去空白和统一括号后名称键无缺/余；与[深圳政府在线同步页](https://www.sz.gov.cn/szzt2010/zdlyzl/ggsy/mzxx/yljg/yljgjs/content/post_1312479.html)同序 95 行、8 列逐格规范化一致，同步页 SHA-256 为 4a33f9a0c92cbf14c2462ed31a4280de2588822cf6378f76db27ecd2b6fb3b35 | 0 |

“新候选”仅指相对上述既有官方快照的差异；未将名称相同自动升级为机构身份确认，也没有把重庆和深圳的版本行数加作当期在营机构数。来源 URL 各 1 个；深圳同步页为同版镜像，不另增 95 条。既有原件最初取得时间在本次可用来源元数据中无法可靠确定；私有 manifest 将其记为 null，另列未核验的本地文件修改时间；本轮复核时间由脚本逐行记录为 archive_checked_at_utc，不得冒充原件首次获取时间。

## 访问规则与再利用边界

- **重庆：** 2026-11-18 08:38:48 UTC 请求 https://mzj.cq.gov.cn/robots.txt 得 HTTP 404，未取得 robots 指令；404 不构成转载许可。官网[版权声明](https://mzj.cq.gov.cn/bqsm/202602/t20260209_15396715.html)于本轮正常返回 HTTP 200：引用/转载须标明“来源：重庆市民政局网站”，未经许可及授权不得以商业目的使用本站及其内容。访问原始响应、请求头和哈希在本批私有 access-evidence.json 与同目录原件中。基于此只复核此前已归档资料，不扩采或新增公开投影；现有公开投影的再利用资格应在对外发布前单独审阅。
- **深圳：** 本轮两次请求 https://mzj.sz.gov.cn/robots.txt 均未取得源站 HTTP 状态，第二次明确为 TLS 握手失败；2026-11-14 的历史归档显示当时 HTTP 404，**不能充当当前 robots 结果**。因此本轮不再直接请求该站机构页。项目既有[深圳名单版权审计](../shenzhen-roster-2026-10-08-audit.md)指出深圳政府在线版权保护页对商业转载、摘编及商业网站链接设有限制，逐字段再展示授权未落实；该条款本轮未重新直读，不能推断为已经获得许可。

## 逐行字段、核验与缺口

私有 source-observations.jsonl 每行记录原文 URL、标题、发布日期、未知的资料截至日、原件路径及 SHA-256、表格行定位、源序号、原文名称、完整原始列名/单元格字符串和保守解析字段；原表空床位解析为 null，不推定运营状态。source-manifest.json 汇总行数、缺项、重复和与现有快照的差异，audit_sources.py 可离线重跑，不触碰既有原件或公开数据。

- 重庆原表 7 列：序号、名称、地址、入住老年人总数、从业人员数、床位数、提供服务内容。1,725 个连续源序号，6 组同名额外行、16 行床位空值、4 行名称含“测试”。原表混有医院、社区中心、敬老院等，未作设施性质和在营判定；入住人数不是实时入住率，床位数不是实时空床。
- 深圳原表 8 列：序号、辖区、单位名称、机构性质、单位通信地址、床位总数量、护理型床位数量、联系人电话。95 个连续源序号，原列均非空；“机构性质”不能当作独立设施类型。联系人电话保留在 Git 忽略的私有逐行文件，报告不列号码，也不写入公开投影。
- 已查：这两张冻结表、深圳同版同步页、重庆版权声明、两站 robots 访问证据，以及项目现有重庆/深圳官方投影。未查：重庆后续或其他区县名单、深圳站点当期完整目录/新增附件、当期设施运营状态、官方授权或开放数据许可；深圳源站本轮 TLS 故障未绕过。无新增原件，不作当前全量覆盖声明。

## 复核

在项目根目录执行：

~~~powershell
$env:PYTHONIOENCODING='utf-8'
python data/private/eldercare-multisource-b3-20261118/chongqing-shenzhen/audit_sources.py
Get-FileHash -Algorithm SHA256 data/private/eldercare-multisource-b3-20261118/chongqing-shenzhen/source-observations.jsonl
~~~

脚本在写出派生私有文件前校验三份既有官方 HTML 的 SHA-256、表头、行数、连续序号和数字字段，核对重庆公开索引 1,725 行及深圳公开名称键 95 个，并验证深圳两版官方页 8 列无规范化差异；任一变化即报错。source-manifest.json 保存本次观察文件的 SHA-256，可与上面的计算结果对照。未改公开数据、业务代码或其他 agent 目录，故不运行网站构建。原件及逐行文件均在 .gitignore 排除的私有目录中。
