// The command slice that creates a note: its ports, its rules and its event, end to end.
import type { NoteCreated } from '../../events/events.ts';
import { type Note, newNote } from '../../model/note.ts';

/** What the slice needs from storage; the infrastructure layer implements it. */
export interface Repository {
  save(note: Note): Promise<void>;
}

/** Sends the domain's events. */
export interface Publisher {
  publish(event: NoteCreated): Promise<void>;
}

/** Creates a note, stores it and announces it. */
export async function createNote(notes: Repository, events: Publisher, id: string, text: string): Promise<Note> {
  const note = newNote(id, text);
  await notes.save(note);
  await events.publish({ id: note.id });
  return note;
}
