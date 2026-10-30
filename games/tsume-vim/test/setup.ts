import page from '../index.html?raw';

const doc = new DOMParser().parseFromString(page, 'text/html');
doc.head.querySelectorAll('style').forEach(style => document.head.appendChild(style.cloneNode(true)));
document.body.innerHTML = doc.body.innerHTML;
