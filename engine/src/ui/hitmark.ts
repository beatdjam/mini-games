// engine: The hit marker: a mark over the crosshair that shows for a moment when a shot lands. The game owns the
// element and its look (CSS: the element is shown while it has the class `on`, and has `crit` on a critical hit);
// show() puts it up, update(dt) takes it down again once `time` seconds have passed
export function createHitMark(mark: HTMLElement, time: number) {
  let left = 0; // seconds it stays up
  return {
    show(crit?: boolean) {
      mark.classList.add('on');
      mark.classList.toggle('crit', !!crit);
      left = time;
    },
    update(dt: number) {
      left -= dt;
      if (left <= 0) mark.classList.remove('on');
    },
  };
}
