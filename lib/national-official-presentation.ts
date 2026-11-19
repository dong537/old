import type { NationalOfficialIndexRecord } from './national-official-types';

type DisplayRecord = Pick<NationalOfficialIndexRecord, 'sourceId' | 'rowNumber' | 'name' | 'address'>;

const HUNAN_2025_SOURCE = 'hn-mzt-20260112';
const CHONGQING_TEST_ROWS: Readonly<Record<number, string>> = {
  23: '测试单位1209',
  305: '测试机构003',
  671: '测试单位001',
  1510: '测试99',
};

export function officialAddressLabel(record: DisplayRecord): string {
  if (record.sourceId === HUNAN_2025_SOURCE && record.rowNumber === 708 && record.address === '169') {
    return '原表仅填“169”，详细地址无法确定';
  }
  return record.address ?? '原表未提供';
}

export function officialNameCaution(record: DisplayRecord): string | null {
  if (record.sourceId === 'cq-mzj-20251222' && CHONGQING_TEST_ROWS[record.rowNumber] === record.name) {
    return '原表该条名称为“' + record.name + '”，疑似测试记录，不能作为机构信息使用；请向重庆市民政局核实。';
  }
  if (record.sourceId === HUNAN_2025_SOURCE && record.rowNumber === 1667 && record.name.startsWith(':')) {
    return '原表名称以冒号开头，本站按原文展示，尚未核实是否笔误。';
  }
  return null;
}

export function officialWorkbookRow(record: DisplayRecord): number | null {
  // The pinned Hunan workbook has two header rows; rowNumber is the 1-based data sequence.
  return record.sourceId === HUNAN_2025_SOURCE ? record.rowNumber + 2 : null;
}
