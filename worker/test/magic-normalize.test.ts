import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeMagicCredential } from '../src/auth/magic.ts';
import { generateOtpCode } from '../src/lib/encoding.ts';

describe('normalizeMagicCredential (worker)', () => {
  it('accepts passcodes and deep links', () => {
    assert.equal(normalizeMagicCredential('123456'), '123456');
    assert.equal(
      normalizeMagicCredential('foodie://auth/verify?token=abc'),
      'abc',
    );
    assert.equal(
      normalizeMagicCredential('https://foodie-prod.pages.dev/?magic=xyz'),
      'xyz',
    );
  });
});

describe('generateOtpCode', () => {
  it('returns six digits', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateOtpCode();
      assert.match(code, /^\d{6}$/);
    }
  });
});
