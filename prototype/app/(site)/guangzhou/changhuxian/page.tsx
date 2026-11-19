import Link from "next/link";
import { listHomes, listServices } from "@/lib/store";
import { SOURCES } from "@/lib/content";
import { homePath, jigouPath, servicePath, shangmenPath } from "@/lib/paths";
import { JsonLd } from "@/components/JsonLd";
import { Notice, PageTitle, SampleTag } from "@/components/ui";

export const metadata = { title: "广州长护险指南：谁能申请、怎么评估、住机构和在家护理各有哪些定点" };

const FAQ = [
  {
    q: "长护险是什么？",
    a: "长期护理保险，给失能老人的护理费用报销一部分。按国家部署，长护险制度要在 2028 年底前基本覆盖全国；广州是较早开展的城市之一。",
  },
  {
    q: "谁能申请？",
    a: "参加广州医保、因年老或疾病长期失能、需要长期护理的人，经过失能评估达到标准后可以享受。具体参保类别和条件，以广州市医疗保障局现行规定为准。",
  },
  {
    q: "怎么申请？",
    a: "先提出失能评估申请，评估通过后，选择定点服务机构签订服务协议。住机构的选「机构护理」定点，在家护理的选做「居家护理」的定点服务商。",
  },
  {
    q: "住机构和在家护理有什么区别？",
    a: "机构护理是住进长护险定点的养老机构或护理院；居家护理是定点服务商派护理员、护士上门。两种的服务内容和报销方式不同，具体以医保经办机构核定为准。",
  },
  {
    q: "能报多少？",
    a: "报销比例和限额按广州现行政策执行，会随政策调整。本页不写具体比例，避免引用过时的数字；请以广州市医疗保障局公布的规定和定点机构的结算单为准。",
  },
  {
    q: "怎么知道一家定点服务商靠不靠谱？",
    a: "广州市医疗保险服务中心每年公布定点服务机构的综合考核结果，分优秀、良好、合格、不合格。服务商档案里都标了，「不合格」会放进风险提示。",
  },
];

export default function ChanghuxianGuide() {
  const homes = listHomes().filter((h) => h.ltci);
  const services = listServices().filter((s) => s.ltci);
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        }}
      />
      <PageTitle
        title="广州长护险指南"
        lead="失能老人要长期护理，先看能不能用长护险。住机构选「机构护理」定点，住在家选「居家护理」定点服务商；两类定点名单都来自广州市医疗保险服务中心的公示。"
      />
      <div className="card flex flex-col divide-y divide-hair">
        {FAQ.map((f) => (
          <details key={f.q} className="group px-5 py-4" open={f.q === "怎么申请？"}>
            <summary className="cursor-pointer text-[16px] font-semibold marker:text-brand">{f.q}</summary>
            <p className="m-0 mt-2 text-body">{f.a}</p>
          </details>
        ))}
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card flex flex-col gap-3 p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="m-0 text-lg font-semibold">机构护理定点（{homes.length} 家）</h2>
            <Link href={jigouPath({ ltci: "1" })} className="text-[13px]">去筛选</Link>
          </div>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px]">
            {homes.map((h) => (
              <li key={h.id} className="flex items-center gap-2">
                <Link href={homePath(h.id)}>{h.name}</Link>
                <span className="text-sub">{h.district}区</span>
                <SampleTag />
              </li>
            ))}
          </ul>
        </div>
        <div className="card flex flex-col gap-3 p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="m-0 text-lg font-semibold">居家护理定点（{services.length} 家）</h2>
            <Link href={shangmenPath({ ltci: "1" })} className="text-[13px]">去筛选</Link>
          </div>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px]">
            {services.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <Link href={servicePath(s.id)}>{s.name}</Link>
                <span className="text-sub">服务{s.areas.join("、")}区</span>
                {s.ltciReview && <span className={`text-[13px] ${s.ltciReview.result === "不合格" ? "text-risk" : "text-sub"}`}>考核：{s.ltciReview.result}</span>}
                <SampleTag />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Notice>
        官方名单要分两份看：年度考核结果（2025 年度共列 250 家定点机构）不区分机构护理和居家护理；新增定点公示里有「服务类别」一栏，能看出哪些做居家护理。平台把两份合到一起，每家标清楚。
      </Notice>

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-lg font-semibold">参考来源</h2>
        <ul className="m-0 flex flex-col gap-1 pl-5 text-[14px]">
          {[SOURCES.ltciReview, SOURCES.ltciNew, SOURCES.ltciPolicy].map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>
              <span className="text-sub">（{s.publisher}）</span>
              {!s.checked && <span className="ml-1 text-xs text-gradeD">待核对原文</span>}
            </li>
          ))}
        </ul>
        <p className="m-0 text-xs text-sub">本页名单中的机构是原型示例，不是真实的定点机构。</p>
      </section>
    </>
  );
}
