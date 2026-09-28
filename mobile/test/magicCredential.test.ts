import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  credentialFromAuthUrl,
  normalizeMagicCredential,
} from '../src/auth/magicCredential.ts';

describe('normalizeMagicCredential', () => {
  it('accepts bare 6-digit passcodes', () => {
    assert.equal(normalizeMagicCredential(' 042891 '), '042891');
  });

  it('extracts token from foodie:// deep links', () => {
    assert.equal(
      normalizeMagicCredential('foodie://auth/verify?token=abc123XYZ'),
      'abc123XYZ',
    );
  });

  it('extracts magic= from https handoff URLs (paste path)', () => {
    assert.equal(
      normalizeMagicCredential('https://foodie-staging.pages.dev/?magic=tok_from_email'),
      'tok_from_email',
    );
  });

  it('extracts token= from https auth verify URLs', () => {
    assert.equal(
      normalizeMagicCredential('https://foodie-prod.pages.dev/auth/verify?token=webTok'),
      'webTok',
    );
  });

  it('leaves opaque long tokens untouched', () => {
    assert.equal(normalizeMagicCredential('dGVzdC1sb25nLXRva2Vu'), 'dGVzdC1sb25nLXRva2Vu');
  });
});

describe('credentialFromAuthUrl', () => {
  it('reads foodie://auth/verify', () => {
    assert.equal(
      credentialFromAuthUrl('foodie://auth/verify?token=deeplink1'),
      'deeplink1',
    );
  });

  it('reads ?magic= https handoff without consuming semantics', () => {
    assert.equal(
      credentialFromAuthUrl('https://example.com/?magic=handoffTok'),
      'handoffTok',
    );
  });

  it('ignores unrelated deep links', () => {
    assert.equal(credentialFromAuthUrl('foodie://items/123'), null);
  });
});
