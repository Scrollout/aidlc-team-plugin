// The query operation that reads one note.
import type { Note } from '../../model/note.ts';

/** Returned for an id no note has. */
export class NoteNotFoundError extends Error {
  constructor(id: string) {
    super(`no note ${id}`);
  }
}

/** What the operation needs from storage. */
export interface Repository {
  get(id: string): Promise<Note | undefined>;
}

/** The note with the given id. */
export async function getNote(notes: Repository, id: string): Promise<Note> {
  const note = await notes.get(id);
  if (!note) throw new NoteNotFoundError(id);
  return note;
}
