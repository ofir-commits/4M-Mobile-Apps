/* =========================================================
   Shilo Pro — Header group JS
   Announcement rotation, typeahead search, mega menu,
   sticky header height publishing, menu drawer adoption.
   Loaded (deferred) by both announcement-bar and header sections,
   so the whole module is guarded against double execution.
   ========================================================= */
(function () {
  'use strict';

  if (window.__shiloHeaderInit) return;
  window.__shiloHeaderInit = true;

  var debounce = window.debounce || function (fn, wait) {
    var t;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  };

  function toArray(list) {
    return Array.prototype.slice.call(list);
  }

  var searchInstances = [];

  /* ---------- Typeahead configuration ----------
     MIN_CHARS was 2, and the sub-minimum branch called closePanel(), so the first
     letter typed actively CLOSED a panel that was showing popular searches — the
     exact opposite of a typeahead. With options[prefix]=last a single Hebrew
     letter is already a useful narrowing, and Hebrew queries are short. */
  var DEBOUNCE_MS = 150;
  var MIN_CHARS = 1;

  /* Shopify's Predictive Search API (/search/suggest) is language-gated and Hebrew
     is not on the supported list, so on this store it can never return a product
     no matter what resources[type] asks for — that, and not the rendering, is why
     the dropdown looked empty. #shopify-features is Shopify's own capability flag
     (the merchant checkbox in themeSettings.predictiveSearch says nothing about
     it), so the day Hebrew is added this flips back to the purpose-built typeahead
     endpoint by itself. A missing or unparseable tag counts as unsupported. */
  function predictiveApiSupported() {
    var el = document.getElementById('shopify-features');
    if (!el) return false;
    try {
      return JSON.parse(el.textContent).predictiveSearch === true;
    } catch (e) {
      return false;
    }
  }

  var usePredictiveApi = predictiveApiSupported();

  function buildSearchUrl(q) {
    var routes = window.routes || {};
    if (usePredictiveApi) {
      return routes.predictive_search_url +
        '?q=' + encodeURIComponent(q) +
        '&resources[type]=product,collection,page,article' +
        '&resources[limit]=6' +
        '&resources[limit_scope]=each' +
        '&section_id=predictive-search';
    }
    /* Storefront search through the Section Rendering API — no language gate.
       options[prefix]=last is what makes it match letter by letter on the term
       being typed, and it is passed explicitly because the Search & Discovery app
       can otherwise change the effective default. type=product only: storefront
       search cannot return collections at all, so the קטגוריות group in the
       dropdown is not available on this path. */
    return (routes.search_url || '/search') +
      '?q=' + encodeURIComponent(q) +
      '&type=product' +
      '&options[prefix]=last' +
      '&options[unavailable_products]=last' +
      '&section_id=predictive-search';
  }

  /* The query is echoed back into the empty state as markup, so it has to be
     escaped — a search for `<b>` must not become one. */
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Pointer activity flag — lets keyboard focus open the mega menu without a
     mouse click on <summary> opening and instantly re-closing it. */
  var pointerActive = false;
  var pointerTimer = null;
  document.addEventListener(
    'pointerdown',
    function () {
      pointerActive = true;
      clearTimeout(pointerTimer);
      pointerTimer = setTimeout(function () { pointerActive = false; }, 500);
    },
    true
  );

  /* ---------- Menu drawer: move to <body> ----------
     The header section wrapper is position:sticky with a z-index, which
     creates a stacking context below the global overlay (z-index 90).
     Re-parenting the drawer to <body> lets it layer above the overlay. */
  function adoptMenuDrawer(scope) {
    var drawer = scope.querySelector('[data-menu-drawer]');
    if (!drawer) return;
    document.querySelectorAll('body > [data-menu-drawer]').forEach(function (old) {
      if (old !== drawer) old.remove();
    });
    if (drawer.parentElement !== document.body) document.body.appendChild(drawer);
  }

  /* ---------- Announcement rotation ---------- */
  function initAnnouncements(track) {
    if (!track || track.dataset.initialized === 'true') return;
    track.dataset.initialized = 'true';

    var items = toArray(track.querySelectorAll('[data-announcement]'));
    if (items.length < 2) return;

    var interval = parseInt(track.getAttribute('data-rotate-interval'), 10) || 5000;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var index = 0;
    var timer = null;

    function show(i) {
      index = i;
      items.forEach(function (item, n) {
        var active = n === i;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-hidden', active ? 'false' : 'true');
        /* Hidden slides fade out with opacity only, which leaves their links in
           the tab order — keep focusability in sync with the active slide. */
        item.querySelectorAll('a[href]').forEach(function (a) {
          if (active) a.removeAttribute('tabindex');
          else a.setAttribute('tabindex', '-1');
        });
      });
    }

    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function start() {
      if (reduced) return;
      stop();
      timer = setInterval(function () {
        show((index + 1) % items.length);
      }, interval);
    }

    /* Exposed for the theme editor (block select/deselect) */
    track._pin = function (item) {
      stop();
      var i = items.indexOf(item);
      if (i > -1) show(i);
    };
    track._resume = start;

    var bar = track.closest('.announcement-bar') || track;
    bar.addEventListener('mouseenter', stop);
    bar.addEventListener('mouseleave', start);
    bar.addEventListener('focusin', stop);
    bar.addEventListener('focusout', start);

    show(0);
    start();
  }

  /* ---------- Typeahead search ----------
     Products come from storefront search on this store (see buildSearchUrl), not
     from the Predictive Search API, so "predictive" here only names the merchant
     setting and the section that renders the rows. */
  function initSearchForm(form) {
    if (!form || form.dataset.initialized === 'true') return;
    form.dataset.initialized = 'true';

    var input = form.querySelector('[data-search-input]');
    var panel = form.querySelector('[data-search-panel]');
    if (!input || !panel) return;

    var slot = form.querySelector('[data-search-results]');
    var popular = form.querySelector('[data-search-popular]');
    var clearBtn = form.querySelector('[data-search-clear]');
    var skeleton = form.querySelector('[data-search-skeleton]');
    var status = form.querySelector('[data-search-status]');
    var emptyTpl = form.querySelector('[data-search-empty]');
    var predictiveOn = !!(window.themeSettings && window.themeSettings.predictiveSearch) && !!slot;
    var cache = {};
    var cacheSize = 0;
    var controller = null;

    /* Monotonic request token. The old guard compared input.value against the query
       a response was for, which both discarded responses that were still the newest
       one and could be fooled by the user retyping an earlier string. The token
       discards exactly the superseded ones.
       It is per form on purpose: the desktop and the mobile form are both in the
       DOM at all times, and a shared counter would let one cancel the other's
       renders. */
    var seq = 0;

    function announce(text) {
      if (status) status.textContent = text || '';
    }

    function openPanel() {
      panel.hidden = false;
      form.classList.add('is-open');
      input.setAttribute('aria-expanded', 'true');
    }

    function hideSkeleton() {
      if (skeleton) skeleton.hidden = true;
    }

    function closePanel() {
      if (controller) {
        controller.abort();
        controller = null;
      }
      form.classList.remove('is-searching');
      hideSkeleton();
      announce('');
      panel.hidden = true;
      form.classList.remove('is-open');
      input.setAttribute('aria-expanded', 'false');
    }

    function showPopular() {
      /* Invalidate any in-flight query, exactly as closePanel does. Without this
         the panel silently reopens with stale results: type "מק", hit the clear
         button (which assigns input.value programmatically, so no input event
         fires), and when the "מק" response lands its token still equals seq, so
         renderResults replaces the popular chips the user just asked for with
         results for an empty box. Bumping seq is what actually fixes it; the
         abort just stops paying for a request nobody will read. */
      seq += 1;
      if (controller) {
        controller.abort();
        controller = null;
      }
      form.classList.remove('is-searching');
      hideSkeleton();
      announce('');
      if (slot) {
        slot.hidden = true;
        slot.innerHTML = '';
      }
      if (popular) {
        popular.hidden = false;
        openPanel();
      } else {
        closePanel();
      }
    }

    /* Skeleton only replaces an empty panel — when results are already on
       screen they stay put and the submit button shows the spinner. */
    function showSkeleton() {
      if (!skeleton) return;
      var hasResults = slot && !slot.hidden && slot.innerHTML.trim().length > 0;
      if (hasResults) return;
      if (popular) popular.hidden = true;
      if (slot) slot.hidden = true;
      skeleton.hidden = false;
      openPanel();
    }

    /* A failure or an empty result must never close the panel. Closing it is what
       made a broken endpoint indistinguishable from "nothing happens"; the Hebrew
       empty state at least tells the shopper the search ran. The markup and the
       strings come from the <template> in sections/header.liquid so the icon and
       the localization stay in Liquid. */
    function renderEmpty(q) {
      if (!slot) return;
      hideSkeleton();
      /* Function replacement, not a string: a query containing `$&` or `$'` would
         otherwise be read as a replacement pattern rather than as text. */
      slot.innerHTML = emptyTpl
        ? emptyTpl.innerHTML.replace('[terms]', function () { return escapeHtml(q); })
        : '';
      slot.hidden = false;
      if (popular) popular.hidden = true;
      /* Open before announcing — a live region inside a hidden subtree is not read. */
      openPanel();
      var title = slot.querySelector('.predictive-results__empty-title');
      announce(title ? title.textContent : '');
    }

    function renderResults(html, q) {
      if (!slot) return;
      hideSkeleton();
      if (!html || !html.trim()) {
        renderEmpty(q);
        return;
      }
      slot.innerHTML = html;
      slot.hidden = false;
      if (popular) popular.hidden = true;
      openPanel();
      /* The result count is rendered by the section (it is the side that knows the
         number and has `| t`) into a visually-hidden node; only that sentence gets
         announced, not the whole dropdown. */
      var count = slot.querySelector('[data-search-count]');
      announce(count ? count.textContent.trim() : '');
    }

    function fetchResults(q) {
      var token = ++seq;
      /* Abort on the cache path too: without this a superseded request ran to
         completion and could leave `is-searching` stuck on the submit button. */
      if (controller) {
        controller.abort();
        controller = null;
      }
      if (Object.prototype.hasOwnProperty.call(cache, q)) {
        form.classList.remove('is-searching');
        renderResults(cache[q], q);
        return;
      }
      controller = new AbortController();
      form.classList.add('is-searching');
      showSkeleton();

      fetch(buildSearchUrl(q), { signal: controller.signal })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.text();
        })
        .then(function (text) {
          if (token !== seq) return;
          form.classList.remove('is-searching');
          var doc = new DOMParser().parseFromString(text, 'text/html');
          var results = doc.getElementById('PredictiveSearchResults');
          /* Tolerate a missing node — section_id=predictive-search stops resolving
             if that section file is ever renamed, and an empty string routes to the
             empty state rather than to a blank panel. */
          var html = results ? results.innerHTML : '';
          if (cacheSize > 40) {
            cache = {};
            cacheSize = 0;
          }
          cache[q] = html;
          cacheSize++;
          renderResults(html, q);
        })
        .catch(function (err) {
          if (err && err.name === 'AbortError') return;
          if (token !== seq) return;
          form.classList.remove('is-searching');
          renderEmpty(q);
        });
    }

    function onQueryChange() {
      var q = input.value.trim();
      if (clearBtn) clearBtn.hidden = q.length === 0;
      if (q.length === 0) {
        showPopular();
        return;
      }
      if (!predictiveOn) {
        closePanel();
        return;
      }
      /* Below the minimum, fall back to the popular chips — never to a closed
         panel. Unreachable at MIN_CHARS = 1, kept so raising the knob stays safe. */
      if (q.length < MIN_CHARS) {
        showPopular();
        return;
      }
      fetchResults(q);
    }

    input.addEventListener('input', debounce(onQueryChange, DEBOUNCE_MS));

    /* Android Hebrew keyboards compose: several letters can be committed with one
       final input event, and some IMEs suppress input events mid-composition
       entirely. compositionend fires at the commit, so the panel updates then
       instead of waiting out another debounce. */
    input.addEventListener('compositionend', onQueryChange);

    input.addEventListener('focus', function () {
      var q = input.value.trim();
      if (q.length === 0) {
        if (popular) showPopular();
      } else if (predictiveOn && q.length >= MIN_CHARS) {
        fetchResults(q);
      }
    });

    if (clearBtn) {
      clearBtn.hidden = input.value.trim().length === 0;
      clearBtn.addEventListener('click', function () {
        input.value = '';
        clearBtn.hidden = true;
        input.focus();
        showPopular();
      });
    }

    form.addEventListener('submit', function (e) {
      if (input.value.trim().length === 0) {
        e.preventDefault();
        input.focus();
      }
    });

    /* Keyboard: combobox-style navigation into the results panel */
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closePanel();
        return;
      }
      if (e.key === 'ArrowDown' && !panel.hidden) {
        var first = panel.querySelector('a[href], button:not([disabled])');
        if (first) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    panel.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Escape') return;
      var focusables = toArray(panel.querySelectorAll('a[href], button:not([disabled])'))
        .filter(function (el) { return el.offsetParent !== null; });
      if (e.key === 'Escape') {
        closePanel();
        input.focus();
        return;
      }
      if (!focusables.length) return;
      var idx = focusables.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        (focusables[idx + 1] || focusables[0]).focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx <= 0) input.focus();
        else focusables[idx - 1].focus();
      }
    });

    searchInstances.push({ form: form, close: closePanel });
  }

  /* Close open search panels on outside click */
  document.addEventListener('click', function (e) {
    searchInstances.forEach(function (inst) {
      if (!document.documentElement.contains(inst.form)) return;
      if (inst.form.classList.contains('is-open') && !inst.form.contains(e.target)) {
        inst.close();
      }
    });
  });

  /* ---------- Mega menu / nav dropdowns ----------
     <details> keeps click + keyboard support for free; this adds hover-intent
     opening, single-panel-at-a-time behaviour and Escape/scroll closing.
     (global.js also closes [data-disclosure] on outside click and Escape.) */
  function initNav(nav) {
    if (!nav || nav.dataset.initialized === 'true') return;
    nav.dataset.initialized = 'true';

    var dropdowns = toArray(nav.querySelectorAll('[data-nav-dropdown]'));
    if (!dropdowns.length) return;

    var hoverCapable = !window.matchMedia || window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    var openTimer = null;
    var closeTimer = null;

    function clearTimers() {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
    }

    function closeOthers(except) {
      dropdowns.forEach(function (item) {
        if (item !== except) item.removeAttribute('open');
      });
    }

    function openOne(item) {
      clearTimers();
      closeOthers(item);
      if (!item.hasAttribute('open')) item.setAttribute('open', '');
    }

    function closeOne(item) {
      item.removeAttribute('open');
    }

    /* Tracked rather than re-derived, so the scroll listener below can bail on a
       single integer compare instead of walking 12 <details> per scroll event. */
    var openCount = 0;

    dropdowns.forEach(function (item) {
      var summary = item.querySelector('summary');

      item.addEventListener('toggle', function () {
        openCount = 0;
        for (var i = 0; i < dropdowns.length; i++) {
          if (dropdowns[i].open) openCount++;
        }
        if (item.open) {
          closeOthers(item);
          /* The row wraps at 990-1400px, so the CSS nth-last-child guard misses
             flyouts on items that end the first line. Measure every open path
             (hover, focus, native tap) with the override cleared to avoid
             measuring an already-flipped panel. */
          var panel = item.querySelector('.site-nav__panel--flyout');
          if (panel) {
            panel.classList.remove('is-edge');
            var r = panel.getBoundingClientRect();
            panel.classList.toggle('is-edge', r.left < 0 || r.right > document.documentElement.clientWidth);
          }
        }
      });

      if (hoverCapable) {
        item.addEventListener('mouseenter', function () {
          clearTimeout(closeTimer);
          openTimer = setTimeout(function () { openOne(item); }, 120);
        });
        item.addEventListener('mouseleave', function () {
          clearTimeout(openTimer);
          closeTimer = setTimeout(function () { closeOne(item); }, 180);
        });
      }

      item.addEventListener('focusin', function () {
        if (pointerActive) return;
        openOne(item);
      });

      item.addEventListener('focusout', function (e) {
        if (e.relatedTarget && item.contains(e.relatedTarget)) return;
        closeOne(item);
      });

      item.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        closeOne(item);
        if (summary) summary.focus();
      });
    });

    /* The nav row folds away while the header is compressed — never leave a
       panel hanging open across that transition. */
    window.addEventListener(
      'scroll',
      function () {
        if (openCount === 0) return;
        clearTimers();
        closeOthers(null);
      },
      { passive: true }
    );
  }

  /* ---------- Sticky header height ----------
     The sticky wrapper's flow height is a constant and the header floats inside it
     (see the long note in section-header.css), so all that is left to do is tell
     CSS what that constant is. It is measured ONCE PER LAYOUT EPOCH — never on
     scroll, and deliberately not from a ResizeObserver on the header, which is what
     the old reserve spacer did: RO callbacks are delivered after layout but before
     paint, so writing a custom property there forced a second layout in the same
     frame, and because the animated height was fractional while the write was
     rounded, the top of the document jittered by up to a pixel per frame and
     Chrome's scroll anchoring kept adjusting the offset mid-gesture.

     Math.ceil, never round: a height rounded down leaves the header's bottom edge
     overhanging the first content below it.

     Both states are read in one synchronous block. Nothing paints between
     synchronous DOM writes, and .is-measuring suppresses the two transitions the
     header still has — plus a final forced read while it is still suppressed, so
     the next real style recalc compares against the finished state and the shadow
     overlay does not animate away from a value the measurement briefly forced. */
  function publishHeaderHeight(scope) {
    var root = scope || document;
    var header = root.querySelector('[data-sticky-header]') || root.querySelector('.site-header');
    if (!header) return;

    var wrapper = header.closest('.site-header-wrapper') || header.parentElement;
    var wasStuck = header.classList.contains('is-stuck');

    header.classList.add('is-measuring');
    header.classList.remove('is-stuck');
    var expanded = Math.ceil(header.getBoundingClientRect().height);
    header.classList.add('is-stuck');
    var collapsed = Math.ceil(header.getBoundingClientRect().height);
    if (!wasStuck) header.classList.remove('is-stuck');
    void header.offsetHeight;
    header.classList.remove('is-measuring');

    if (wrapper && expanded > 0) wrapper.style.setProperty('--header-h', expanded + 'px');

    /* Published on :root because five stylesheets offset their own sticky UI by
       --sticky-header-height and, with nothing ever setting it, only ever saw their
       fallbacks. They want the height that is on screen while the page is scrolled,
       which is the compressed one. */
    if (collapsed > 0) {
      document.documentElement.style.setProperty('--sticky-header-height', collapsed + 'px');
    }
  }

  var lastHeaderWidth = window.innerWidth;

  window.addEventListener('load', function () { publishHeaderHeight(document); });

  window.addEventListener(
    'resize',
    debounce(function () {
      /* Only a width change can rewrap the 12-department nav row. A mobile URL bar
         collapsing fires resize on height alone and must not cost a measurement. */
      if (window.innerWidth === lastHeaderWidth) return;
      lastHeaderWidth = window.innerWidth;
      publishHeaderHeight(document);
    }, 150)
  );

  /* Heebo and Assistant swap in after first paint and change where the nav row
     wraps, which changes the expanded height. */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { publishHeaderHeight(document); });
  }

  /* ---------- Init ---------- */
  function initAll(scope) {
    var root = scope || document;
    adoptMenuDrawer(root);
    root.querySelectorAll('[data-announcements]').forEach(initAnnouncements);
    root.querySelectorAll('[data-header-search]').forEach(initSearchForm);
    root.querySelectorAll('[data-header-nav]').forEach(initNav);
    publishHeaderHeight(root);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initAll(document); });
  } else {
    initAll(document);
  }

  /* Theme editor support */
  document.addEventListener('shopify:section:load', function (e) {
    initAll(e.target);
  });

  document.addEventListener('shopify:block:select', function (e) {
    var item = e.target && e.target.closest ? e.target.closest('[data-announcement]') : null;
    if (!item) return;
    var track = item.closest('[data-announcements]');
    if (track && typeof track._pin === 'function') track._pin(item);
  });

  document.addEventListener('shopify:block:deselect', function (e) {
    var item = e.target && e.target.closest ? e.target.closest('[data-announcement]') : null;
    if (!item) return;
    var track = item.closest('[data-announcements]');
    if (track && typeof track._resume === 'function') track._resume();
  });
})();
