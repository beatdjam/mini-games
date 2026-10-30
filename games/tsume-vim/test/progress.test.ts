import { beforeEach, describe, expect, test } from 'vitest';
import { loadEndlessBest, loadProgress, recordSolve, saveEndlessBest } from '../src/core/progress.ts';

const PROGRESS_KEY = 'tsume-vim/progress';

beforeEach(() => localStorage.clear());

describe('progress', () => {
  test('loadProgress drops broken JSON, wrong shapes and unusable best counts', () => {
    localStorage.setItem(PROGRESS_KEY, '{broken');
    expect(loadProgress()).toEqual({ done: {} });

    localStorage.setItem(PROGRESS_KEY, '[]');
    expect(loadProgress()).toEqual({ done: {} });

    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ done: 'none' }));
    expect(loadProgress()).toEqual({ done: {} });

    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({ done: { zero: 0, negative: -2, text: '12', none: null, decimal: 4.5, ok: 7 } }),
    );
    expect(loadProgress()).toEqual({ done: { decimal: 4.5, ok: 7 } });
  });

  test('recordSolve keeps the best count', () => {
    const progress = loadProgress();
    expect(recordSolve(progress, 'e01', 12)).toBe(true);
    expect(progress.done.e01).toBe(12);

    expect(recordSolve(progress, 'e01', 12)).toBe(false);
    expect(recordSolve(progress, 'e01', 15)).toBe(false);
    expect(progress.done.e01).toBe(12);

    expect(recordSolve(progress, 'e01', 8)).toBe(true);
    expect(progress.done.e01).toBe(8);
    expect(loadProgress().done.e01).toBe(8);
  });

  test('saveEndlessBest keeps the best clear count', () => {
    expect(saveEndlessBest(5)).toBe(5);
    expect(loadEndlessBest()).toBe(5);

    expect(saveEndlessBest(3)).toBe(5);
    expect(loadEndlessBest()).toBe(5);

    expect(saveEndlessBest(9)).toBe(9);
    expect(loadEndlessBest()).toBe(9);
  });
});
