// Serves the notes domain over HTTP: the router is the domain's shared server surface, each route its slice's own.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Publisher, Repository as Writes } from '../createnote/application/handler.ts';
import type { Repository as Reads } from '../getnote/application/handler.ts';
import { createnoteRoute } from '../createnote/interface/route.ts';
import { getnoteRoute } from '../getnote/interface/route.ts';

/** Mounts PUT and GET /notes/{noteName} on their slices' routes. */
export function routes(notes: Writes & Reads, events: Publisher) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const name = decodeURIComponent((req.url ?? '').replace(/^\/notes\//, ''));
    if (req.method === 'PUT') await createnoteRoute(notes, events, name, req, res);
    else await getnoteRoute(notes, name, res);
  };
}
