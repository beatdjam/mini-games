// Undo and redo: the snapshot stacks, the limit, and the single undo kept while `.` replays a change.
import type { Pos } from '../../data/types.ts';
import type { EditorHost } from './context.ts';

const UNDO_LIMIT = 200;

export function undo(host: EditorHost): void {
  const snap = host.undoStack.pop();
  if (!snap) return;
  host.redoStack.push({ lines: [...host.lines], cursor: { ...host.cursor } });
  host.lines = [...snap.lines];
  host.cursor = host.normalizeNormal(snap.cursor);
  host.mode = 'normal';
  host.anchor = null;
  host.pending = null;
}

export function redo(host: EditorHost): void {
  const snap = host.redoStack.pop();
  if (!snap) return;
  host.undoStack.push({ lines: [...host.lines], cursor: { ...host.cursor } });
  host.lines = [...snap.lines];
  host.cursor = host.normalizeNormal(snap.cursor);
  host.mode = 'normal';
  host.anchor = null;
  host.pending = null;
}

export function pushUndo(host: EditorHost, cursor: Pos = host.cursor): void {
  if (host.replaying && host.undoPushedForReplay) return;
  host.undoStack.push({ lines: [...host.lines], cursor: { ...cursor } });
  if (host.undoStack.length > UNDO_LIMIT) host.undoStack.shift();
  host.redoStack = [];
  if (host.replaying) host.undoPushedForReplay = true;
}
