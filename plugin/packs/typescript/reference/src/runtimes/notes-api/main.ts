// The runtime that hosts the notes domain: wiring only.
import { createServer } from 'node:http';
import { NoteCreatedType, type NoteCreated } from '../../domains/notes/events/events.ts';
import { MemoryNotes } from '../../domains/notes/infrastructure/memory.ts';
import { routes } from '../../domains/notes/interface/http.ts';

const events = { publish: async (e: NoteCreated) => console.log(NoteCreatedType, e.id) };
createServer(routes(new MemoryNotes(), events)).listen(8080);
