import Link from 'next/link';
import { catalog, districts } from '@/lib/catalog';
import { SectionTitle } from '@/components/DirectoryUi';
import { sitePath } from '@/lib/site-path';

export const metadata = { title: '广州养老机构查询 · 按区查找并核对官方名单' };

const districtOrder = ['越秀区', '海珠区', '荔湾区', '天河区', '白云区', '黄埔区', '番禺区', '花都区', '南沙区', '从化区', '增城区'];
const signing = [
  { title: '确认实际服务', text: '先问能否满足老人的照护需求、目前是否有合适床位，再安排现场探访。备案床位不是当前空床。' },
  { title: '索取完整费用', text: '分别核对床位费、护理费、餐费、押金及退费条件。名单的预收费标记不等于收费金额。' },
  { title: '核对签约主体', text: '确认实际服务场所、运营方和合同签署方；官方名单收录本身不证明这些关系。' },
];

export default function GuangzhouPage() {
  return <>
    <section className="card flex flex-col gap-5 border-t-4 border-t-brand p-5 sm:p-7">
      <div className="flex flex-col gap-2">
        <p className="eyebrow m-0">广州 · 官方名单</p>
        <h1 className="m-0 text-[28px] font-bold leading-tight sm:text-[34px]">找广州养老机构，从所在区开始</h1>
        <p className="m-0 max-w-[760px] text-[16px] text-body">这份名单收录 {catalog.institutions.length} 条养老机构记录，覆盖 {districts.length} 个区。可按名称或地址检索，再打开档案核对地址、备案床位、电话及预收费标记。</p>
      </div>
      <form action={sitePath('/guangzhou/jigou/')} method="get" role="search" aria-label="搜索广州养老机构" className="flex flex-col gap-3 rounded-xl bg-page p-3 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="guangzhou-q" className="text-[13px] font-semibold">机构名称或地址</label>
          <input id="guangzhou-q" name="q" type="search" maxLength={80} placeholder="例如：机构名称、街道" className="field min-h-11 bg-white" />
        </div>
        <button type="submit" className="btn-primary min-h-11 shrink-0 px-6">查找广州机构</button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hair pt-3 text-[13px] text-sub">
        <span>名单发布于 <time dateTime={catalog.source.publishedAt}>{catalog.source.publishedAt}</time> · 收录不代表当前在营或有空床</span>
        <Link href="/guangzhou/jigou/" className="font-semibold">浏览全部广州记录 →</Link>
      </div>
    </section>

    <section className="flex flex-col gap-3" aria-labelledby="districts-title">
      <SectionTitle id="districts-title" title="按区找" extra="按官方名单中的所属区统计" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {districtOrder.filter(district => districts.includes(district)).map(district =>
          <Link key={district} href={'/guangzhou/jigou/?district=' + encodeURIComponent(district)} className="card flex min-h-16 flex-col justify-center gap-0.5 p-3 text-ink no-underline hover:border-brand hover:text-brand sm:p-4">
            <span className="text-[16px] font-semibold">{district}</span>
            <span className="text-[13px] text-sub">{catalog.institutions.filter(item => item.district === district).length} 条名单记录</span>
          </Link>)}
      </div>
    </section>

    <section className="card grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:p-6">
      <div className="flex flex-col gap-2">
        <h2 className="m-0 text-lg font-semibold">先看记录来自哪里</h2>
        <p className="m-0 text-[14px] text-body">广州档案来自广州市民政局公开名单，保留名单发布日期和原始序号。名单未提供当前月费、空床或运营状态，这些需要向机构核实。</p>
        <a href={catalog.source.url} target="_blank" rel="noopener noreferrer" className="text-[14px]">打开广州官方名单核对 ↗</a>
      </div>
      <div className="flex flex-col gap-2 border-t border-hair pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
        <h2 className="m-0 text-lg font-semibold">查其他地区与来源</h2>
        <p className="m-0 text-[14px] text-body">全国官方来源目录收录不同地区、不同日期的资料，不代表全国完整机构名录。全国机构线索也不是已核实的在营名单，两类记录不与广州名单数量相加。</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[14px]"><Link href="/quanguo/laiyuan/">查全国官方来源 →</Link><Link href="/quanguo/cankao/">查全国机构线索 →</Link></div>
      </div>
    </section>

    <section className="flex flex-col gap-3">
      <SectionTitle title="名单中的前五条" extra={<Link href="/guangzhou/jigou/">查看完整名单 →</Link>} />
      <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
        {catalog.institutions.slice(0, 5).map(item => <li key={item.id} className="card min-w-0 p-4">
          <Link href={'/guangzhou/jigou/' + item.id + '/'} className="break-words text-[15px] font-semibold">{item.name}</Link>
          <p className="mb-0 mt-1 text-[13px] text-sub">{item.district} · 官方名单第 {item.sourceRow} 条{item.qualityNotes.length > 0 ? ' · 有资料核对提示' : ''}</p>
        </li>)}
      </ul>
    </section>

    <section className="flex flex-col gap-3">
      <SectionTitle title="签约前看三件事" extra={<Link href="/rules/#limits">查看资料边界 →</Link>} />
      <div className="grid gap-3 md:grid-cols-3">{signing.map(item => <div key={item.title} className="card p-4"><h3 className="m-0 text-[16px] font-semibold">{item.title}</h3><p className="mb-0 mt-2 text-[14px] text-body">{item.text}</p></div>)}</div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[14px]"><Link href="/guangzhou/changhuxian/">广州长护险指南 →</Link><Link href="/guangzhou/shangmen/">查养老服务公开记录 →</Link></div>
    </section>
  </>;
}
