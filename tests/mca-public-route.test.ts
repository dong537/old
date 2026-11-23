import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import McaPublicDetailPage, { generateStaticParams } from '../app/quanguo/pingtai/[id]/page';
import { mcaCatalogLoader } from '../lib/mca-catalog-static';
import { mcaPublicLoader } from '../lib/mca-public-static';

const sampledId = 'BA7E6A754BB0A66AE053E897A6C0B507';

test('公开投影区分 3726 个已观察 ID、3716 条列表记录及 10 条仅详情观察', () => {
  const manifest = mcaPublicLoader.getManifest();
  const index = mcaPublicLoader.getIndex();
  assert.equal(manifest.recordCount, 3726);
  assert.equal(manifest.listObservedCount, 3716);
  assert.equal(manifest.withDetailCount, 131);
  assert.equal(manifest.detailOnlyCount, 10);
  assert.equal(index.records.length, manifest.recordCount);
  assert.equal(generateStaticParams().length, mcaCatalogLoader.getManifest().detailCount);
  assert.ok(generateStaticParams().some(item => item.id === sampledId));
  assert.equal(index.records.filter(item => item.detailPath === null).length, 3595);
  assert.equal(index.records.filter(item => item.listObservationCount === 0 && item.detailPath !== null).length, 10);
});

test('用户指定的已采样本在公开详情展示实际费用、床位和介绍', async () => {
  const page = await McaPublicDetailPage({ params: Promise.resolve({ id: sampledId }) });
  const html = renderToStaticMarkup(page);
  assert.match(html, /北京兆如养老服务有限公司/);
  assert.match(html, /8,000/);
  assert.match(html, /15,000/);
  assert.match(html, /55 个/);
  assert.doesNotMatch(html, /仅供本机|sourceFields|private-photo-file-id/);
});
