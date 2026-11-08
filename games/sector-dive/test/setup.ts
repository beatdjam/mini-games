// Vitest setup for the Sector Dive tests: puts the game page's styles and elements into the document before the game
// modules load, then starts the engine's renderer, input and touch layout on them
import page from '../index.html?raw';
import { el } from '@engine/core/util.ts';
import { initRender } from '@engine/render/render.ts';
import { initInput } from '@engine/ui/input.ts';
import { initTouchLayout } from '@engine/ui/touchlayout.ts';

const doc = new DOMParser().parseFromString(page, 'text/html');
doc.head.querySelectorAll('style').forEach(s => document.head.appendChild(s.cloneNode(true)));
document.body.innerHTML = doc.body.innerHTML;
initRender(el<HTMLCanvasElement>('#gl'));
initInput({ touch: el('#touch'), fire: el('#btnFire'), fire2: el('#btnFire2') });
initTouchLayout();
