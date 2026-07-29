/* =========================================================
   Shilo Pro — Product page JS
   Media gallery (thumbs, arrows, zoom overlay), variant selection with
   pill *and* select controls, price / stock / SKU / URL updates, share
   button, sticky add-to-cart bar.

   Depends on global.js for: window.formatMoney, window.ShiloToast,
   window.ShiloDrawers (the zoom overlay reuses the drawer controller, so it
   gets the overlay, the focus trap and Escape-to-close for free).
   ========================================================= */
(function () {
  'use strict';

  function readJSON(el) {
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      return null;
    }
  }

  /* ---------- Media gallery ---------- */
  function initGallery(root) {
    const gallery = root.querySelector('[data-product-gallery]');
    if (!gallery) return null;

    const items = Array.from(gallery.querySelectorAll('.product-gallery__item'));
    const thumbs = Array.from(gallery.querySelectorAll('[data-thumb]'));
    const counters = Array.from(root.querySelectorAll('[data-gallery-counter]'));
    const zoom = root.querySelector('[data-product-zoom]');
    const zoomItems = zoom ? Array.from(zoom.querySelectorAll('[data-zoom-item]')) : [];
    const zoomCounters = Array.from(root.querySelectorAll('[data-zoom-counter]'));

    if (!items.length) return null;

    const ids = items.map((item) => item.dataset.mediaId);
    let activeIndex = Math.max(0, items.findIndex((item) => item.classList.contains('is-active')));

    function setActive(mediaId) {
      const id = String(mediaId);
      const index = ids.indexOf(id);
      if (index === -1) return;
      activeIndex = index;

      items.forEach((item) => {
        const active = item.dataset.mediaId === id;
        const wasActive = item.classList.contains('is-active');
        item.classList.toggle('is-active', active);
        if (active) {
          item.removeAttribute('aria-hidden');
        } else {
          item.setAttribute('aria-hidden', 'true');
          item.querySelectorAll('video').forEach((v) => {
            try { v.pause(); } catch (e) { /* noop */ }
          });
          /* External video embeds (YouTube/Vimeo iframes) keep playing when
             hidden via CSS — reload the src of the frame we just left. */
          if (wasActive) {
            item.querySelectorAll('iframe').forEach((f) => {
              const src = f.getAttribute('src');
              if (src) f.setAttribute('src', src);
            });
          }
        }
        /* Keep hidden frames out of the tab order. */
        const trigger = item.querySelector('.product-gallery__zoom');
        if (trigger) {
          if (active) trigger.removeAttribute('tabindex');
          else trigger.setAttribute('tabindex', '-1');
        }
      });

      thumbs.forEach((thumb) => {
        const active = thumb.dataset.mediaId === id;
        thumb.classList.toggle('is-active', active);
        thumb.setAttribute('aria-current', active ? 'true' : 'false');
        if (active) {
          /* Align the thumb inside its own rail only — scrollIntoView also
             scrolls the document and yanks the page under the shopper's
             finger when the rail is partially off-screen. */
          const rail = thumb.closest('[data-gallery-thumbs]');
          if (rail) {
            const railRect = rail.getBoundingClientRect();
            const thumbRect = thumb.getBoundingClientRect();
            let dx = 0;
            if (thumbRect.left < railRect.left) dx = thumbRect.left - railRect.left;
            else if (thumbRect.right > railRect.right) dx = thumbRect.right - railRect.right;
            if (dx !== 0) rail.scrollBy({ left: dx, behavior: 'smooth' });
          }
        }
      });

      zoomItems.forEach((frame) => {
        const active = frame.dataset.mediaId === id;
        frame.classList.toggle('is-active', active);
        if (active) frame.removeAttribute('aria-hidden');
        else frame.setAttribute('aria-hidden', 'true');
      });

      /* The overlay only holds images, so its counter reports the position
         inside zoomItems, not the all-media index. */
      const zoomIndex = zoomItems.findIndex((frame) => frame.dataset.mediaId === id);
      if (zoomIndex !== -1) {
        zoomCounters.forEach((counter) => {
          counter.textContent = zoomIndex + 1;
        });
      }

      counters.forEach((counter) => {
        counter.textContent = index + 1;
      });
    }

    function step(delta) {
      const next = (activeIndex + delta + items.length) % items.length;
      setActive(ids[next]);
    }

    /* The overlay only holds images, so stepping inside it skips video and
       3D media instead of landing on an empty frame. */
    const zoomIds = zoomItems.map((frame) => frame.dataset.mediaId);

    function stepZoom(delta) {
      if (!zoomIds.length) return;
      const current = zoomIds.indexOf(ids[activeIndex]);
      const from = current === -1 ? 0 : current;
      const next = (from + delta + zoomIds.length) % zoomIds.length;
      setActive(zoomIds[next]);
    }

    thumbs.forEach((thumb) => {
      thumb.addEventListener('click', () => setActive(thumb.dataset.mediaId));
    });

    root.querySelectorAll('[data-gallery-prev]').forEach((btn) => {
      btn.addEventListener('click', () => step(-1));
    });
    root.querySelectorAll('[data-gallery-next]').forEach((btn) => {
      btn.addEventListener('click', () => step(1));
    });
    root.querySelectorAll('[data-zoom-prev]').forEach((btn) => {
      btn.addEventListener('click', () => stepZoom(-1));
    });
    root.querySelectorAll('[data-zoom-next]').forEach((btn) => {
      btn.addEventListener('click', () => stepZoom(1));
    });

    const thumbsWrap = gallery.querySelector('[data-gallery-thumbs]');
    if (thumbsWrap) {
      thumbsWrap.addEventListener('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        const focused = document.activeElement;
        const index = thumbs.indexOf(focused);
        if (index === -1) return;
        e.preventDefault();
        const rtl = document.documentElement.dir === 'rtl';
        let next = index;
        if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = thumbs.length - 1;
        else {
          const forward = (e.key === 'ArrowRight') !== rtl;
          next = forward ? index + 1 : index - 1;
        }
        next = Math.max(0, Math.min(thumbs.length - 1, next));
        thumbs[next].focus();
        setActive(thumbs[next].dataset.mediaId);
      });
    }

    /* ----- Zoom overlay: opened by [data-drawer-open] in global.js ----- */
    if (zoom) {
      /* A click on the padding around the image closes, like the drawer scrim. */
      zoom.addEventListener('click', (e) => {
        if (e.target.closest('.modal__content')) return;
        if (window.ShiloDrawers) window.ShiloDrawers.close();
      });

      document.addEventListener('keydown', (e) => {
        if (!zoom.classList.contains('is-open')) return;
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const rtl = document.documentElement.dir === 'rtl';
        const forward = (e.key === 'ArrowRight') !== rtl;
        stepZoom(forward ? 1 : -1);
      });
    }

    return { setActive: setActive, step: step };
  }

  /* ---------- Main product section ---------- */
  function initMainProduct(root) {
    if (!root || root.dataset.jsInitialized) return;
    root.dataset.jsInitialized = 'true';

    const sectionId = root.dataset.sectionId;
    const lowStockThreshold = parseInt(root.dataset.lowStock, 10) || 5;
    const strings = readJSON(root.querySelector('[data-product-strings]')) || {};
    const variants = readJSON(root.querySelector('[data-variant-json]'));

    const picker = root.querySelector('[data-variant-picker]');
    const priceEl = root.querySelector('#ProductPrice-' + sectionId);
    const saveBadge = root.querySelector('[data-save-badge]');
    const skuWrap = root.querySelector('[data-sku-wrap]');
    const skuEl = root.querySelector('[data-sku]');
    const stockEl = root.querySelector('[data-stock-status]');
    const form = root.querySelector('#ProductForm-' + sectionId);
    const idInput = form ? form.querySelector('[data-variant-id]') : null;
    const addBtn = root.querySelector('[data-add-button]');
    const addBtnText = root.querySelector('[data-add-button-text]');
    const inCartWrap = root.querySelector('[data-in-cart]');
    const inCartText = root.querySelector('[data-in-cart-text]');
    const stickyBar = root.querySelector('[data-sticky-atc]');
    const stickyPrice = root.querySelector('[data-sticky-price]');
    const stickyBtn = root.querySelector('[data-sticky-add]');
    const stickyBtnText = root.querySelector('[data-sticky-add-text]');
    const stickyImage = root.querySelector('[data-sticky-image]');
    const buyWrap = root.querySelector('[data-buy-buttons-wrap]');
    const requestWrap = root.querySelector('[data-request-price-wrap]');
    const callPriceTpl = root.querySelector('[data-call-price-template]');
    const backInStock = root.querySelector('[data-back-in-stock]');

    const gallery = initGallery(root);

    /* ----- Share button ----- */
    const shareBtn = root.querySelector('[data-share-button]');
    if (shareBtn) {
      shareBtn.addEventListener('click', async () => {
        const url = shareBtn.dataset.shareUrl || window.location.href;
        const title = shareBtn.dataset.shareTitle || document.title;
        if (navigator.share) {
          try {
            await navigator.share({ title: title, url: url });
            return;
          } catch (e) {
            if (e && e.name === 'AbortError') return;
          }
        }
        try {
          await navigator.clipboard.writeText(url);
          if (window.ShiloToast && strings.copied) window.ShiloToast(strings.copied, 'success');
        } catch (e) {
          const ta = document.createElement('textarea');
          ta.value = url;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try {
            document.execCommand('copy');
            if (window.ShiloToast && strings.copied) window.ShiloToast(strings.copied, 'success');
          } catch (err) { /* noop */ }
          ta.remove();
        }
      });
    }

    /* ----- Sticky add-to-cart bar ----- */
    const buyAnchor = root.querySelector('[data-buy-buttons-anchor]');
    if (stickyBar && buyAnchor && 'IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          const passed = !entry.isIntersecting && entry.boundingClientRect.bottom < 0;
          stickyBar.classList.toggle('is-visible', passed);
        },
        { threshold: 0 }
      );
      observer.observe(buyAnchor);
    }

    if (stickyBtn) {
      stickyBtn.addEventListener('click', () => {
        if (stickyBtn.disabled || stickyBtn.hasAttribute('aria-disabled')) return;
        stickyBtn.classList.add('btn--loading');
        setTimeout(() => stickyBtn.classList.remove('btn--loading'), 5000);
      });
      document.addEventListener('cart:updated', () => stickyBtn.classList.remove('btn--loading'));
    }

    /* ----- "Already in your cart" line ----- */
    let cartItems = null;

    function pluralize(one, other, count) {
      if (count === 1) return one || '';
      return (other || '').replace('[count]', count);
    }

    function renderInCart(variantId) {
      if (!inCartWrap || !inCartText) return;
      if (!cartItems) {
        /* No cart snapshot yet — the server-rendered line stays as it is for
           the variant it was rendered for, and is hidden for any other. */
        return;
      }
      let quantity = 0;
      cartItems.forEach((item) => {
        if (item.variant_id === variantId) quantity += item.quantity;
      });
      if (quantity > 0) {
        inCartText.textContent = pluralize(strings.inCartOne, strings.inCartOther, quantity);
        inCartWrap.hidden = false;
      } else {
        inCartWrap.hidden = true;
      }
    }

    document.addEventListener('cart:updated', (e) => {
      const cart = e.detail && e.detail.cart;
      if (!cart) return;
      cartItems = cart.items || [];
      const variantId = idInput ? parseInt(idInput.value, 10) : NaN;
      if (!isNaN(variantId)) renderInCart(variantId);
    });

    /* ----- Variant selection ----- */
    if (!picker || !Array.isArray(variants) || !variants.length) return;

    const controls = Array.from(
      picker.querySelectorAll('input[type="radio"][data-option-position], select[data-option-position]')
    );
    const optionCount = controls.reduce(
      (max, el) => Math.max(max, parseInt(el.dataset.optionPosition, 10) || 0),
      0
    );
    const unavailableSuffixEl = picker.querySelector('[data-unavailable-suffix]');
    const unavailableSuffix = unavailableSuffixEl
      ? unavailableSuffixEl.textContent.trim()
      : strings.unavailable || '';

    function controlsAt(position) {
      return controls.filter((el) => parseInt(el.dataset.optionPosition, 10) === position);
    }

    function valueAt(position) {
      const group = controlsAt(position);
      for (let i = 0; i < group.length; i++) {
        const el = group[i];
        if (el.tagName === 'SELECT') return el.value || null;
        if (el.checked) return el.value;
      }
      return null;
    }

    function selectedOptions() {
      const options = [];
      for (let p = 1; p <= optionCount; p++) options.push(valueAt(p));
      return options;
    }

    function findVariant(options) {
      return variants.find((v) =>
        v.options.every((value, i) => value === options[i])
      );
    }

    /* Is there an available variant for `value` at `position`, given the values
       already chosen for the options before it? */
    function combinationExists(position, value, selected) {
      return variants.some((v) => {
        if (!v.available) return false;
        if (v.options[position - 1] !== value) return false;
        for (let i = 0; i < position - 1; i++) {
          if (selected[i] !== null && v.options[i] !== selected[i]) return false;
        }
        return true;
      });
    }

    function markUnavailable() {
      const selected = selectedOptions();
      controls.forEach((el) => {
        const position = parseInt(el.dataset.optionPosition, 10);

        if (el.tagName === 'SELECT') {
          Array.from(el.options).forEach((option) => {
            const label = option.dataset.label || option.value;
            const exists = combinationExists(position, option.value, selected);
            option.textContent = exists || !unavailableSuffix
              ? label
              : label + ' - ' + unavailableSuffix;
          });
          return;
        }

        const exists = combinationExists(position, el.value, selected);
        const pill = el.closest('.variant-pill');
        if (pill) pill.classList.toggle('is-unavailable', !exists);
      });
    }

    function renderPrice(variant) {
      if (!priceEl || typeof window.formatMoney !== 'function') return;
      const onSale =
        typeof variant.compare_at_price === 'number' &&
        variant.compare_at_price > variant.price;

      /* dir="ltr" on both money spans is not decoration: it mirrors
         snippets/price.liquid exactly. The server render isolates the money run,
         and rebuilding the markup here without the attribute silently broke that
         the instant a shopper picked a variant — the ₪ sign and the decimals can
         reorder inside the RTL page, and on sale items the current and compare-at
         runs sit adjacent, which is where it shows most. */
      let html =
        '<div class="price price--large' + (onSale ? ' price--on-sale' : '') + '">' +
        '<span class="price__current" dir="ltr">' +
        '<span class="visually-hidden">' +
        (onSale ? strings.salePrice || '' : strings.regularPrice || '') +
        '</span>' +
        window.formatMoney(variant.price) +
        '</span>';
      if (onSale) {
        html +=
          '<s class="price__compare" dir="ltr">' +
          '<span class="visually-hidden">' + (strings.regularPrice || '') + '</span>' +
          window.formatMoney(variant.compare_at_price) +
          '</s>';
      }
      html += '</div>';
      priceEl.innerHTML = html;

      if (saveBadge) {
        if (onSale && strings.saveAmount) {
          saveBadge.textContent = strings.saveAmount.replace(
            '[amount]',
            window.formatMoney(variant.compare_at_price - variant.price)
          );
          saveBadge.hidden = false;
        } else {
          saveBadge.hidden = true;
        }
      }

      if (stickyPrice) stickyPrice.textContent = window.formatMoney(variant.price);
    }

    function renderStock(variant) {
      if (!stockEl) return;
      let cls = 'stock-dot';
      let text = strings.inStock || '';
      if (!variant.available) {
        cls = 'stock-dot stock-dot--out';
        text = strings.outOfStock || '';
      } else if (
        variant.inventory_management &&
        typeof variant.inventory_quantity === 'number' &&
        variant.inventory_quantity > 0 &&
        variant.inventory_quantity <= lowStockThreshold
      ) {
        cls = 'stock-dot stock-dot--low';
        text = pluralize(strings.lowStockOne, strings.lowStockOther, variant.inventory_quantity);
      }
      stockEl.innerHTML = '';
      const dot = document.createElement('span');
      dot.className = cls;
      dot.textContent = text;
      stockEl.appendChild(dot);
    }

    function setButtonState(button, textEl, available, unavailableText) {
      if (!button) return;
      if (available) {
        button.disabled = false;
        button.removeAttribute('aria-disabled');
        if (textEl) textEl.textContent = strings.addToCart || '';
      } else {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
        if (textEl) textEl.textContent = unavailableText;
      }
    }

    function renderSku(variant) {
      if (!skuWrap || !skuEl) return;
      if (variant.sku) {
        skuEl.textContent = variant.sku;
        skuWrap.hidden = false;
      } else {
        skuWrap.hidden = true;
      }
    }

    function updateUrl(variant) {
      if (!window.history || !window.history.replaceState) return;
      window.history.replaceState(
        {},
        '',
        window.location.pathname + '?variant=' + variant.id
      );
    }

    function updateStickyImage(variant) {
      if (!stickyImage || !variant.featured_media) return;
      const preview = variant.featured_media.preview_image;
      if (!preview || !preview.src) return;
      const sep = preview.src.indexOf('?') === -1 ? '?' : '&';
      stickyImage.src = preview.src + sep + 'width=96';
      stickyImage.srcset =
        preview.src + sep + 'width=96 1x, ' + preview.src + sep + 'width=192 2x';
    }

    function updateSelectedLabels() {
      picker.querySelectorAll('.product-variants__option').forEach((group) => {
        const label = group.querySelector('[data-selected-value]');
        if (!label) return;
        const select = group.querySelector('select[data-option-position]');
        if (select) {
          label.textContent = select.value;
          return;
        }
        const checked = group.querySelector('input[type="radio"]:checked');
        if (checked) label.textContent = checked.value;
      });
    }

    function onVariantChange() {
      updateSelectedLabels();
      markUnavailable();

      const variant = findVariant(selectedOptions());

      if (!variant) {
        setButtonState(addBtn, addBtnText, false, strings.unavailable || '');
        setButtonState(stickyBtn, stickyBtnText, false, strings.unavailable || '');
        if (stockEl) stockEl.innerHTML = '';
        if (saveBadge) saveBadge.hidden = true;
        if (inCartWrap) inCartWrap.hidden = true;
        if (backInStock) backInStock.hidden = true;
        return;
      }

      if (idInput) idInput.value = variant.id;

      /* An unpriced (₪0) variant must never be purchasable: swap the buy
         buttons (sticky bar included) for the quote request and restore the
         "call for price" display instead of rendering ₪0.00. Disabling the
         hidden buttons is defense-in-depth, so the sticky bar's form-attached
         submit can never fire for it. */
      const unpriced = variant.price === 0;
      if (buyWrap) buyWrap.hidden = unpriced;
      if (requestWrap) requestWrap.hidden = !unpriced;
      if (unpriced) {
        if (priceEl && callPriceTpl) priceEl.innerHTML = callPriceTpl.innerHTML;
        if (saveBadge) saveBadge.hidden = true;
        setButtonState(addBtn, addBtnText, false, strings.unavailable || '');
        setButtonState(stickyBtn, stickyBtnText, false, strings.unavailable || '');
      } else {
        renderPrice(variant);
        setButtonState(addBtn, addBtnText, variant.available, strings.soldOut || '');
        setButtonState(stickyBtn, stickyBtnText, variant.available, strings.soldOut || '');
      }

      /* Keep the back-in-stock card in step with the selection: hide it for a
         purchasable variant and re-point its hidden contact fields, so the
         shop is notified about the variant the shopper actually asked for.
         (The card only exists when the landing variant was sold out.) */
      if (backInStock) {
        backInStock.hidden = variant.available;
        const bisTitle = backInStock.querySelector('[data-bis-variant-title]');
        if (bisTitle) bisTitle.value = variant.title || '';
        const bisSku = backInStock.querySelector('[data-bis-sku]');
        if (bisSku) bisSku.value = variant.sku || '';
        const bisLink = backInStock.querySelector('[data-bis-link]');
        if (bisLink) bisLink.value = bisLink.value.replace(/variant=\d+/, 'variant=' + variant.id);
      }

      renderStock(variant);
      renderSku(variant);
      updateUrl(variant);
      updateStickyImage(variant);
      if (inCartWrap) {
        if (cartItems) renderInCart(variant.id);
        else inCartWrap.hidden = true;
      }
      if (gallery && variant.featured_media) {
        gallery.setActive(variant.featured_media.id);
      }
    }

    picker.addEventListener('change', (e) => {
      if (e.target.matches('input[type="radio"], select[data-option-position]')) onVariantChange();
    });

    markUnavailable();
  }

  function initAll() {
    document.querySelectorAll('[data-main-product]').forEach(initMainProduct);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  document.addEventListener('shopify:section:load', (e) => {
    const root = e.target && e.target.querySelector && e.target.querySelector('[data-main-product]');
    if (root) initMainProduct(root);
  });
})();
