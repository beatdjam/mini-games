// a label / value list for the <dl class="reslist"> panels (stats, result)
export const rowsHTML = (rows: [string, string | number][]): string =>
  rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
