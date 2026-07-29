/* =========================================================
   Shilo Pro — Article page (main-article)
   Copy-link share button.
   ========================================================= */
(function () {
  'use strict';

  function fallbackCopy(text, done) {
    var input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'absolute';
    input.style.insetInlineStart = '-9999px';
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand('copy');
      if (done) done();
    } catch (e) {
      /* noop */
    }
    document.body.removeChild(input);
  }

  function init() {
    document.querySelectorAll('[data-copy-link]').forEach(function (btn) {
      if (btn.dataset.copyBound === 'true') return;
      btn.dataset.copyBound = 'true';

      btn.addEventListener('click', function () {
        var url = btn.getAttribute('data-copy-link') || window.location.href;
        var message = btn.getAttribute('data-copy-success') || '';

        var done = function () {
          if (typeof window.ShiloToast === 'function' && message) {
            window.ShiloToast(message, 'success');
          }
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard
            .writeText(url)
            .then(done)
            .catch(function () {
              fallbackCopy(url, done);
            });
        } else {
          fallbackCopy(url, done);
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Re-bind after theme editor re-renders the section */
  document.addEventListener('shopify:section:load', init);
})();
