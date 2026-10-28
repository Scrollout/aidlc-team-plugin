// The {{operation}} slice's route: it decodes the call, runs the slice's handler and answers; the domain's router mounts it.
import type { IncomingMessage, ServerResponse } from 'node:http';

export async function {{operation}}Route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.writeHead(501).end();
}
