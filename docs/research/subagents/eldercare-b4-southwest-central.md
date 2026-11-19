# B4 云南、江西珠山、河南涧西逐家原件私有核对（2026-11-18）

## 结果与计数口径

三份官方原件此前已冻结，本批**复用原件 3 份、新下载 0 份**，生成 861 条带物理行定位的私有来源观察。它们不是 861 家新发现的在营机构；确认新增机构 0、公开投影新增行 0。本站公开官方来源 manifest 目前在这三个省份均无逐名投影，不能因这次私有解析而改动该覆盖统计。

| 来源及范围 | 来源行 / 唯一名称键 | 有地址 / 床位及其他详情 | 同省企查查线索严格名称候选 | 未同名 |
| --- | ---: | --- | ---: | ---: |
| [云南省民政厅正常运营状态养老机构信息](https://ynmz.yn.gov.cn/zwgk/fdzdgknr/ylfw/202506/t20250616_3819534.html)，2025-06-16 发布，16 州市 | 834 / 834 | 地址 834；原表无床位列；保留州市和区县市 | 756 来源行、761 对线索行 | 78 |
| [景德镇市珠山区养老机构名单](https://www.jdzzsq.gov.cn/qmzj/zdly/shgysy/yl/t1059845.shtml)，2025-12-04 发布，仅一区 | 7 / 7 | 地址、总床位、全托/日托/护理床位、单位性质、经营状况和备案字段各 7 | 4 来源行、4 对 | 3 |
| [洛阳市涧西区养老机构备案 PDF](https://oss.ly.gov.cn/luoyang_jianxiqu/UploadFiles/xxgkzl/2025/3/202503111524580649.pdf)，表内截至 2024-12，仅一区 | 20 / 20 | 地址、备案编号、备案网站各 20；原表无床位列 | 15 来源行、15 对 | 5 |
| **合计** | **861 / 861** | **地址 861；总床位仅珠山 7** | **775 来源行、780 对** | **86** |

匹配只在同省采用 Unicode NFKC、去空白/括号/连接号的名称键；云南的 756 个匹配来源行也与既有同州市私有对账数一致。同名只是人工复核线索，未命中也不证明任一来源漏掉机构。企查查参考表在三省分别有云南 875、江西 1,681、河南 4,275 行；那是来源行，不是机构数。云南标题里的“正常运营”是 2025 年发布时陈述，涧西备案截至 2024-12，均不能证明今天仍运营。

## 原件与字段

| 原件 | SHA-256 | 物理位置 |
| --- | --- | --- |
| data/private/national-official-source/raw/yunnan-normal-operation-20250616.html | 38d32dbebe06b36037616ce9f4d00605183ec9e3174471ec3aa0cfd5b4591b63 | HTML 表第 3–836 个 tr，含 rowspan 展开 |
| data/private/national-official-source/raw/jiangxi-jingdezhen-zhushan-eldercare-20251204.xlsx | cf5b6e271c80826dfc6846268e900f7f7c1573e8c043d90ede07e9488861e75f | 工作表“景德镇市”第 5–11 行 |
| data/private/national-official-source/raw/henan-luoyang-jianxi-filing-20250311.pdf | aca314a53d7f3156acd3fe457d4ae359028e7fe4d70d418df4c05f874cc3eb0c | PDF 第 1 页表格序号 1–20 |

统一观察在 data/private/eldercare-regional-b4-20261118/southwest-central/source-observations.jsonl，每条保留 sourceId、原始名称、地址、来源列名/原值、物理行号、同省企查查同名候选的原表行号；summary.json 保存原件哈希、字段非空数、候选/未命中计数、资料日期、输出哈希及复核命令。云南负责人姓名、珠山负责人姓名和联系号码只留在既有原件，**没有复制到观察 JSONL 或本报告**。输出由 .gitignore 的 data/private/ 排除。

## 复核与发布边界

- 运行 py -3.11 -X utf8 data/private/eldercare-regional-b4-20261118/southwest-central/audit.py --check：通过；逐字节重建并比对 861 条观察及摘要，且核对三份原件与企查查参考表 SHA-256、表头、行数、物理位置。
- 既有云南解析器的 6 项行为测试、珠山解析器的 4 项行为测试均通过；本批脚本 py_compile 通过。最初按模块路径运行测试时，项目 tests/ 未作为可导入包而报导入错误；改用 unittest discover -s tests -p 指定文件后通过，未改测试代码。
- 云南省厅站点声明复制、引用和转载须书面同意；珠山及涧西未取得本站逐字段再展示许可。当前仅私有查漏，不改 public/。机构状态、床位和经营状况均为来源原表陈述，不作当前事实或空床承诺。
