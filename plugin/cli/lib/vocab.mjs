// The canonical words, and the generated blocks drawn from them (docs/design/canonical-model.md).
import { config } from './config.mjs';
import { render } from './template.mjs';

const V = config.vocabulary;
const BLOCK = (name) => new RegExp(`(<!-- generated: ${name} -->\\n)[\\s\\S]*?(<!-- /generated -->)`);

// The glossary table: every word with its scale and AI-DLC term, then the retired words and what replaces them.
export function glossary() {
  const rows = V.words.map((w) => render(V.row, { method: '', ...w }));
  const retired = render(V.retiredLine, { list: V.retired.map((r) => render(V.retiredItem, r)).join('; ') });
  return [V.heading, ...rows, '', retired].join('\n');
}

// A doc with its generated block rewritten; null when the doc holds no such block.
export function withBlock(text, name, body) {
  return BLOCK(name).test(text) ? text.replace(BLOCK(name), (_, open, close) => `${open}${body}\n${close}`) : null;
}
