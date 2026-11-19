export type LtciGuideSourceId = 'service-management' | 'annual-assessment' | 'designation-notice';

export interface LtciGuideSource {
  id: LtciGuideSourceId;
  citationLabel: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string;
  accessedAt: string;
  scope: string;
}

export interface LtciGuideEntry {
  title: string;
  body: string;
  sourceIds: LtciGuideSourceId[];
}

export const ltciGuide: {
  sources: LtciGuideSource[];
  faq: LtciGuideEntry[];
  steps: LtciGuideEntry[];
} = {
  sources: [
    {
      id: 'service-management',
      citationLabel: '长护险管理规定',
      title: '广州市长期护理保险服务管理规定',
      url: 'https://www.gz.gov.cn/gfxwj/sbmgfxwj/gzsylbzj/content/mpost_9394201.html',
      publisher: '广州市医疗保障局、广州市民政局、广州市卫生健康委员会',
      publishedAt: '2023-12-08',
      accessedAt: '2026-11-15',
      scope: '穗医保规字〔2023〕1号；2024-01-01施行，有效至2029-01-01。以失能评估申请、材料、办理渠道和服务机构管理为口径；是否享受待遇仍由医保经办机构按现行规定审核。',
    },
    {
      id: 'annual-assessment',
      citationLabel: '年度考核',
      title: '广州市长期护理保险定点服务机构2025年度综合考核结果',
      url: 'https://www.gz.gov.cn/zfjg/gzsylbzj/ybfw/content/post_10804799.html',
      publisher: '广州市医疗保险服务中心（广州市医疗保障局）',
      publishedAt: '2026-05-09',
      accessedAt: '2026-11-15',
      scope: '发布的是2025年度考核记录，含护理机构和设备机构；只反映该年度考核结果，不代表目前仍为定点，也不证明当前提供居家上门服务。',
    },
    {
      id: 'designation-notice',
      citationLabel: '新增公示',
      title: '广州市长期护理保险新增定点评估合格服务机构名单公示（2026.15）',
      url: 'https://www.gz.gov.cn/zfjg/gzsylbzj/ybfw/content/post_10984980.html',
      publisher: '广州市医疗保险服务中心（广州市医疗保障局）',
      publishedAt: '2026-09-01',
      accessedAt: '2026-11-15',
      scope: '该批公示期为2026-09-01至2026-09-09，列出1条评估合格记录；公示不是服务协议正式生效的证明，也不是全部定点服务机构名单。',
    },
  ],
  faq: [
    {
      title: '长护险申请先看什么？',
      body: '先确认申请人属于广州长护险参保人员，并向医保经办机构核对其当前适用的待遇条件。现行服务管理规定写明评估申请主体是参保人员本人、监护人或代理人；它没有在本页可核验的条文中列出完整待遇资格，不能仅凭年龄、诊断或家属判断认定符合。',
      sourceIds: ['service-management'],
    },
    {
      title: '失能评估怎么申请？',
      body: '由参保人员本人或其监护人、代理人，通过统一信息平台或到医保经办机构服务窗口，向评估机构提出申请。规定要求提交失能评估申请表及病历资料；60周岁及以上纳入本市老年人照护需求综合评估，60周岁以下参照相关规定执行。',
      sourceIds: ['service-management'],
    },
    {
      title: '评估要等多久、结果在哪里看？',
      body: '管理规定所列受理审核、现场评估、复核与结论总体时限不超过13个工作日；评估结果在统一信息平台或申请人居住社区公示3个工作日，结束后出具结论，并在5个工作日内告知申请人。申请人对结论有异议时，可按老年人照护需求综合评估有关规定申请复评。',
      sourceIds: ['service-management'],
    },
    {
      title: '机构护理和居家护理怎么选？',
      body: '管理规定分别设置机构护理和居家护理服务条件。拿到评估结论后，先向医保经办机构核对当前签约定点护理机构及其服务类别，再按照护安排咨询机构护理或居家护理（居家建床）承接方式。考核记录或名称相似，不能单独证明机构目前仍有定点协议或具备上门能力。',
      sourceIds: ['service-management', 'annual-assessment'],
    },
  ],
  steps: [
    {
      title: '核对参保和办理口径',
      body: '申请前向医保经办机构确认申请人当前参保状态及适用的待遇条件。服务管理规定面向参保人员的评估申请，不以家属自行判断替代审核。',
      sourceIds: ['service-management'],
    },
    {
      title: '备好申请表和病历资料',
      body: '现行规定明确的失能评估材料为失能评估申请表及病历资料。若经办机构另有当前材料清单，以其正式要求为准；本页不补写未核实的身份证明或病种要求。',
      sourceIds: ['service-management'],
    },
    {
      title: '通过官方渠道提交评估申请',
      body: '本人、监护人或代理人通过统一信息平台，或前往医保经办机构服务窗口，向评估机构提出申请。现行规定没有在该条款中给出统一公开的直达办事URL；请从广州医保官方渠道进入平台或咨询经办窗口，不要使用来源不明的代办链接。',
      sourceIds: ['service-management'],
    },
    {
      title: '参加评估并等待书面结论',
      body: '配合受理审核和现场评估；总体办理时限、公示和结论告知按现行规定执行。对失能评估结论有异议，按规定渠道申请复评。',
      sourceIds: ['service-management'],
    },
    {
      title: '核对服务类别后联系承接机构',
      body: '取得结论后，向医保经办机构核实当前协议定点信息，再按实际安排选择机构护理或居家护理（居家建床）服务。签约、公示和年度考核处于不同环节，应确认服务协议与可提供项目。',
      sourceIds: ['service-management', 'designation-notice', 'annual-assessment'],
    },
  ],
};
