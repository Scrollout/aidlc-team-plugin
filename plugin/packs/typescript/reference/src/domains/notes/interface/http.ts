// Serves the notes domain over HTTP: the server surface its runtime hosts.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createNote, type Publisher, type Repository as Writes } from '../application/createnote/handler.ts';
import { getNote, type Repository as Reads } from '../application/getnote/handler.ts';

/** Routes PUT and GET /notes/{noteName} to the slices. */
export function routes(notes: Writes & Reads, events: Publisher) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const name = decodeURIComponent((req.url ?? '').replace(/^\/notes\//, ''));
    try {
      if (req.method === 'PUT') {
        let body = '';
        for await (const chunk of req) body += chunk;
        res.writeHead(201).end(JSON.stringify(await createNote(notes, events, name, JSON.parse(body).text ?? '')));
      } else res.writeHead(200).end(JSON.stringify(await getNote(notes, name)));
    } catch (e) {
      res.writeHead(req.method === 'PUT' ? 400 : 404).end(String((e as Error).message));
    }
  };
}
