const test = require('node:test');
const assert = require('node:assert/strict');
const { makeBackup, readBackup } = require('../utils.js');

const sample = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  user_id: 'private-account-id',
  title: 'Full ✨ Prompt',
  content: 'Line 1\n\n  Line 2\twith spaces\n\n`code` 💻 <script>alert(1)</script>\n' + 'X'.repeat(12000),
  created_at: '2026-11-13T09:05:00.000Z',
  updated_at: '2026-11-13T09:10:00.000Z'
};

test('backup exports whole prompt exactly and omits user IDs', () => {
  const obj = makeBackup([sample], '2026-11-13T10:00:00Z');
  const serialized = JSON.stringify(obj);
  assert.equal(obj.count, 1);
  assert.ok(!serialized.includes('private-account-id'));
  assert.equal(readBackup(serialized)[0].content, sample.content);
  assert.equal(obj.exported_at, '2026-11-13T10:00:00Z');
});

test('backup handles zero prompts without losing format', () => {
  const obj = makeBackup([]);
  assert.deepEqual(readBackup(JSON.stringify(obj)), []);
});

test('invalid, truncated, or unrelated JSON is rejected', () => {
  assert.throws(() => readBackup('{'), /valid JSON/);
  assert.throws(() => readBackup('{"prompts":[]}'), /not a supported/);
  assert.throws(() => readBackup(JSON.stringify({ ...makeBackup([sample]), count: 2 })), /record count/);
});

test('duplicates and empty content in restore are rejected', () => {
  assert.throws(() => readBackup(JSON.stringify(makeBackup([sample, sample]))), /duplicate/);
  assert.throws(() => readBackup(JSON.stringify(makeBackup([{ ...sample, content: '  ' }]))), /invalid prompt/);
});

test('backup cannot override a user ID through the restore parser', () => {
  const record = readBackup(JSON.stringify(makeBackup([sample])))[0];
  assert.deepEqual(Object.keys(record), ['id', 'title', 'content', 'created_at', 'updated_at']);
  assert.equal(record.user_id, undefined);
});
