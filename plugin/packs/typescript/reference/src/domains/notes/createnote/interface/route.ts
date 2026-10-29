// The createnote slice's route: it decodes the call, runs the slice's handler and answers.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createNote, type Publisher, type Repository } from '../application/handler.ts';

export async function createnoteRoute(notes: Repository, events: Publisher, name: string, req: IncomingMessage, res: ServerResponse) {
  let body = '';
  for await (const chunk of req) body += chunk;
  try {
    res.writeHead(201).end(JSON.stringify(await createNote(notes, events, name, JSON.parse(body).text ?? '')));
  } catch (e) {
    res.writeHead(400).end(String((e as Error).message));
  }
}
