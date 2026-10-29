import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screen } from './screen.ts';

test('the createnote screen calls its route', () => {
  assert.match(screen('a b'), /action="\/notes\/a%20b"/);
});
