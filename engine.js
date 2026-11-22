(() => {
  const base = new URL('.', document.currentScript.src);
  const initial = {
    model: 'female', outfit: 'classic', render3D: true, gravity: 9.81, wind: 2, direction: 35, turbulence: 0.2, speed: 1,
    walking: true, playing: false, fabric: 'linen', color: '#e9dfce',
    topColor: '#b4532e', view: 'front', wireframe: false, grid: true, zoom: 1, time: 0
  };
  let options = { ...initial };
  let engine, pending;
  window.DrapeEngine = {
    init(container) {
      if (pending) return pending;
      pending = import(new URL('scene.mjs?v=2026-11-22k4', base)).then(({ createScene }) => {
        engine = createScene(container, options);
        window.dispatchEvent(new CustomEvent('drape:ready', {detail: engine.stats()}));
        return true;
      }).catch(error => {
        pending = null;
        window.dispatchEvent(new CustomEvent('drape:error', {detail: error.message}));
        console.error('3D fitting scene:', error);
        return false;
      });
      return pending;
    },
    set(changes) {
      Object.assign(options, changes);
      engine?.update(changes);
    },
    reset() {
      Object.assign(options, initial);
      engine?.reset();
      engine?.update(options);
    },
    getMotion() {
      return engine?.motion() || null;
    },
    getStats() {
      return engine?.stats() || {};
    }
  };
})();
