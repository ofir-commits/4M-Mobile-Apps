/* =========================================================
   Quick order by catalogue number (SKU / barcode)
   Resolves each SKU through the JSON search view
   (templates/search.quick-order.liquid) and adds every resolved
   line to the cart in a single /cart/add.js call.
   ========================================================= */
(function () {
  'use strict';

  var DEBOUNCE = 320;
  var MAX_ROWS = 40;

  /* Kept deliberately identical to window.formatMoney in global.js. Both used to
     test only for {{amount}} and {{amount_no_decimals}} and so returned the raw,
     unsubstituted format string for the three separator variants Shopify also
     ships. This one had a second bug on top: the no-decimals branch returned
     without the markup strip, so a merchant format wrapping the value in a span
     leaked tags into the row. Matching the placeholder fixes both. */
  function formatMoney(cents, fallbackFormat) {
    var format = fallbackFormat || (window.themeSettings && window.themeSettings.moneyFormat) || '₪{{amount}}';
    var match = format.match(/\{\{\s*(amount[a-z_]*)\s*\}\}/);
    var noDecimals = match ? match[1].indexOf('no_decimals') > -1 : false;
    var value = noDecimals
      ? Math.round(cents / 100).toLocaleString('he-IL')
      : (cents / 100).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (!match) return '₪' + value;
    return format.replace(match[0], value).replace(/<[^>]*>/g, '');
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  function QuickOrder(root) {
    this.root = root;
    this.rowsHost = root.querySelector('[data-quick-order-rows]');
    this.template = root.querySelector('[data-quick-order-row-template]');
    this.status = root.querySelector('[data-quick-order-status]');
    this.countEl = root.querySelector('[data-quick-order-count]');
    this.grandEl = root.querySelector('[data-quick-order-grand]');
    this.submitBtn = root.querySelector('[data-quick-order-submit]');
    this.emptySummary = this.countEl ? this.countEl.textContent : '';

    if (!this.rowsHost || !this.template) return;

    this.bind();
    this.addRow();
    this.addRow();
    this.addRow();
  }

  QuickOrder.prototype.bind = function () {
    var self = this;

    this.root.addEventListener('click', function (event) {
      var tab = event.target.closest('[data-quick-order-tab]');
      if (tab) { self.switchTab(tab.dataset.quickOrderTab); return; }

      if (event.target.closest('[data-quick-order-add-row]')) { self.addRow(true); return; }
      if (event.target.closest('[data-quick-order-parse]')) { self.parsePaste(); return; }
      if (event.target.closest('[data-quick-order-clear]')) { self.clear(); return; }
      if (event.target.closest('[data-quick-order-submit]')) { self.submit(); return; }

      var step = event.target.closest('[data-quick-order-step]');
      if (step) {
        var row = step.closest('[data-quick-order-row]');
        var input = row.querySelector('[data-quick-order-qty]');
        var next = (parseInt(input.value, 10) || 1) + parseInt(step.dataset.quickOrderStep, 10);
        input.value = Math.max(1, next);
        self.refreshRow(row);
        return;
      }

      var remove = event.target.closest('[data-quick-order-remove]');
      if (remove) {
        var target = remove.closest('[data-quick-order-row]');
        if (self.rowsHost.children.length > 1) target.remove();
        else self.resetRow(target);
        self.refreshTotals();
      }
    });

    var lookup = debounce(function (row) { self.lookup(row); }, DEBOUNCE);

    this.rowsHost.addEventListener('input', function (event) {
      var row = event.target.closest('[data-quick-order-row]');
      if (!row) return;
      if (event.target.matches('[data-quick-order-sku]')) {
        row.dataset.variantId = '';
        row.dataset.price = '';
        lookup(row);
      }
      if (event.target.matches('[data-quick-order-qty]')) self.refreshRow(row);
    });

    this.rowsHost.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' || !event.target.matches('[data-quick-order-sku]')) return;
      event.preventDefault();
      var row = event.target.closest('[data-quick-order-row]');
      if (row === self.rowsHost.lastElementChild) self.addRow(true);
      else {
        var nextInput = row.nextElementSibling.querySelector('[data-quick-order-sku]');
        if (nextInput) nextInput.focus();
      }
    });
  };

  QuickOrder.prototype.switchTab = function (name) {
    this.root.querySelectorAll('[data-quick-order-tab]').forEach(function (tab) {
      var active = tab.dataset.quickOrderTab === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    this.root.querySelectorAll('[data-quick-order-panel]').forEach(function (panel) {
      panel.hidden = panel.dataset.quickOrderPanel !== name;
    });
  };

  QuickOrder.prototype.addRow = function (focus) {
    if (this.rowsHost.children.length >= MAX_ROWS) return null;
    var frag = this.template.content.cloneNode(true);
    var row = frag.querySelector('[data-quick-order-row]');
    this.rowsHost.appendChild(frag);
    if (focus) {
      var input = row.querySelector('[data-quick-order-sku]');
      if (input) input.focus();
    }
    return row;
  };

  QuickOrder.prototype.resetRow = function (row) {
    row.querySelector('[data-quick-order-sku]').value = '';
    row.querySelector('[data-quick-order-qty]').value = 1;
    row.querySelector('[data-quick-order-match]').innerHTML = '';
    row.querySelector('[data-quick-order-line-total]').textContent = '';
    row.dataset.variantId = '';
    row.dataset.price = '';
    row.classList.remove('is-resolved', 'is-missing', 'is-loading');
  };

  QuickOrder.prototype.lookup = function (row) {
    var self = this;
    var input = row.querySelector('[data-quick-order-sku]');
    var matchCell = row.querySelector('[data-quick-order-match]');
    var term = (input.value || '').trim();

    row.classList.remove('is-resolved', 'is-missing');
    row.querySelector('[data-quick-order-line-total]').textContent = '';

    if (!term) { matchCell.innerHTML = ''; this.refreshTotals(); return; }

    row.classList.add('is-loading');
    matchCell.innerHTML = '<span class="quick-order__match-loading"><span class="spinner" aria-hidden="true"></span></span>';

    var url = '/search?type=product&view=quick-order&q=' + encodeURIComponent(term);

    fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.ok ? res.json() : { results: [] }; })
      .catch(function () { return { results: [] }; })
      .then(function (data) {
        row.classList.remove('is-loading');
        var results = (data && data.results) || [];
        var exact = results.filter(function (r) { return r.exact; });
        var hit = exact[0] || null;

        if (hit) { self.applyMatch(row, hit); return; }

        if (results.length) { self.applySuggestions(row, results); return; }

        row.classList.add('is-missing');
        row.dataset.variantId = '';
        row.dataset.price = '';
        matchCell.innerHTML =
          '<span class="quick-order__miss">' +
          '<span class="quick-order__miss-title">מקט לא נמצא בקטלוג</span>' +
          '<a class="link fs-xs" href="/search?q=' + encodeURIComponent(term) + '">חיפוש חופשי</a>' +
          '</span>';
        self.refreshTotals();
      });
  };

  QuickOrder.prototype.applyMatch = function (row, hit) {
    var matchCell = row.querySelector('[data-quick-order-match]');
    var thumb = hit.image
      ? '<span class="quick-order__thumb"><img src="' + hit.image + '" alt="" width="44" height="44" loading="lazy"></span>'
      : '<span class="quick-order__thumb quick-order__thumb--empty" aria-hidden="true"></span>';

    var variantLine = hit.variant_title && hit.variant_title !== 'Default Title'
      ? '<span class="quick-order__match-variant">' + hit.variant_title + '</span>'
      : '';

    var stock = hit.available
      ? '<span class="stock-dot">במלאי</span>'
      : '<span class="stock-dot stock-dot--out">אזל מהמלאי</span>';

    matchCell.innerHTML =
      thumb +
      '<span class="quick-order__match-text">' +
      '<a class="quick-order__match-title" href="' + hit.url + '">' + hit.title + '</a>' +
      variantLine +
      stock +
      '</span>';

    row.dataset.variantId = hit.available ? String(hit.variant_id) : '';
    row.dataset.price = String(hit.price);
    row.classList.toggle('is-resolved', !!hit.available);
    row.classList.toggle('is-missing', !hit.available);
    this.refreshRow(row);
  };

  QuickOrder.prototype.applySuggestions = function (row, results) {
    var matchCell = row.querySelector('[data-quick-order-match]');
    var options = results.slice(0, 4).map(function (r) {
      var label = r.title + (r.variant_title && r.variant_title !== 'Default Title' ? ' · ' + r.variant_title : '');
      return '<button type="button" class="chip chip--suggestion" data-quick-order-pick=\'' +
        JSON.stringify(r).replace(/'/g, '&#39;') + '\'>' + label + '</button>';
    }).join('');

    matchCell.innerHTML =
      '<span class="quick-order__suggest">' +
      '<span class="text-meta">אין התאמה מדויקת - התכוונתם ל:</span>' +
      '<span class="quick-order__suggest-list">' + options + '</span>' +
      '</span>';

    var self = this;
    matchCell.querySelectorAll('[data-quick-order-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var hit = JSON.parse(btn.dataset.quickOrderPick);
        var skuInput = row.querySelector('[data-quick-order-sku]');
        if (hit.sku) skuInput.value = hit.sku;
        self.applyMatch(row, hit);
      });
    });
    this.refreshTotals();
  };

  QuickOrder.prototype.refreshRow = function (row) {
    var price = parseInt(row.dataset.price, 10);
    var qty = parseInt(row.querySelector('[data-quick-order-qty]').value, 10) || 1;
    var cell = row.querySelector('[data-quick-order-line-total]');
    if (row.dataset.variantId && !isNaN(price)) cell.textContent = formatMoney(price * qty);
    else cell.textContent = '';
    this.refreshTotals();
  };

  QuickOrder.prototype.resolvedRows = function () {
    return Array.prototype.filter.call(this.rowsHost.children, function (row) {
      return !!row.dataset.variantId;
    });
  };

  QuickOrder.prototype.refreshTotals = function () {
    var rows = this.resolvedRows();
    var items = 0;
    var total = 0;

    rows.forEach(function (row) {
      var qty = parseInt(row.querySelector('[data-quick-order-qty]').value, 10) || 1;
      var price = parseInt(row.dataset.price, 10) || 0;
      items += qty;
      total += price * qty;
    });

    if (this.countEl) {
      this.countEl.textContent = rows.length
        ? rows.length + ' מקטים · ' + items + ' יחידות'
        : this.emptySummary;
    }
    if (this.grandEl) this.grandEl.textContent = rows.length ? formatMoney(total) : '';
    if (this.submitBtn) this.submitBtn.disabled = rows.length === 0;
  };

  QuickOrder.prototype.parsePaste = function () {
    var textarea = this.root.querySelector('[data-quick-order-paste]');
    if (!textarea) return;

    var lines = (textarea.value || '')
      .split('\n')
      .map(function (l) { return l.trim(); })
      .filter(Boolean);

    if (!lines.length) { this.setStatus('הדביקו רשימת מקטים ואז לחצו על "אתרו את המוצרים".', 'error'); return; }

    this.rowsHost.innerHTML = '';

    var self = this;
    var added = 0;

    lines.slice(0, MAX_ROWS).forEach(function (line) {
      var parts = line.split(/[\s,;\t]+/).filter(Boolean);
      var sku = parts[0];
      var qty = parts.length > 1 ? parseInt(parts[parts.length - 1], 10) : 1;
      if (isNaN(qty) || qty < 1) qty = 1;

      var row = self.addRow();
      if (!row) return;
      row.querySelector('[data-quick-order-sku]').value = sku;
      row.querySelector('[data-quick-order-qty]').value = qty;
      self.lookup(row);
      added += 1;
    });

    var skipped = lines.length - added;
    this.switchTab('rows');
    this.setStatus(
      'עובד על ' + added + ' שורות…' + (skipped > 0 ? ' (' + skipped + ' שורות מעל המקסימום דולגו)' : ''),
      'info'
    );
  };

  QuickOrder.prototype.clear = function () {
    this.rowsHost.innerHTML = '';
    var paste = this.root.querySelector('[data-quick-order-paste]');
    if (paste) paste.value = '';
    this.addRow();
    this.addRow();
    this.addRow();
    this.setStatus('', '');
    this.refreshTotals();
  };

  QuickOrder.prototype.setStatus = function (message, kind) {
    if (!this.status) return;
    this.status.textContent = message || '';
    this.status.className = 'quick-order__status' + (kind ? ' quick-order__status--' + kind : '');
  };

  QuickOrder.prototype.submit = function () {
    var rows = this.resolvedRows();
    if (!rows.length) return;

    var items = rows.map(function (row) {
      return {
        id: parseInt(row.dataset.variantId, 10),
        quantity: parseInt(row.querySelector('[data-quick-order-qty]').value, 10) || 1
      };
    });

    var self = this;
    this.submitBtn.classList.add('btn--loading');
    this.submitBtn.disabled = true;

    var routes = window.routes || {};
    fetch(routes.cart_add_url || '/cart/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/javascript' },
      body: JSON.stringify({ items: items, sections_url: window.location.pathname })
    })
      .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
      .then(function (result) {
        self.submitBtn.classList.remove('btn--loading');
        self.submitBtn.disabled = false;

        if (!result.ok) {
          self.setStatus((result.body && result.body.description) || 'לא הצלחנו להוסיף את הפריטים. נסו שוב.', 'error');
          return;
        }

        self.setStatus(items.length + ' מקטים נוספו לעגלה בהצלחה.', 'success');
        document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));

        var drawerTrigger = document.querySelector('[data-drawer-open="CartDrawer"]');
        if (window.themeSettings && window.themeSettings.cartType === 'drawer' && drawerTrigger) drawerTrigger.click();
        else window.location.href = (window.routes && window.routes.cart_url) || '/cart';
      })
      .catch(function () {
        self.submitBtn.classList.remove('btn--loading');
        self.submitBtn.disabled = false;
        self.setStatus('שגיאת רשת. בדקו את החיבור ונסו שוב.', 'error');
      });
  };

  function init() {
    document.querySelectorAll('[data-quick-order]').forEach(function (root) {
      if (root.dataset.quickOrderReady) return;
      root.dataset.quickOrderReady = '1';
      new QuickOrder(root);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('shopify:section:load', init);
})();
