import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EmptyNoteError, newNote } from './note.ts';

test('a note keeps its rule', () => {
  assert.throws(() => newNote('n1', ''), EmptyNoteError);
  assert.deepEqual(newNote('n1', 'hello'), { id: 'n1', text: 'hello' });
});
