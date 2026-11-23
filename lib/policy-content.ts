// 政策内容数据访问层（含大 JSON 数据，仅供服务端组件使用；客户端组件请引用 policy-content-types）。
import manifest from '@/public/data/policy-content/manifest.v1.json';
import zhengce from '@/public/data/policy-content/zhengce.v1.json';
import fagui from '@/public/data/policy-content/fagui.v1.json';
import biaozhun from '@/public/data/policy-content/biaozhun.v1.json';
import zixun from '@/public/data/policy-content/zixun.v1.json';
import anquan from '@/public/data/policy-content/anquan.v1.json';
import {
  policySections,
  type PolicyItem,
  type PolicySection,
  type PolicySectionKey,
} from './policy-content-types';

interface SectionFile {
  section: PolicySectionKey;
  label: string;
  items: PolicyItem[];
}

const sectionFiles: Record<PolicySectionKey, SectionFile> = {
  zhengce: zhengce as unknown as SectionFile,
  fagui: fagui as unknown as SectionFile,
  biaozhun: biaozhun as unknown as SectionFile,
  zixun: zixun as unknown as SectionFile,
  anquan: anquan as unknown as SectionFile,
};

export const policyManifest = manifest as { capturedAt: string; sections: PolicySection[]; totalCount: number };

export { policySections };

/** 取某个栏目的全部条目，按发布时间倒序 */
export function listSection(key: PolicySectionKey): PolicyItem[] {
  const items = sectionFiles[key]?.items ?? [];
  return [...items].sort((a, b) => (b.releaseTime ?? '').localeCompare(a.releaseTime ?? ''));
}

/** 按 id 查单条（id 全局唯一，跨 section 查找） */
export function findPolicyItem(id: string): PolicyItem | null {
  for (const key of Object.keys(sectionFiles) as PolicySectionKey[]) {
    const hit = sectionFiles[key].items.find((i) => i.id === id);
    if (hit) return hit;
  }
  return null;
}

/** 政策资讯四类的全部条目（合并） */
export function listPolicyContent(): PolicyItem[] {
  return policySections.flatMap((key) => listSection(key));
}
