// Implements the operations' ports; depends on the model only.
import type { Note } from '../model/note.ts';

/** Keeps notes in memory; a database adapter has the same two methods. */
export class MemoryNotes {
  readonly #notes = new Map<string, Note>();

  async save(note: Note): Promise<void> {
    this.#notes.set(note.id, note);
  }

  async get(id: string): Promise<Note | undefined> {
    return this.#notes.get(id);
  }
}
