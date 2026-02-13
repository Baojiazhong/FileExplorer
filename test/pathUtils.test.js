import test from 'node:test';
import assert from 'node:assert/strict';

import { getDirectoryPath } from '../src/utils/pathUtils.js';

test('getDirectoryPath: Windows paths', () => {
  assert.equal(getDirectoryPath('C:\\a\\b.txt'), 'C:\\a');
  assert.equal(getDirectoryPath('C:\\a\\b'), 'C:\\a');

  // Drive root should remain root
  assert.equal(getDirectoryPath('C:\\a'), 'C:\\');
  assert.equal(getDirectoryPath('C:\\'), 'C:\\');
});

test('getDirectoryPath: Unix paths', () => {
  assert.equal(getDirectoryPath('/a/b.txt'), '/a');
  assert.equal(getDirectoryPath('/a/b'), '/a');

  // Unix root should remain root
  assert.equal(getDirectoryPath('/a'), '/');
  assert.equal(getDirectoryPath('/'), '/');
});

test('getDirectoryPath: Edge cases', () => {
  assert.equal(getDirectoryPath(''), '');
  assert.equal(getDirectoryPath(null), '');
  assert.equal(getDirectoryPath(undefined), '');

  // No separator: function returns input as-is
  assert.equal(getDirectoryPath('filename.txt'), 'filename.txt');
});
