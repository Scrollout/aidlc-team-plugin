// The notes domain's published event types: other domains may depend on this surface.

/** The event type: <Org>.<Service>.<Noun><PastTenseVerb>, with no version. */
export const NoteCreatedType = 'Example.Reference.NoteCreated';

/** Published once a note is stored. */
export interface NoteCreated {
  readonly id: string;
}
