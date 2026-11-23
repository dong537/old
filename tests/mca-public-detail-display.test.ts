import assert from 'node:assert/strict';
import test from 'node:test';
import { mapMcaPublicDetailDisplay } from '../lib/mca-public-detail-display';
import { mcaPublicLoader } from '../lib/mca-public-static';

test('detail display DTO groups sourced values without losing provenance', () => {
  const id = 'BA7E6A754BB0A66AE053E897A6C0B507';
  const record = mcaPublicLoader.getIndex().records.find(item => item.mcaId === id);
  const detail = mcaPublicLoader.getDetail(id);
  assert.ok(record && detail);
  const dto = mapMcaPublicDetailDisplay(record, detail, mcaPublicLoader.getManifest());

  assert.equal(dto.name, record.name);
  assert.equal(dto.overview.address.value, '北京市东城区广渠门内大街12号');
  assert.equal(dto.capacity.total.value, 55);
  assert.deepEqual(dto.monthlyFees[0].range.value, [8000, 15000]);
  assert.equal(dto.source.mcaId, id);
  assert.equal(dto.source.detailObservedAtUtc.earliest.slice(0, 10), '2026-11-18');
  assert.equal(dto.source.facts.length, detail.facts.length);
  assert.ok(dto.serviceFields.some(item => item.label === '服务内容'));
  assert.deepEqual(dto.serviceFields[0], { label: '平台列示服务类别', field: record.serviceCategoryLabel });
});

test('only recognizable phone formats become dial links', () => {
  const id = 'BA7E6A754BB0A66AE053E897A6C0B507';
  const record = mcaPublicLoader.getIndex().records.find(item => item.mcaId === id);
  const source = mcaPublicLoader.getDetail(id);
  assert.ok(record && source);
  const detail = structuredClone(source);
  const phone = detail.platformDetail.contactPhone;
  phone.state = 'observed'; phone.observationCount = 1;
  phone.value = '010-12345678';
  assert.equal(mapMcaPublicDetailDisplay(record, detail, mcaPublicLoader.getManifest()).overview.contactHref, 'tel:01012345678');
  phone.value = '123456789012345678';
  assert.equal(mapMcaPublicDetailDisplay(record, detail, mcaPublicLoader.getManifest()).overview.contactHref, null);
  phone.value = '13800138000';
  assert.equal(mapMcaPublicDetailDisplay(record, detail, mcaPublicLoader.getManifest()).overview.contactHref, 'tel:13800138000');
});
