// The screen: course list, the two buffers, the status line, hints and the solved panel. Every key goes to one Editor.
import { LEVELS } from '../core/content/catalog.ts';
import { track } from '@engine/core/analytics.ts';
import { Editor } from '../core/vim/editor.ts';
import { generateLevel } from '../core/content/generate/index.ts';
import { loadEndlessBest, loadProgress, recordSolve, saveEndlessBest, type Progress } from '../core/progress.ts';
import { samePos } from '../core/vim/text.ts';
import type { Level, LevelText } from '../data/types.ts';
import { applyStaticText, t } from '@engine/core/i18n.ts';
import { chapterText, endlessText, helpRows, levelText } from '../i18n/text.ts';
import { charSpan, ensureCursorVisible, insertCursor, newLineRow } from './dom.ts';
import { getElements, type Elements } from './elements.ts';
import { keyLabel, keyOf, SPECIAL_KEYS } from './keyboard.ts';

interface State {
  mode: 'course' | 'endless';
  index: number;
  editor: Editor;
  solved: boolean;
  showSolution: boolean;
  levelsOpen: boolean;
  progress: Progress;
  endless: Level;
  endlessSeed: number;
  // the endless seed whose clear is already counted, so a retry does not count it again
  clearedSeed: number | null;
  cleared: number;
  endlessBest: number;
  pressed: number;
  notice: string;
}

const MODE_KEYS: Record<string, string> = {
  normal: 'mode.normal',
  insert: 'mode.insert',
  search: 'mode.search',
  command: 'mode.command',
  visual: 'mode.visual',
  'visual-line': 'mode.visualLine',
};

let elements: Elements;
let state: State;

const current = (): Level => (state.mode === 'endless' ? state.endless : LEVELS[state.index]);
const words = (level: Level): LevelText => (level.kind ? endlessText(level.kind) : levelText(level.id));
const randomSeed = (): number => Math.floor(Math.random() * 1_000_000_000);

function endlessSeedFromHash(): number | null {
  const match = /^#endless(?:-(\d{1,9}))?$/.exec(location.hash);
  if (!match) return null;
  return match[1] ? Number(match[1]) : randomSeed();
}

const sameLines = (lines: string[], target: string[]): boolean =>
  lines.length === target.length && lines.every((line, index) => line === target[index]);

// px kept above or below the active level when the list scrolls to it
const LEVEL_SCROLL_MARGIN = 40;

const allDone = (): boolean => LEVELS.every(level => state.progress.done[level.id] !== undefined);

function startIndex(): number {
  const id = location.hash.replace(/^#/, '');
  const found = LEVELS.findIndex(level => level.id === id);
  return found < 0 ? 0 : found;
}

export function startTerminal(): void {
  elements = getElements();
  state = {
    mode: 'course',
    index: startIndex(),
    editor: new Editor(LEVELS[0].lines, LEVELS[0].cursor),
    solved: false,
    showSolution: false,
    levelsOpen: false,
    progress: loadProgress(),
    endless: LEVELS[0],
    endlessSeed: 0,
    clearedSeed: null,
    cleared: 0,
    endlessBest: loadEndlessBest(),
    pressed: 0,
    notice: '',
  };
  applyStaticText();
  renderHelp();
  bind();
  const seed = endlessSeedFromHash();
  if (seed === null) loadLevel(state.index);
  else loadEndless(seed);
}

function bind(): void {
  elements.endlessToggle.addEventListener('click', () => {
    if (state.mode === 'course') loadEndless(randomSeed());
    else loadLevel(state.index);
    elements.endlessToggle.blur();
  });
  elements.levelsToggle.addEventListener('click', () => {
    state.levelsOpen = !state.levelsOpen;
    elements.app.classList.toggle('levels-open', state.levelsOpen);
    elements.levelsToggle.setAttribute('aria-expanded', String(state.levelsOpen));
    elements.levelsToggle.blur();
  });
  elements.help.addEventListener('click', () => {
    if (!elements.helpDlg.open) elements.helpDlg.showModal();
    elements.help.blur();
  });
  elements.helpClose.addEventListener('click', () => elements.helpDlg.close());
  elements.helpDlg.addEventListener('click', event => {
    if (event.target === elements.helpDlg) elements.helpDlg.close();
  });
  elements.solution.addEventListener('click', () => {
    state.showSolution = !state.showSolution;
    if (state.showSolution) track('solution_show', { level: current().id });
    renderHint();
    elements.solution.blur();
  });
  elements.next.addEventListener('click', () => {
    nextLevel();
    elements.next.blur();
  });
  elements.retry.addEventListener('click', () => {
    if (state.mode === 'endless') loadEndless(state.endlessSeed);
    else loadLevel(state.index);
    elements.retry.blur();
  });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('hashchange', () => {
    const seed = endlessSeedFromHash();
    if (seed !== null) {
      loadEndless(seed);
      return;
    }
    const id = location.hash.replace(/^#/, '');
    const index = LEVELS.findIndex(level => level.id === id);
    if (index >= 0 && index !== state.index) loadLevel(index);
  });
}

function onKeyDown(event: KeyboardEvent): void {
  // keyCode 229 is what many IMEs report while composing; the field is deprecated but still needed here.
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.key === 'Process') return;
  if (elements.helpDlg.open) return;
  if (event.metaKey || event.altKey) return;
  if (event.key === 'Tab') return;
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
  const control = target?.closest('button, a');
  if (control && (event.key === 'Enter' || event.key === ' ')) return;

  if (state.solved) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.repeat) return;
      nextLevel();
    }
    return;
  }

  const key = keyOf(event, state.editor.mode);
  if (!key) return;
  if (key.length > 1 && !SPECIAL_KEYS.has(key)) return;
  state.pressed++;
  if (key === 'C-r') event.preventDefault();
  if (!state.editor.feed(key)) {
    state.notice = t('status.unknown', { key: keyLabel(key) });
    event.preventDefault();
    render();
    return;
  }
  state.notice = '';
  event.preventDefault();
  if (checkSolved() && state.mode === 'course') renderLevels();
  render();
}

function setPuzzle(level: Level, endless: boolean): void {
  state.editor = new Editor(level.lines, level.cursor, level.marks);
  state.solved = false;
  state.showSolution = false;
  state.levelsOpen = false;
  state.pressed = 0;
  state.notice = '';
  elements.app.classList.toggle('endless', endless);
  elements.app.classList.remove('levels-open');
  elements.levelsToggle.setAttribute('aria-expanded', 'false');
  elements.buffer.scrollTop = 0;
}

function setHash(hash: string): void {
  try {
    history.replaceState(null, '', hash);
  } catch {
    // history is optional (some embedded frames block it)
  }
}

function loadLevel(index: number): void {
  state.mode = 'course';
  state.index = index;
  const level = current();
  setPuzzle(level, false);
  setHash(`#${level.id}`);
  renderLevels();
  render();
}

function loadEndless(seed: number): void {
  state.mode = 'endless';
  state.endlessSeed = seed;
  state.endless = generateLevel(seed, `endless-${seed}`, 0);
  setPuzzle(state.endless, true);
  setHash(`#endless-${seed}`);
  render();
}

function nextLevel(): void {
  if (state.mode === 'endless') {
    loadEndless(state.endlessSeed + 1);
    return;
  }
  const next = state.index + 1;
  loadLevel(next < LEVELS.length ? next : 0);
}

function checkSolved(): boolean {
  if (state.solved) return false;
  if (state.editor.mode !== 'normal') return false;
  const level = current();
  if (!sameLines(state.editor.lines, level.target)) return false;
  if (level.targetCursor && !samePos(state.editor.cursor, level.targetCursor)) return false;
  state.solved = true;
  if (state.mode === 'endless') {
    if (state.endlessSeed !== state.clearedSeed) {
      state.clearedSeed = state.endlessSeed;
      state.cleared++;
      state.endlessBest = saveEndlessBest(state.cleared);
      track('endless_clear', { cleared: state.cleared });
    }
  } else {
    recordSolve(state.progress, level.id, state.pressed);
    track('level_clear', { level: level.id, keys: state.pressed });
  }
  return true;
}

function render(): void {
  const level = current();
  const endless = state.mode === 'endless';
  elements.app.classList.toggle('endless', endless);
  elements.endlessToggle.textContent = t(endless ? 'nav.course' : 'nav.endless');
  elements.endlessToggle.classList.toggle('active', endless);
  if (endless) {
    elements.chapter.textContent = t('endless.label');
  } else {
    elements.chapter.textContent = `${t('levels.chapter', { n: level.chapter })} · ${chapterText(level.chapter).title}`;
  }
  elements.title.textContent = words(level).title;
  elements.brief.textContent = words(level).brief;
  renderGoal();
  renderBuffer();
  renderStatus();
  renderHint();
  renderDone();
  renderProgress();
  ensureCursorVisible(elements.buffer);
}

function renderLevels(): void {
  elements.levelList.replaceChildren();
  const chapters = [...new Set(LEVELS.map(level => level.chapter))].sort((a, b) => a - b);
  for (const chapter of chapters) {
    const box = document.createElement('div');
    box.className = 'chapterbox';
    const head = document.createElement('div');
    head.className = 'chapterhead';
    const number = document.createElement('b');
    number.textContent = t('levels.chapter', { n: chapter });
    const name = document.createElement('span');
    name.textContent = chapterText(chapter).title;
    head.append(number, name);
    const intro = document.createElement('p');
    intro.className = 'chapterintro';
    intro.textContent = chapterText(chapter).intro;
    box.append(head, intro);
    LEVELS.forEach((level, index) => {
      if (level.chapter !== chapter) return;
      const best = state.progress.done[level.id];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lv' + (index === state.index ? ' active' : '') + (best !== undefined ? ' done' : '');
      button.setAttribute('aria-current', index === state.index ? 'true' : 'false');
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(index + 1).padStart(2, '0');
      const label = document.createElement('span');
      label.className = 'name';
      label.textContent = words(level).title;
      const mark = document.createElement('span');
      mark.className = 'mark';
      mark.textContent = best !== undefined ? '✓' : '·';
      mark.setAttribute('aria-label', best !== undefined ? t('levels.done') : t('levels.todo'));
      button.append(num, label, mark);
      button.addEventListener('click', () => loadLevel(index));
      box.append(button);
    });
    elements.levelList.append(box);
  }
  const active = elements.levelList.querySelector<HTMLElement>('.lv.active');
  if (active) {
    const top = active.offsetTop;
    const bottom = top + active.offsetHeight;
    if (top < elements.levels.scrollTop) elements.levels.scrollTop = Math.max(0, top - LEVEL_SCROLL_MARGIN);
    else if (bottom > elements.levels.scrollTop + elements.levels.clientHeight) {
      elements.levels.scrollTop = bottom - elements.levels.clientHeight + LEVEL_SCROLL_MARGIN;
    }
  }
}

function renderBuffer(): void {
  const editor = state.editor;
  const fragment = document.createDocumentFragment();
  editor.lines.forEach((line, lineIndex) => {
    const marks = Object.entries(editor.marks)
      .filter(([, pos]) => pos.line === lineIndex)
      .map(([name]) => name)
      .sort()
      .join('');
    const { row, body } = newLineRow(lineIndex, marks);
    if (lineIndex === editor.cursor.line) row.classList.add('curline');
    if (editor.mode === 'visual-line' && editor.isSelected(lineIndex, 0)) row.classList.add('vline');
    const insertHere = editor.mode === 'insert' && editor.cursor.line === lineIndex;
    for (let col = 0; col < line.length; col++) {
      if (insertHere && editor.cursor.col === col) body.append(insertCursor());
      const span = charSpan(line, col);
      if (editor.mode !== 'insert' && editor.cursor.line === lineIndex && editor.cursor.col === col)
        span.classList.add('cur');
      if (editor.isSelected(lineIndex, col)) span.classList.add('sel');
      body.append(span);
    }
    if (insertHere && editor.cursor.col >= line.length) body.append(insertCursor());
    if (editor.mode !== 'insert' && editor.cursor.line === lineIndex && line.length === 0) {
      const cursor = document.createElement('span');
      cursor.className = 'cur';
      cursor.textContent = '\u00a0';
      body.append(cursor);
    }
    fragment.append(row);
  });
  elements.buffer.replaceChildren(fragment);
}

function renderGoal(): void {
  const level = current();
  const target = level.targetCursor;
  elements.goalNote.textContent = target
    ? `${t('pane.goalCursor')} · ${target.line + 1}:${target.col + 1}`
    : t('pane.goalText');
  const fragment = document.createDocumentFragment();
  level.target.forEach((line, lineIndex) => {
    const { row, body } = newLineRow(lineIndex);
    for (let col = 0; col < line.length; col++) {
      const span = charSpan(line, col);
      if (target && target.line === lineIndex && target.col === col) span.classList.add('gcur');
      body.append(span);
    }
    if (target && target.line === lineIndex && line.length === 0) {
      const cursor = document.createElement('span');
      cursor.className = 'gcur';
      cursor.textContent = '\u00a0';
      body.append(cursor);
    }
    fragment.append(row);
  });
  elements.goal.replaceChildren(fragment);
}

function queryText(editor: Editor): string {
  if (editor.mode === 'search') return `${editor.searchDirection > 0 ? '/' : '?'}${editor.searchText}▌`;
  if (editor.mode === 'command') return `:${editor.commandText}▌`;
  return '';
}

function renderStatus(): void {
  const editor = state.editor;
  elements.mode.textContent = `-- ${t(MODE_KEYS[editor.mode] ?? 'mode.normal')} --`;
  elements.mode.className = `mode ${editor.mode}`;
  const query = queryText(editor) || editor.pendingText;
  elements.search.hidden = query === '';
  elements.search.textContent = query;
  elements.notice.hidden = state.notice === '';
  elements.notice.textContent = state.notice;
  elements.pos.textContent = t('status.pos', { line: editor.cursor.line + 1, col: editor.cursor.col + 1 });
  const esc = editor.mode !== 'normal' ? ` · ${t('status.esc')}` : '';
  const model = state.mode === 'endless' ? '' : ` · ${t('status.model', { n: current().solution.length })}`;
  elements.keys.textContent = `${t('status.keys', { n: state.pressed })}${model}${esc}`;
  if (state.mode === 'endless') {
    elements.best.textContent = state.endlessBest ? t('endless.best', { n: state.endlessBest }) : '';
  } else {
    const best = state.progress.done[current().id];
    elements.best.textContent = best === undefined ? '' : t('status.best', { n: best });
  }
}

function renderHint(): void {
  elements.hint.textContent = words(current()).hint;
  if (state.mode === 'endless') {
    elements.solution.hidden = true;
    elements.solutionKeys.hidden = false;
    elements.solutionKeys.textContent = t('endless.noSolution');
    return;
  }
  elements.solution.hidden = false;
  elements.solution.textContent = t(state.showSolution ? 'hint.hide' : 'hint.show');
  if (!state.showSolution) {
    elements.solutionKeys.hidden = true;
    elements.solutionKeys.replaceChildren();
    return;
  }
  elements.solutionKeys.hidden = false;
  elements.solutionKeys.replaceChildren(
    ...current().solution.map(key => {
      const kbd = document.createElement('kbd');
      kbd.textContent = key === 'Escape' ? 'Esc' : key === ' ' ? '␣' : key;
      return kbd;
    }),
  );
}

function nextLabel(level: Level): string {
  if (state.index === LEVELS.length - 1) return t('done.restart');
  return LEVELS[state.index + 1].chapter !== level.chapter ? t('done.nextChapter') : t('done.next');
}

function renderDone(): void {
  if (!state.solved) {
    elements.done.hidden = true;
    return;
  }
  elements.done.hidden = false;
  const level = current();
  if (state.mode === 'endless') {
    elements.doneTitle.textContent = t('done.title');
    elements.doneText.textContent = `${words(level).explanation} ${t('endless.done')}`;
    elements.doneStats.textContent = `${t('status.keys', { n: state.pressed })} · ${t('endless.cleared', {
      n: state.cleared,
    })}`;
    elements.next.textContent = t('done.next');
  } else {
    elements.doneTitle.textContent = allDone() ? t('done.all') : t('done.title');
    elements.doneText.textContent = words(level).explanation;
    const best = state.progress.done[level.id];
    const stats = t('done.stats', { keys: state.pressed, model: level.solution.length });
    elements.doneStats.textContent = best === undefined ? stats : `${stats} · ${t('done.best', { best })}`;
    elements.next.textContent = nextLabel(level);
  }
  elements.retry.textContent = t('done.retry');
}

function renderProgress(): void {
  if (state.mode === 'endless') {
    const best = state.endlessBest ? ` · ${t('endless.best', { n: state.endlessBest })}` : '';
    elements.progress.textContent = `${t('endless.cleared', { n: state.cleared })}${best}`;
    return;
  }
  const done = LEVELS.filter(level => state.progress.done[level.id] !== undefined).length;
  elements.progress.textContent = t('levels.count', { done, all: LEVELS.length });
}

function renderHelp(): void {
  const fragment = document.createDocumentFragment();
  for (const row of helpRows()) {
    const term = document.createElement('dt');
    term.textContent = row.keys;
    const description = document.createElement('dd');
    description.textContent = row.text;
    fragment.append(term, description);
  }
  elements.helpList.replaceChildren(fragment);
}
