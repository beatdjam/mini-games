// The pending-key table: once a key starts something (an operator, `g`, `f`, `m`, `r`, ...), the next key is
// looked up by the kind of pending state and finishes or extends it.
import { findCharOnLine, firstNonBlank, isDigit, textObject as resolveTextObject } from './text.ts';
import { MAX_COUNT } from './context.ts';
import type { EditorHost } from './context.ts';
import type { MotionKind, Pending } from './types.ts';

type PendingHandler = (host: EditorHost, pending: Pending, key: string) => boolean;

const HANDLERS: Record<Pending['kind'], PendingHandler> = {
  op: handleOp,
  opFind: handleOpFind,
  opG: handleOpG,
  opMark: handleOpMark,
  opText: handleOpText,
  visualText: handleVisualText,
  visualReplace: handleVisualReplace,
  register: handleRegister,
  g: handleG,
  mark: handleMark,
  jumpMark: handleJumpMark,
  find: handleFind,
  replace: handleReplace,
};

export function pendingKey(host: EditorHost, key: string): boolean {
  const pending = host.pending;
  if (!pending) return false;
  if (key === 'Escape') {
    host.pending = null;
    host.count = 0;
    return true;
  }
  return HANDLERS[pending.kind](host, pending, key);
}

function handleOp(host: EditorHost, pending: Pending, key: string): boolean {
  if (pending.kind !== 'op') return false;
  if (isDigit(key) && !(key === '0' && pending.count2 === 0)) {
    pending.count2 = Math.min(MAX_COUNT, pending.count2 * 10 + Number(key));
    return true;
  }
  const total = (pending.count || 1) * (pending.count2 || 1);
  const explicit = pending.count > 0 || pending.count2 > 0;
  if (key === pending.op) {
    host.applyLineOp(pending.op, total);
    host.pending = null;
    return true;
  }
  if (key === 'f' || key === 'F' || key === 't' || key === 'T') {
    host.pending = {
      kind: 'opFind',
      op: pending.op,
      count: total,
      dir: key === 'f' || key === 't' ? 1 : -1,
      till: key === 't' || key === 'T',
    };
    return true;
  }
  if (key === '/' || key === '?') {
    host.operatorSearch = { op: pending.op, count: total };
    host.pending = null;
    host.searchReturn = 'normal';
    host.mode = 'search';
    host.searchText = '';
    host.searchDirection = key === '/' ? 1 : -1;
    return true;
  }
  if (key === 'n' || key === 'N') {
    host.pending = null;
    if (!host.lastSearch) return true;
    const to = host.repeatSearchTarget(key, total);
    if (to) host.applyOperator(pending.op, { to, inclusive: false, linewise: false });
    return true;
  }
  if (key === '*' || key === '#') {
    host.pending = null;
    const to = host.searchWordTarget(key === '*' ? 1 : -1, total);
    if (to) host.applyOperator(pending.op, { to, inclusive: false, linewise: false });
    return true;
  }
  if (key === "'" || key === '`') {
    host.pending = { kind: 'opMark', op: pending.op, linewise: key === "'" };
    return true;
  }
  if (key === 'i' || key === 'a') {
    host.pending = { kind: 'opText', op: pending.op, around: key === 'a' };
    return true;
  }
  if (key === 'g') {
    host.pending = { kind: 'opG', op: pending.op, count: total };
    return true;
  }
  const motion = host.operatorMotion(pending.op, key, total, explicit);
  if (!motion) {
    // a motion that fails (dk on the first line, a missing df) does nothing
    if (host.hasMotionKind(key)) {
      host.pending = null;
      return true;
    }
    return false;
  }
  host.applyOperator(pending.op, motion);
  host.pending = null;
  return true;
}

function handleOpFind(host: EditorHost, pending: Pending, key: string): boolean {
  if (pending.kind !== 'opFind') return false;
  if (key.length !== 1) {
    host.pending = null;
    return false;
  }
  const to = findCharOnLine(host.lines, host.cursor, key, pending.dir, pending.till, pending.count);
  host.pending = null;
  // Vim remembers the character even when the search fails, for ; and ,
  host.lastFind = { char: key, dir: pending.dir, till: pending.till };
  if (!to) return true;
  const kind: MotionKind = pending.dir === 1 ? 'inclusive' : 'exclusive';
  host.applyOperator(pending.op, { to, inclusive: kind === 'inclusive', linewise: false });
  return true;
}

function handleOpG(host: EditorHost, pending: Pending, key: string): boolean {
  if (pending.kind !== 'opG') return false;
  host.pending = null;
  const motion = host.resolveGMotion(key, pending.count);
  if (!motion) return true;
  const moveKey = key === 'g' ? 'gg' : `g${key}`;
  const kind = host.operatorMotionKind(moveKey, motion);
  host.applyOperator(pending.op, { ...motion, inclusive: kind === 'inclusive', linewise: kind === 'linewise' });
  return true;
}

function handleOpMark(host: EditorHost, pending: Pending, key: string): boolean {
  if (pending.kind !== 'opMark') return false;
  host.pending = null;
  if (!/^[a-z]$/.test(key) || !host.marks[key]) return true;
  const target = host.marks[key];
  const to = pending.linewise ? { line: target.line, col: firstNonBlank(host.lines, target.line) } : { ...target };
  host.applyOperator(pending.op, { to, inclusive: false, linewise: pending.linewise });
  return true;
}

function handleOpText(host: EditorHost, pending: Pending, key: string): boolean {
  if (pending.kind !== 'opText') return false;
  host.pending = null;
  const range = resolveTextObject(host.lines, host.cursor, key, pending.around);
  if (!range) return true;
  host.applyOperator(pending.op, { ...range, linewise: false });
  return true;
}

function handleG(host: EditorHost, pending: Pending, key: string): boolean {
  if (pending.kind !== 'g') return false;
  host.pending = null;
  const count = pending.count > 0 ? pending.count : 1;
  const motion = host.resolveGMotion(key, count);
  if (motion) host.moveToMotion(motion, key === 'g');
  return true;
}

function handleRegister(host: EditorHost, pending: Pending, key: string): boolean {
  if (pending.kind !== 'register') return false;
  host.pending = null;
  if (!/^[a-zA-Z"]$/.test(key)) return true;
  host.registers.select(key);
  return true;
}

function handleMark(host: EditorHost, pending: Pending, key: string): boolean {
  if (pending.kind !== 'mark') return false;
  host.pending = null;
  if (!/^[a-z]$/.test(key)) return true;
  host.marks[key] = { ...host.cursor };
  return true;
}

function handleJumpMark(host: EditorHost, pending: Pending, key: string): boolean {
  if (pending.kind !== 'jumpMark') return false;
  host.pending = null;
  if (key === '`') {
    if (!host.lastJump) return true;
    const target = { ...host.lastJump };
    host.lastJump = { ...host.cursor };
    host.moveTo(target);
    return true;
  }
  if (key === "'") {
    if (!host.lastJump) return true;
    const target = { line: host.lastJump.line, col: firstNonBlank(host.lines, host.lastJump.line) };
    host.lastJump = { ...host.cursor };
    host.moveTo(target);
    return true;
  }
  if (!/^[a-z]$/.test(key) || !host.marks[key]) return true;
  const target = host.marks[key];
  const to = pending.linewise ? { line: target.line, col: firstNonBlank(host.lines, target.line) } : { ...target };
  host.lastJump = { ...host.cursor };
  host.moveTo(to);
  return true;
}

function handleFind(host: EditorHost, pending: Pending, key: string): boolean {
  if (pending.kind !== 'find') return false;
  host.pending = null;
  if (key.length !== 1) return false;
  const to = findCharOnLine(host.lines, host.cursor, key, pending.dir, pending.till, pending.count);
  // Vim remembers the character even when the search fails, for ; and ,
  host.lastFind = { char: key, dir: pending.dir, till: pending.till };
  if (to) host.moveTo(to);
  return true;
}

// Never reached: visualKey (visual.ts) finishes `vi`/`va` before the table, because Escape there also leaves
// visual mode. The entry stays so the table covers every pending kind.
function handleVisualText(host: EditorHost, pending: Pending, _key: string): boolean {
  if (pending.kind !== 'visualText') return false;
  host.pending = null;
  return true;
}

function handleVisualReplace(host: EditorHost, pending: Pending, key: string): boolean {
  if (pending.kind !== 'visualReplace') return false;
  host.pending = null;
  if (key.length !== 1) return false;
  host.replaceVisual(key);
  return true;
}

function handleReplace(host: EditorHost, pending: Pending, key: string): boolean {
  if (pending.kind !== 'replace') return false;
  host.pending = null;
  if (key.length !== 1) return false;
  host.replaceChars(key, pending.count);
  return true;
}
