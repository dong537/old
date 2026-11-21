/** 从本机私有 MCA 观察快照生成独立的、明确标注部分覆盖的来源投影。 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync,
  writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapMcaPreviewDetail, mapMcaPreviewListExtras } from '../lib/mca-preview-dto';
import type { McaPreviewFactDto, McaPreviewListExtrasDto, McaPreviewPlatformDetailDto } from '../lib/mca-preview-dto';
import type { McaPreviewCatalog, McaPreviewDetail, McaPreviewIndexRecord,
  McaPreviewManifest, McaPreviewSource } from '../lib/mca-preview-types';
import { validateMcaObservedOutput } from './check-mca-observed-output';

const PROJECT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PRIVATE_ROOT = path.join(PROJECT, 'data/private/generated/mca-observed-catalog');
export const PRIVATE_OUTPUT = path.join(PROJECT, 'data/private/generated/mca-detail-candidate.v1.json');
export const PUBLIC_DIR = path.join(PROJECT, 'public/data/mca-observed');
export const PRIVATE_STAGE_PARENT = path.dirname(PRIVATE_OUTPUT);
const SOURCE_PAGE = 'https://yanglao.mca.gov.cn/?#/index/institutionList';
const snapshotPattern = /^observed-[a-f0-9]{24}$/;
const idPattern = /^(?:[A-Za-z0-9_-]{7,64}|[0-9]{4,6})$/;

export interface McaObservedWindow { earliest: string; latest: string }
type CandidateList = Omit<McaPreviewIndexRecord, 'mcaId' | 'detailPath'> &
  McaPreviewListExtrasDto & { listObservedAtUtc: McaObservedWindow | null };
interface CandidateDetail {
  facts: McaPreviewFactDto[];
  platformDetail: McaPreviewPlatformDetailDto;
  conflictLabels: string[];
  detailObservedAtUtc: McaObservedWindow;
}
export interface McaCandidate {
  schemaVersion: 1;
  scope: 'private_mca_observed_candidate';
  publishable: false;
  nationalComplete: false;
  snapshotId: string;
  sourceSnapshots: McaPreviewManifest['sourceSnapshots'];
  snapshotCapturedAtUtc: string;
  generatedAtUtc: string;
  recordCount: number;
  listObservedCount: number;
  withDetailCount: number;
  detailOnlyCount: number;
  records: { mcaId: string; list: CandidateList; detail: CandidateDetail | null }[];
}

interface PublicIndexRecord extends CandidateList {
  mcaId: string;
  detailPath: string | null;
}
export interface McaPublicManifest {
  schemaVersion: 1;
  scope: 'partial_observed_mca_institutions';
  snapshotId: string;
  sourcePage: string;
  snapshotCapturedAtUtc: string;
  generatedAtUtc: string;
  recordCount: number;
  listObservedCount: number;
  withDetailCount: number;
  detailOnlyCount: number;
  nationalComplete: false;
  currentStatusVerified: false;
  sourceSnapshots: McaPreviewManifest['sourceSnapshots'];
}
export interface McaPublicDetail extends CandidateDetail {
  schemaVersion: 1;
  snapshotId: string;
  mcaId: string;
  sourcePage: string;
}
export interface McaPublicProjection {
  manifest: McaPublicManifest;
  index: { schemaVersion: 1; snapshotId: string; records: PublicIndexRecord[] };
  details: McaPublicDetail[];
}

function shaId(id: string): string {
  return createHash('sha256').update(id, 'utf8').digest('hex');
}
function capturedAt(sourceSnapshots: McaPreviewManifest['sourceSnapshots']): string {
  const valid = sourceSnapshots.map(item => item.capturedAtUtc).filter((value): value is string =>
    typeof value === 'string' && Number.isFinite(Date.parse(value)));
  if (valid.length === 0) throw new Error('source snapshot time missing');
  return valid.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

function observedWindow(sources: readonly McaPreviewSource[]): McaObservedWindow | null {
  if (sources.length === 0) return null;
  const times = sources.map(source => {
    const value = source.fetchedAtUtc;
    if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ||
      !Number.isFinite(Date.parse(value))) throw new Error('per-record source time invalid');
    return value;
  }).sort((a, b) => Date.parse(a) - Date.parse(b));
  return { earliest: times[0], latest: times[times.length - 1] };
}

/** 可注入详情加载函数，便于离线测试；只选用现有 DTO 已映射的实际观察值。 */
export function buildMcaCandidate(catalog: McaPreviewCatalog,
  loadDetail: (id: string) => McaPreviewDetail, generatedAtUtc: string): McaCandidate {
  const { manifest, index } = catalog;
  if (manifest.scope !== 'private_mca_observed_institutions' || manifest.publishable !== false ||
    manifest.nationalComplete !== false || index.publishable !== false ||
    index.snapshotId !== manifest.snapshotId || !snapshotPattern.test(manifest.snapshotId) ||
    index.records.length !== manifest.recordCount || !Number.isFinite(Date.parse(generatedAtUtc))) {
    throw new Error('private snapshot contract invalid');
  }
  const seen = new Set<string>();
  let withDetailCount = 0;
  let listObservedCount = 0;
  let detailOnlyCount = 0;
  const records = index.records.map(record => {
    const mcaId = record.mcaId;
    if (!idPattern.test(record.mcaId)) throw new Error('platform ID invalid');
    if (seen.has(record.mcaId)) throw new Error('duplicate platform ID: ' + record.mcaId);
    seen.add(record.mcaId);
    if (!Number.isSafeInteger(record.listObservationCount) || record.listObservationCount < 0 ||
      !Number.isSafeInteger(record.detailObservationCount) || record.detailObservationCount < 0 ||
      record.listObservationCount + record.detailObservationCount === 0) {
      throw new Error('record observation count invalid: ' + record.mcaId);
    }
    if (record.listObservationCount > 0) listObservedCount++;
    const original = loadDetail(record.mcaId);
    if (original.mcaId !== mcaId || original.publishable !== false ||
      original.listObservations.length !== record.listObservationCount ||
      original.detailObservations.length !== record.detailObservationCount) {
      throw new Error('private observation contract invalid: ' + mcaId);
    }
    const { mcaId: _id, detailPath: _privateDetailPath, ...indexed } = record;
    const list: CandidateList = { ...indexed, ...mapMcaPreviewListExtras(original),
      listObservedAtUtc: observedWindow(original.listObservations.map(item => item.source)) };
    let detail: CandidateDetail | null = null;
    if (record.hasDetail) {
      if (original.detailObservations.length === 0) throw new Error('private detail contract invalid: ' + mcaId);
      const dto = mapMcaPreviewDetail(record, original, manifest.snapshotId);
      const detailObservedAtUtc = observedWindow(original.detailObservations.flatMap(item => [
        item.endpoints.orgBaseDetail.source, item.endpoints.yangLaoOrgDetail.source,
      ]));
      if (detailObservedAtUtc === null) throw new Error('private detail time missing: ' + mcaId);
      detail = { facts: dto.facts, platformDetail: dto.platformDetail,
        conflictLabels: dto.conflictLabels, detailObservedAtUtc };
      withDetailCount++;
      if (record.listObservationCount === 0) detailOnlyCount++;
    } else if (original.detailObservations.length !== 0) {
      throw new Error('list-only detail count invalid: ' + mcaId);
    }
    return { mcaId, list, detail };
  });
  if (withDetailCount !== manifest.withDetailCount ||
    records.reduce((sum, record) => sum + record.list.listObservationCount, 0) !== manifest.listObservationCount ||
    records.reduce((sum, record) => sum + record.list.detailObservationCount, 0) !== manifest.detailObservationCount) {
    throw new Error('private observation coverage count invalid');
  }
  return {
    schemaVersion: 1, scope: 'private_mca_observed_candidate', publishable: false,
    nationalComplete: false, snapshotId: manifest.snapshotId,
    sourceSnapshots: manifest.sourceSnapshots.map(item => ({
      lane: item.lane, sha256: item.sha256, capturedAtUtc: item.capturedAtUtc,
    })),
    snapshotCapturedAtUtc: capturedAt(manifest.sourceSnapshots), generatedAtUtc,
    recordCount: records.length, listObservedCount, withDetailCount, detailOnlyCount, records,
  };
}

function publicList(record: McaCandidate['records'][number]): PublicIndexRecord {
  const list = record.list;
  return {
    mcaId: record.mcaId, detailPath: record.detail ? 'details/' + shaId(record.mcaId) + '.v1.json' : null,
    name: list.name, facilityTypeCode: list.facilityTypeCode, facilityTypeLabel: list.facilityTypeLabel,
    areaCode: list.areaCode, regionLabel: list.regionLabel, regionPath: list.regionPath,
    address: list.address, listedBeds: list.listedBeds, nursingBeds: list.nursingBeds,
    listedMonthlyFeeMin: list.listedMonthlyFeeMin, listedMonthlyFeeMax: list.listedMonthlyFeeMax,
    platformStarCode: list.platformStarCode, evaluationCount: list.evaluationCount,
    overallEvaluation: list.overallEvaluation, functionPositioningLabel: list.functionPositioningLabel,
    platformTagsRaw: list.platformTagsRaw, hasDetail: list.hasDetail,
    listedContactPhone: list.listedContactPhone, serviceCategoryLabel: list.serviceCategoryLabel,
    subsidyCode: list.subsidyCode, dayCareBeds: list.dayCareBeds, fullCareBeds: list.fullCareBeds,
    listObservedAtUtc: list.listObservedAtUtc,
    listObservationCount: list.listObservationCount,
    detailObservationCount: list.detailObservationCount, conflictFields: list.conflictFields,
  };
}

/** 公开文件只有解释过的 DTO 字段；原始响应、采集 token 和图片文件 ID 均不进入。 */
export function buildPublicProjection(candidate: McaCandidate, generatedAtUtc: string): McaPublicProjection {
  if (candidate.scope !== 'private_mca_observed_candidate' || candidate.publishable !== false ||
    candidate.nationalComplete !== false || candidate.records.length !== candidate.recordCount ||
    candidate.records.filter(record => record.detail !== null).length !== candidate.withDetailCount ||
    candidate.records.filter(record => record.list.listObservationCount > 0).length !== candidate.listObservedCount ||
    candidate.records.filter(record => record.list.listObservationCount === 0).length !== candidate.detailOnlyCount) {
    throw new Error('candidate partial-coverage contract invalid');
  }
  const details: McaPublicDetail[] = [];
  const records = candidate.records.map(record => {
    if (record.detail !== null) {
      const detail = record.detail;
      details.push({ schemaVersion: 1, snapshotId: candidate.snapshotId, mcaId: record.mcaId,
        sourcePage: 'https://yanglao.mca.gov.cn/?#/index/orgServicesDetail?axbe0001=' +
          encodeURIComponent(record.mcaId) + '&parentRoute=institutionList&tagValue=3',
        facts: detail.facts.map(fact => ({
          key: fact.key, label: fact.label, text: fact.text, state: fact.state,
          source: fact.source === null ? null : { channelLabel: fact.source.channelLabel,
            fetchedAtUtc: fact.source.fetchedAtUtc }, warning: fact.warning,
        })),
        platformDetail: detail.platformDetail, conflictLabels: [...detail.conflictLabels],
        detailObservedAtUtc: detail.detailObservedAtUtc });
    }
    return publicList(record);
  });
  return {
    manifest: { schemaVersion: 1, scope: 'partial_observed_mca_institutions',
      snapshotId: candidate.snapshotId, sourcePage: SOURCE_PAGE,
      snapshotCapturedAtUtc: candidate.snapshotCapturedAtUtc, generatedAtUtc,
      recordCount: candidate.recordCount, listObservedCount: candidate.listObservedCount,
      withDetailCount: candidate.withDetailCount, detailOnlyCount: candidate.detailOnlyCount,
      nationalComplete: false, currentStatusVerified: false,
      sourceSnapshots: candidate.sourceSnapshots.map(item => ({
        lane: item.lane, sha256: item.sha256, capturedAtUtc: item.capturedAtUtc,
      })),
    },
    index: { schemaVersion: 1, snapshotId: candidate.snapshotId, records }, details,
  };
}

function readJson(location: string): unknown {
  return JSON.parse(readFileSync(location, 'utf8'));
}

/** 只读固定私有目录；不调用官网，也不修改原件或旧的全国发布门禁。 */
export function loadMcaCandidate(root = PRIVATE_ROOT): McaCandidate {
  const current = readJson(path.join(root, 'current.json')) as { snapshotId?: unknown };
  if (typeof current.snapshotId !== 'string' || !snapshotPattern.test(current.snapshotId)) {
    throw new Error('private snapshot pointer invalid');
  }
  const snapshot = path.join(root, 'snapshots', current.snapshotId);
  const manifest = readJson(path.join(snapshot, 'manifest.json')) as McaPreviewCatalog['manifest'];
  const index = readJson(path.join(snapshot, 'index.json')) as McaPreviewCatalog['index'];
  const byId = new Map(index.records.map(record => [record.mcaId, record]));
  return buildMcaCandidate({ manifest, index }, id => {
    const indexed = byId.get(id);
    const expected = 'details/' + shaId(id) + '.json';
    if (indexed?.detailPath !== expected) throw new Error('private detail path invalid: ' + id);
    return readJson(path.join(snapshot, expected)) as McaPreviewDetail;
  }, new Date().toISOString());
}

function writeJsonAtomic(location: string, value: unknown): void {
  mkdirSync(path.dirname(location), { recursive: true });
  const temporary = location + '.' + process.pid + '.tmp';
  writeFileSync(temporary, JSON.stringify(value) + '\n', { encoding: 'utf8', flag: 'wx' });
  renameSync(temporary, location);
}

function stagedPublicFiles(stage: string): Map<string, string> {
  const files = new Map<string, string>();
  const visit = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      const location = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(location, relative + '/');
      else if (entry.isFile()) files.set('data/mca-observed/' + relative, readFileSync(location, 'utf8'));
      else throw new Error('MCA暂存目录包含非文件：' + relative);
    }
  };
  visit(stage, '');
  return files;
}

/** 完整暂存、验证、目录交换；失败时保留旧公开快照，不逐文件混写。 */
export function publishMcaPublicProjection(publicData: McaPublicProjection, destination = PUBLIC_DIR,
  writeStagedFile: (location: string, value: string) => void =
    (location, value) => writeFileSync(location, value, 'utf8')): void {
  const parent = path.dirname(destination);
  mkdirSync(parent, { recursive: true });
  const relativeToPublic = path.relative(path.join(PROJECT, 'public'), path.resolve(destination));
  const insidePublic = relativeToPublic === '' ||
    (relativeToPublic !== '..' && !relativeToPublic.startsWith('..' + path.sep) &&
      !path.isAbsolute(relativeToPublic));
  const stageParent = insidePublic ? PRIVATE_STAGE_PARENT : parent;
  mkdirSync(stageParent, { recursive: true });
  if (statSync(parent).dev !== statSync(stageParent).dev) {
    throw new Error('MCA公开目录与私有暂存目录不在同一磁盘');
  }
  const stage = mkdtempSync(path.join(stageParent, '.mca-observed-stage-'));
  const backup = stage + '.previous';
  let previousMoved = false;
  let published = false;
  try {
    mkdirSync(path.join(stage, 'details'));
    for (const detail of publicData.details) {
      writeStagedFile(path.join(stage, 'details', shaId(detail.mcaId) + '.v1.json'),
        JSON.stringify(detail) + String.fromCharCode(10));
    }
    writeStagedFile(path.join(stage, 'index.v1.json'), JSON.stringify(publicData.index) + String.fromCharCode(10));
    writeStagedFile(path.join(stage, 'manifest.v1.json'), JSON.stringify(publicData.manifest) + String.fromCharCode(10));
    validateMcaObservedOutput(stagedPublicFiles(stage));
    if (existsSync(destination)) {
      renameSync(destination, backup);
      previousMoved = true;
    }
    try {
      renameSync(stage, destination);
      published = true;
    } catch (error) {
      if (previousMoved) {
        try { renameSync(backup, destination); }
        catch (rollbackError) {
          throw new AggregateError([error, rollbackError],
            'MCA公开目录交换及回滚均失败，旧快照保存在 ' + backup);
        }
      }
      throw error;
    }
    if (previousMoved) rmSync(backup, { recursive: true });
  } finally {
    if (!published && existsSync(stage)) rmSync(stage, { recursive: true });
  }
}

export function exportMcaObserved(candidateOnly = false): { recordCount: number; withDetailCount: number; snapshotId: string } {
  const candidate = loadMcaCandidate();
  writeJsonAtomic(PRIVATE_OUTPUT, candidate);
  if (!candidateOnly) {
    const publicData = buildPublicProjection(candidate, new Date().toISOString());
    publishMcaPublicProjection(publicData);
  }
  return { recordCount: candidate.recordCount, withDetailCount: candidate.withDetailCount,
    snapshotId: candidate.snapshotId };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(PRIVATE_ROOT)) throw new Error('MCA private snapshot is unavailable');
  if (process.argv[2] && process.argv[2] !== '--candidate-only') throw new Error('unsupported argument');
  process.stdout.write(JSON.stringify(exportMcaObserved(process.argv[2] === '--candidate-only')) + '\n');
}
