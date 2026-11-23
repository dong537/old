// 政策内容的类型与轻量常量（不含数据 JSON，可安全被客户端组件引用）。

export type PolicySectionKey = 'zhengce' | 'fagui' | 'biaozhun' | 'zixun' | 'anquan';

export interface PolicyItem {
  id: string;
  title: string;
  section: PolicySectionKey;
  source?: string;
  docNo?: string;
  releaseTime?: string;
  theme?: string;
  standardType?: string;
  fileName?: string;
  fileId?: string;
  content?: string;
}

export interface PolicySection {
  key: PolicySectionKey;
  label: string;
  count: number;
}

/** 政策资讯四类（不含安全提示） */
export const policySections: PolicySectionKey[] = ['zhengce', 'fagui', 'biaozhun', 'zixun'];

export const sectionLabel: Record<PolicySectionKey, string> = {
  zhengce: '政策文件',
  fagui: '法律法规',
  biaozhun: '标准规范',
  zixun: '资讯动态',
  anquan: '安全提示',
};
