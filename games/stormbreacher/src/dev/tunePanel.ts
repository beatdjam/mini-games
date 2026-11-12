// The tuning panel the dev views share (#view-boom, #view-map, #view-sound): it puts a slider and a number field on
// the values the view lets the eye settle, writes a change straight into the table the view reads, and copies the
// changed values back in the shape of the source table so they can be handed to Claude. Nothing is saved and no file is
// touched: a reload puts the table back.
//
// It lives in src/dev/ so the sortie's build carries none of it.

export interface TuneRange {
  min: number;
  max: number;
  step: number;
}

export interface TuneGroup {
  name: string; // the table's name in the source ("MOVE_TUNE"), printed when a changed value is copied
  table: object; // the table itself: a change is written into it in place
  ranges: Readonly<Record<string, TuneRange>>; // the values to show, by dotted path ("fire.radius")
  labels?: Readonly<Record<string, string>>; // what a row is called on screen (the path when left out)
  baseline?: Readonly<Record<string, number>>; // what "元に戻す" goes back to (the values when the panel is made)
}

export interface TunePanelOptions {
  groups: readonly TuneGroup[];
  title?: string;
  id?: string;
  extra?: HTMLElement; // the view's own buttons, shown above the sliders
  onChange?: (group: string, key: string, value: number) => void;
  zIndex?: number;
}

export interface TunePanel {
  element: HTMLElement;
  // Replaces the groups, for a view whose table changes (the boom view's kind). Every group's baseline is taken from
  // its `baseline` (the current values when left out).
  setGroups(groups: readonly TuneGroup[]): void;
  // Reads the tables again, for a value changed outside the panel (a URL override or a new scene).
  sync(): void;
}

// The number as the source would write it: 12 significant digits leave out the noise a slider step or a number field
// can leave behind (0.30000000000000004), and no trailing zeros are added to an integer.
export function tuneNumber(value: number): string {
  return String(Number(value.toPrecision(12)));
}

function containerOf(table: object, path: string): Record<string, unknown> | null {
  const parts = path.split('.');
  let at = table as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = at[parts[i]];
    if (typeof next !== 'object' || next === null) return null;
    at = next as Record<string, unknown>;
  }
  return at;
}

export function readTune(table: object, path: string): number | null {
  const parent = containerOf(table, path);
  if (parent === null) return null;
  const parts = path.split('.');
  const value = parent[parts[parts.length - 1]];
  return typeof value === 'number' ? value : null;
}

function writeTune(table: object, path: string, value: number): void {
  const parent = containerOf(table, path);
  if (parent === null) return;
  const parts = path.split('.');
  parent[parts[parts.length - 1]] = value;
}

// The lines to copy for one table: only the values that differ from `baseline`, each as `TABLE.path: value`.
// `keys` is the dotted paths the panel shows; the baseline holds what they were when the panel was made.
export function changedValuesText(
  name: string,
  table: object,
  baseline: Readonly<Record<string, number>>,
  keys: readonly string[],
): string {
  const lines: string[] = [];
  for (const key of keys) {
    const value = readTune(table, key);
    const before = baseline[key];
    if (value === null || before === undefined) continue;
    if (Math.abs(value - before) < 1e-9) continue;
    lines.push(`${name}.${key}: ${tuneNumber(value)}`);
  }
  return lines.join('\n');
}

interface Row {
  range: HTMLInputElement;
  number: HTMLInputElement;
  value: HTMLElement;
}

interface GroupState {
  spec: TuneGroup;
  baseline: Record<string, number>;
  rows: Map<string, Row>;
}

const BUTTON_STYLE =
  'height:24px;border:1px solid rgba(213,228,238,0.35);background:rgba(10,17,25,0.7);color:inherit;font:inherit';

export function createTunePanel(options: TunePanelOptions): TunePanel {
  document.getElementById(options.id ?? 'sbTunePanel')?.remove();

  const panel = document.createElement('div');
  panel.id = options.id ?? 'sbTunePanel';
  panel.style.cssText =
    'position:fixed;right:8px;top:calc(env(safe-area-inset-top,0px) + 8px);width:260px;' +
    'max-height:calc(100vh - 16px);display:flex;flex-direction:column;font:11px/1.35 monospace;color:#e8eef2;' +
    `background:rgba(10,17,25,0.88);border:1px solid rgba(213,228,238,0.3);z-index:${options.zIndex ?? 6}`;
  document.body.appendChild(panel);

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;gap:4px;align-items:center;padding:4px';
  const title = document.createElement('span');
  title.textContent = options.title ?? '調整';
  title.style.cssText = 'flex:1;font-weight:bold';
  const fold = document.createElement('button');
  fold.type = 'button';
  fold.style.cssText = BUTTON_STYLE;
  head.append(title, fold);
  panel.appendChild(head);

  const body = document.createElement('div');
  body.style.cssText = 'overflow:auto;padding:0 6px 6px';
  panel.appendChild(body);

  let collapsed = window.innerHeight < 520;
  const showFold = () => {
    body.hidden = collapsed;
    fold.textContent = collapsed ? 'つまみ ▸' : 'つまみ ▾';
  };
  showFold();
  fold.addEventListener('click', () => {
    collapsed = !collapsed;
    showFold();
  });

  if (options.extra) body.appendChild(options.extra);

  const groupsBox = document.createElement('div');
  body.appendChild(groupsBox);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:4px;margin-top:6px';
  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.dataset.tuneAction = 'copy';
  copyButton.textContent = '値をコピー';
  copyButton.style.cssText = `${BUTTON_STYLE};flex:1`;
  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.dataset.tuneAction = 'reset';
  resetButton.textContent = '元に戻す';
  resetButton.style.cssText = `${BUTTON_STYLE};flex:1`;
  actions.append(copyButton, resetButton);
  body.appendChild(actions);

  const output = document.createElement('textarea');
  output.readOnly = true;
  output.hidden = true;
  output.style.cssText = 'width:100%;height:72px;margin-top:4px;box-sizing:border-box;font:10px/1.3 monospace';
  body.appendChild(output);

  let groups: GroupState[] = [];

  const updateRow = (state: GroupState, key: string, value: number) => {
    const row = state.rows.get(key);
    if (!row) return;
    row.value.textContent = tuneNumber(value);
    row.range.value = String(value);
    row.number.value = tuneNumber(value);
  };

  const apply = (state: GroupState, key: string, raw: string, fromRange: boolean) => {
    const spec = state.spec.ranges[key];
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const value = Math.min(spec.max, Math.max(spec.min, parsed));
    writeTune(state.spec.table, key, value);
    const row = state.rows.get(key);
    if (row) {
      row.value.textContent = tuneNumber(value);
      if (fromRange) row.number.value = tuneNumber(value);
      else row.range.value = String(value);
    }
    options.onChange?.(state.spec.name, key, value);
  };

  const buildGroup = (state: GroupState): HTMLElement => {
    const box = document.createElement('div');
    box.dataset.tuneGroup = state.spec.name;
    const heading = document.createElement('div');
    heading.textContent = state.spec.name;
    heading.style.cssText = 'margin-top:4px;color:#9fb3c0';
    box.appendChild(heading);

    for (const key of Object.keys(state.spec.ranges)) {
      const spec = state.spec.ranges[key];
      const row = document.createElement('label');
      row.dataset.tuneKey = key;
      row.style.cssText = 'display:block;border-top:1px solid rgba(213,228,238,0.12);padding:2px 0';

      const label = document.createElement('span');
      label.textContent = `${state.spec.labels?.[key] ?? key} `;
      const value = document.createElement('b');

      const line = document.createElement('div');
      line.style.cssText = 'display:flex;gap:4px;align-items:center';
      const range = document.createElement('input');
      range.type = 'range';
      range.min = String(spec.min);
      range.max = String(spec.max);
      range.step = String(spec.step);
      range.style.cssText = 'flex:1;min-width:0;margin:0';
      const number = document.createElement('input');
      number.type = 'number';
      number.min = String(spec.min);
      number.max = String(spec.max);
      number.step = String(spec.step);
      number.style.cssText =
        'width:60px;font:inherit;color:inherit;background:rgba(10,17,25,0.7);border:1px solid rgba(213,228,238,0.35)';

      range.addEventListener('input', () => apply(state, key, range.value, true));
      number.addEventListener('input', () => apply(state, key, number.value, false));

      line.append(range, number);
      row.append(label, value, line);
      box.appendChild(row);
      state.rows.set(key, { range, number, value });
    }
    return box;
  };

  const setGroups = (next: readonly TuneGroup[]) => {
    groups = next.map(spec => {
      const baseline: Record<string, number> = {};
      for (const key of Object.keys(spec.ranges)) {
        baseline[key] = spec.baseline?.[key] ?? readTune(spec.table, key) ?? 0;
      }
      return { spec, baseline, rows: new Map<string, Row>() };
    });
    groupsBox.replaceChildren(...groups.map(buildGroup));
    for (const state of groups) {
      for (const key of Object.keys(state.spec.ranges)) {
        updateRow(state, key, readTune(state.spec.table, key) ?? 0);
      }
    }
  };

  const sync = () => {
    for (const state of groups) {
      for (const key of Object.keys(state.spec.ranges)) {
        updateRow(state, key, readTune(state.spec.table, key) ?? 0);
      }
    }
  };

  const changedText = () =>
    groups
      .map(state =>
        changedValuesText(state.spec.name, state.spec.table, state.baseline, Object.keys(state.spec.ranges)),
      )
      .filter(text => text !== '')
      .join('\n');

  resetButton.addEventListener('click', () => {
    for (const state of groups) {
      for (const key of Object.keys(state.spec.ranges)) {
        const before = readTune(state.spec.table, key);
        const target = state.baseline[key];
        if (before === target) continue;
        writeTune(state.spec.table, key, target);
        const row = state.rows.get(key);
        if (row) {
          row.value.textContent = tuneNumber(target);
          row.range.value = String(target);
          row.number.value = tuneNumber(target);
        }
        options.onChange?.(state.spec.name, key, target);
      }
    }
  });

  copyButton.addEventListener('click', () => {
    const text = changedText();
    // The clipboard needs a secure page and the user's permission. When either is missing, the text goes into the box
    // below, selected, so it can be copied by hand.
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        output.hidden = true;
      } catch {
        output.value = text;
        output.hidden = false;
        output.select();
      }
    })();
  });

  setGroups(options.groups);

  return { element: panel, setGroups, sync };
}
