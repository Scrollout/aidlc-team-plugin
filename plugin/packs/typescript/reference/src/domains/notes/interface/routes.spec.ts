import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { routes } from './http.ts';
import type { Note } from '../model/note.ts';

// A call as the runtime passes it in, and the answer it writes out.
const call = (method: string, url: string, body = '') => Object.assign((async function* () { if (body) yield body; })(), { method, url }) as unknown as IncomingMessage;
const answer = () => {
  const out = { status: 0, body: '' };
  const res = { writeHead: (s: number) => { out.status = s; return res; }, end: (b: string) => { out.body = b; return res; } };
  return { out, res: res as unknown as ServerResponse };
};

// Each slice is proved through its route: a call in, the answer out.
test('createnote and getnote answer through their routes', async () => {
  const store = new Map<string, Note>();
  const serve = routes({ save: async (n: Note) => { store.set(n.id, n); }, get: async (id: string) => store.get(id) }, { publish: async () => {} });
  const put = answer();
  await serve(call('PUT', '/notes/a', JSON.stringify({ text: 'hi' })), put.res);
  assert.equal(put.out.status, 201);
  const got = answer();
  await serve(call('GET', '/notes/a'), got.res);
  assert.equal(got.out.status, 200);
  assert.match(got.out.body, /hi/);
  const missing = answer();
  await serve(call('GET', '/notes/b'), missing.res);
  assert.equal(missing.out.status, 404);
});
