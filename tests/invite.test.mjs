import test from 'node:test';
import assert from 'node:assert/strict';
import { createEntryUrl, createInviteUrl, roomInviteText } from '../src/services/invite.ts';

test('creates a hash-routed invite URL and removes stale query/hash values', () => {
  const result = createInviteUrl('https://example.test/game?old=1#/pages/index/index?room=000001', '123456');
  assert.equal(result, 'https://example.test/game#/pages/index/index?room=123456');
});

test('encodes the room code in the invite URL', () => {
  const result = createInviteUrl('https://example.test/', 'A&B');
  assert.equal(result, 'https://example.test/#/pages/index/index?room=A%26B');
});

test('creates the platform entry URL without carrying a room invitation', () => {
  const result = createEntryUrl('https://example.test/game?old=1#/pages/index/index?room=123456');
  assert.equal(result, 'https://example.test/game#/pages/index/index');
});

test('provides a non-H5 fallback invite label', () => {
  assert.equal(roomInviteText('123456'), '房间号：123456');
});
