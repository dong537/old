# 北方省份无条件开放数据第二轮核验（2026-11-17）

目标是寻找辽宁、吉林、黑龙江、内蒙古、山西、河南、宁夏、新疆中尚无公开官方来源投影的省份，且同时满足：官方数据来源、明确允许开放利用、匿名可取得逐名记录。已有的银川和佳木斯公告不在本轮重复判断。本轮未找到同时满足三项的新增省份数据，因此没有修改公开 builder、manifest 或应用源码；目录标题和元数据数量均不计为已取得记录。

## 内蒙古自治区：目录可见，两个逐名文件需登录

- 官方门户：https://data.nmg.gov.cn/oportal/catalog/index?Q=养老&page=1&openType=1；本机绕过本机代理直连 GET 200，查询结果含自治区民政厅《全区已登记养老机构查询》https://data.nmg.gov.cn/oportal/catalog/c04725bda62e4fa3b39ef442f88dc708 和《全区已备案的社会办养老机构查询》https://data.nmg.gov.cn/oportal/catalog/72669ae062854c4bbba67d6723123418。二者目录均标“无条件开放”，发布时间 2025-03-31，数据更新时间 2025-06-11，各有 ZIP 文件约 54.9 KB 和 36.2 KB；这些是文件标称大小，不是已取得明细的大小或机构数。
- 登记目录的公开字段说明为机构类型、旗县、服务机构名称、具体地址、负责人、联系方式；社会办备案目录为盟市、旗县、服务机构名称、具体地址、负责人、联系方式。将来若获得文件，公开投影必须排除负责人及联系方式，且“登记”和“备案社会办”属于不同来源，不宜直接拼成去重机构总数。
- 实际匿名下载：使用目录 HTML 中的 file-id，通过页面脚本采用的 GET /oportal/catalog/download，传 cataId、cataName、idInRc，带普通 User-Agent 和原页 Referer，两个目录均返回 HTTP 302、Location 为 https://data.nmg.gov.cn/oportal/login。前端隐藏值 download_check=0 并未使服务器允许匿名下载；随后访问统一身份认证页面也只是登录 HTML，不是 ZIP。登记目录的 POST /oportal/catalog/c04725bda62e4fa3b39ef442f88dc708/getData（form 为 param=）返回 recordsTotal=0、data 为空；该目录页也没有数据预览标签。因此没有匿名逐行数据，不接入公开投影，也不绕过登录。
- 使用条件结论：目录的“无条件开放”标签不足以证明匿名获取实际成功；即使法律上可利用，也必须先经正常平台流程取得文件并核对许可、行数、日期和个人字段。本轮未冻结文件原件。

## 辽宁省：聚合门户有目录，但未获得匿名明细

- 官方门户：https://data.ln.gov.cn/oportal/catalog/index?Q=养老&page=1&openType=1；本机直连 GET 200，查询结果总数标为 14，跨沈阳等市。值得后续申请的目录有沈阳市民政局《沈阳市养老机构基本情况明细表》https://data.shenyang.gov.cn/oportal/catalog/c62d717ca7604549b40749a95527a102（页面显示 2021-08-27 更新，XLSX 附件）、沈北新区《养老机构信息》https://data.shenyang.gov.cn/oportal/catalog/87645d931f2d4a8686061cfa319e478d（2025-11-20 更新，XLSX 附件），以及新民市公办/民办两份目录。页面均标无条件开放，但文件目录的前端值 download_check=1，点击下载需要登录。铁西区 API 目录 https://data.shenyang.gov.cn/oportal/catalog/f7f8553229db4223bc89a71f15cae683 自身标数据量 0，不提供可用机构明细。
- 大连市公共数据开放平台 https://data.dl.gov.cn/ 本机直连 GET 200，但第一次正常 POST /api/open/openData/page 空查询即返回 HTTP 429“操作过于频繁”，未取得可核数据集；停止请求，没有尝试绕过反爬或验证码。
- 葫芦岛数据目录在辽宁聚合搜索中可见，但其 http://data.hld.gov.cn:8081/oportal/catalog/5dc2df4889324780a12d1f0dead7717d 本机直连连接超时，不能确认明细、许可或下载。

## 其余门户可达性与后续

- 吉林省公共数据开放平台 https://data.jl.gov.cn/ 使用普通浏览器 User-Agent、本机直连时 GET 200，应用是动态目录；本轮尚未核到明确养老机构数据集，不能将省级门户可达视为有可用明细。
- 河南旧开放入口 https://data.hnzwfw.gov.cn/odweb/index.htm 重定向综合政务网；https://data.henan.gov.cn/ 连接异常。宁夏开放入口 https://opendata.nx.gov.cn/portal/index 本机直连超时。山西、黑龙江候选门户本机直连超时。上述只是本轮网络观测，不等于数据不存在。
- 下一步应走平台正常注册/申请取得已列出目录文件，或继续寻找无登录直接下载且许可清楚的市级政府开放数据集。取得文件前不能使用目录标称数量补全国覆盖，也不应把普通公告的“主动公开”推定为允许商业平台逐项再发布。
