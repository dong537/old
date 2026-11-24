import Link from 'next/link';
import { HomeOnlineTabs } from '@/components/HomeOnlineTabs';
import { sitePath } from '@/lib/site-path';
import { mcaCatalogLoader } from '@/lib/mca-catalog-static';
import { summarizeMcaCatalog } from '@/lib/mca-catalog-scope';
import referenceManifest from '@/public/data/qcc-institutions/manifest.v1.json';
import { homeStyles } from './home-styles';

const styles = {
  page: 'home-portal-page',
  shell: 'home-portal-shell',
  hero: 'home-portal-hero',
  heroMain: 'home-portal-heroMain',
  kicker: 'home-portal-kicker',
  heroTitle: 'home-portal-heroTitle',
  heroIntro: 'home-portal-heroIntro',
  heroSearch: 'home-portal-heroSearch',
  heroFoot: 'home-portal-heroFoot',
  quickGrid: 'home-portal-quickGrid',
  quickCard: 'home-portal-quickCard',
  quickGlyph: 'home-portal-quickGlyph',
  quickText: 'home-portal-quickText',
  hotLinks: 'home-portal-hotLinks',
  queryModule: 'home-portal-queryModule',
  queryMenu: 'home-portal-queryMenu',
  menuActive: 'home-portal-menuActive',
  queryBody: 'home-portal-queryBody',
  queryIntro: 'home-portal-queryIntro',
  sectionEyebrow: 'home-portal-sectionEyebrow',
  queryForm: 'home-portal-queryForm',
  regionShortcuts: 'home-portal-regionShortcuts',
  shortcutHeading: 'home-portal-shortcutHeading',
  queryCaveat: 'home-portal-queryCaveat',
  onlinePanel: 'home-portal-onlinePanel',
  regionIndex: 'home-portal-regionIndex',
  regionIndexHeading: 'home-portal-regionIndexHeading',
  entrances: 'home-portal-entrances',
} as const;

export const metadata = {
  title: '找养老机构 · 全国机构线索与官方来源',
  description: '按省份查找全国养老机构来源线索，核对地方官方名单和登记主体；所有资料均标明来源边界。',
};

const quickEntries = [
  { href: '/quanguo/pingtai/', glyph: '院', title: '养老院查询', detail: '按地区检索民政部平台部分采集快照' },
  { href: '/quanguo/cankao/', glyph: '录', title: '机构线索', detail: '查看企查查来源表中的机构记录' },
  { href: '/quanguo/laiyuan/', glyph: '源', title: '官方来源', detail: '核对地方名单原文和资料日期' },
  { href: '/quanguo/shangmen/', glyph: '家', title: '上门服务', detail: '查找公开列示居家服务的机构线索' },
] as const;

const hotLinks = [
  { href: '/quanguo/pingtai/', label: '民政部平台快照' },
  { href: '/quanguo/cankao/', label: '企查查机构线索' },
  { href: '/quanguo/laiyuan/', label: '地方官方来源' },
  { href: '/quanguo/zhuti/', label: '登记主体候选' },
  { href: '/rules/', label: '收录范围与方法' },
] as const;

const menuLinks = [
  { href: '#institution-search', label: '养老院查询' },
  { href: '#region-shortcuts', label: '按地区查找' },
  { href: '/quanguo/laiyuan/', label: '官方来源' },
  { href: '/quanguo/shangmen/', label: '居家服务' },
  { href: '/quanguo/banshi/', label: '办事指南' },
  { href: '/corrections/', label: '资料纠错' },
] as const;

const entranceCards = [
  { href: '/quanguo/cankao/', title: '企查查机构线索', desc: '按省市查看来源表逐行记录' },
  { href: '/quanguo/laiyuan/', title: '核对官方来源', desc: '查看原文、发布方与资料日期' },
  { href: '/quanguo/zhuti/', title: '登记主体候选', desc: '企业登记快照与机构记录分开核对' },
  { href: '/rules/', title: '来源与方法', desc: '了解收录范围与待核边界' },
] as const;

const shortProvinceNames = ['北京市', '上海市', '广东省', '江苏省', '浙江省', '山东省', '四川省', '河南省', '湖北省', '湖南省', '福建省', '重庆市'];
const shortProvinces = shortProvinceNames.flatMap(name => {
  const province = referenceManifest.provinces.find(item => item.name === name);
  return province ? [province] : [];
});

export default function HomePage() {
  const platform = summarizeMcaCatalog(mcaCatalogLoader.getManifest());
  return <div className={styles.page + ' home-page min-w-0'}>
    <style>{homeStyles}</style>
    <div className={styles.shell}>
      <section id="home-hero" aria-labelledby="home-title" className={styles.hero}>
        <div className={styles.heroMain}>
          <p className={styles.kicker}>全国养老机构来源查询</p>
          <h1 id="home-title" className={styles.heroTitle}>找养老机构，<br />先看清资料来源</h1>
          <p className={styles.heroIntro}>按机构名称或地区找线索，再查看来源和资料日期。这里展示的是历史快照，不代表机构当前在营、空床或实时收费。</p>
          <form action={sitePath('/quanguo/pingtai/')} method="get" role="search" aria-label="检索民政部平台部分采集快照" className={styles.heroSearch}>
            <label htmlFor="home-keyword" className="sr-only">机构名称或地址</label>
            <input id="home-keyword" name="q" type="search" maxLength={80} placeholder="输入机构名称、地区或地址" />
            <button type="submit">搜索机构</button>
          </form>
          <p className={styles.heroFoot}>民政部平台部分采集快照 · {platform.recordCount.toLocaleString('zh-CN')} 个不重复平台 ID · {platform.detailCount.toLocaleString('zh-CN')} 条有详情</p>
        </div>
        <nav aria-label="首页主要入口" className={styles.quickGrid}>
          {quickEntries.map(item => <Link key={item.href} href={item.href} className={styles.quickCard}>
            <span aria-hidden="true" className={styles.quickGlyph}>{item.glyph}</span>
            <span className={styles.quickText}><strong>{item.title} <span aria-hidden="true">›</span></strong><small>{item.detail}</small></span>
          </Link>)}
        </nav>
      </section>

      <nav aria-label="首页热点服务" className={styles.hotLinks}>
        <strong>热点服务</strong>
        <div>{hotLinks.map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}
          <Link href="/quanguo/banshi/">机构办事指南</Link>
        </div>
      </nav>

      <section id="service-query" aria-labelledby="service-query-title" className={styles.queryModule}>
        <nav aria-label="首页查询栏目" className={styles.queryMenu}>
          <h2 id="service-query-title">养老服务</h2>
          {menuLinks.map((item, index) => item.href.startsWith('#')
            ? <a key={item.href} href={item.href} className={index === 0 ? styles.menuActive : undefined}>{item.label}<span aria-hidden="true">›</span></a>
            : <Link key={item.href} href={item.href}>{item.label}<span aria-hidden="true">›</span></Link>)}
        </nav>
        <div className={styles.queryBody}>
          <div id="institution-search" className={styles.queryIntro}>
            <div><p className={styles.sectionEyebrow}>机构查询</p><h2>按名称查机构，按来源核资料</h2></div>
            <Link href="/quanguo/pingtai/">进入全国目录 <span aria-hidden="true">→</span></Link>
          </div>
          <form action={sitePath('/quanguo/pingtai/')} method="get" role="search" aria-label="查询全国机构线索" className={styles.queryForm}>
            <label htmlFor="home-query-keyword">机构名称或地址</label>
            <div><input id="home-query-keyword" name="q" type="search" maxLength={80} placeholder="例如：东城区 养老院" /><button type="submit">开始查询</button></div>
          </form>
          <div id="region-shortcuts" className={styles.regionShortcuts}>
            <div className={styles.shortcutHeading}><h3>地区快捷入口</h3><span>企查查来源表线索</span></div>
            <ul>{shortProvinces.map(province => <li key={province.slug}><Link href={'/quanguo/cankao/sheng/' + province.slug + '/'}>{province.name}</Link></li>)}</ul>
          </div>
          <p className={styles.queryCaveat}>民政部平台部分采集快照：{platform.recordCount.toLocaleString('zh-CN')} 个不重复平台 ID，{platform.detailCount.toLocaleString('zh-CN')} 条有详情、{platform.indexOnlyCount.toLocaleString('zh-CN')} 条仅有索引。CSV 导出日期 {platform.csvExportDate}，非全国全量，不代表当前在营；进入目录可按省市和设施类型筛选。</p>
        </div>
      </section>

      <div className={styles.onlinePanel}><HomeOnlineTabs /></div>

      <section id="region-index" aria-labelledby="region-index-title" className={styles.regionIndex}>
        <div className={styles.regionIndexHeading}><div><p className={styles.sectionEyebrow}>地区索引</p><h2 id="region-index-title">按省份进入企查查来源表线索</h2></div><Link href="/quanguo/cankao/">查看全部来源表 <span aria-hidden="true">→</span></Link></div>
        <p>以下是来源表中的候选记录，不等于当前在营养老机构，也不自动关联民政部平台记录。</p>
        <details open><summary>按省份展开来源线索 <span aria-hidden="true">⌄</span></summary>
          <ul>{referenceManifest.provinces.map(province => <li key={province.slug}><Link href={'/quanguo/cankao/sheng/' + province.slug + '/'}>{province.name}</Link></li>)}</ul>
        </details>
      </section>

      <section id="home-entrances" aria-label="本站资料入口" className={styles.entrances}>
        {entranceCards.map(item => <Link key={item.href} href={item.href}><strong>{item.title}</strong><span>{item.desc} <b aria-hidden="true">→</b></span></Link>)}
      </section>
    </div>
  </div>;
}
