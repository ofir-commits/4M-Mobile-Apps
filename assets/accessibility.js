/* =========================================================
   Shilo Pro — Accessibility widget
   State machine for the toggles rendered by
   snippets/accessibility-widget.liquid. Preferences persist in
   localStorage and re-apply on every page load.
   ========================================================= */
(function () {
  'use strict';

  if (window.ShiloA11yInit) return;
  window.ShiloA11yInit = true;

  var STORAGE_KEY = 'shilo.a11y.v1';
  var FONT_STEPS = [100, 110, 125];

  /* action name -> html class. fontsize is handled separately. */
  var CLASS_MAP = {
    contrast: 'a11y-contrast',
    grayscale: 'a11y-grayscale',
    invert: 'a11y-invert',
    links: 'a11y-links',
    font: 'a11y-font',
    motion: 'a11y-motion',
    cursor: 'a11y-cursor'
  };

  function loadState() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function saveState(state) {
    try {
      var any = Object.keys(state).some(function (k) {
        return k === 'fontsize' ? state[k] !== 100 : !!state[k];
      });
      if (any) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* private mode — the session still works, it just won't persist */
    }
  }

  function applyState(state) {
    var root = document.documentElement;
    Object.keys(CLASS_MAP).forEach(function (action) {
      root.classList.toggle(CLASS_MAP[action], !!state[action]);
    });
    root.classList.toggle('a11y-fs-110', state.fontsize === 110);
    root.classList.toggle('a11y-fs-125', state.fontsize === 125);

    if (state.motion) {
      document.querySelectorAll('video[autoplay]').forEach(function (video) {
        try { video.pause(); } catch (e) { /* detached */ }
      });
    }
  }

  var state = loadState();
  if (typeof state.fontsize !== 'number' || FONT_STEPS.indexOf(state.fontsize) === -1) {
    state.fontsize = 100;
  }
  applyState(state);

  function init() {
    var widget = document.querySelector('[data-a11y-widget]');
    if (!widget) return;

    var toggle = widget.querySelector('[data-a11y-toggle]');
    var panel = widget.querySelector('#A11yPanel');
    if (!toggle || !panel) return;

    function syncUi() {
      widget.querySelectorAll('[data-a11y-action]').forEach(function (btn) {
        var action = btn.getAttribute('data-a11y-action');
        if (action === 'fontsize') {
          btn.setAttribute('aria-pressed', state.fontsize !== 100 ? 'true' : 'false');
        } else {
          btn.setAttribute('aria-pressed', state[action] ? 'true' : 'false');
        }
      });
      var value = widget.querySelector('[data-a11y-fontsize-value]');
      if (value) value.textContent = state.fontsize + '%';
    }

    function openPanel() {
      panel.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      var first = panel.querySelector('button, a[href]');
      if (first) first.focus({ preventScroll: true });
      document.addEventListener('keydown', onKeydown);
      document.addEventListener('click', onOutsideClick, true);
    }

    function closePanel(returnFocus) {
      if (panel.hidden) return;
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', onKeydown);
      document.removeEventListener('click', onOutsideClick, true);
      if (returnFocus !== false) toggle.focus({ preventScroll: true });
    }

    function onKeydown(event) {
      if (event.key === 'Escape') closePanel();
    }

    function onOutsideClick(event) {
      if (!widget.contains(event.target)) closePanel(false);
    }

    toggle.addEventListener('click', function () {
      if (panel.hidden) openPanel();
      else closePanel();
    });

    var closeBtn = widget.querySelector('[data-a11y-close]');
    if (closeBtn) closeBtn.addEventListener('click', function () { closePanel(); });

    widget.querySelectorAll('[data-a11y-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-a11y-action');
        if (action === 'fontsize') {
          var next = FONT_STEPS[(FONT_STEPS.indexOf(state.fontsize) + 1) % FONT_STEPS.length];
          state.fontsize = next;
        } else {
          state[action] = !state[action];
        }
        applyState(state);
        saveState(state);
        syncUi();
      });
    });

    var reset = widget.querySelector('[data-a11y-reset]');
    if (reset) {
      reset.addEventListener('click', function () {
        state = { fontsize: 100 };
        applyState(state);
        saveState(state);
        syncUi();
      });
    }

    syncUi();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
