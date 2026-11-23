import { sitePath } from '@/lib/site-path';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { catalog } from '@/lib/catalog';
import { PageTitle } from '@/components/DirectoryUi';
import { SourceNote } from '@/components/SourceNote';
import nationalManifest from '@/public/data/qcc-national/manifest.v1.json';
import officialManifest from '@/public/data/national-official/manifest.v1.json';
import institutionReferenceManifest from '@/public/data/qcc-institutions/manifest.v1.json';

export const metadata = { title: '方法论：收录范围、资料来源与字段说明' };

const TOC = [
  ['commitments', '我们不卖什么'], ['scope', '收录范围'], ['sources', '数据来源'], ['registered-subjects', '登记主体'], ['care-records', '长护险记录'],
  ['grades', '可信度等级'], ['risk', '风险提示'], ['freshness', '保鲜期'],
  ['sorting', '列表排序'], ['rankings', '榜单'], ['leads', '预约与线索'],
  ['reports', '报错与申诉'], ['privacy', '个人信息'], ['fees', '平台怎么收费'],
] as const;

function Sec({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className="section">
    <h2 className="m-0 text-lg font-semibold">{title}</h2>
    {children}
  </section>;
}

export default function RulesPage() {
  return <>
    <PageTitle title="方法论" lead="养老信源怎么收数据、怎样标明来源，以及哪些资料目前还不知道。这里说明当前目录的实际范围和使用方式。" />
    <nav aria-label="方法论目录" className="card flex flex-wrap gap-x-5 gap-y-2 p-4 text-[14px]">
      {TOC.map(([id, label]) => <a key={id} href={sitePath(`#${id}`)}>{label}</a>)}
    </nav>

    <Sec id="commitments" title="我们不卖什么">
      <ul className="m-0 flex flex-col gap-1.5 pl-5 text-body">
        <li><b>不把收录当作推荐。</b>官方名单收录不等于平台确认机构服务质量或目前仍在运营。</li>
        <li><b>不把未知写成没有。</b>尚未取得收费、空床、评级或处罚资料时，明确说明资料缺失。</li>
        <li><b>不把快照当成实时信息。</b>保留名单发布日期，实际情况仍需联系机构核实。</li>
        <li><b>当前只提供资料查询。</b>没有开通预约、交易、机构认领或付费排序。</li>
      </ul>
    </Sec>

    <Sec id="scope" title="收录范围：全国线索、官方来源、登记主体与广州专项">
      <ul className="m-0 flex flex-col gap-1.5 pl-5 text-body">
        <li>全国机构线索来自用户提供的《养老机构信息.xlsx》，共有 {institutionReferenceManifest.rowCount.toLocaleString('zh-CN')} 条企查查来源机构线索，按原表行政区划代码与“地区”列分为 {institutionReferenceManifest.provinces.length} 个省级地区、{institutionReferenceManifest.provinces.reduce((count, province) => count + province.cities.length, 0)} 个地市展示组。它与登记主体候选和官方来源可能重叠，来源行不等于独立机构，资料截至日未知，也不能证明当前在营或空床。</li>
        <li>广东以外另收录 {officialManifest.rowCount.toLocaleString('zh-CN')} 条跨省官方来源记录，来自 {officialManifest.sources.length} 组经核验的官方来源、覆盖 {officialManifest.provinces.length} 个省级地区。各来源范围不同，可能包含敬老院、社区照料设施或医院；来源行不能当作全国或所在省市的当前全量机构数。</li>
        <li>全国官方来源目录中的广东记录按 21 市各一份已取到的官方逐名来源展示名称线索。它们来自不同资料期，包含部分区县子集；列表数字是来源记录数，不是独立机构数或当前在营数。</li>
        <li>这些广东来源记录不自动与广州档案或工商主体合并，不提供电话、床位、价格、预约或当前营业状态。请逐条打开官方来源核对。</li>
        <li>广东以外另有 {nationalManifest.sourceFiles.length} 份企查查导出快照，共 {nationalManifest.rowCount.toLocaleString('zh-CN')} 条原始行，覆盖 {nationalManifest.provinces.length} 个省级地区、{nationalManifest.provinces.reduce((count, province) => count + province.cities.length, 0)} 个省市分组。与广东独立快照分别查询；这些是登记主体候选记录，不是全国养老机构名录或当前在营数。</li>
        <li>另有 6,777 条企查查导出的广东登记主体宽口径搜索结果，单独检索和计数；未逐条核实其养老关联，不等于 6,777 家养老机构。与官方来源同城同名的关联仅是候选线索。</li>
        <li>广州档案收录同一份广州市民政局公开名单中的 {catalog.institutions.length} 条记录，一条记录对应一份广州档案；展示名称、行政区、地址、可公开电话、备案床位及三项预收费标记。</li>
        <li>养老服务记录页列出医保官方年度考核和新增定点评估合格公示，不是当前全量定点名单。</li>
        <li>任何城市的来源行都不能视作该市完整、当前在营的养老机构数量。</li>
      </ul>
      <div className="flex flex-wrap gap-4"><Link href="/quanguo/laiyuan/">查看全国官方来源记录 →</Link><Link href="/quanguo/cankao/">查看全国机构线索 →</Link><Link href="/quanguo/zhuti/">查看全国登记主体候选 →</Link></div>
    </Sec>

    <Sec id="sources" title="数据来源">
      <p className="m-0 text-body">广州档案使用以下单份官方名单，保留原始名单序号。广东来源记录按城市展示不同日期的官方逐名来源；其他省市来源保留冻结原件 SHA-256、来源行序及可核的工作表行号。各来源发布日期与原文明示资料期分别标示，不把清洗归档日写成官方资料日期。其他省市的登记主体候选来自 {nationalManifest.exportedAt} 导出的企查查宽口径搜索快照，逐条保留原文件和行号，与官方来源分开。</p>
      <p className="m-0 text-body">全国机构线索来自用户提供并确认可公开展示的企查查《养老机构信息.xlsx》。本地接收日是 {institutionReferenceManifest.receivedAt}，不是机构资料截至日；原表省市派生列存在冲突，检索仍以相互一致的行政区划代码与“地区”列分组。详情逐列保留全部 11 个原列名和非联系字段原值及空值，包括地址、原始代码、补充省市区和经纬度；含联系方式的自由文本整格显示“[已遮蔽]”。私有 XLSX 原件保留不变，不随网站发布。这些来源字段未经逐家核验，不用于导航或替代已校验的登记代码。来源线索与官方机构来源之间尚未核实同一实体关系。</p>
      <SourceNote source={catalog.source} detailed />
      <div className="table-wrap"><table className="lg:table-fixed">
        <thead><tr><th scope="col" className="lg:w-[40%]">字段</th><th scope="col">来源与解释</th></tr></thead>
        <tbody>{[
          ['名称、地址、床位、性质', '名称、地址与备案床位来自官方原表；床位不代表当前空床，机构性质原表未提供。'],
          ['养老机构等级', '暂无可核验资料，不推断已评级或未评级。'],
          ['长护险新增定点评估合格公示', '独立记录公示时点与服务类别；公示不等于生效确认或全量定点名单。'],
          ['长护险年度考核等次', '独立记录年度考核结果；表格不区分居家护理与机构护理，也不证明当前定点状态。'],
          ['内设医疗机构、护理站执业', '暂无可核验资料，医疗安排需联系机构确认。'],
          ['登记主体、经营异常、行政处罚', '登记主体单独展示获授权的企查查导出快照；不据此确认养老机构运营关系。经营异常与行政处罚资料未接入。'],
          ['收费明细、上门价目', '暂无完整费目；原表预收养老服务费标记不代表收费金额或预收期限。'],
          ['押金、会员费存管', '原表只记录是否收取押金、会员费，不推导金额、资金存管或合规结论。'],
          ['护理员持证', '暂无可核验资料，不据此判断护理能力。'],
          ['探访、体验服务、回访', '尚未开展，不展示示例记录或评价。'],
        ].map(([field, description]) => <tr key={field}><td className="font-semibold">{field}</td><td className="text-body">{description}</td></tr>)}</tbody>
      </table></div>
      <p className="m-0 text-[13px] text-sub">广州官方档案保留原表行政区文字；行政区与地址不一致时提示核对，疑似占位号码不提供拨号链接，手机号格式的官方来源号码暂不展示。获授权的企查查表格另在对应详情保留原列名和非联系字段原值，公开联系方式按规则整格遮蔽。全省官方来源页仍只发布最小来源字段，不使用工商快照或省开放平台查漏表作为机构详情；登记主体另设独立页面。</p>
    </Sec>

    <Sec id="registered-subjects" title="登记主体资料的范围与局限">
      <p className="m-0 text-body">广东候选库来自 2026 年 11 月 16 日企查查高级搜索导出的广东省宽口径结果，共 6,777 条、覆盖 21 市；跨省候选库另收录 {nationalManifest.rowCount.toLocaleString('zh-CN')} 条原始行，覆盖广东以外 {nationalManifest.provinces.length} 个省级地区。两批分别保留来源、快照和计数，不能相加为养老机构总数；其中存在与养老服务关联未核实的记录。主体类型、登记状态、经营范围或行业分类都不能单独证明某个养老场所当前营业或具备服务能力。</p>
      <p className="m-0 text-body">当前公开官方来源包括广东及跨省目录中的局部资料；仅对广东官方来源记录与广东登记主体作同城同名候选关联，一条来源可能对应多个主体，必须另行核实实际运营关系。跨省登记主体与跨省官方来源行尚未自动关联，未显示关联不代表不存在机构。获授权的企查查导出在详情中保留全部 37 个原列名和非联系字段原值，空白及占位值也按来源保留；手机、电话、邮箱及含联系方式的自由文本整格显示“[已遮蔽]”。私有 XLSX 原件保留不变，不随网站发布。检索、分组及关联仍使用单独整理的字段，网址不自动生成外部链接。原始值不代表已经核验或实时有效。与既有查企GO工商登记照面相比，企查查导出不能补齐已缴金额、纳税人资质、人员规模、核准日期、登记部门、进出口企业代码和企业简称；导出的“企业规模”不等于“人员规模”。</p>
      <div className="flex flex-wrap gap-4"><Link href="/quanguo/zhuti/">查看全国登记主体候选 →</Link><a href={sitePath('/data/qcc-national/manifest.v1.json')}>查看跨省快照清单 →</a></div>
    </Sec>

    <Sec id="care-records" title="长护险记录与口径">
      <p className="m-0 text-body">广州长护险公开记录分为年度考核和新增定点公示。考核记录说明对应年度发布的考核结果；年度表没有区分机构护理和居家护理。新增公示只说明评估合格并进入公示阶段，不代表公示期间后已经完成定点生效确认。两类数据都不能据此判断当前有效资格、全量覆盖或实际服务能力。</p>
      <p className="m-0 text-body">记录逐行保留官方表格的序号、名称、地址和资料日期，同名记录不合并。所属区若由地址文本辅助提取，会标记为推导，不当作服务范围。</p>
      <div className="flex flex-wrap gap-3"><Link href="/guangzhou/shangmen/" className="btn-primary btn-sm">检索养老服务公开记录</Link><Link href="/guangzhou/changhuxian/" className="btn-outline btn-sm">查看申请指南</Link></div>
    </Sec>

    <Sec id="grades" title="可信度等级（暂未启用）">
      <p className="m-0 text-body">当前没有给机构评定 A–D 可信度等级，也没有服务质量评分。官方名单来源、资料完整程度与服务好坏是不同的判断。</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        <li className="flex flex-wrap items-center gap-2"><span className="chip bg-official-bg text-official">官方公开资料</span><span className="text-body">说明字段出处，不表示平台已实地核验。</span></li>
        <li className="flex flex-wrap items-center gap-2"><span className="chip bg-gradeC-bg text-gradeC">暂无资料</span><span className="text-body">尚未取得证据，不表示该项服务不存在。</span></li>
        <li className="flex flex-wrap items-center gap-2"><span className="chip bg-gradeD-soft text-gradeD">待核对</span><span className="text-body">原表有需要核对的信息，不是对机构的风险定性。</span></li>
      </ul>
    </Sec>

    <Sec id="risk" title="风险提示">
      <p className="m-0 text-body">原表资料提示用于指出地址、电话等需要核对的内容，与行政处罚、经营异常或服务质量结论分开。</p>
      <ul className="m-0 flex flex-col gap-1.5 pl-5 text-body">
        <li>本版未接入处罚、失信或服务质量核验资料；长护险考核只按原表年度记录展示，未展示的记录不能理解为“没有风险”或“当前不是定点”。</li>
        <li>押金或会员费的原表标记，不能单独证明资金存管情况或收费是否合法。</li>
        <li>工商登记与机构运营是不同关系；名称匹配不能直接证明实际运营或签约主体。</li>
      </ul>
    </Sec>

    <Sec id="freshness" title="资料日期与更新">
      <p className="m-0 text-body">官方名单发布于 <time dateTime={catalog.source.publishedAt}>{catalog.source.publishedAt}</time>。发布日期是来源日期，不是平台逐字段核验日期，也不是机构确认日期。</p>
      <p className="m-0 text-body">广东全省线索来自多个不同日期和覆盖范围的来源。资料截止期缺失时明确写“原文未说明”；相同名称可在不同日期重复出现，不能由此推断是同一家机构或现在仍在运营。</p>
      <p className="m-0 text-body">跨省来源逐份列示原文发布日期和资料期；缺失时保留“原文未说明”，不拿本站归档日期填补。各来源范围不同，床位数不等于当前空床，也不证明当前运营。</p>
      <ul className="m-0 flex flex-col gap-1.5 pl-5 text-body">{officialManifest.sources.map(source => <li key={source.id}>{source.province}{source.city ? ' · ' + source.city : ' · 跨城市'}：{source.title}，{source.rowCount.toLocaleString('zh-CN')} 条来源行；发布 {source.publishedAt ?? '原文未说明'}，资料期 {source.asOf ?? '原文未说明'}。{source.scope}</li>)}</ul>
      <p className="m-0 text-body">跨省登记主体候选的导出日期为 <time dateTime={nationalManifest.exportedAt}>{nationalManifest.exportedAt}</time>；这是第三方登记搜索结果快照，不能代替最新工商登记、养老机构备案或现场服务核验。</p>
      <div className="table-wrap"><table>
        <thead><tr><th scope="col">资料</th><th scope="col">当前状态</th></tr></thead>
        <tbody>{[
          ['名称、地址、电话与备案床位', '名单发布时的快照，联系或到访前再次核实。'],
          ['三项预收费标记', '保留该次公示状态，当前方案需向机构索取书面说明。'],
          ['收费金额、空床与可约时间', '暂无核验资料，不提供实时状态。'],
          ['长护险考核与公示记录', '保留各来源原始发布日期及行号；不同来源不能拼成当前全量名录。'],
          ['定期更新与机构自助确认', '尚未接入，不能承诺固定更新周期或自动提醒。'],
        ].map(([field, state]) => <tr key={field}><td>{field}</td><td className="text-body">{state}</td></tr>)}</tbody>
      </table></div>
      <div id="limits" className="scroll-mt-16 rounded-lg border border-gradeD-line bg-gradeD-soft px-4 py-3 text-[14px] text-gradeD">这是历史公开资料快照。机构可能更名、搬迁、调整服务或停止运营；请勿把名单收录、备案床位或预收费标记当作当前服务承诺。</div>
    </Sec>

    <Sec id="sorting" title="列表排序">
      <p className="m-0 text-body">列表保留官方原表顺序，按机构名称、行政区和地址搜索，并可按行政区筛选。多词搜索要求各关键词均能在上述字段中找到。</p>
      <p className="m-0 text-body">全省来源记录按城市、原文名称检索。它不是服务排序，也不支持按价格、空床或质量筛选。</p>
      <p className="m-0 text-body">跨省官方来源先选已收录省市，再按原表名称或地址检索；保留来源原始行号，不合并同名记录。未收录的省份可另行使用民政部全国查询核对。</p>
      <p className="m-0 text-body">全国机构线索先选省市，再按原表名称、地址或地区检索；列表保留 XLSX 来源行序，完全重复的来源行也不合并，不按床位或服务质量排名。</p>
      <p className="m-0 text-body">跨省主体候选先选省市，再按名称、主体类型和登记状态筛选；列表保留导出来源行顺序，同名不同来源行分别显示，不按服务质量排序。</p>
      <p className="m-0 text-body">当前没有质量排名、价格排序或付费置顶。对比页仅并列展示同一份名单的可核字段，最多选择 3 家。</p>
      <Link href="/quanguo/cankao/">查找养老机构 →</Link>
    </Sec>

    <Sec id="rankings" title="榜单与发布条件">
      <ul className="m-0 flex flex-col gap-1.5 pl-5 text-body">
        <li>当前没有可支撑机构排名的收费明细、探访、回访或报错处理数据。</li>
        <li>不根据名单顺序、备案床位或资料缺失情况生成“最好”“最推荐”等结论。</li>
        <li>榜单页面已开放，本期质量榜未发布；逐项说明发布条件，不展示示例机构或虚构分数。</li>
      </ul>
      <Link href="/quanguo/bangdan/">查看榜单与发布条件 →</Link>
    </Sec>

    <Sec id="leads" title="预约与线索（暂未开放）">
      <ul className="m-0 flex flex-col gap-1.5 pl-5 text-body">
        <li>当前没有接通机构预约、线索分发或商户后台，页面不提交预约申请。</li>
        <li>可拨打的官方名单固定电话会在档案中提供；疑似占位号码保留原文并提示核对，官方档案中的手机号格式号码暂不展示。企查查来源中的原始联系方式不公开，请通过机构当期官方渠道联系并核实。</li>
        <li>联系机构时请直接确认接收条件、当前床位、收费明细和到访安排。</li>
      </ul>
    </Sec>

    <Sec id="reports" title="报错与申诉（暂未开放）">
      <ul className="m-0 flex flex-col gap-1.5 pl-5 text-body">
        <li>尚未设立公开纠错邮箱或在线提交渠道，不显示提交成功或处理时限承诺。</li>
        <li>发现资料不一致时，请先通过原文发布单位或机构官方渠道核实。</li>
        <li>更新时对照新的官方名单逐条核对，保留来源日期与稳定档案编号。</li>
      </ul>
    </Sec>

    <Sec id="privacy" title="个人信息">
      <p className="m-0 text-body">当前目录无需注册即可查询，不通过预约、认领或报错表单收集联系人、手机号、老人的健康情况等资料。这些提交功能尚未开放。</p>
      <p className="m-0 text-body">请不要在网址搜索词中填写身份证号、手机号或病历。联系机构时，先确认沟通渠道和接收方身份。</p>
    </Sec>

    <Sec id="fees" title="平台怎么收费">
      <div className="table-wrap"><table>
        <thead><tr><th scope="col">项目</th><th scope="col">当前状态</th></tr></thead>
        <tbody>{[
          ['机构查询、档案与对比', '无需注册即可查看，当前页面没有收费流程。'],
          ['机构认领、年费会员', '暂未开放，没有可购买的套餐。'],
          ['探访预约、上门评估与线索包', '暂未开放，不提供充值或付款入口。'],
          ['押金、会员费及养老服务费', '本目录不接收这些款项，实际收费与签约条件请向机构核对。'],
        ].map(([item, state]) => <tr key={item}><td className="font-semibold">{item}</td><td className="text-body">{state}</td></tr>)}</tbody>
      </table></div>
      <p className="m-0 text-[13px] text-sub">公开 JSON 保留来源与快照标识。引用时请同时保留原始来源和发布日期，不把本地副本称为实时官方数据。</p>
      <div className="flex flex-wrap gap-3"><a href={sitePath("/data/guangzhou-institutions.v1.json")} className="btn-outline btn-sm">查看广州名单 JSON</a><Link href="/quanguo/cankao/" className="btn-primary btn-sm">返回查找养老机构</Link></div>
    </Sec>
  </>;
}
