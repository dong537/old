import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const templatePath = path.join(process.cwd(), '.github', 'ISSUE_TEMPLATE', 'institution-correction.yml');

function field(source: string, id: string): string {
  const block = source.split(/^  - type: /m).find(part => new RegExp('^    id: ' + id + '$', 'm').test(part));
  assert.ok(block, '纠错表单缺少 ' + id);
  return block;
}

test('公开纠错表单要求可定位的机构和来源证据', () => {
  const source = readFileSync(templatePath, 'utf8');
  assert.match(source, /^name: .+$/m);
  assert.match(source, /^description: .+$/m);
  assert.match(source, /^body:$/m);
  for (const id of ['record_locator', 'page_url', 'disputed_field', 'evidence_url', 'evidence_date', 'explanation']) {
    assert.match(field(source, id), /\n    validations:\n      required: true(?:\n|$)/, id + ' 必须填写');
  }
  assert.match(source, /公开可访问/);
  assert.match(source, /发布日期/);
  assert.match(field(source, 'record_locator'), /平台 ID.*来源行/);
  assert.match(field(source, 'record_locator'), /不会自动填入此栏/);
});

test('公开工单说明登录和公开边界，禁止上传个人敏感信息', () => {
  const source = readFileSync(templatePath, 'utf8');
  assert.match(source, /GitHub 账号登录/);
  assert.match(source, /所有提交内容公开可见/);
  for (const value of ['病历', '身份证', '老人联系方式']) assert.ok(source.includes(value));
  const acknowledgement = field(source, 'privacy_acknowledgement');
  assert.match(acknowledgement, /^checkboxes/);
  assert.match(acknowledgement, /options:\n        - label: .+\n          required: true/);
  assert.doesNotMatch(source, /id: (?:email|phone|contact_name)/);
  assert.doesNotMatch(source, /提交后即已核实|自动修改|保证当日处理/);
});
