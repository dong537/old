# C01 养老信息网北方/西北外部索引补查（2026-11-18）

## 目标、范围与冻结结果

本批在已完成 south-search 之后独立补查天津、河北、山西、陕西、吉林、黑龙江、甘肃、内蒙古、宁夏、新疆。仅使用外部搜索索引，没有向 `yanglaocn.com` 请求网页，没有改动前批、公开数据、应用或共享 manifest。

共 **18 条独立标准机构详情线索 URL**；省区市计数如下。零命中只表示本轮有上限的检索没有发现详情，不表示该地区无机构或没有被索引的详情。

| 省区市 | 详情线索 |
| --- | ---: |
| 天津 | 3 |
| 河北 | 2 |
| 山西 | 0 |
| 陕西 | 4 |
| 吉林 | 1 |
| 黑龙江 | 0 |
| 甘肃 | 1 |
| 内蒙古 | 4 |
| 宁夏 | 0 |
| 新疆 | 3 |
| 合计 | 18 |

另存 1 条收费聚合页、1 条单机构文章；5 条搜索命中的范围外详情单独排除，均不进入这 18 条。未为凑数量把聚合页、首页或离题省份写入主记录。

## 查询与证据边界

- 使用 12 次 `web.run/search_query` 调用，每次 1 个查询，总计 12 个不同 query，已封顶停止。
- 前 10 次分别使用 `site:yanglaocn.com "省区市名" "简介,收费价格"`；后两次补查 `哈尔滨＋位置地址`、`太原＋简介＋养老院`，详见 queries.json。
- 本批没有调用 Brave，也没有重复前批网络失败。
- 所有记录的证据类型均为 `search-snippet`，不是站内正文或官方核验。标题、原 URL、查询、工具结果 ref 和简短的地域原文字段全部保留。
- 省市都来自标题或摘要明确文字，分别记录 `provinceEvidence/cityEvidence.location` 为 `result-title` 或 `result-snippet`。无法明确的下级地区为 null。没有从查询上下文或 URL 推断地域。
- 独立保存的河北大厂单机构文章来自“太原”查询：`queryProvince="山西"`，但标题明确为河北廊坊，故 `province="河北"`。这保留了搜索上下文与事实字段的区别。
- 地域名称按索引文字保留，未做行政区划时点标准化。例如“九台市”“兴安盟”“昌吉”为观察到的标签，不能视为当前行政边界已经核实。
- `searchEvidenceUrl` 是为复核构造的 Google 检索重放链接，明确标记未访问；不是声称实际后端 provider 提供或已打开的结果页 URL。
- `canonicalDetailUrl` 目前等于原始 URL，没有验证跳转或网页 canonical。没有从 URL 日期段、搜索 crawl 时间或营销标签推断发布、更新或资质日期。

## 文件与 schema

私有输出：`data/private/yanglaocn-20261118/northwest-search/`

| 文件 | 内容 |
| --- | --- |
| `leads.json` | 顶层 `{ meta, records }`；18 条范围内标准机构详情线索 |
| `queries.json` | 顶层 `{ searchedOn, queries }`；12 个完整查询与结果概况 |
| `auxiliary-articles.json` | 1 条反复出现的收费聚合页，不计详情 |
| `independent-profile-articles.json` | 1 条河北大厂单机构文章线索，未取得正文，暂不计标准详情 |
| `excluded-offscope-details.json` | 5 条地域不在本批范围的真实详情命中，不计主记录 |

主记录沿用 south-search schema：

`leadId, sourceId, sourceSite, recordType, institutionName, province, city, district, queryProvince, provinceEvidence, cityEvidence, originalUrl, canonicalDetailUrl, canonicalization, originalTitle, queryId, query, searchEvidenceUrl, searchEvidenceUrlStatus, searchEvidence, searchedOn, pageFetched, officiallyVerified, pagePublicationDate, pageUpdateDate, restrictions`。

`pageFetched/officiallyVerified` 一律为 false；`pagePublicationDate/pageUpdateDate` 一律为 null。

## 可核查详情线索

| 搜索标题中的机构名 | 省区市 / 二级地域 | 原始 URL |
| --- | --- | --- |
| 天津市武清区安享晚年医养院 | 天津 / 天津 | https://www.yanglaocn.com/shtml/ylyxx/2017-09/yly15048307304908.html |
| 泉和养老康复中心 | 天津 / 天津 | https://www.yanglaocn.com/ylyxx/y29999.html |
| 天津滨海益年养老院 | 天津 / 天津 | https://www.yanglaocn.com/shtml/ylyxx/2021-12/yly164087596427388.html |
| 河北省石家庄市裕华区金刚集团老年公寓 | 河北 / 石家庄 | https://www.yanglaocn.com/shtml/ylyxx/2013-02/yly1360406957895.html |
| 石家庄大院人家长者社区 | 河北 / 石家庄 | https://www.yanglaocn.com/shtml/ylyxx/2019-04/yly15561725315440.html |
| 西安市雁塔区东仪社区爱心护理院 | 陕西 / 西安 | https://www.yanglaocn.com/shtml/ylyxx/2013-02/yly1360060497957.html |
| 陕西渭南博思特家政服务有限公司 | 陕西 / 渭南 | https://www.yanglaocn.com/shtml/ylyxx/2013-05/yly1369398762539.html |
| 陕西金秋老年公寓 | 陕西 / 西安 | https://www.yanglaocn.com/shtml/ylyxx/2013-10/yly1382757700953.html |
| 陕西医联医生集团管理有限公司 | 陕西 / 西安 | https://www.yanglaocn.com/shtml/ylyxx/2020-11/yly160653361522957.html |
| 吉林省长春市九台市社会福利院 | 吉林 / 长春 | https://www.yanglaocn.com/shtml/ylyxx/2013-07/yly1373063300363.html |
| 甘肃省兰州市城关区老年公寓 | 甘肃 / 兰州 | https://www.yanglaocn.com/shtml/ylyxx/2013-03/yly1362966090982.html |
| 乌海市海勃湾区金裕幸福院 | 内蒙古 / 乌海 | https://www.yanglaocn.com/ylyxx/y29525.html |
| 内蒙古兴安盟乌兰浩特市松鹤老年公寓 | 内蒙古 / 兴安盟 | https://www.yanglaocn.com/shtml/ylyxx/2013-08/yly1377232631594.html |
| 内蒙古呼伦贝尔市扎兰屯市老年公寓 | 内蒙古 / 呼伦贝尔 | https://www.yanglaocn.com/shtml/ylyxx/2013-08/yly1376444813457.html |
| 内蒙古赤峰市吉泰老年公寓 | 内蒙古 / 赤峰 | https://www.yanglaocn.com/shtml/ylyxx/2021-10/yly163314329826730.html |
| 新疆乌鲁木齐市仁和老年公寓 | 新疆 / 乌鲁木齐 | https://www.yanglaocn.com/shtml/ylyxx/2013-01/yly1357226393479.html |
| 乌鲁木齐市爱心老年公寓 | 新疆 / 乌鲁木齐 | https://www.yanglaocn.com/shtml/ylyxx/2013-01/yly1357551926719.html |
| 新疆昌吉市杏苑老年公寓 | 新疆 / 昌吉 | https://www.yanglaocn.com/shtml/ylyxx/2013-01/yly1357641660475.html |

标准详情路径样式：2 条 `/ylyxx/y{id}.html`、16 条 `/shtml/ylyxx/.../yly{id}.html`。另存的单机构文章路径为 `/shtml/20150205/14231384423889.html`，不计标准详情。

河北大厂资料采用文章式路径。搜索标题只指向一家机构，摘要展示“基本信息、床位数、收住对象、机构性质”等单机构字段，因此保留于 independent-profile-articles.json 作为单机构文章线索。尚未取得正文，暂不计标准机构详情；没有从 URL 推断资料日期，meta 中明确记录排除原因。

## 聚合页与排除项

收费聚合页为 `https://www.yanglaocn.com/shtml/juhe/ylcsfy.html?ch=229&cfr=6538`。它在多个查询中反复出现，摘要提及太原、银川等机构，但没有出现这些机构的独立详情 URL，因此只保留为辅助发现记录，未猜测或枚举对应详情链接。

范围外详情涉及云南昆明、广东广州、北京、江苏南京、广东惠州。仅保存观察到的标题名、URL、查询及明确地域文字，便于审计为什么被排除；未并入本批。

## 验证与剩余限制

写入后通过 Python 标准库重新读取全部 JSON，核对 18 条主 URL 唯一、域名和观察到的路径、逐省数量、12 个查询 ID、证据来源枚举及省市原文字段、正文/官方核验标志和日期 null；同时确认 1 条聚合文章、1 条单机构文章和 5 条范围外详情没有混入主记录。只新增本批私有产物和报告。

不验证机构住宿许可、当前在营、医疗资质、收费、床位、电话或运营主体。公司名称和养老社区类型保留为资料线索，不自动等同于持证住宿养老机构。没有运行应用测试，因为本任务没有改动应用或公开数据。后续由统一流程与既有 41,955 条线索做候选比对，再按字段独立核验；当前文件不构成公开再展示授权。
