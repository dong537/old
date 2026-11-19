# C01 养老信息网华南/福建搜索线索（2026-11-18）

## 目标、范围与结果

本任务只从外部搜索引擎发现广东、广西、海南、福建的养老信息网机构详情 URL，没有向 `yanglaocn.com` 发送请求，没有读取该站正文，没有修改公开目录、应用、out 或共享 manifest。先核对了 `commercial-institution-matches-2026-11-18.md` 的 C01 既有观察：搜索索引可见不等于正文抓取成功或官方核验。

本轮保存 **19 条独立机构详情 URL**：广东 13、广西 4、福建 2、海南 0。另存海南 2 条名单/旅居文章，仅作辅助发现，不计入机构详情数。未达到期望的 20–50 条，未凑数，也不能由本样本推断四省全量覆盖或当前在营数量。

## 检索方法和工具边界

- 日期：2026-11-18（任务环境本地日期）；只调用外部 `web.run/search_query`，不打开搜索命中的站内 URL。
- `web.run` 共 8 次调用、17 个不同查询：4 个省名宽查询、4 个旧详情路径查询、4 个省名＋详情标题模板查询，以及 5 个有上限的海南城市/机构名补查。前 8 个查询只发现 2 条详情；模板查询发现 17 条新增详情；海南补查没有发现详情，随即结束。
- Brave 第一次调用因可选 `country: cn` 的大小写不符合枚举而校验失败；移除可选国家/语言参数后的调用返回 `fetch failed`。未反复重试网络失败，改用系统外部搜索。
- 不从 URL 日期段、搜索 crawl 时间或标题营销词推断资料更新时间、当前经营、医疗资质、床位、收费或院方联系方式。
- 全部字段证据类型是 `search-snippet`。省市逐条附标题或摘要中的明确文字；没有仅由查询上下文推断的确定省市。地区边界没有外部行政区划复核。
- 搜索工具未给可保存的引擎结果页 URL。因此 `searchEvidenceUrl` 明确标为**构造的 Google 检索重放链接，未访问**，不冒充实际后端 provider 的结果页；同时保留查询、工具结果 ref、观察到的原始详情 URL、原始标题和简短位置证据。
- `canonicalDetailUrl` 当前与原始结果 URL 完全相同；未验证 HTTP 跳转或 `rel=canonical`，不擅自把新旧路径合并。

## 文件与 schema

私有目录：`data/private/yanglaocn-20261118/south-search/`

| 文件 | 内容 |
| --- | --- |
| `leads.json` | 顶层 `{ meta, records }`；meta 含范围、计数、访问/再使用限制、工具失败和缺口 |
| `leads.jsonl` | 与 records 相同的逐行记录，便于统一合并 |
| `queries.json` | 顶层 `{ searchedOn, queries }`；17 个差异查询、策略、结果概况和未访问重放链接 |
| `auxiliary-articles.json` | 海南 2 条聚合文章，明确排除于详情计数 |

记录 schema：`leadId, sourceId, sourceSite, recordType, institutionName, province, city, district, queryProvince, provinceEvidence, cityEvidence, originalUrl, canonicalDetailUrl, canonicalization, originalTitle, queryId, query, searchEvidenceUrl, searchEvidenceUrlStatus, searchEvidence, searchedOn, pageFetched, officiallyVerified, pagePublicationDate, pageUpdateDate, restrictions`。

`provinceEvidence/cityEvidence` 保存 `evidenceType, location, excerpt`；`location` 区分 `result-title` 与 `result-snippet`。publication/update 均为 null，pageFetched/officiallyVerified 均为 false。

## 可核查线索

| 机构标题名 | 省 / 市 | 详情 URL |
| --- | --- | --- |
| 广东汕头中南颐养院 | 广东 / 汕头 | https://www.yanglaocn.com/shtml/ylyxx/2017-04/yly1492763512992.html |
| 金湾颐养园 | 广东 / 珠海 | https://www.yanglaocn.com/shtml/ylyxx/2021-11/yly163573623027025.html |
| 中山市乐而乐养老院 | 广东 / 中山 | https://www.yanglaocn.com/ylyxx/y30164.html |
| 颐养松花湖 | 广东 / 肇庆 | https://www.yanglaocn.com/ylyxx/y30201.html |
| 广州越秀银幸颐园高端养护院 | 广东 / 广州 | https://www.yanglaocn.com/ylyxx/y30270.html |
| 麓湖•嘉怡颐养院 | 广东 / 广州 | https://www.yanglaocn.com/ylyxx/y27848.html |
| 惠州市惠东县社会养老服务中心 | 广东 / 惠州 | https://www.yanglaocn.com/ylyxx/y29951.html |
| 深圳市宝安区西乡街道福安养老院 | 广东 / 深圳 | https://www.yanglaocn.com/ylyxx/y29962.html |
| 中山健乐颐养院 | 广东 / 中山 | https://www.yanglaocn.com/shtml/ylyxx/2022-02/yly164439624027530.html |
| 平安臻颐年颐年城心旗舰康养社区 | 广东 / 深圳 | https://www.yanglaocn.com/ylyxx/y29086.html |
| 光大百龄帮·清远奥园颐养公馆 | 广东 / 清远 | https://www.yanglaocn.com/ylyxx/y29571.html |
| 杜曼旅居养老院 | 广东 / 江门 | https://www.yanglaocn.com/shtml/ylyxx/2021-11/yly163669830927111.html |
| 广州鹏瑞利康养护社区 | 广东 / 广州 | https://www.yanglaocn.com/ylyxx/y30396.html |
| 广西省重阳老年公寓 | 广西 / 南宁 | https://www.yanglaocn.com/shtml/ylyxx/2013-09/yly1379427993972.html |
| 广西梧州市社会福利院 | 广西 / 梧州 | https://www.yanglaocn.com/ylyxx/y730.html |
| 广西慧孝养老院 | 广西 / 防城港 | https://www.yanglaocn.com/shtml/ylyxx/2022-05/yly1651934816236107.html |
| 广西桂林冶金疗养院 | 广西 / 桂林 | https://www.yanglaocn.com/shtml/ylyxx/2013-07/yly1374368364539.html |
| 禾康敬老园 | 福建 / 福州 | https://www.yanglaocn.com/shtml/ylyxx/2015-04/yly1428047358375.html |
| 福建省莆田市涵江尊德老年公寓 | 福建 / 莆田 | https://www.yanglaocn.com/shtml/ylyxx/2014-02/yly1392641682345.html |

新路径样式 `/ylyxx/y{id}.html` 共 10 条，旧路径样式 `/shtml/ylyxx/.../yly{id}.html` 共 9 条。以上只是观察到的路径样式，不是已验证解析 contract。

## 海南缺口

宽查询、详情标题模板、海口/三亚城市词和机构名称补查均未返回独立机构详情。只保留：

- 题为“海南省老龄办：全省截至2012年6月30日登记在册养老机构名单”的历史聚合文章；
- 题为“海南省候鸟式旅居养老——海口篇”的旅居文章。

二者摘要中的机构名称可供后续有授权的独立核对，但没有猜测、拼装或枚举其机构详情 URL，不能当作当期官方名单。

## 验证与剩余限制

本任务写入后用 Python 标准库重新读取 JSON 和 JSONL，核对逐行一致、URL 去重、域名及路径、逐省计数、所有记录明确为 search-snippet 且正文/官方核验标志均 false。报告与私有产物完成静态检查；没有运行应用测试，因为没有改动应用或公开数据。

后续应由统一合并流程与已有 41,955 条线索做候选比对，再按字段独立核验。商业内容再展示授权、robots/使用条款、站内现状及所有机构事实均不在本任务中确认。
