/* =========================================================
   Recently viewed products
   - Records the current product handle on product pages.
   - Hydrates <recently-viewed> elements with real product cards
     fetched from the collection/search JSON-free Section Rendering API.
   Storage: localStorage, newest first, capped, resilient to quota errors.
   ========================================================= */
(function () {
  'use strict';

  var KEY = 'shilo:recently-viewed';
  var MAX = 12;

  function read() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(function (h) { return typeof h === 'string' && h; }) : [];
    } catch (e) {
      return [];
    }
  }

  function write(list) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    } catch (e) {
      /* Private mode or quota exceeded — recently viewed is a nicety, never block. */
    }
  }

  function record(handle) {
    if (!handle) return;
    var list = read().filter(function (h) { return h !== handle; });
    list.unshift(handle);
    write(list);
  }

  /*
    <recently-viewed data-section-id="..." data-exclude="current-handle" data-limit="6">
      <div data-recently-viewed-target></div>
    </recently-viewed>

    Renders each product through the theme's `product-card` snippet by requesting
    the product page with ?section_id=<card section>. Falls back to staying hidden
    when nothing can be rendered, so the page never shows an empty shell.
  */
  var RecentlyViewed = function () {
    if (typeof HTMLElement !== 'function') return null;

    function El() {
      return Reflect.construct(HTMLElement, [], El);
    }
    El.prototype = Object.create(HTMLElement.prototype);
    El.prototype.constructor = El;
    Object.setPrototypeOf(El, HTMLElement);

    El.prototype.connectedCallback = function () {
      if (this.loaded) return;
      this.loaded = true;
      this.render();
    };

    El.prototype.render = function () {
      var target = this.querySelector('[data-recently-viewed-target]');
      if (!target) return;

      var exclude = this.dataset.exclude || '';
      var limit = parseInt(this.dataset.limit, 10) || 6;
      var sectionId = this.dataset.cardSectionId;
      var handles = read().filter(function (h) { return h !== exclude; }).slice(0, limit);

      if (!handles.length || !sectionId) {
        this.hidden = true;
        return;
      }

      var self = this;
      var requests = handles.map(function (handle) {
        return fetch('/products/' + encodeURIComponent(handle) + '?section_id=' + sectionId)
          .then(function (res) { return res.ok ? res.text() : ''; })
          .catch(function () { return ''; });
      });

      Promise.all(requests).then(function (chunks) {
        var html = chunks
          .map(function (chunk) {
            if (!chunk) return '';
            var doc = new DOMParser().parseFromString(chunk, 'text/html');
            var card = doc.querySelector('.product-card');
            return card ? card.outerHTML : '';
          })
          .filter(Boolean)
          .join('');

        if (!html) {
          self.hidden = true;
          return;
        }
        target.innerHTML = html;
        self.hidden = false;
      });
    };

    return El;
  };

  document.addEventListener('DOMContentLoaded', function () {
    var meta = document.querySelector('[data-product-handle]');
    if (meta) record(meta.getAttribute('data-product-handle'));
  });

  var Element = RecentlyViewed();
  if (Element && !window.customElements.get('recently-viewed')) {
    window.customElements.define('recently-viewed', Element);
  }
})();
