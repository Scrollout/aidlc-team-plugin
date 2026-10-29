import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Note } from '../../model/note.ts';
import { getNote, NoteNotFoundError } from './handler.ts';

test('get reads a note or refuses an unknown id', async () => {
  const notes = { get: async (id: string): Promise<Note | undefined> => (id === 'n1' ? { id, text: 'hello' } : undefined) };
  assert.equal((await getNote(notes, 'n1')).text, 'hello');
  await assert.rejects(getNote(notes, 'n9'), NoteNotFoundError);
});
