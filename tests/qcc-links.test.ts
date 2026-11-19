import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { QccDetailRecord, QccIndex, QccLinks } from '../lib/qcc-types';
import { QCC_SOURCE_FIELD_NAMES } from '../lib/qcc-types';
import { findQccRecord, subjectIdsForSource, verifiedSourceForSubject } from '../lib/qcc-search';
import { QccCandidateList } from '../components/QccCandidateLinks';

Object.assign(globalThis, { React });

const links: QccLinks = {
  schemaVersion: 1,
  snapshotId: 'frozen-test',
  links: [
    { sourceRecordId: 'gd-src-000001', subjectIds: ['qcc-a', 'qcc-b'] },
  ],
};
const candidate = (id: string, code: string): QccDetailRecord => ({
  sourceFields: Object.fromEntries(QCC_SOURCE_FIELD_NAMES.map(header => [header, null])),
  id, rowNumber: id === 'qcc-a' ? 100 : 101, name: '高州市福康养老服务中心', city: '茂名', district: null,
  subjectType: '个体工商户', registrationStatus: '存续', creditCode: code,
  codeValidity: 'valid', legalRepresentative: null, establishedAt: null,
  registeredCapital: null, organizationCode: null, registrationNo: null,
  taxId: null, businessTerm: null, insuredPersons: null, insuredYear: null,
  nationalIndustry: null, address: null, mailingAddress: null, businessScope: null,
  formerName: null, englishName: null, companySize: null,
});

test('source links retain two distinct registered-subject candidates', () => {
  assert.deepEqual(subjectIdsForSource(links, 'gd-src-000001'), ['qcc-a', 'qcc-b']);
  assert.deepEqual(subjectIdsForSource(links, 'gd-src-unknown'), []);
  const html = renderToStaticMarkup(React.createElement(QccCandidateList, {
    candidates: [candidate('qcc-a', '914400001111111111'), candidate('qcc-b', '914400002222222222')],
  }));
  assert.match(html, /高州市福康养老服务中心/g);
  assert.match(html, /914400001111111111/);
  assert.match(html, /914400002222222222/);
  assert.match(html, /同城同名候选/);
  assert.doesNotMatch(html, /运营主体已确认/);
});


test('frozen projection keeps 157 official keys and 158 subject references, including two Gaozhou codes', () => {
  const root = join(process.cwd(), 'public', 'data');
  const index = JSON.parse(readFileSync(join(root, 'qcc', 'index.v1.json'), 'utf8')) as QccIndex;
  const actualLinks = JSON.parse(readFileSync(join(root, 'qcc', 'links.v1.json'), 'utf8')) as QccLinks;
  const official = JSON.parse(readFileSync(join(root, 'guangdong-source-records.v1.json'), 'utf8')) as {
    records: { id: string; name: string; city: string }[];
  };
  assert.equal(index.records.length, 6777);
  assert.equal(new Set(index.records.map(item => item.city)).size, 21);
  assert.equal(actualLinks.links.length, 157);
  assert.equal(actualLinks.links.reduce((total, link) => total + link.subjectIds.length, 0), 158);
  assert.equal(actualLinks.snapshotId, index.snapshotId);
  const source = official.records.find(item => item.name === '高州市福康养老服务中心' && item.city === '茂名');
  assert.ok(source);
  const ids = subjectIdsForSource(actualLinks, source.id);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2);
  const candidates = ids.map(id => {
    const location = findQccRecord(index.records, id);
    assert.ok(location);
    const chunk = JSON.parse(readFileSync(join(root, 'qcc', location.chunk), 'utf8')) as { snapshotId: string; records: QccDetailRecord[] };
    assert.equal(chunk.snapshotId, index.snapshotId);
    const detail = chunk.records.find(item => item.id === id);
    assert.ok(detail);
    return detail;
  });
  assert.equal(new Set(candidates.map(item => item.creditCode)).size, 2);
  const html = renderToStaticMarkup(React.createElement(QccCandidateList, { candidates, sourceRecordId: source.id }));
  for (const candidate of candidates) {
    assert.match(html, new RegExp(candidate.creditCode!));
    assert.match(html, new RegExp(candidate.id));
  }
  assert.doesNotMatch(html, /运营主体已确认/);
  assert.equal(renderToStaticMarkup(React.createElement(QccCandidateList, { candidates: [] })), '');
});


test('a source backlink is shown only for an actual same-snapshot candidate link', () => {
  assert.equal(verifiedSourceForSubject(links, 'frozen-test', 'gd-src-000001', 'qcc-a'), 'gd-src-000001');
  assert.equal(verifiedSourceForSubject(links, 'frozen-test', 'gd-src-000001', 'qcc-unrelated'), null);
  assert.equal(verifiedSourceForSubject(links, 'different-snapshot', 'gd-src-000001', 'qcc-a'), null);
  assert.equal(verifiedSourceForSubject(links, 'frozen-test', 'https://evil.test/', 'qcc-a'), null);
});

