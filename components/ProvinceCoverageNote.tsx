import { sitePath } from '@/lib/site-path';

const localScope: Record<string, string> = {
  广州: '海珠区',
  揭阳: '普宁市',
  茂名: '高州市',
  梅州: '蕉岭县',
  清远: '清城区',
  韶关: '曲江区',
  阳江: '阳春市',
};

export function ProvinceCoverageNote({ city }: { city?: string }) {
  const shortCity = city?.replace(/市$/, '') ?? '';
  const scope = localScope[shortCity];
  return <div className="notice text-[14px] leading-relaxed" role="note">
    <p className="m-0"><strong>资料范围：</strong>21 市各选一份官方逐名来源；这里展示来源记录，不是独立或当前在营机构数。</p>
    {scope && <span className="mt-1 block">{shortCity}仅覆盖{scope}，不代表{shortCity}全市。</span>}
    {shortCity === '广州' && <span className="mt-1 block">同名可能与广州既有档案重合，数量不相加、不合并身份。<a href={sitePath('/guangzhou/jigou/')} className="underlink">查看广州235条官方名单档案</a>。</span>}
    <details className="mt-2"><summary className="cursor-pointer font-medium">查看来源口径与核验限制</summary><p className="mb-0 mt-2">各市仅收录一份官方逐名来源，记录跨越不同时期；不能据此判断全市机构是否收齐，亦不能判断当前是否在营。原文条目也包括长者、社区、居家服务中心和医院等名称，不能统称已登记养老机构。部分记录缺少逐行原件校验或可定位源行号，请以原始来源核对。</p>{!city && <p className="mb-0 mt-2">已知局部来源：广州仅覆盖海珠区、揭阳仅普宁市、茂名仅高州市、梅州仅蕉岭县、清远仅清城区、韶关仅曲江区、阳江仅阳春市。</p>}</details>
  </div>;
}

