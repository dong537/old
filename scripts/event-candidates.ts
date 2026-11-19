import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertPrivateOutputPath, buildProvinceReview, normalizeCandidateName } from './province-pipeline';

export interface EventRecord {
  event_id: string;
  city: string;
  institution_name_as_published: string;
  source_url: string;
  source_published_at: string;
  source_sha256: string;
}

export interface CandidateGroupRef { candidateKey: string; city: string; normalizedName: string }

export function matchEventCandidates(events: EventRecord[], groups: CandidateGroupRef[]) {
  const byCityAndName = new Map<string, CandidateGroupRef>();
  for (const group of groups) {
    const key = group.city.trim() + '\0' + group.normalizedName;
    if (byCityAndName.has(key)) throw new Error('同城同名候选键冲突，停止事件关联。');
    byCityAndName.set(key, group);
  }
  const seenEventIds = new Set<string>();
  const links = events.map(event => {
    if (!event.event_id || seenEventIds.has(event.event_id)) throw new Error('重复事件ID或缺少事件ID。');
    seenEventIds.add(event.event_id);
    if (!event.city.trim() || !event.institution_name_as_published.trim() || !/^[a-f0-9]{64}$/i.test(event.source_sha256)) {
      throw new Error('事件城市、机构原名或来源哈希无效。');
    }
    let url: URL;
    try { url = new URL(event.source_url); }
    catch { throw new Error('事件来源URL无效。'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('事件来源URL必须为HTTP(S)。');
    const candidateKey = byCityAndName.get(event.city.trim() + '\0' + normalizeCandidateName(event.institution_name_as_published.trim()))?.candidateKey ?? null;
    return {
      eventId: event.event_id, city: event.city, nameAsPublished: event.institution_name_as_published,
      candidateKey, matchStatus: candidateKey ? 'exact_name_candidate' as const : 'unmatched' as const,
      identityVerified: false as const, sourceUrl: event.source_url,
      publishedAt: event.source_published_at || null, sourceSha256: event.source_sha256,
    };
  });
  const exactNameCandidates = links.filter(link => link.candidateKey !== null).length;
  return {
    manifest: { eventCount: events.length, exactNameCandidates, unmatched: events.length - exactNameCandidates,
      interpretation: '事件与名录同城同名仅为身份候选；未命中仍保留事件，全部待原件人工核实。' },
    links,
  };
}

interface EventPackage { sources: { url: string; file: string; sha256: string }[]; events: EventRecord[] }

async function main(): Promise<void> {
  const root = process.cwd();
  const sourceRoot = path.resolve(root, 'data/private/guangdong-eldercare-source');
  const eventFile = path.join(sourceRoot, 'events/20261114-reviewed/机构官方事件.json');
  const observationFile = path.join(sourceRoot, 'exports/20261114_batch10/机构名录_逐条来源.csv');
  const eventText = await readFile(eventFile, 'utf8');
  const observationCsv = await readFile(observationFile, 'utf8');
  const eventPackage = JSON.parse(eventText) as EventPackage;
  if (!Array.isArray(eventPackage.sources) || !Array.isArray(eventPackage.events)) throw new Error('已审事件包结构无效。');
  const sourceKeys = new Set<string>();
  for (const source of eventPackage.sources) {
    const file = path.resolve(sourceRoot, source.file);
    if (!file.startsWith(sourceRoot + path.sep)) throw new Error('事件原件路径越界。');
    const sha = createHash('sha256').update(await readFile(file)).digest('hex');
    if (sha !== source.sha256) throw new Error('事件原件哈希不一致，停止清洗。');
    sourceKeys.add(source.url + '\0' + sha);
  }
  if (eventPackage.events.some(event => !sourceKeys.has(event.source_url + '\0' + event.source_sha256))) {
    throw new Error('事件未能对应已核原件，停止清洗。');
  }
  const groups = buildProvinceReview(observationCsv).candidateGroups;
  const result = matchEventCandidates(eventPackage.events, groups);
  const output = {
    manifest: { ...result.manifest, eventInputSha256: createHash('sha256').update(eventText).digest('hex'),
      observationInputSha256: createHash('sha256').update(observationCsv).digest('hex') },
    links: result.links,
  };
  const destination = path.join(sourceRoot, 'research-batch11/event-candidates/官方事件与机构候选关联.json');
  assertPrivateOutputPath(root, destination);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log('已审事件：' + result.manifest.eventCount + '；同城同名候选：' + result.manifest.exactNameCandidates + '；未命中：' + result.manifest.unmatched + '。身份均未核实。');
}

if (path.basename(process.argv[1] ?? '') === 'event-candidates.ts') {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
