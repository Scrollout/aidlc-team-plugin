import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryNotes } from './memory.ts';

test('memory saves and reads', async () => {
  const notes = new MemoryNotes();
  await notes.save({ id: 'n1', text: 'hello' });
  assert.equal((await notes.get('n1'))?.text, 'hello');
});
