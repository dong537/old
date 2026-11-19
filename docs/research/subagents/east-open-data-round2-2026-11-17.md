# 华东开放数据第二轮核验（2026-11-17）

本轮找到山东菏泽鲁西新区的局部来源，未取得山东全省完整在营机构名录。下列 23 是原始来源行，不是经去重或现状核实后的机构数。

## 山东：菏泽鲁西新区“养老机构信息”

- [山东公共数据开放网目录](https://data.sd.gov.cn/portal/catalog/CD7009EDC99348728AAAD80F06AE1BFE)标注来源部门“菏泽鲁西新区”、无条件开放、目录发布时间 2025-07-28、目录更新时间 2026-11-10、元数据量 23。目录内使用许可允许无条件开放数据自由利用、传播、分享，要求成果注明数据来源并定期反馈使用情况。冻结页面为 shandong-luxi-catalog-20261117.html，92,875 字节，SHA-256 568f35128dbf05492aabfdfdb3c5b0486aa4eabde063d6fc0607861e92cb1fb1。
- [2025-06-27 版本 CSV](https://data.sd.gov.cn/rcservice/docouter?docid=03578C1CF00E4767B5F284BAFA38C6E7)匿名直接下载，GB18030 编码，3,199 字节，SHA-256 780fd0150064bbb7946e15c51491412f305726019914863d2eba885e3130c2fc，表头加 23 行。[2026-11-10 版本 CSV](https://data.sd.gov.cn/rcservice/docouter?docid=744A681FF2C24CCF9EF9E4E41E24635C)794 字节，SHA-256 256877cea4ccfe1beee6488ccd331338cbf36a3434cccbd0bdee565e9108c14a，仅 5 行；这 5 行七列与旧版对应行完全相同，0 个新增。新版为何缩减不明，不能把 23+5 当作 28，或推断旧版 23 行仍全部在营。
- 两版七列均为统一社会信用代码、法人性质、机构名称、法定代表人、机构类别、机构地址、运营方式。公开投影仅展示名称和地址，床位保留未知；原 CSV、信用代码、负责人和其余列都不进入网页。文件版本日不等于资料截至日，原表未明示资料期。页面 scope 明示新区局部历史来源，不代表菏泽市或山东省全量。
- 两版 CSV 与目录页原件保存在 Git 忽略的 data/private/national-official-source/raw/；增量设计见 docs/superpowers/specs/2026-11-17-shandong-luxi-open-data-addition.md。正式发布前仍需落实许可要求的定期反馈和更新责任。

## 其他发现

温州开放平台数据集 6254《社区养老院地理位置信息》可匿名取得 31 行；名称与数据类型更接近社区养老服务设施，不能未经分类核验混作住养机构。温州数据集 6724 的 196 行旧快照和 14697 的地域冲突详见 east-official-sources-2026-11-17.md，尚未进入公开目录。

## 本地数据层验证

2026-11-17，增量投影快照 v1-b15ff6373851c423：11 组官方来源、6,298 行、广东以外 9 个省级地区、114 个公开 JSON，其中 shandong/heze 为 23 行。这里只完成离线数据层和扫描器验证，最终静态构建、真实浏览器验收和可回滚归档由父任务统一执行；未部署。

- python -m unittest tests.test_shandong_luxi_official_rows tests.test_shandong_luxi_projection tests.test_national_official -v：15/15，通过，含 23 行完整性、名称/地址私密列排除、两版 CSV 子集、目录许可与哈希、表头/行数/联系方式漂移负例。
- npx tsx --test tests/national-official-output.test.ts：18/18，通过，新增固定 CSV 输入与精确山东官方目录 URL、拒绝公开原 CSV 和错误目录的测试。
- python scripts/build-national-official.py --check：114 个 JSON、6,298 行逐字节核对通过。
- npx tsc --noEmit、git diff --check：exit 0。

工具环境：仓库在 C:/Users/Lenovo/Desktop/search/eldercare-sources，环境初始 cwd 是另一目录，已按项目文件修正；rtk 只用于外部可执行程序，PowerShell Get-Content 等 cmdlet 直接运行。
