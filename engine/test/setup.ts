// Vitest setup for the engine tests: the page elements the engine looks up when its modules load (engine/README.md)
document.body.innerHTML = `
<canvas id="gl" width="64" height="64"></canvas>
<div id="touch" hidden><div id="joyBase"><div id="joyKnob"></div></div>
  <button id="btnFire" data-lb="fire"></button><button id="btnFire2" data-lb="fire2"></button></div>
<div id="layoutBar" hidden><b id="lbName"></b><button data-lbact="minus"></button><button data-lbact="plus"></button><button data-lbact="reset"></button><button data-lbact="done"></button></div>
<div id="toast"></div><div id="banner"><b id="bannerCode"></b><span id="bannerSub"></span></div>
<p data-i18n="hello"></p>`;
