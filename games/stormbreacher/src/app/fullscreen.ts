// The fullscreen button (#sbFs): on every screen, so a phone can go fullscreen from the title or in a sortie. It is
// hidden where the browser cannot go fullscreen and where the page already runs as a home-screen app. The engine does
// the switch (toggleFs); the canvas follows the window's resize on its own.
import { el, t } from '@engine/core/index.ts';
import { fsSupported, isFullscreen, isStandalone, toggleFs } from '@engine/ui/index.ts';

// The button's words for the state it is in now.
function label(): void {
  el('#sbFs').textContent = t(isFullscreen() ? 'app.fsOff' : 'app.fs');
}

export function initFullscreen(): void {
  const button = el<HTMLButtonElement>('#sbFs');
  button.hidden = !fsSupported || isStandalone;
  label();
  button.addEventListener('click', () => {
    toggleFs();
    // the title starts a sortie on Enter, so the button gives the focus back after a click
    button.blur();
  });
  for (const name of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(name, label);
}
