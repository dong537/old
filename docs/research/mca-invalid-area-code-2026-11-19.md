# MCA 南太湖新区异常编码隔离

范围：仅 `fetch-mca-area-tree.py`、`build-mca-area-seeds.py` 与对应离线测试。禁止联网、猜补零、从 `code` 字段推导替代 `sbcode`，不修改原始响应或控制器。

## 证据与决策

- 私有证据：`data/private/mca-institutions-2026-11-18/diagnostics/area-child-61c11934c4e04524af2b935e81acb580-20261119.json`，不提交原始响应。
- 原始 HTTP body SHA-256：`0dd6d5d80e1708b13f46c6823903a99affa7af813452ff9a5843223063881559`。
- parent：`61c11934c4e04524af2b935e81acb580`；child：`05a899fd428f4716a0aa96623c7527f9`；level 3；南太湖新区；原始 `sbcode=33055200000`（11 位）。
- `code` 原值尾部为 `330524000000`，不能当成可靠的修正编码。
- Source of Truth 是校验过原始字节、哈希和父子关系的官方响应；隔离标记是本地派生审计信息，不写回 response/rawNode。
- 精确匹配 parent、id、name、level、sbcode、code、pathName；其他畸形码继续阻断。若上游修正为合法 12 位，正常校验路径自然恢复，不继续隔离。
- 遍历按官方 node ID 继续；`treeWalkComplete` 仅指遍历闭合，不表示列表覆盖完整。manifest 另列 `invalidCodeNodes` 和计数，标记不可用于列表查询、coverage gap 和证据 SHA。
- seeds 仅收合法 12 位编码。兼容现有 probe 的 `seeds + uncodedNodes` 枚举契约，`uncodedNodes` 作为既有不可查询节点桶容纳该异常，明确 `reason=invalid_official_sbcode`、`queryable=false`、原始 sbcode。新增 `missingCodeNodeCount` 和 `invalidCodeNodeCount` 分开统计，避免把非法值伪装为缺失值。
- probe 仍能按 ID 枚举异常节点的子级；这不代表可用其 sbcode 发送列表查询。

## 验证与下游

离线 TDD：先复现严格校验失败，再检验精确例外、不变原始字节、哈希/父子约束不放宽、其余树继续、种子排除及现有 probe 不漏节点。私有 diagnostic 测试在本机执行，其他环境无文件时明确 skip；合成 fixture 独立覆盖相同契约。

下游 `audit-mca-list-coverage.py` 另有严格代码校验，需要同步采用相同隔离判定，并显式报告缺口；不得把遍历完成或隔离节点排除等同于全国机构采全。控制器/汇总状态需展示该缺口。此文档是本次独立变更记录，未改长期规范。

验证结果（2026-11-19，离线）：

- RED：新增回归首次运行 5 项，3 项在原有 `invalid official sbcode` 校验处失败，2 项既有防线通过。
- GREEN：`rtk python -m unittest discover -s tests -p test_mca_invalid_area_code.py -v`：6/6（私有 diagnostic 测试实际执行，无 skip）。覆盖精确身份、原始 body/hash、父级层次、未来合法格式恢复、缓存零请求续跑、manifest 缺口篡改阻断、种子及 probe 联动。
- 回归：同命令分别指定 `test_mca_area_tree.py` 14/14、`test_mca_area_seed_audit.py` 5/5、`test_mca_level3_probe.py` 7/7、`test_mca_level4_overlay.py` 12/12；合计 44 项通过。
- 未发出网络请求，未改私有 diagnostic、真实缓存、resume/controller 或其它模块；尚未进行现场恢复采集。新增派生字段会改变 seed/probe source fingerprint，已有下游绑定必须按真实变更重新审计，不能手工改 hash 绕过漂移检查。
