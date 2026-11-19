# B2 后续查漏任务（2026-11-18）

延续上一轮 167 条详情 URL 的私有档案。用户要求继续。上一轮机器人规则限制当前客户端，任何 agent 不再直接自动请求养老信息网，不换代理或身份绕过。外部搜索索引只能做发现线索；官方网页可正常访问，但保留标题、原始 URL、取得日期、真实正文/搜索摘要的区别。不要把搜索摘要或同名当作在营机构认证。不写 public、out，不部署，不使用付费工商积分。

输入：data/private/yanglaocn-20261118/combined-final/reconciled-candidates.json。原始 167 URL 不覆盖。三个子任务各写独立目录和报告，主线程合并。

## yanglaocn_b2_official

仅做独立官方/机构官网核验。优先处理 108 条 no-same-province-exact-name 中的广东 13 条，以及北京、江苏的较新线索。每条保存 candidateId、原名称、找到的原始 URL、页面或索引证据类型、实际取得日期、证据支持的原文名称和地区、歧义；找不到明确证据则保留未核。输出 data/private/yanglaocn-20261118/b2-official/ 和 docs/research/subagents/yanglaocn-b2-official.md。不要扩搜养老信息网，也不碰其他任务文件。

## yanglaocn_b2_resolve

只做本地宽松候选比对，不外搜；与上面官方核验和下面索引查新分开。输入 167 条合并结果、41,955 全国机构线索、8,500 官方来源快照。重点是 108 条同省名称未精确命中；按同省名称前后缀、可靠别名和现有地址作候选，保留来源 ID、匹配规则、分数与冲突，不自动合并。56 条地域未知标为不能做同省匹配。输出 data/private/yanglaocn-20261118/b2-resolve/ 和 docs/research/subagents/yanglaocn-b2-resolve.md。写新脚本先写行为测试，不能改旧合并脚本或其他 agent 文件。

## yanglaocn_b2_research

只用外部搜索索引发现上一轮没有的养老信息网标准机构详情 URL，不直接访问源站。重点广东及上轮空白的海南、贵州、山西、黑龙江、宁夏、青海、西藏；有界搜索约 25 次，负结果记录实际查询。只保留真实搜索结果的两类路径 /ylyxx/y数字.html 或 /shtml/ylyxx/YYYY-MM/yly数字.html，与旧 167 URL 去重。逐条保存 query、搜索标题和摘要、结果引用、地区文本证据和时间；不能从 query 或 URL 路径推断省市/资料日期。输出 data/private/yanglaocn-20261118/b2-research/ 和 docs/research/subagents/yanglaocn-b2-research.md。文章、目录与非标准路径另列，不能混机构详情数。

主线程将在三项完成后检查：原件和搜索证据、URL 去重、省市来源、同名冲突、与现有目录的候选关系，最后出新批统计。各子任务只改自己的新私有目录/报告，保护用户原有未提交改动。

## 本轮完成状态

三路子任务及主线程对账已完成，最终统计和复核命令见 `docs/research/yanglaocn-b2-2026-11-18.md`。私有合并结果以 `data/private/yanglaocn-20261118/combined-b2-final/` 为准：170 个去重 URL，其中 3 条新 URL 仅有索引链接证据；没有新增公开机构行。官方名称提及和宽松候选分别保存在 `b2-official/`、`b2-resolve-b2-final/`，均不代表已确认同一机构。
