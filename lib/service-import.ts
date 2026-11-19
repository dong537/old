import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import type { ServiceCatalog, ServiceRecord, ServiceRecordType, ServiceSource } from './service-types';

export interface ServiceArchiveManifest {
  source: ServiceSource;
  htmlFile: string;
  htmlSha256: string;
  tableFile: string;
  tableSha256: string;
  expectedRows: number;
  recordIdPrefix: string;
}

export interface ServiceManifest {
  schemaVersion: 1;
  snapshotId: string;
  archives: ServiceArchiveManifest[];
}

const DISTRICTS = ['越秀区', '海珠区', '荔湾区', '天河区', '白云区', '黄埔区', '番禺区', '花都区', '南沙区', '从化区', '增城区'];
const ASSESSMENT_HEADERS = ['序号', '类型', '机构名称', '服务地址', '考核 等次'];
const ASSESSMENT_HEADER_VARIANTS = [ASSESSMENT_HEADERS, ['序号', '类型', '机构名称', '服务地址', '考核等次']];
const NOTICE_HEADERS = ['序号', '单位名称', '所在区', '提供服务地址', '服务类别', '服务项目', '机构类别'];
const GRADES = ['优秀', '良好', '合格', '不合格', '无等次'];

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertArchiveFile(name: string): void {
  if (!name || name !== name.split(/[\\/]/u).at(-1) || name.startsWith('.')) {
    throw new Error('服务目录归档文件名无效。');
  }
}

function assertSha(value: string, actual: string, label: string): void {
  if (!/^[a-f0-9]{64}$/u.test(value) || value !== actual) throw new Error(`${label} SHA-256 不匹配。`);
}

function asRows(content: string, headerVariants: string[][], expectedRows: number, label: string): Record<string, string>[] {
  const parsed = parse(content, { bom: true, columns: true, skip_empty_lines: true, relax_column_count: false, trim: false }) as Record<string, string>[];
  const headers = Object.keys(parsed[0] ?? {});
  if (!headerVariants.some(expected => JSON.stringify(headers) === JSON.stringify(expected))) throw new Error(`${label} CSV表头不符合官方原表结构。`);
  if (parsed.length !== expectedRows) throw new Error(`${label} 记录数不符合归档清单。`);
  return parsed;
}

function addressDistrict(address: string): string | null {
  return DISTRICTS.find(district => address.includes(district)) ?? null;
}

function validateManifest(value: unknown): asserts value is ServiceManifest {
  const manifest = value as ServiceManifest | null;
  if (!manifest || typeof manifest !== 'object' || manifest.schemaVersion !== 1 || typeof manifest.snapshotId !== 'string' || !/^[a-z0-9-]+$/u.test(manifest.snapshotId) || !Array.isArray(manifest.archives) || manifest.archives.length === 0) {
    throw new Error('服务目录归档清单无效。');
  }
  const sourceIds = new Set<string>();
  for (const archive of manifest.archives) {
    if (!archive || typeof archive !== 'object' || !archive.source || typeof archive.source !== 'object') throw new Error('服务来源元数据无效。');
    const { source } = archive;
    let url: URL;
    try { url = new URL(source.url); } catch { throw new Error('服务来源 URL 无效。'); }
    if (url.protocol !== 'https:' || !/(^|\.)gz\.gov\.cn$/u.test(url.hostname) || !source.id || sourceIds.has(source.id)) {
      throw new Error('服务来源必须唯一且为官方HTTPS来源。');
    }
    sourceIds.add(source.id);
    const expectedKind = source.kind;
    if (!['annual-assessment', 'designation-notice'].includes(expectedKind) ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(source.publishedAt) || !/^\d{4}-\d{2}-\d{2}$/u.test(source.accessedAt) ||
      !source.title || !source.publisher || !source.period || !source.limitations ||
      !Number.isSafeInteger(archive.expectedRows) || archive.expectedRows < 1 ||
      !/^gz-ltci-[a-z0-9-]+-$/u.test(archive.recordIdPrefix)) {
      throw new Error('服务来源元数据或记录范围无效。');
    }
    assertArchiveFile(archive.htmlFile);
    assertArchiveFile(archive.tableFile);
  }
}

export function buildServiceCatalog(input: unknown, files: Record<string, string | undefined>): ServiceCatalog {
  validateManifest(input);
  const manifest = input;
  const sources = manifest.archives.map(archive => archive.source);
  const records: ServiceRecord[] = [];
  for (const archive of manifest.archives) {
    const { source } = archive;
    const html = files[archive.htmlFile];
    const csv = files[archive.tableFile];
    if (html === undefined || csv === undefined) throw new Error('服务目录缺少归档原件或表格快照。');
    assertSha(archive.htmlSha256, sha256(html), archive.htmlFile);
    assertSha(archive.tableSha256, sha256(csv), archive.tableFile);
    const headerVariants = source.kind === 'annual-assessment' ? ASSESSMENT_HEADER_VARIANTS : [NOTICE_HEADERS];
    const rows = asRows(csv, headerVariants, archive.expectedRows, archive.tableFile);
    rows.forEach((row, index) => {
      const sourceRow = index + 1;
      if (row['序号'] !== String(sourceRow)) throw new Error(`${archive.tableFile} 来源序号重复或未保持原表顺序。`);
      const annual = source.kind === 'annual-assessment';
      const name = row[annual ? '机构名称' : '单位名称']?.trim();
      const address = row[annual ? '服务地址' : '提供服务地址']?.trim();
      if (!name || !address) throw new Error(`${archive.tableFile} 第${sourceRow}条缺少名称或地址。`);
      const rawDistrict = annual ? null : row['所在区']?.trim() ?? null;
      if (rawDistrict && !DISTRICTS.includes(rawDistrict)) throw new Error(`${archive.tableFile} 第${sourceRow}条行政区不在广州11区范围。`);
      const extractedDistrict = annual ? addressDistrict(address) : null;
      const assessmentGrade = annual ? row['考核 等次']?.trim() ?? row['考核等次']?.trim() : null;
      if (annual && (!row['类型']?.trim() || !GRADES.includes(assessmentGrade ?? ''))) {
        throw new Error(`${archive.tableFile} 第${sourceRow}条机构类型或考核等次无效。`);
      }
      const serviceCategory = annual ? null : row['服务类别']?.trim() || null;
      const serviceItemsText = annual ? '' : row['服务项目']?.trim() ?? '';
      records.push({
        id: `${archive.recordIdPrefix}${String(sourceRow).padStart(4, '0')}`,
        sourceId: source.id,
        sourceRow,
        name,
        address,
        district: rawDistrict || extractedDistrict,
        districtBasis: rawDistrict ? 'source' : extractedDistrict ? 'address-text' : null,
        recordType: source.kind as ServiceRecordType,
        providerType: row[annual ? '类型' : '机构类别']?.trim() || null,
        assessmentGrade: assessmentGrade || null,
        serviceCategory,
        serviceItems: serviceItemsText || null,
      });
    });
  }
  const sourceIdSet = new Set(sources.map(source => source.id));
  if (records.some(record => !sourceIdSet.has(record.sourceId))) throw new Error('服务记录引用了未登记来源。');
  return { schemaVersion: 1, snapshotId: manifest.snapshotId, sources, records };
}
