import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NoteCreated } from '../../events/events.ts';
import { EmptyNoteError, type Note } from '../../model/note.ts';
import { createNote } from './handler.ts';

test('create stores and announces, and a refused note does neither', async () => {
  const stored = new Map<string, Note>(), sent: NoteCreated[] = [];
  const notes = { save: async (n: Note) => void stored.set(n.id, n) }, events = { publish: async (e: NoteCreated) => void sent.push(e) };
  await createNote(notes, events, 'n1', 'hello');
  assert.equal(stored.get('n1')?.text, 'hello');
  assert.deepEqual(sent, [{ id: 'n1' }]);
  await assert.rejects(createNote(notes, events, 'n2', ''), EmptyNoteError);
  assert.equal(stored.has('n2'), false);
  assert.equal(sent.length, 1);
});
