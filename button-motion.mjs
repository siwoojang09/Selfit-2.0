// Touch browsers can wait until the tap ends to apply :active.
let pressed;

function release() {
  pressed?.removeAttribute('data-pressing');
  pressed = undefined;
}

document.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.pointerType === 'mouse') return;
  release();
  pressed = event.target.closest('button:enabled, a[href]');
  if (!pressed?.closest('[aria-disabled="true"]')) pressed?.setAttribute('data-pressing', '');
}, {capture: true, passive: true});

for (const type of ['pointerup', 'pointercancel']) {
  document.addEventListener(type, event => {
    if (event.isPrimary && event.pointerType !== 'mouse') release();
  }, {capture: true, passive: true});
}
window.addEventListener('pagehide', release);
