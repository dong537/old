# 养老信息网 B2 私有查漏与对账（2026-11-18）

## 范围和证据口径

沿用上一批 `combined-final/` 的 167 个去重详情 URL，优先整理外部搜索索引中的新标准路径链接，并对既有仅链接项补充同 URL 地区线索。已读到的 robots 规则限制当前命名客户端，因此本批不再自动请求养老信息网源站；索引结果不算详情正文、当前在营或可发布字段。本批不改网站 `public/`、`out/`、页面、部署配置，也不调用付费工商接口。

`data/private/yanglaocn-20261118/combined-b2-final/` 是本批唯一合并口径，旧 `combined-final/` 保留供对照。合并脚本只接受明确列出的私有输入并拒绝覆盖已有输出；所有 URL 仅做路径语法归一，没有验证重定向或源站 canonical。

## 合并结果

| 指标 | 上批 | 本批 | 解读 |
| --- | ---: | ---: | --- |
| 输入观察 | 174 | 186 | 新增 9 条同 URL 索引地区观察和 3 条仅 URL 索引线索 |
| 去重详情 URL | 167 | 170 | 新增 3 个 URL，不等于新增 3 家机构 |
| 正文观察 | 1 | 1 | 本批未取得新的源站详情正文 |
| 完整搜索摘要层 URL | 110 | 110 | 与上批相同 |
| 同 URL 搜索索引地区层 URL | 0 | 9 | 仅存地区文本和结果引用，未存完整标题/摘要 |
| 仅页面链接层 URL | 56 | 47 | 9 条移到索引地区层 |
| 仅搜索索引 URL 层 URL | 0 | 3 | 名称、省市、来源资料日期均未知 |
| 地域待核 URL | 56 | 50 | 9 条补地区，同时新增 3 条未知地区 URL |
| 同省同名候选 URL / 记录对 | 3 / 5 | 5 / 9 | 只是待核关联，不是身份确认 |
| 确认新增机构 / 公开新增行 | 0 / 0 | 0 / 0 | 不把商业站线索提升为网站的已核实机构 |

9 条同 URL 地区证据逐条保存在 `b2-link-region/search-evidence.json`；已核对其候选 ID、URL、名称均与旧基线一致。两条北京名称因此与本地官方来源及机构线索表形成同省同名候选：北京市东城区景山兆如老年养护中心、北京市朝阳区劲松老年家园。该索引只保存了地区文本、搜索查询和结果引用，没有完整结果快照，**不能据此确认具体机构身份**。

外部索引查新归档了三条旧基线外标准路径：`/ylyxx/y26033.html`、`/shtml/ylyxx/2022-09/yly166348618427703.html`、`/ylyxx/y25705.html`。只保留了“韶关爱民”“惠州惠康”“创乐福”标题片段，未保留完整标题或摘要；合并时三条的机构名称、省份、城市都为 `null`。研究 agent 实际进行了 48 次外部搜索，超过原 brief 的约 25 次目标；已停止扩搜，逐次查询见 `b2-research/queries.json`。

## 数据入口和复核

- 本批总表：`data/private/yanglaocn-20261118/combined-b2-final/reconciled-candidates.csv`；原观察与候选关系：同目录 JSON；输入文件哈希和分层统计：`summary.json`。
- 新 URL 的原始索引线索：`b2-research/leads.json`；`candidates.json` 也会按仅 URL 层读取，不能被当成完整搜索摘要。
- 9 条地区线索：`b2-link-region/search-evidence.json`；其来源仍是外部搜索索引，而非养老信息网正文。
- 旧基线的六个输入保持不变：四批索引、一次正文观察、一次已取得页面的链接观察。
- 离线对账代码：`scripts/reconcile-yanglaocn-private.py`；回归：`tests/test_yanglaocn_reconciliation.py`。

## 独立官方核验与别名审查

独立官方核验覆盖 31 个 URL（广东 13、北京 5、江苏 13）。其中 **8 个**在已归档、经 SHA-256 校验的官方网页或附件正文中找到名称或名称变体提及（广东 5、北京 3）；其余 **23 个**只表示在本次检查的有限原件中未核到。北京“景山兆如”“劲松老年家园”虽在北京民政局附件逐字出现，商业 URL 仍无正文/地址交叉证明，身份保持未确认。逐条官方原始 URL、原件哈希、名称关系和歧义见 `b2-official/evidence.json`，方法及 31 条范围见 `docs/research/subagents/yanglaocn-b2-official.md`。本轮未重新取得官方网页；复用的是此前冻结的官方原件。

对 115 个已知省份但未精确同名的 URL，离线别名规则产生 **8 个 URL / 11 对来源行**的人工复核候选；其中 **5 个 URL / 7 对**进入无已见城市/区县冲突的优先表。另 50 个地域未知 URL 不做同省匹配，5 个已有精确候选不重复宽松匹配。发现 1 对城市冲突、3 对区县冲突；济南华森“槐荫区/历下区”及黄桥镇敬老院“海陵区/泰兴市”已从优先表排除。结果见 `b2-resolve-b2-final/`，规则和逐项限制见 `docs/research/subagents/yanglaocn-b2-resolve.md`。这 8 个宽松候选与官方提及、精确同名口径可能重叠，不能相加当机构数。

## 验证和剩余限制

- `python -X utf8 -m unittest discover -s tests -p 'test_yanglaocn*.py' -q`：34 条相关测试通过。对账解析器额外区分“索引地区”“索引仅 URL”和真实搜索摘要；同批 `candidates.json` 也不能误将仅 URL 线索算成摘要。
- 对 `combined-b2-final/` 与 `b2-resolve-b2-final/` 执行 `--check`，均逐字节重算一致；旧 `combined-final/` 保持 167 URL。
- 官方核验独立复读 31 个不同候选 ID、8 条正文名称提及；全部身份确认、当前在营和公开资格字段保持否/未知。`b2-official/evidence.json` 的 SHA-256 为 `b723243641866aeb12fe4ad1854e3895b3968694ec3c75de8c75d2bebaaae203`。
- 本批所有新增材料仍仅在私有目录和研究文档；没有新的可直接发布机构行，也没有进行生产构建或浏览器验收，因为公开应用未变。
- 未取得该站其余详情正文；9 条地区索引观察没有完整搜索结果快照，3 条新 URL 只留标题片段。已覆盖的查询不能证明全站或全国已采完，也不能证明名单当前在营。后续需站方允许的导出/API 或独立官方逐家核验后，才有条件把字段加入公开档案。

只读复算命令（从项目根目录执行）：

```powershell
$b = 'data/private/yanglaocn-20261118'
$inputs = @('national-search/candidates.json', 'south-search/leads.json',
  'west-search/candidates.json', 'northwest-search/leads.json',
  'access/detail-observation.json', 'access/discovered-links.json',
  'b2-link-region/search-evidence.json', 'b2-research/leads.json')
$a = @(); foreach ($item in $inputs) { $a += @('--input', "$b/$item") }
python -X utf8 scripts/reconcile-yanglaocn-private.py @a --output "$b/combined-b2-final" --check
python -X utf8 scripts/resolve-yanglaocn-b2-private.py --check
python -X utf8 -m unittest discover -s tests -p 'test_yanglaocn*.py' -q
```
