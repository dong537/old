# 东北及天津官方养老机构逐名来源补缺（2026-11-17）

目标：在不登录、不处理验证码、不绕过 HTTP 429 的前提下，寻找天津、山西、内蒙古、辽宁、吉林、黑龙江可匿名取得、逐名可核、明确允许公开再利用的官方来源。只有实际取得的明细行计入本地官方来源投影；目录标称量不计。全部工作仅在本地。

## 可接入：天津南开区开放数据匿名预览（20 行）

- 数据页：天津市信息资源统一开放平台《南开区养老机构》，https://open.data.tj.gov.cn/sjjk/45e4998327f34ddd8dab66770999e631.htm；来源部门为南开区人民政府，页面标“无条件开放”，发布时间 2022-04-02 14:23，更新时间 2022-04-11 16:12。仅覆盖南开区当时的来源快照，不代表天津市全量或现时在营。页面原始 HTML 2026-11-17 匿名 GET 200，65,220 字节，SHA-256 a8ad003337e11ac5e270f56f134839e1280846a3e623a2c39e459d91e8256cf8；冻结在 Git 忽略的 data/private/national-official-source/raw/tianjin-nankai-preview-20261117.html。
- 页面内联的公开预览 JSON 实际有 20 条 list 行，previewCount=20，而 totalCount=42 只是目录元数据。20 行名称、地址均非空，名称 20 个互异。原表列顺序为“地址、联系电话、序号、名称”；预览数组按序号字符串排序，原序号为 1、10—19、2、20—27。公开 rowNumber 应定义为预览数组 1—20 位次，不能声称已取得 1—42 全部。公开投影仅保留名称、地址，联系电话列整列排除；原数据未给床位、资料截至日，保持未知。
- 平台《网站声明》https://open.data.tj.gov.cn/xgxx/wzsm/index.htm 载明“无条件开放的公共数据资源享有可自由利用、自由传播与分享的权利”，成果须注明来源为“天津市信息资源统一开放平台”；另外平台保留对在平台发布数据应用成果的审核权。本项目仅在自己的本地来源目录展示最小字段，并标明来源。该声明只覆盖该平台资源，不能转用到天津市民政局的另一站点。声明原页匿名 GET 200，15,278 字节，SHA-256 e91b7a6796877eae8a64a6618c6cc08d6af1355aa35eeb09098f8ccd4a1527ef，冻结在 data/private/national-official-source/raw/tianjin-open-license-20261117.html。
- 页面预览区域未见“下一页”、页码或分页请求代码：整页 HTML 的“下一页”与 pageNumber 出现次数均为 0，内联 list 只有 20 行。页面“在线测试”代码先检查登录，不能将此当匿名取得 42 行的通道。若以后正常登录获准取到更多行，需另行冻结、核验授权和个人字段，再重新锁定；本轮不尝试绕过。

## 天津其他来源：许可或访问边界未同时满足

- 天津市民政局站内搜索接口 https://mz.tj.gov.cn/igs/front/search.jhtml?code=ff9644063d5544388c5d4ffae036b2ab&searchWord=%E5%85%BB%E8%80%81%E6%9C%BA%E6%9E%84%E5%90%8D%E5%8D%95&pageNumber=1&pageSize=20&siteId=60&queryAll=true 返回 17 个 2025-02-17“养老机构名单-区/市级国办”结果，例如和平区 https://mz.tj.gov.cn/tjsmzjylc/gspd/yljgmd/202502/t20250217_6860416.html。和平区页匿名 GET 200，主体为图片，不是可直接核对的 HTML 行；页面显示发布时间 2025-02-17，图片路径和 Meta PubTime 另指向 2025-04-22，资料期不明确。
- 该名单页页脚直接链接天津市民政局自身《网站声明》https://mz.tj.gov.cn/GLLLM5475/WZSM8741/202008/t20200820_3491729.html；声明明确未经授权，不得利用该站内容进行商业性原版原式转载，授权使用也不得超范围。事实性字段的法律边界不在此推定，且没有明确允许本项目逐项商业再发布的许可，因此仅保留原站链接/私有参照，不进入公开投影。声明页匿名 GET 200，42,730 字节，SHA-256 00240f5b3f49f73236afa163161627066c5eaf6e2c8da3608da14db9acaf7f8e，冻结在 data/private/national-official-source/raw/tianjin-civil-statement-20261117.html。天津政务网 https://www.tj.gov.cn/glllm_55512/glsy/flsm/ 的法律声明另对商业、盈利、广告用途设许可条件，但本名单更直接适用民政局自身声明。
- 开放平台《养老机构基本信息》https://open.data.tj.gov.cn/sjj/9bd41f5c9eed4eb0b9635f49136e4a6c.htm（市民政局，2019-03-11 发布）和《和平区养老机构基本信息》https://open.data.tj.gov.cn/sjj/9dd1241c4e484808922f0ce74b37e7b7.htm（和平区政府，2025-10-09 附件）均标无条件开放，但页面仅列 XLS 附件。下载按钮脚本先 POST /cms/data/user/info，若无 data.object 即提示“用户尚未登录”；无登录会话的正常请求实测 HTTP 200、object=null、status=7010。未触发附件下载 URL /cms/data/docs/download.jsp?ID=ae9f70910628473a83cb067bd4d440b8，因为这会绕开页面登录判定。实际取得附件 0 份、明细 0 行，无文件 SHA。
- 《（天津市红桥区）养老机构备案》https://open.data.tj.gov.cn/sjj/c24d01fe69cf4a678162c39d2e69c780.htm 的摘要是“子项名称、办理类型、设定依据、备注、实施部门”，属于办事事项而非养老机构逐名名单；不能凭标题计数。

## 其他五地缺口（复核既有证据）

- 山西：运城市政府公开的《第二批养老机构等级评定结果》PDF，https://xxgk.yczf.gov.cn/xzf/ycmzj/fdzdgknr/gzdt/202512/P020251211324057464260.pdf；正文分级合计 177 家，但这是评定子集，且未核到商业逐项再发布许可，本轮未独立逐行取得。省开放门户 https://data.shanxi.gov.cn/ 本机直连超时。实际新增可公开行 0。
- 内蒙古：自治区开放平台两份民政厅目录 https://data.nmg.gov.cn/oportal/catalog/c04725bda62e4fa3b39ef442f88dc708 与 https://data.nmg.gov.cn/oportal/catalog/72669ae062854c4bbba67d6723123418 标“无条件开放”，但正常匿名下载重定向登录、预览为空。字段说明含负责人、联系方式，若正常取得须排除。实际新增可公开行 0。
- 辽宁：沈阳开放目录 https://data.shenyang.gov.cn/oportal/catalog/c62d717ca7604549b40749a95527a102 标无条件开放但附件需要登录；大连开放平台正常首次查询即 429，已停止。另有省民政厅 2,375 行 XLSX 可作私有参照，但原页禁止未经授权转载。实际新增可公开行 0。
- 吉林：开放门户 https://data.jl.gov.cn/robots.txt 2026-11-17 本机直连返回 User-agent: * / Disallow: /，未继续抓取；民政厅首页 https://mzt.jl.gov.cn/ 返回 403。实际新增可公开行 0。
- 黑龙江：佳木斯市民政局公告 https://www.jms.gov.cn/jms/c100186/202610/c04_314158.shtml 及 XLS 附件可匿名取得 88 行，覆盖佳木斯市内县区；本项目既有私有冻结 SHA 详见 north-official-sources-2026-11-17.md。但尚未找到附件逐项商用再发布的明确许可，不能将 88 行计入公开投影。省开放门户 https://data.hlj.gov.cn/ 本机直连超时。实际新增可公开行 0。

上述网络状态只是本轮观测，不等于相关数据不存在。内蒙古、辽宁、佳木斯的逐项证据、哈希与限制详见同目录 north-open-data-round2-2026-11-17.md 和 north-official-sources-2026-11-17.md。本轮不把任何目录标称数、搜索结果数或民政公告发布日期当作已取得明细行数、资料截至日或当前在营证明。
