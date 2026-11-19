import assert from 'node:assert/strict';
import test from 'node:test';
import { sitePath, logicalPathname } from '../lib/site-path';

test('site paths preserve current root deployment by default', () => {
  const previous = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
  delete process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
  try {
    assert.equal(sitePath('/guangzhou/jigou/?q=养老'), '/guangzhou/jigou/?q=养老');
    assert.equal(logicalPathname('/guangzhou/jigou/'), '/guangzhou/jigou/');
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
    else process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = previous;
  }
});

test('site paths keep internal navigation inside isolated eldercare prefix', () => {
  const previous = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
  process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = '/eldercare';
  try {
    assert.equal(sitePath('/guangzhou/jigou/?q=养老'), '/eldercare/guangzhou/jigou/?q=养老');
    assert.equal(sitePath('/data/guangzhou-institutions.v1.json'), '/eldercare/data/guangzhou-institutions.v1.json');
    assert.equal(sitePath('#sources'), '#sources');
    assert.equal(sitePath('tel:02012345678'), 'tel:02012345678');
    assert.equal(sitePath('https://example.com/'), 'https://example.com/');
    assert.equal(logicalPathname('/eldercare/guangzhou/shangmen/'), '/guangzhou/shangmen/');
    assert.equal(logicalPathname('/eldercare'), '/');
    assert.equal(logicalPathname('/elsewhere/'), '/elsewhere/');
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
    else process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = previous;
  }
});
