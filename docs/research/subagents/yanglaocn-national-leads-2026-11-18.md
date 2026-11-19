# 养老信息网全国搜索线索（2026-11-18）

## 目标、范围与状态

从外部搜索索引发现北京、上海、江苏、浙江、山东、河南、辽宁的机构详情候选；与广东采集分工隔离。本轮只写私有候选和研究记录，不修改 `public/`、`out/`、`app/`、共享 manifest，不调用付费端点，不绕过验证码或登录。

产物位于 `data/private/yanglaocn-20261118/national-search/`（由现有 `data/private/` 规则忽略）：`candidates.json`、`candidates.csv`、`search-evidence.json`、转录生成脚本、README 及校验记录。

## 结果与解释

得到 **31 个去重详情 URL 候选**：北京4、上海1、江苏12、浙江2、山东9、河南1、辽宁2。这是外部索引中的 URL 线索数；不是经核实的独立机构数、当前在营机构数，也不是可公开商业数据量。所有省市由结果标题或摘要直接支持，未做现行区划修正。

每条私有记录保留明确机构名、搜索标题、省市、原始 `yanglaocn.com` URL、检索日、搜索批次、工具结果引用及短索引片段，状态统一为 `search-index-only-unverified`。没有从片段采集电话、床位、价格、资质、地址正文或运营状态；标题和地域也仍是待源站/官方核验的索引声明。

`provinceEvidence`、`cityEvidence` 分别标明 `search-result-title` 或 `search-result-snippet`，31条均不是query上下文推定。`originalUrl` 保留索引原URL，`canonicalUrl` 只做原URL语法同一化并标明未检查跳转/HTML canonical。每条保留 `queries`；单查询批次有 `query`，多查询批次令 `query=null`，避免虚构精确归属。证据类型明确为 `search-snippet`。

搜索执行日为 2026-11-18，不代表原始页面内容更新时间。旧路径中的2012、2013、2014只是URL组成，不用于推定数据有效期。两种命中路径为 `/ylyxx/y*.html` 和 `/shtml/ylyxx/.../yly*.html`；这只用于详情候选筛选，未声称源站当下可访问。

## 搜索方法与工具情况

通过 `web.run search_query` 做6批共15个查询。最初宽泛的“城市 + 养老院 + 详情”及路径约束命中大量文章、榜单和地区页，最后改用 `"简介,收费价格,联系电话,位置地址"` 的详情页标题短语，在江苏和山东得到更多详情命中。查询明细和逐条归属见私有 `search-evidence.json`。多查询同批返回结果无法可靠归属到单个查询，故只记批次，不虚构精确归属。

另一次 `mcp__brave_search__brave_web_search` 标准搜索查询 `site:yanglaocn.com/ylyxx/ 江苏 养老`、`count=20` 返回 `isError: true` 和 `fetch failed`；没有重试，随即改用可用搜索工具。没有调用 Brave 的付费 place/local/summarizer 或其他计费端点。搜索结果摘录不是工具全量原始响应。

本采集器向 `yanglaocn.com` 直接请求次数为 **0**，没有与源站探测 agent 竞争请求。未访问搜索结果目标页，也没有读取其正文。

## 验证与后续

运行 `python data/private/yanglaocn-20261118/national-search/verify-candidates.py`，退出码0：31条记录及URL唯一性、允许的详情路径、七省市分布、必填字段、全部未核实/未直连/不可商业公开标记、CSV与JSON对应、证据批次引用，以及私有目录被Git忽略检查均通过。标题/摘要地域检查还逐条确认省市名称词干实际出现在声明的证据文字中；结果已写入同目录 `validation.json`。这些只是本地完整性验证，不是源站或机构内容核验。

候选应留在私有暂存区。下一步按访问 agent 的结论，选择正常匿名、低频且允许的逐页核验路径，另行确认来源/授权/字段可复用范围；不能自动合并进41955条机构线索或8500条官方来源行，更不能把三者相加当作机构总数。

这轮没有应用代码、运行时或公共构建产物变化，因此不运行与产物无关的前端构建与浏览器测试。不更新长期 spec：没有新增正式数据接入、实体身份规则或公开字段 contract。
