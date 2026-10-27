// The notes domain's entities and the rules they keep; this layer depends on no other.

/** The root aggregate of the notes domain. */
export interface Note {
  readonly id: string;
  readonly text: string;
}

/** The rule a note keeps: it has text. */
export class EmptyNoteError extends Error {
  constructor() {
    super('a note needs text');
  }
}

/** A note, once its rules hold. */
export function newNote(id: string, text: string): Note {
  if (text === '') throw new EmptyNoteError();
  return { id, text };
}
