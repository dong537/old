# 机构文章发布说明

本目录中的每个 JSON 文件代表一篇机构文章。文章由构建期读取并发布到机构页下；机构由稳定的全国平台 ID（institutionId）关联，不能按名称关联。一个机构可以有多篇文章，slug 在同一机构下唯一。

当前站点是 Next 静态导出，没有可用的线上投稿或审核 POST 接口。企业提供的资料先放在非公开的编辑工作区，由人工确认授权、来源、真实性和时效，再编成受审 JSON 并重建站点。不能把企业提交当作官方事实，也不能因为内容文件出现就自动判定服务、费用和空床为实时。

字段契约：schemaVersion 为 1；status 为 published 才生成页面；institutionId、slug、title、summary、authorLabel、publishedAt、updatedAt、evidenceAsOf 必填。sections 是按阅读顺序排列的 heading 与 paragraphs；每段 text 应有对应 sourceIds。sources 的每项有稳定 id、title、HTTPS url 和 observedAt。数值、服务和机构资质的说法应在段落中说明口径与时间，来源和正文不符时停发并回查。

发布前核对：机构 ID 确实对应目标机构；逐段能追到来源；资料时点是采集/记录时点而非当前状态；没有未经证明的探访、专家审核、服务质量或医疗建议；没有待补占位符、个人私有资料和无授权图片。发布后仍需在来源更新或纠错时人工复核，不能让历史文章默默变成“最新资料”。
