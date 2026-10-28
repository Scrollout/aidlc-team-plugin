// The getnote slice's route: it runs the slice's handler and answers with the note.
import type { ServerResponse } from 'node:http';
import { getNote, type Repository } from '../application/getnote/handler.ts';

export async function getnoteRoute(notes: Repository, name: string, res: ServerResponse) {
  try {
    res.writeHead(200).end(JSON.stringify(await getNote(notes, name)));
  } catch (e) {
    res.writeHead(404).end(String((e as Error).message));
  }
}
