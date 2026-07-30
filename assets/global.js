/* =========================================================
   Shilo Pro — Global JS
   Cart API, drawers, toasts, quantity inputs, reveal, menus
   ========================================================= */
(function () {
  'use strict';

  /* ---------- Utilities ---------- */
  window.debounce = function (fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  };

  /* Mirrors Liquid's `| money`, because the same price is rendered by Liquid on
     load and by JS on every variant change — hardcoding '₪' + 0-2 decimals made
     the two disagree. layout/theme.liquid already passes shop.money_format in;
     the tag strip is there because a merchant's format can carry markup
     (`<span class=money>…</span>`) and callers insert this into textContent.
     Same implementation as quick-order.js:13 — keep the two in step. */
  window.formatMoney = function (cents) {
    const format = (window.themeSettings && window.themeSettings.moneyFormat) || '₪{{amount}}';
    /* Match the placeholder rather than testing for the two we happen to know.
       Shopify also ships {{amount_with_comma_separator}},
       {{amount_no_decimals_with_comma_separator}} and
       {{amount_with_period_separator}}; checking only for {{amount}} and
       {{amount_no_decimals}} left the format string UNSUBSTITUTED for the rest,
       so a shop on any of them would render the literal
       "₪{{amount_with_comma_separator}}" into textContent on every variant
       change. The separator variants only differ in grouping, which
       toLocaleString('he-IL') already produces, so the name is consulted for one
       thing: whether decimals are wanted.
       If no placeholder matches at all, fall back to a formatted number instead
       of returning the raw format — a wrong separator is a blemish, echoing
       template syntax at the customer is a bug. */
    const match = format.match(/\{\{\s*(amount[a-z_]*)\s*\}\}/);
    const noDecimals = match ? match[1].indexOf('no_decimals') > -1 : false;
    const amount = noDecimals
      ? Math.round(cents / 100).toLocaleString('he-IL')
      : (cents / 100).toLocaleString('he-IL', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
    if (!match) return '₪' + amount;
    /* Strip markup last: a merchant format can carry a wrapper such as
       <span class=money>…</span>, and every caller writes this into textContent. */
    return format.replace(match[0], amount).replace(/<[^>]*>/g, '');
  };

  const trapFocusHandlers = {};

  window.trapFocus = function (container) {
    const focusable = container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    removeTrapFocus();

    trapFocusHandlers.keydown = function (e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trapFocusHandlers.keydown);
    (container.querySelector('[autofocus]') || first).focus({ preventScroll: true });
  };

  window.removeTrapFocus = function () {
    if (trapFocusHandlers.keydown) {
      document.removeEventListener('keydown', trapFocusHandlers.keydown);
      trapFocusHandlers.keydown = null;
    }
  };

  /* ---------- Toast ---------- */
  window.ShiloToast = function (message, type = 'success', duration = 3200) {
    const region = document.querySelector('[data-toast-region]');
    if (!region) return;
    const toast = document.createElement('div');
    toast.className = 'toast toast--' + type;
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    region.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('is-leaving');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duration);
  };

  /* ---------- Drawer / overlay controller ---------- */
  const Drawers = {
    activeDrawer: null,
    overlay: null,

    ensureOverlay() {
      if (!this.overlay) {
        this.overlay = document.createElement('div');
        this.overlay.className = 'overlay';
        this.overlay.addEventListener('click', () => this.close());
        document.body.appendChild(this.overlay);
      }
      return this.overlay;
    },

    open(id, opener) {
      const drawer = document.getElementById(id);
      if (!drawer) return;
      if (this.activeDrawer && this.activeDrawer !== drawer) this.close(true);

      this.activeDrawer = drawer;
      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
      if (opener) drawer.dataset.openerId = opener.id || '';
      this.ensureOverlay().classList.add('is-open');
      document.body.classList.add('scroll-locked');
      window.trapFocus(drawer);
      document.addEventListener('keydown', this.onKeydown);
      drawer.dispatchEvent(new CustomEvent('drawer:open', { bubbles: true }));
    },

    close(keepOverlay) {
      if (!this.activeDrawer) return;
      const drawer = this.activeDrawer;
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
      this.activeDrawer = null;
      window.removeTrapFocus();
      document.removeEventListener('keydown', this.onKeydown);
      if (!keepOverlay) {
        if (this.overlay) this.overlay.classList.remove('is-open');
        document.body.classList.remove('scroll-locked');
      }
      const opener = drawer.dataset.openerId && document.getElementById(drawer.dataset.openerId);
      if (opener) opener.focus({ preventScroll: true });
      drawer.dispatchEvent(new CustomEvent('drawer:close', { bubbles: true }));
    },

    onKeydown(e) {
      if (e.key === 'Escape') Drawers.close();
    }
  };

  window.ShiloDrawers = Drawers;

  document.addEventListener('click', (e) => {
    const openTrigger = e.target.closest('[data-drawer-open]');
    if (openTrigger) {
      e.preventDefault();
      Drawers.open(openTrigger.getAttribute('data-drawer-open'), openTrigger);
      return;
    }
    const closeTrigger = e.target.closest('[data-drawer-close]');
    if (closeTrigger) {
      e.preventDefault();
      Drawers.close();
    }
  });

  /* ---------- Cart errors ----------
     Shopify's Ajax Cart API answers in English — a 422 from /cart/add.js carries
     `message: "Cart Error"` and `description: "You can only add 3 of X to the
     cart."` — so the theme's own Hebrew strings have to win the precedence, not
     lose it. The one thing worth salvaging from the English text is the NUMBER in
     a quantity cap: cart.errors.quantity_error is the Hebrew sentence shipped for
     exactly that case (layout/theme.liquid publishes it as
     cartStrings.quantityError with a [quantity] placeholder) and nothing read it
     until now. 422 alone is not enough to identify the cap — a sold-out variant
     answers 422 too — so the text has to corroborate it. If Shopify ever
     localizes the body the regex stops matching and we fall back to the generic
     Hebrew sentence, which is the right way to fail. */
  function cartErrorMessage(data, status) {
    const strings = window.cartStrings || {};
    const description = data && typeof data.description === 'string' ? data.description : '';
    const capped = status === 422 && /can only add|only\s+\d+/i.test(description);
    const quantity = description.match(/(\d+)/);
    if (capped && quantity && strings.quantityError) {
      return strings.quantityError.replace('[quantity]', quantity[1]);
    }
    return strings.error || '';
  }

  /* Errors thrown from here are already Hebrew, and `cartMessage` marks them as
     such. A network failure produces a plain Error whose message is the browser's
     own English text ("Failed to fetch"), so callers must never toast
     `err.message` blind — they go through cartErrorText instead. */
  function cartError(message) {
    const err = new Error(message);
    err.cartMessage = message;
    return err;
  }

  window.cartErrorText = function (err) {
    return (err && err.cartMessage) || (window.cartStrings && window.cartStrings.error) || '';
  };

  /* ---------- Cart API ---------- */
  const Cart = {
    sectionsToRender() {
      const ids = [];
      document.querySelectorAll('[data-cart-section]').forEach((el) => {
        const id = el.getAttribute('data-cart-section');
        if (id && !ids.includes(id)) ids.push(id);
      });
      return ids;
    },

    async getState() {
      const res = await fetch(window.routes.cart_url + '.js');
      return res.json();
    },

    async add(items, openDrawer = true) {
      const body = {
        items: Array.isArray(items) ? items : [items],
        sections: this.sectionsToRender(),
        sections_url: window.location.pathname
      };
      const res = await fetch(window.routes.cart_add_url + '.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        throw cartError(cartErrorMessage(data, res.status));
      }
      await this.afterChange(data.sections);
      if (openDrawer && window.themeSettings.cartType === 'drawer') {
        Drawers.open('CartDrawer');
      }
      return data;
    },

    /* `id` is the line-item key, not a positional line number: line numbers
       shift when a line is removed, so a second tap during an in-flight request
       would mutate the wrong item. Keys stay stable, and a change for an
       already-removed key is a harmless no-op. */
    async change(id, quantity) {
      const res = await fetch(window.routes.cart_change_url + '.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          id,
          quantity,
          sections: this.sectionsToRender(),
          sections_url: window.location.pathname
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw cartError(cartErrorMessage(data, res.status));
      }
      /* A deny-policy quantity cap answers 200 with the cart UNCHANGED plus an
         English `errors` string. Re-render first so the input snaps back to the
         server quantity, then throw through the same 422/quantity path so the
         Hebrew cap message (or the generic fallback) is what gets toasted. */
      if (data.errors) {
        await this.afterChange(data.sections);
        throw cartError(cartErrorMessage({ description: String(data.errors) }, 422));
      }
      await this.afterChange(data.sections);
      return data;
    },

    async updateNote(note) {
      await fetch(window.routes.cart_update_url + '.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ note })
      });
    },

    async afterChange(sections) {
      /* The server-rendered sections carry {{ cart.note }}, which lags behind
         text still sitting in the note field's 500ms debounce — snapshot live
         values by id (ids are stable across re-renders) so typed text survives
         the swap. The pending timer still POSTs the same text, so display and
         server converge. */
      const noteMemo = {};
      document.querySelectorAll('[data-cart-note]').forEach((el) => {
        if (el.id) noteMemo[el.id] = el.value;
      });
      if (sections) {
        Object.entries(sections).forEach(([id, html]) => {
          if (!html) return;
          document.querySelectorAll('[data-cart-section="' + id + '"]').forEach((el) => {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const replacement = doc.querySelector('[data-cart-section="' + id + '"]') || doc.body.firstElementChild;
            if (replacement) el.innerHTML = replacement.innerHTML;
          });
        });
        Object.keys(noteMemo).forEach((id) => {
          const el = document.getElementById(id);
          if (el && el.value !== noteMemo[id]) {
            el.value = noteMemo[id];
            const details = el.closest('details');
            if (details && noteMemo[id].trim() !== '') details.open = true;
          }
        });
        /* The swap just detached the nodes the focus trap's first/last point at,
           dropping keyboard focus to <body> behind the overlay — re-arm the trap
           on the open drawer (mirrors facets.js). Guarded to drawers that
           actually contain a re-rendered cart section, and kept inside the
           sections branch so the sectionless error-path call doesn't steal
           focus when no DOM was replaced. */
        if (
          Drawers.activeDrawer &&
          Drawers.activeDrawer.classList.contains('is-open') &&
          Drawers.activeDrawer.querySelector('[data-cart-section]')
        ) {
          window.trapFocus(Drawers.activeDrawer);
        }
      }
      const cart = await this.getState();
      this.updateBubbles(cart.item_count);
      document.dispatchEvent(new CustomEvent('cart:updated', { detail: { cart } }));
      return cart;
    },

    updateBubbles(count) {
      document.querySelectorAll('[data-cart-bubble]').forEach((bubble) => {
        bubble.textContent = count > 99 ? '99+' : count;
        bubble.classList.toggle('is-empty', count === 0);
        bubble.classList.remove('bump');
        void bubble.offsetWidth;
        bubble.classList.add('bump');
      });
    }
  };

  window.ShiloCart = Cart;

  /* ---------- <product-form> — AJAX add to cart ---------- */
  customElements.define(
    'product-form',
    class ProductForm extends HTMLElement {
      connectedCallback() {
        this.form = this.querySelector('form');
        if (!this.form) return;
        this.submitBtn = this.form.querySelector('[type="submit"]');
        this.form.addEventListener('submit', this.onSubmit.bind(this));
      }

      async onSubmit(e) {
        e.preventDefault();
        if (!this.submitBtn || this.submitBtn.hasAttribute('aria-disabled') || this.submitBtn.hasAttribute('aria-busy')) return;

        this.submitBtn.classList.add('btn--loading');
        this.submitBtn.setAttribute('aria-busy', 'true');

        const formData = new FormData(this.form);
        const item = {
          id: parseInt(formData.get('id'), 10),
          quantity: parseInt(formData.get('quantity') || '1', 10)
        };
        const properties = {};
        for (const [key, value] of formData.entries()) {
          const match = key.match(/^properties\[(.+)\]$/);
          if (match && value) properties[match[1]] = value;
        }
        if (Object.keys(properties).length) item.properties = properties;

        try {
          await Cart.add(item, true);
          if (window.themeSettings.cartType !== 'drawer') {
            window.ShiloToast(window.cartStrings.added, 'success');
          }
        } catch (err) {
          window.ShiloToast(window.cartErrorText(err), 'error');
        } finally {
          this.submitBtn.classList.remove('btn--loading');
          this.submitBtn.removeAttribute('aria-busy');
        }
      }
    }
  );

  /* ---------- <quantity-input> ---------- */
  customElements.define(
    'quantity-input',
    class QuantityInput extends HTMLElement {
      connectedCallback() {
        this.input = this.querySelector('input');
        if (!this.input) return;
        this.changeEvent = new Event('change', { bubbles: true });
        this.querySelectorAll('button').forEach((btn) =>
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            const prev = this.input.value;
            if (btn.name === 'plus') this.input.stepUp();
            else this.input.stepDown();
            if (prev !== this.input.value) this.input.dispatchEvent(this.changeEvent);
          })
        );
      }
    }
  );

  /* ---------- <cart-remove-button> ---------- */
  customElements.define(
    'cart-remove-button',
    class CartRemoveButton extends HTMLElement {
      connectedCallback() {
        this.addEventListener('click', (e) => {
          e.preventDefault();
          const key = this.dataset.key;
          this.closest('[data-cart-line]')?.classList.add('is-removing');
          Cart.change(key, 0).catch((err) => window.ShiloToast(window.cartErrorText(err), 'error'));
        });
      }
    }
  );

  /* ---------- <cart-line-qty> — quantity change on cart lines ---------- */
  customElements.define(
    'cart-line-qty',
    class CartLineQty extends HTMLElement {
      connectedCallback() {
        this.addEventListener(
          'change',
          window.debounce((e) => {
            const input = e.target;
            if (!input.matches('input')) return;
            const key = this.dataset.key;
            const qty = parseInt(input.value, 10);
            /* An emptied field parses to NaN, which JSON-serializes to null and
               can delete the line mid-edit — restore the last server-rendered
               quantity instead (afterChange re-renders after every successful
               change, so defaultValue always holds the server's number). */
            if (input.value.trim() === '' || isNaN(qty) || qty < 0) {
              input.value = input.defaultValue || 1;
              return;
            }
            Cart.change(key, qty).catch(async (err) => {
              window.ShiloToast(window.cartErrorText(err), 'error');
              /* Nothing re-rendered on this path — resync the input from the
                 server cart so it doesn't keep showing the rejected value. */
              const cart = await Cart.afterChange();
              const item = cart && cart.items && cart.items.find((it) => it.key === key);
              if (item) input.value = item.quantity;
            });
          }, 350)
        );
      }
    }
  );

  /* ---------- Details disclosure ----------
     A native <details> has no in-between state: the frame before it is open it is
     shut, and every accordion on the site — product description, shipping, FAQ,
     the mobile menu's submenus — appeared and vanished in one frame. The nav
     panels were half-done: CSS could animate them IN, because the element is new
     when it opens, but nothing can animate an element the browser is about to
     stop rendering, so they still blinked out.

     So `open` is taken over here. A summary click is intercepted, the motion runs,
     and only then does `open` flip — on close it flips at the END, which is the
     whole point. Two strategies, chosen per element by asking the browser where
     the content actually sits:

       height  in-flow content (accordions, menu submenus): animate the <details>
               box between its summary height and its full height. box-sizing is
               border-box theme-wide, so the content's own padding collapses with
               it and no wrapper element is needed.
       fade    out-of-flow content (the nav dropdown panels): the panel is
               position: absolute and contributes nothing to the box, so there is
               no height to animate — it gets opacity and a short lift instead,
               mirroring the existing header-panel-in keyframes. Critically this
               strategy never sets overflow on the <details>, which would clip the
               very panel it is trying to animate.

     Interruptions read the CURRENT rendered height rather than the resting one, so
     a double-click reverses from wherever the motion had got to instead of
     snapping to an end state first. */
  const DISCLOSURE_SELECTOR =
    '.accordion__item, .menu-drawer__sub, .site-nav__dropdown, .cart-drawer__note, .request-price__form-wrap';

  const Disclosure = (function () {
    const running = new WeakMap();
    /* Matches --ease-out / --duration-base in the stylesheets. Closing runs on a
       faster, front-loaded curve: waiting for a panel to leave feels slower than
       waiting for one to arrive, even at identical durations. */
    const EASE_OPEN = 'cubic-bezier(0.16, 1, 0.3, 1)';
    const EASE_CLOSE = 'cubic-bezier(0.4, 0, 0.2, 1)';

    /* Three independent sources, and all three have to be read here rather than
       left to CSS. accessibility.css suppresses motion by forcing
       animation-duration and transition-duration to 0.01ms, which reaches every
       CSS animation on the page but is invisible to the Web Animations API calls
       below — so before this check, the site's own "stop animations" control did
       not stop these panels. a11y-motion is that visitor control; no-animations
       is the merchant's theme setting; the media query is the OS setting. */
    function reduced() {
      const root = document.documentElement.classList;
      return (
        root.contains('a11y-motion') ||
        root.contains('no-animations') ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    }

    function summaryOf(details) {
      return Array.prototype.find.call(details.children, (el) => el.tagName === 'SUMMARY');
    }

    function contentOf(details) {
      const summary = summaryOf(details);
      let el = summary ? summary.nextElementSibling : details.firstElementChild;
      /* Skip anything with no box of its own (a stray <template>, a script). */
      while (el && !el.getClientRects().length && el.tagName !== 'DIV' && el.tagName !== 'UL') {
        el = el.nextElementSibling;
      }
      return el;
    }

    /* Long documents should not take proportionally longer to open — the distance
       sets the duration, but only within a band that still feels immediate. */
    function durationFor(distance) {
      return Math.min(420, Math.max(170, Math.round(Math.abs(distance) * 0.55)));
    }

    function clear(details) {
      const state = running.get(details);
      if (state) {
        state.animations.forEach((a) => a.cancel());
        running.delete(details);
      }
    }

    function settle(details) {
      details.style.removeProperty('height');
      details.style.removeProperty('overflow');
    }

    function isFloating(content) {
      if (!content) return false;
      const position = window.getComputedStyle(content).position;
      return position === 'absolute' || position === 'fixed';
    }

    function open(details) {
      if (!details || details.dataset.disclosureBusy === 'open') return;
      clear(details);
      const content = contentOf(details);

      if (reduced() || !details.animate) {
        details.open = true;
        settle(details);
        return;
      }

      if (isFloating(content)) {
        /* The panel is new in the DOM, so the stylesheet's own entrance keyframes
           play on their own — setting open is the whole job. */
        details.open = true;
        delete details.dataset.disclosureBusy;
        return;
      }

      const from = details.offsetHeight;
      details.open = true;
      const to = details.offsetHeight;
      if (to <= from) {
        settle(details);
        return;
      }

      details.style.overflow = 'hidden';
      details.dataset.disclosureBusy = 'open';
      const duration = durationFor(to - from);
      const box = details.animate(
        { height: [from + 'px', to + 'px'] },
        { duration: duration, easing: EASE_OPEN }
      );
      const animations = [box];
      if (content && content.animate) {
        animations.push(
          content.animate(
            { opacity: [0, 1], transform: ['translateY(-6px)', 'translateY(0)'] },
            { duration: Math.round(duration * 0.85), easing: EASE_OPEN, delay: 40, fill: 'backwards' }
          )
        );
      }
      running.set(details, { animations: animations, dir: 'open' });
      box.addEventListener('finish', () => {
        running.delete(details);
        delete details.dataset.disclosureBusy;
        settle(details);
      });
    }

    function close(details, options) {
      if (!details || !details.open) return;
      const focusSummary = options && options.focusSummary;
      const summary = summaryOf(details);
      if (details.dataset.disclosureBusy === 'close') return;
      clear(details);
      const content = contentOf(details);

      const done = () => {
        details.open = false;
        delete details.dataset.disclosureBusy;
        settle(details);
        if (focusSummary && summary) summary.focus();
      };

      if (reduced() || !details.animate) {
        done();
        return;
      }

      if (isFloating(content)) {
        details.dataset.disclosureBusy = 'close';
        const fade = content.animate(
          { opacity: [1, 0], transform: ['translateY(0)', 'translateY(-6px)'] },
          { duration: 150, easing: EASE_CLOSE }
        );
        running.set(details, { animations: [fade], dir: 'close' });
        fade.addEventListener('finish', () => {
          running.delete(details);
          done();
        });
        /* A cancelled fade means "reopened mid-close" — the reopen path owns the
           element from that point, so this must not also flip open to false. */
        fade.addEventListener('cancel', () => {
          delete details.dataset.disclosureBusy;
        });
        return;
      }

      const from = details.offsetHeight;
      const to = summary ? summary.offsetHeight : 0;
      if (from <= to) {
        done();
        return;
      }

      details.style.overflow = 'hidden';
      details.dataset.disclosureBusy = 'close';
      const duration = durationFor(from - to);
      const box = details.animate(
        { height: [from + 'px', to + 'px'] },
        { duration: duration, easing: EASE_CLOSE }
      );
      const animations = [box];
      if (content && content.animate) {
        animations.push(
          content.animate(
            { opacity: [1, 0] },
            { duration: Math.round(duration * 0.7), easing: EASE_CLOSE }
          )
        );
      }
      running.set(details, { animations: animations, dir: 'close' });
      box.addEventListener('finish', () => {
        running.delete(details);
        done();
      });
      box.addEventListener('cancel', () => {
        delete details.dataset.disclosureBusy;
      });
    }

    function toggle(details) {
      if (details.open) close(details);
      else open(details);
    }

    return { open: open, close: close, toggle: toggle, selector: DISCLOSURE_SELECTOR };
  })();

  window.ShiloDisclosure = Disclosure;

  /* Enter and Space on a <summary> both dispatch a click, so this one listener
     covers pointer and keyboard alike. */
  document.addEventListener('click', (e) => {
    const summary = e.target.closest('summary');
    if (!summary) return;
    const details = summary.parentElement;
    if (!details || details.tagName !== 'DETAILS') return;
    if (!details.matches(DISCLOSURE_SELECTOR)) return;
    e.preventDefault();
    Disclosure.toggle(details);
  });

  /* ---------- Details disclosure (dropdown menus) ---------- */
  document.addEventListener('click', (e) => {
    document.querySelectorAll('details[data-disclosure][open]').forEach((details) => {
      if (!details.contains(e.target)) Disclosure.close(details);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('details[data-disclosure][open]').forEach((details) => {
        Disclosure.close(details, { focusSummary: true });
      });
    }
  });

  /* ---------- Reveal on scroll ---------- */
  function initReveal() {
    const elements = document.querySelectorAll('.reveal:not(.reveal--visible)');
    if (!elements.length) return;
    if (!('IntersectionObserver' in window) || document.documentElement.classList.contains('no-animations')) {
      elements.forEach((el) => el.classList.add('reveal--visible'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            entry.target.style.transitionDelay = Math.min(i * 60, 240) + 'ms';
            entry.target.classList.add('reveal--visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    elements.forEach((el) => observer.observe(el));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReveal);
  } else {
    initReveal();
  }
  document.addEventListener('shopify:section:load', initReveal);

  /* ---------- Sticky header helper ----------
     Every class flip here invalidates style for the whole header subtree (12
     departments plus every mega panel), so the work is coalesced to one update
     per frame and classList is only touched on an actual state change — the old
     handler re-queried the DOM and re-wrote both classes on every scroll event.

     The stuck threshold is hysteretic (crosses at 48, releases at 32) because a
     trackpad fling and iOS rubber-banding both re-cross a single threshold
     several times inside one gesture, and each crossing costs a relayout of the
     header. `is-hidden-up` keeps its own ±8px dead zone for the same reason. */
  let headerEl = document.querySelector('[data-sticky-header]');
  let lastScroll = window.scrollY;
  let stuck = false;
  let hiddenUp = false;
  let ticking = false;

  function updateHeader() {
    ticking = false;
    if (!headerEl) return;
    const y = window.scrollY;

    const nextStuck = stuck ? y > 32 : y > 48;
    if (nextStuck !== stuck) {
      stuck = nextStuck;
      headerEl.classList.toggle('is-stuck', stuck);
    }

    let nextHidden = hiddenUp;
    if (y > 320 && y > lastScroll + 8) nextHidden = true;
    else if (y < lastScroll - 8 || y < 320) nextHidden = false;
    if (nextHidden !== hiddenUp) {
      hiddenUp = nextHidden;
      headerEl.classList.toggle('is-hidden-up', hiddenUp);
    }

    lastScroll = y;
  }

  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateHeader);
    },
    { passive: true }
  );

  /* A section re-render in the theme editor hands back a header without the
     state classes, so the tracked state has to be reset and re-applied. */
  document.addEventListener('shopify:section:load', () => {
    headerEl = document.querySelector('[data-sticky-header]');
    stuck = false;
    hiddenUp = false;
    updateHeader();
  });

  /* Reloading half-way down a page must not start with an expanded header. */
  updateHeader();

  /* ---------- External links a11y ---------- */
  document.querySelectorAll('a[target="_blank"]:not([rel*="noopener"])').forEach((a) => {
    a.setAttribute('rel', (a.getAttribute('rel') || '') + ' noopener');
  });
})();
