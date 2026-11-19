# 公开投影数值联系方式防护复核（2026-11-18）

## 范围

- 仅修改 `scripts/build-qcc-institutions.py`、`scripts/build-qcc-national.py`、对应两份 Python 行为测试，以及 `components/InstitutionReferenceDetailView.tsx` 的隐私口径。
- 没有重建或写入 `public/`，没有运行 Next 构建、打包或部署。

## 修复

- 机构线索的地址和补充省市区字段，即使 Excel 将手机号保存为整数或浮点数，也执行联系方式检测；含联系方式的地址在摘要中不公开，在原始 11 列投影中整格遮蔽。
- 信用代码、床位数、经纬度等非联系字段保留原始数值。普通数值地址仍按既有规则拒绝，未用数值冒充可用地址。
- 跨省主体原始字段和规范化字段保留代码、资本、参保人数、年报年份、邮编、企业规模等非联系数值。自由文本中的数值手机号继续遮蔽。
- 跨省规范化自由文本补用既有座机检测，与原始字段遮蔽一致。
- 机构详情页明确保留原表 11 列，含联系方式的地址及其他自由文本已遮蔽；移除“完整地址原值保留”等不再准确的承诺。

## 验证证据

1. 新增数值地址/补充地区遮蔽、非联系数值保留测试，并增强规范化座机断言；先执行得到预期 RED：4 个数值子用例失败，1 个座机用例失败。
2. 修复后执行 `python -m pytest -q tests/test_qcc_institutions.py tests/test_qcc_national.py`：退出码 **0**，**27 passed、20 subtests passed**。
3. `python scripts/build-qcc-institutions.py --check`：退出码 **0**，1,022 个 JSON、41,955 行、31 省、375 个城市组，与现有公开投影完全一致；机构快照不因本次数值防护改变。
4. `python scripts/build-qcc-national.py --check`：退出码 **1**，首个差异为 `p-45db5e6d5fd4/c-e2d11378ac18/chunk-006.v1.json`，需要主任务重建跨省投影。
5. 对现有跨省 141,364 条公开详情只读聚合复核：新增规范化遮蔽命中 **1 格 mailingAddress**；旧审计中上述非联系规范化字段的遮蔽次数均为 **0**。未输出联系方式内容。
6. 目标文件 `git diff --check`：退出码 **0**。
7. 额外 TypeScript 检查中，`institution-reference-static.test.ts` 的 6 项通过；`qcc-institution-output.test.ts` 的 4 项合法基线 fixture 被同步变更中的扫描器拒绝，已交由扫描器负责 agent 修正，不重复编辑。最终整套门禁以主任务后续新鲜结果为准。

## 后续

- 主任务重建跨省投影及相依关联，重新执行完整发布门禁。
- 既有跨省座机正则需区号与号码之间有空格或短横线，本次只对齐规范化与原始字段，未扩大正则匹配边界；已向主任务报告供最终审查。
- `fast-context` 一次调用因缺少 Windsurf API Key 不可用，未重试或尝试提取凭据；使用已知路径、`rg` 和本地代码读取完成检查。
