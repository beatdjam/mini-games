// Small helpers for a game's panels built from HTML strings.
// a label / value list for a <dl>: one <div><dt>label</dt><dd>value</dd></div> per row
export const rowsHTML = (rows: [string, string | number][]): string =>
  rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
// click handling by data attribute: the first entry of `table` whose `[data-attr]` is on the clicked element (or the
// nearest ancestor that has it) gets the attribute's value; entries after it are not looked at.
// attr is written without "data-", all lower case
export type DataClick = [attr: string, run: (value: string) => void];
export function onDataClick(root: HTMLElement, ...table: DataClick[]): void {
  root.addEventListener('click', (e: Event) => {
    const tg = e.target as HTMLElement; // click targets are elements
    for (const [attr, run] of table) {
      const hit = tg.closest<HTMLElement>(`[data-${attr}]`);
      if (hit) {
        run(hit.dataset[attr]!); // closest() found it by this attribute, so the value is there
        return;
      }
    }
  });
}
