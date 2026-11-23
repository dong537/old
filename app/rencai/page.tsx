import type { Metadata } from 'next';
import { PageTitle } from '@/components/DirectoryUi';

export const metadata: Metadata = {
  title: '养老人才 · 养老护理员职业技能等级',
  description: '说明养老护理员的定义、职业技能等级划分（五级/初级工到一级/高级技师），依据《养老护理员国家职业技能标准（2019版）》。',
};

const levels = [
  { name: '五级 / 初级工', desc: '入门等级，能承担基础生活照料。' },
  { name: '四级 / 中级工', desc: '能承担较复杂的生活照料与基础护理。' },
  { name: '三级 / 高级工', desc: '能独立承担复杂照护，具备一定带教能力。' },
  { name: '二级 / 技师', desc: '具备照护方案制定与团队管理能力。' },
  { name: '一级 / 高级技师', desc: '最高等级，具备培训、督导与技术创新能力。' },
];

export default function TalentPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="养老人才 · 养老护理员"
        lead="说明养老护理员的定义与职业技能等级，依据《养老护理员国家职业技能标准（2019版）》。本站不提供护理员个人查询，只整理公开的职业标准口径。"
      />

      <section className="card flex flex-col gap-4 p-6">
        <h2 className="m-0 text-[16px] font-semibold">什么是养老护理员</h2>
        <p className="m-0 text-[14px] leading-7 text-body">
          养老护理员是指从事老年人生活照料、护理服务工作的人员。根据《养老护理员国家职业技能标准（2019版）》，
          养老护理员职业技能等级分为五级/初级工、四级/中级工、三级/高级工、二级/技师、一级/高级技师。
        </p>
        <p className="m-0 text-[14px] leading-7 text-body">
          平台提供查询的养老护理员，是指在养老机构、居家社区养老服务机构和护理站中从事老年人生活照料、护理服务工作的人员。
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="m-0 text-[16px] font-semibold">职业技能等级</h2>
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {levels.map((level, index) => (
            <li key={level.name} className="card flex items-start gap-4 p-4">
              <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-tint text-[13px] font-semibold text-brand-ink">
                {index + 1}
              </span>
              <div>
                <h3 className="m-0 text-[15px] font-semibold text-ink">{level.name}</h3>
                <p className="m-0 mt-1 text-[13.5px] leading-6 text-body">{level.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card flex flex-col gap-2 p-5" aria-label="来源与口径">
        <h2 className="m-0 text-[14px] font-semibold">来源与口径</h2>
        <p className="m-0 text-[13px] leading-6 text-sub">
          依据《养老护理员国家职业技能标准（2019版）》。具体等级认定、证书与考核，以人力资源社会保障部门和民政部门的规定为准。
          本站不提供护理员个人资质查询，也不对任何个人或机构的持证情况作背书。
        </p>
      </section>
    </div>
  );
}
