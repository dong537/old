# 养老信息网八省市补查（2026-11-18）

## 目标、范围、隔离

独立补查四川、重庆、湖北、湖南、安徽、江西、贵州、云南，通过外部搜索索引只发现实际机构详情URL。不直访养老信息网，不绕过验证码或登录，不调用付费接口，不修改national-search前批数据、公开数据、应用代码或共享manifest。

产物在 `data/private/yanglaocn-20261118/west-search/`：`candidates.json`、`candidates.csv`、`search-evidence.json`、本地生成/验证脚本、README和`validation.json`。该目录由现有 `data/private/` Git忽略规则保护。

## 实际结果

**43个去重详情URL候选**：四川3、重庆3、湖北11、湖南11、安徽4、江西6、贵州0、云南5。候选数不是经核实的独立机构数或当前在营机构数；不能与前批、41955条机构线索或8500条官方来源行相加当作机构总数。

每省市先做1个精确标题query，贵州补做1次，共9个查询，没有用满10次封顶。贵州第一次只命中首页；补查命中首页、贵阳市目录和一篇介绍文章，均不符合实际机构详情要求，因此留0，不补造URL。0只描述本批搜索结果，不代表该省没有详情或养老机构。

所有查询都是 `web.run search_query`，每次只提交1个query，逐条可可靠归属。未重试前批失败的Brave接口。本批直接向 `yanglaocn.com` 发起的HTTP请求为0，也没有访问搜索命中的目标页。查询明细和贵州负结果引用保存在私有证据JSON。

## Schema与证据规则

沿用national-search schema。`originalUrl`/`originalYanglaocnUrl`保留搜索索引原URL；`canonicalUrl`只做原URL语法同一化，明确未验证跳转或HTML canonical。每条保存准确query、搜索标题、检索日、结果引用和证据类型 `search-snippet`，统一标记 `search-index-only-unverified`、未直访、无商业发布授权。

`provinceEvidence/cityEvidence`明确区分搜索标题与摘要；新增 `provinceRaw/cityRaw`、`evidence.provinceText/cityText`保留支持该字段的原文。`queryProvince`只记录检索上下文，不能作为省市事实依据。原文未知应为null，本批43条的省市都有明文证据，因此没有依据query补写的null替换。本批按索引原文保留“资阳市简阳市”“红河州”等地域写法，不静默按现行区划改写。

搜索结果日期不冒充内容更新时间；旧路径中的年月只作为URL组成，不推断资料期。没有采集电话、床位、价格、资质或运营状态等商业字段。索引摘录不是源站正文，更不是经核实的业务事实。

## 验证与限制

已运行 `python data/private/yanglaocn-20261118/west-search/verify-candidates.py`，退出码0。本地验证通过：43条记录与URL唯一性、详情路径白名单、八省市分布（含贵州0）、明确地域原文、单query归属、CSV/JSON一致、9次查询未超过10次封顶、未核实/未直访/不可商业公开标记和Git忽略状态。结果已写入私有 `validation.json`；只验证本地完整性，没有核实源站或机构内容。

未运行前端构建和浏览器测试，因为只新增私有检索产物及研究记录，没有应用或公开构建变化。没有更新长期spec：未新增正式来源接入、实体匹配规则或公开字段contract。下一步仍需按源站允许的匿名低频访问路径独立核验，并确认字段与再展示授权；当前不应自动并入公开数据。
