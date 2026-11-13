const test = require('node:test');
const assert = require('node:assert/strict');
const { preview, matchesSearch, validatePrompt, sortedByUpdate } = require('../utils.js');

test('shortens long content but not the original', () => {
  const original = 'Introduction\n' + 'a'.repeat(250) + '\nEnd';
  const result = preview(original);
  assert.ok(result.length <= 148);
  assert.ok(result.endsWith('...'));
  assert.equal(original.split('\n').length, 3);
});

test('searches the full content case-insensitively', () => {
  const row = { title: 'Quant reasoning', content: 'A'.repeat(200) + '\nYouTube lessons for Mixtures' };
  assert.equal(matchesSearch(row, 'youtube'), true);
  assert.equal(matchesSearch(row, 'QUANT'), true);
  assert.equal(matchesSearch(row, 'history'), false);
});

test('rejects empty and too long titles and empty content', () => {
  assert.ok(validatePrompt(' ', 'hello'));
  assert.ok(validatePrompt('title', '\n \t'));
  assert.ok(validatePrompt('a'.repeat(161), 'ok'));
  assert.equal(validatePrompt('One', 'line1\nline2'), null);
});

test('sorts by updated timestamp, newest first', () => {
  const rows = [
    {id:'a', updated_at:'2024-01-01T00:00:00Z'},
    {id:'b', updated_at:'2025-01-01T00:00:00Z'},
  ];
  assert.deepEqual(sortedByUpdate(rows).map(row=>row.id), ['b','a']);
  assert.deepEqual(rows.map(row=>row.id), ['a','b']);
});
