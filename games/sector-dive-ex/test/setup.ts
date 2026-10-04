// Vitest setup for the Sector Dive Extended tests: puts the game page's styles and elements into the document before the game modules load
import page from '../index.html?raw';

const doc = new DOMParser().parseFromString(page, 'text/html');
doc.head.querySelectorAll('style').forEach(s => document.head.appendChild(s.cloneNode(true)));
document.body.innerHTML = doc.body.innerHTML;
