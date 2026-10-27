// How other domains call the notes domain: this surface links no internals of it.

/** The client's view of a note, from the published contract. */
export interface Note {
  readonly id: string;
  readonly text: string;
}

/** Reads a note from the notes API at baseUrl. */
export async function getNote(baseUrl: string, id: string): Promise<Note> {
  const res = await fetch(`${baseUrl}/notes/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`get note ${id}: ${res.status}`);
  return (await res.json()) as Note;
}
