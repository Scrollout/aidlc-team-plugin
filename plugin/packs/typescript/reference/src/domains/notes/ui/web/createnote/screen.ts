// The createnote slice's screen: the form calling its route.
export function screen(name: string): string {
  return `<form method="put" action="/notes/${encodeURIComponent(name)}"><textarea name="text"></textarea><button>Save</button></form>`;
}
