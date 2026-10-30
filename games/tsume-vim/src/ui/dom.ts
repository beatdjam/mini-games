// Small DOM pieces shared by the two buffer panes.
export interface LineRow {
  row: HTMLElement;
  body: HTMLElement;
}

export function newLineRow(lineIndex: number, marks = ''): LineRow {
  const row = document.createElement('div');
  row.className = 'line';
  const number = document.createElement('span');
  number.className = 'ln';
  number.textContent = String(lineIndex + 1);
  if (marks) {
    const badge = document.createElement('span');
    badge.className = 'mark';
    badge.textContent = marks;
    number.append(badge);
  }
  const body = document.createElement('span');
  body.className = 'tx';
  row.append(number, body);
  return { row, body };
}

export function charSpan(line: string, col: number): HTMLSpanElement {
  const span = document.createElement('span');
  if (line[col] === ' ' && line.slice(col).trim() === '') {
    span.textContent = '·';
    span.classList.add('trail');
  } else {
    span.textContent = line[col];
  }
  return span;
}

export function insertCursor(): HTMLElement {
  const span = document.createElement('span');
  span.className = 'cur ins';
  return span;
}

// px kept above or below the cursor's line when the buffer scrolls to it
const CURSOR_SCROLL_MARGIN = 24;

export function ensureCursorVisible(buffer: HTMLElement): void {
  const row = buffer.querySelector<HTMLElement>('.curline');
  if (!row) return;
  const top = row.offsetTop;
  const bottom = top + row.offsetHeight;
  if (top < buffer.scrollTop) {
    buffer.scrollTop = Math.max(0, top - CURSOR_SCROLL_MARGIN);
  } else if (bottom > buffer.scrollTop + buffer.clientHeight) {
    buffer.scrollTop = bottom - buffer.clientHeight + CURSOR_SCROLL_MARGIN;
  }
}
