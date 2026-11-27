// Where a HUD part that follows a point goes on the screen (SB-2150). Pure: no DOM and no three, so a test can work the
// places out without a page.

export interface ScreenPoint {
  x: number; // px
  y: number; // px
}

// The screen's px for a normalized device point (-1..1, + up), on a screen `width` x `height`.
export function ndcToScreen(ndc: ScreenPoint, width: number, height: number): ScreenPoint {
  return { x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height };
}

// The top left that keeps a `width` x `height` box inside the screen, with `margin` px from each edge. A box larger than
// the screen cannot fit; it is pinned `margin` from the top left, so its top and left stay in view.
export function keepInside(
  point: ScreenPoint,
  width: number,
  height: number,
  screen: { width: number; height: number },
  margin: number,
): ScreenPoint {
  const maxLeft = screen.width - width - margin;
  const maxTop = screen.height - height - margin;
  return {
    x: Math.min(Math.max(margin, maxLeft), Math.max(margin, point.x)),
    y: Math.min(Math.max(margin, maxTop), Math.max(margin, point.y)),
  };
}
