/** Curated exits for provinces where this site has no republishable official rows. */
export interface OfficialVerificationPointer {
  kind: 'regional' | 'national';
  title: string;
  url: string;
  scope: string;
  checkedAt: string;
}

const NATIONAL_QUERY: OfficialVerificationPointer = {
  kind: 'national',
  title: '全国养老机构信息查询',
  url: 'https://app.gjzwfw.gov.cn/jmopen/webapp/html5/qgyljgxxcx/index.html',
  scope: '自行选择地区、输入机构名称和验证码；查询结果不代表本站已收录官方来源。',
  checkedAt: '2026-11-18',
};

const REGIONAL_POINTERS: Readonly<Record<string, OfficialVerificationPointer>> = {
  山西省: {
    kind: 'regional',
    title: '山西省第二批养老机构等级评定结果（PDF）',
    url: 'https://xxgk.yczf.gov.cn/xzf/ycmzj/fdzdgknr/gzdt/202512/P020251211324057464260.pdf',
    scope: '全省第二批等级评定获评名单，2025 年 12 月发布、共 177 个名称；仅参评子集，后续等级有效性和当前在营状态须另核。',
    checkedAt: '2026-11-18',
  },
  内蒙古自治区: {
    kind: 'regional',
    title: '包头市青山区 2026 年养老机构备案表',
    url: 'https://www.qsq.gov.cn/zwgk/fdzdgknr/fd_zdlyxxgk/zdly_ylfw/202607/t20260715_939255.html',
    scope: '仅包头市青山区，2026 年 7 月发布的 14 条备案来源；不是内蒙古全区或当前在营机构总表。',
    checkedAt: '2026-11-18',
  },
  上海市: {
    kind: 'regional',
    title: '上海市 2026 年保基本养老机构（床位）名单',
    url: 'https://mzj.sh.gov.cn/2026bsmz/20260722/8c9c94c58ece4859ac4c6675f398584a.html',
    scope: '仅保基本养老机构（床位）子集，截至 2026 年 6 月；原页以图片列名，不是全市养老机构底表。',
    checkedAt: '2026-11-18',
  },
  江西省: {
    kind: 'regional',
    title: '赣州市 2026 年养老机构名录（下载 XLS）',
    url: 'https://www.ganzhou.gov.cn/zfxxgk/c143793/202606/a73d1b1b1bc14a38a23cf4bb17f9fb30/files/2cc78e4a47214af9b1a30457f483cbc1.xls',
    scope: '仅赣州市，2026 年发布；原表未注明独立资料截至日。外部下载不计入本站官方来源记录。',
    checkedAt: '2026-11-18',
  },
  河南省: {
    kind: 'regional',
    title: '洛阳市涧西区养老机构备案信息（PDF）',
    url: 'https://oss.ly.gov.cn/luoyang_jianxiqu/UploadFiles/xxgkzl/2025/3/202503111524580649.pdf',
    scope: '仅洛阳市涧西区，资料截至 2024 年 12 月；备案历史名单不证明目前仍在营。',
    checkedAt: '2026-11-18',
  },
  海南省: {
    kind: 'regional',
    title: '三亚市 2025 年养老机构备案公示',
    url: 'https://www.sanya.gov.cn/mzjsite/zdlyxxgkxx/202503/30b4dfe07ba94676b57f955ed30843f6.shtml',
    scope: '仅三亚市，2025 年 2 月发布的备案名单；不是海南全省或实时在营名录。',
    checkedAt: '2026-11-18',
  },
  贵州省: {
    kind: 'regional',
    title: '贵阳市云岩区养老机构查询',
    url: 'https://www.yunyan.gov.cn/ztzl/rdzt/lnrfw/zjg/yljgcx/',
    scope: '仅贵阳市云岩区，原页未注明资料截至日；含居家服务、日间照料等非住宿设施。',
    checkedAt: '2026-11-18',
  },
  云南省: {
    kind: 'regional',
    title: '云南省正常运营状态养老机构信息',
    url: 'https://ynmz.yn.gov.cn/zwgk/fdzdgknr/ylfw/202506/t20250616_3819534.html',
    scope: '覆盖云南省 16 州市，2025 年 6 月发布；原页未注明独立状态截至日，不证明今日仍在营。',
    checkedAt: '2026-11-18',
  },
  辽宁省: {
    kind: 'regional',
    title: '辽宁省 2024 年养老服务供给信息表',
    url: 'https://mzt.ln.gov.cn/mzt/zfxxgk/fdzdgknr/ylfw/jgxx/440F2BC00FF248B8800BF67C529E3C61/index.shtml',
    scope: '覆盖辽宁 14 地市；资料标题期为 2024 年，2025 年发布，不代表 2026 年在营状态。',
    checkedAt: '2026-11-18',
  },
  吉林省: {
    kind: 'regional',
    title: '吉林省 2026 年旅居养老服务机构名单',
    url: 'https://mzt.jl.gov.cn/xxgk_2643/tzgg/202606/t20260615_9648772.html',
    scope: '仅 2026 年旅居养老服务子集，含酒店、景区等；不是吉林全省住宿养老机构底表。',
    checkedAt: '2026-11-18',
  },
  黑龙江省: {
    kind: 'regional',
    title: '佳木斯市 2026 年合规养老机构公示',
    url: 'https://www.jms.gov.cn/jms/c100186/202610/c04_314158.shtml',
    scope: '仅佳木斯市，2026 年 10 月公示；名单当时的“合规”不证明今日在营。',
    checkedAt: '2026-11-18',
  },
  陕西省: {
    kind: 'regional',
    title: '西安市公办养老机构信息',
    url: 'https://mzj.xa.gov.cn/zxcx/ylfw/1991801583955382274.html',
    scope: '仅西安市公办机构，2025 年 11 月发布；不包括民办机构和陕西其他城市。',
    checkedAt: '2026-11-18',
  },
  甘肃省: {
    kind: 'regional',
    title: '张掖市养老机构基本信息表',
    url: 'https://www.zhangye.gov.cn/zyszfxxgk/fdzdgknr_5657/ylfw/yljg/202401/t20240106_1167788.html',
    scope: '仅张掖市，2024 年 1 月发布的历史名单；不代表甘肃全省或目前在营。',
    checkedAt: '2026-11-18',
  },
  青海省: {
    kind: 'regional',
    title: '青海省 2025 年新评定二星级以上名单',
    url: 'https://mzt.qinghai.gov.cn/html/show-13027.html',
    scope: '仅 2025 年新评定二星级以上的养老机构及服务设施子集；非全省在营机构总表。',
    checkedAt: '2026-11-18',
  },
  宁夏回族自治区: {
    kind: 'regional',
    title: '银川市正常运营养老机构基础信息表',
    url: 'https://www.yinchuan.gov.cn/xxgk/bmxxgkml/smzj/xxgkml_2049/ylfw/gzxx/202504/t20250415_4880863.html',
    scope: '仅银川市，资料截至 2025 年 3 月底；不代表宁夏全区或今日仍在营。',
    checkedAt: '2026-11-18',
  },
  新疆维吾尔自治区: {
    kind: 'regional',
    title: '乌鲁木齐市正常运营养老机构公示信息表',
    url: 'https://www.wlmq.gov.cn/wlmqs/c119167/202611/aa15ed42f65b46d5b21c916e8c27e394.shtml',
    scope: '仅乌鲁木齐市本级及 8 区县，2026 年 11 月发布；未注明独立资料截至日。',
    checkedAt: '2026-11-18',
  },
  西藏自治区: {
    kind: 'regional',
    title: '林芝市巴宜区 2025 年星级养老服务机构',
    url: 'https://www.bayiqu.gov.cn/byq/xwzx/202512/a04382c61dd44d0cbef91ef55dd028f8.shtml',
    scope: '仅林芝市巴宜区 4 处星级获评设施，含日间照料中心和农村幸福院；不是西藏全区住宿机构名单。',
    checkedAt: '2026-11-18',
  },
};

function assertPointer(pointer: OfficialVerificationPointer): void {
  const url = new URL(pointer.url);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.gov.cn') ||
      !pointer.title.trim() || !pointer.scope.trim() ||
      !/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(pointer.checkedAt)) {
    throw new Error('外部官方核验入口的地址、范围或核验日期无效。');
  }
}

assertPointer(NATIONAL_QUERY);
for (const pointer of Object.values(REGIONAL_POINTERS)) assertPointer(pointer);

export function officialVerificationPointer(provinceName: string): OfficialVerificationPointer {
  if (typeof provinceName !== 'string' || !provinceName.trim()) throw new Error('省级地区无效。');
  return REGIONAL_POINTERS[provinceName] ?? NATIONAL_QUERY;
}
