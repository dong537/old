# 最终公开字段浏览器验收（2026-11-18）

## 范围和环境

本次为独立浏览器自测，不是真实家属用户测试，也不是全站功能/无障碍审计。只验收本轮公开字段遮蔽对三类详情及机构线索主流程的影响。

- 产物：主代理确认完整本地门禁 exit 0 后生成的最终 `out/`；没有复用先前中间构建的通过记录。
- 本机静态预览：`http://127.0.0.1:3118/eldercare/`，由 `scripts/preview.mjs` 读取最终静态文件；未部署外网。
- 真实浏览器：Playwright CLI 驱动的 headed Chrome，命名会话 `eldercare-privacy-20261118`。
- 验收脚本：`output/playwright/privacy-final-details.cjs`、`privacy-final-flow.cjs`、`privacy-final-keyboard.cjs`。
- 验收方法：实际导航/读取公开 JSON/表单筛选和检索/进入详情/返回/键盘操作/DOM 断言/截图与人工自评。

最终快照：

| 数据类型 | snapshotId | 来源行数 |
| --- | --- | ---: |
| 广东登记主体 | `v1-cf77dafa2a71210f` | 6,777 |
| 跨省登记主体 | `v1-6e9fc520f240f955` | 141,364 |
| 全国机构来源线索 | `v1-4ab89d0a078c4e13` | 41,955 |

这些数字是来源记录行数，不作为去重养老机构数或当前在营机构数。

## 三类详情结果

| 场景 | 最终公开路由（省略本机前缀） | 断言 | 结果 |
| --- | --- | --- | --- |
| 机构来源线索 | `/quanguo/cankao/detail/?province=p-4fa8c90e9504&city=c-04e2ba0b31ca&id=qi-6bc157e26959-4545` | HTTP 200；标题“二连浩特市民政事业发展中心”；原始字段 11 列；地址原值为“[已遮蔽]”；有遮蔽说明 | 通过 |
| 广东登记主体 | `/guangdong/zhuti/detail/?id=gd-qcc-cd49f423b2a09fd6ee4d` | HTTP 200；标题“东莞市寿康宁养老服务股份有限公司”；原始字段 37 列；有效手机号、更多电话、邮箱均为“[已遮蔽]”；有遮蔽说明 | 通过 |
| 跨省登记主体 | `/quanguo/zhuti/detail/?province=p-05e2ff124284&city=c-13e0f4cdf678&id=qcc-n-55cba50a067db7bfdc25` | HTTP 200；标题“三明市百家兴实业有限公司”；原始字段 37 列；有效手机号、更多电话为“[已遮蔽]”；有遮蔽说明 | 通过 |

三类详情分别在 320、375、768、1024、1440px 视口检查。页面 document/body 的实际 scrollWidth 分别为 305、360、753、1009、1425px，均不超过对应视口；没有页面级横向溢出。导航和本页目录沿用项目既有横向滚动形式。

最终三类详情运行期间监听到：`pageerror = 0`、`console error = 0`、`HTTP >= 400 = 0`。使用 CLI 补查整个会话，控制台共 0 error、0 warning；加载中的详情及关联 JSON 请求均返回 200。

## 机构线索主流程

1. 从 `/quanguo/cankao/` 选择广东省，再选择广州市，提交“查看线索”。
2. 在“名称、地址或地区”检索“广东颐年石溪养老院有限公司”。
3. 实际只显示 1 条来源线索，进入 `qi-6bc157e26959-30614` 详情。
4. 点击“返回线索目录（保留筛选）”后，URL 与检索前完全一致，省份、城市及关键词全部保留。
5. 结果页在 320px 视口的 document/body scrollWidth 为 305px，无页面级横向溢出。
6. 流程监听到 0 个运行时/控制台错误及 0 个 HTTP >= 400 响应。

返回后的路径：

`/quanguo/cankao/?province=p-ee410024807c&city=c-343599b7642b&q=广东颐年石溪养老院有限公司`

## 键盘和截图自评

- 新加载页面后，按 Tab 首个焦点为“跳到主要内容”链接；按 Enter 后焦点为 `main-content`，URL hash 为 `#main-content`。
- 检查了三类 320px 详情首屏与 320/1440px 检索结果截图：中文标题正常换行，主要正文与操作可读，未发现正文遮挡或页面溢出。长名称在输入框内保持原生输入框滚动/编辑语义。
- 本轮是按现有页面/组件契约做回归，没有视觉重构，也没有引入新的页面方向或竞品样式。

截图位于 `output/playwright/`：

- `privacy-final-institution-1440.png` / `privacy-final-institution-320.png`
- `privacy-final-guangdong-subject-1440.png` / `privacy-final-guangdong-subject-320.png`
- `privacy-final-national-subject-1440.png` / `privacy-final-national-subject-320.png`
- `privacy-final-filter-return-1440.png` / `privacy-final-filter-return-320.png`
- 同名 `-top.png` 为首屏裁切，用于人工自评，不替代完整截图。

## 限制

- 真实浏览器 200% 放大尚未完成：受控 Chrome 中 Ctrl+Equal 未改变 DPR 或 innerWidth，因此不把 `privacy-final-keyboard-zoom.png` 当作 200% 通过证据。已做 320px 等五档真实视口检查，但它不能替代浏览器缩放验证。
- 只做上述固定真实来源样本；没有逐一人工浏览 41,955/141,364/6,777 行，没有声称证明这些主体当前经营养老机构。
- 预约、认领和后台仍是未开放范围；本轮未验证或开启。
- 本浏览器验收子任务未修改生产应用源码、未部署远端站点。

