# B3 商业养老目录查漏（2026-11-18）

## 三站访问结论

| 站点 | 规则与本轮动作 | 可用证据 |
| --- | --- | --- |
| 养老信息网 `yanglaocn.com` | 上轮已读到针对当前命名客户端的禁止抓取规则，本轮不直接自动请求源站。 | 沿用 `data/private/yanglaocn-20261118/combined-b2-final/` 的 170 个私有 URL 线索；不是本批新下载正文。 |
| 养老网 `yanglao5.com` | 2026-11-18 重新读取 robots.txt：通用组 Allow，但 GPTBot 等命名组 Disallow 全站；本轮不自动请求目录或详情。 | 既有竞品审查记录的 538 个详情 URL 是上轮站点地图口径，本批不重复计入新增。 |
| 养老机构网 `xyanglao.com` | robots.txt 的通用组禁止 `wp-admin/`、`wp-json/` 与特定查询参数，提供公开 sitemap；本轮仅访问未禁止的站点地图和少量公开详情样本。 | 两段机构 sitemap 原件及完整 URL 清单在 `data/private/eldercare-multisource-b3-20261118/commercial/`。 |

上述 robots 结论不等于商业再展示许可。三站的机构身份、在营、空床、价格和服务均不能仅凭商业目录自动写入网站官方事实字段。

## 养老机构网站点地图

2026-11-18 归档 `sitemap.xml`、`sitemap-institution-1.xml`、`sitemap-institution-2.xml` 与 robots 原件，记录取得时间及每份 SHA-256。两段分别列 4,000 和 2,363 个机构路径，去重后 **6,363 个 URL**、跨段重复 0；这只是网站声明的路径，不等于 6,363 家独立或当前在营的养老机构。4,036 个 URL 末段可解码出汉字标签，2,327 个为代码等非汉字路径；URL 标签未当成详情 H1 或机构原名。站点地图 `lastmod` 也未当成机构资料日期。完整清单见 `commercial/inventory.json`，原件哈希与计数见 `commercial/summary.json`。

只用 URL 路径汉字标签与本地 41,955 条机构线索、7,719 条全国官方来源及 781 条广东官方来源做全局严格同名**候选**比对：921 个 URL 标签对应 1,049 对来源行，其中机构线索 900 对、全国官方 143 对、广东官方 6 对。122 个 URL 对应多行；“爱心老年公寓”一项跨多个省份，更不能自动认作同一家。没有从 URL 猜省份，没有把同名候选确认为身份，新增公开行 0。逐对结果见 `commercial/xyanglao-crosswalk/candidates.csv` 和 JSON；统计及输入快照哈希见同目录 `summary.json`。

另独立归档了跨两段 sitemap 的 **12 个公开详情页样本**（中文路径、代码路径各 6）。12/12 返回 HTTP 200 且有可见 H1；机构名称、地址、设施类型各 12 条，地区 10 条，另 2 页原文为“-”并保留 null。12/12 均标“信息待核验”；5 个与现有官方来源同名的详情页 H1 与候选名文字一致，身份仍未确认。页面参考月费、评分及平台热线不提取为机构事实。原 HTML、逐页 URL/时间/hash、字段 XPath/行号与验证脚本见 `commercial/xyanglao-detail-sample/`，方法见 `docs/research/subagents/eldercare-b3-xyanglao-sample.md`。其余 6,351 个 sitemap URL 未取详情正文。

## 复核

从 `commercial/` 目录运行：

```powershell
python -X utf8 collect_xyanglao.py --check
python -X utf8 crosswalk_xyanglao.py --check
python -X utf8 -m unittest test_collect_xyanglao.py test_crosswalk_xyanglao.py -q
python -X utf8 xyanglao-detail-sample/verify_sample.py
```

四项检查均通过：两份 sitemap 共 6,363 URL、严格路径标签同名 921 URL/1,049 来源行对、4 条解析/候选规则测试、12 个详情原件与解析值。原件和交叉表在 Git 忽略的私有目录；未改 `public/`、页面、部署配置或业务代码。
