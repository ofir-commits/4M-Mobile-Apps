# Accessibility — what has been checked, and what has not

Israeli law reaches this store through two regulations. The website is covered by
תקנה 35 of תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג-2013,
which requires accessibility to **WCAG 2.0 level AA** as adopted by the Israeli
standard **ת"י 5568**. The published statement lives at `theme/legal/accessibility-statement.html`
and on the store as the page `הצהרת-נגישות-1`.

Audited 30 July 2026 against the Commission's own inspection form
(`טופס בדיקת נגישות לאינטרנט`, the file תקנה 93(א) requires be filled in). The filled
workbook is `anshilo-accessibility-form.xlsx` in this folder: one sheet per page
template, all 42 criteria, with the evidence for each answer.

## The honest summary

| | |
|---|---|
| Assessed compliant, with evidence | 278 |
| Assessed non-compliant | 0 |
| Not applicable to the page | 118 |
| **Still unverified** | **66** |

A blank result in the workbook means *not yet checked*, never *fine*. Those 66 are
not code defects — they are checks that cannot be made from source, listed below.

## Fixed during the audit

Three real failures, all found by working through the form criterion by criterion.

**1.4.3 contrast.** The accent colour on the two pale accent washes measured
4.47:1 and 4.06:1, under the 4.5:1 required for text at those sizes. Affected
`.btn--quiet`, `.badge--soft`, `.price__save`, the selected `.variant-pill`, and
`.facet__selected`. Now uses `--color-accent-ink` — same hue, 6.07:1 and 5.52:1.

**2.4.7 focus visible.** `.qty__input` set `outline: none` and put nothing back,
and `.qty` had no `:focus-within` rule, so tabbing into the quantity field — on the
product page, in the cart, in the cart drawer, in quick-order — showed no focus
indicator at all.

**2.2.2 pause, stop, hide.** The announcement bar advances on a `setInterval`, and
`accessibility.css` suppresses motion by zeroing CSS durations — which a timer
cannot see. So the accessibility menu's *עצירת אנימציות ותנועה* button never stopped
it. The same root cause meant it did not stop the disclosure animations either,
which run through the Web Animations API. Motion preference is now derived from all
three sources (visitor, merchant, OS), re-derived on every start, and
`accessibility.js` fires `shilo:motion` so anything already moving halts on the
click rather than at the next page load.

## Guarding the contrast fix

```sh
python3 theme/accessibility/contrast-audit.py    # non-zero exit if any pair fails
```

Run it after touching anything under **Colours** in the theme editor. It reads
`config/settings_data.json` and reimplements the `color_mix` / `color_lighten`
filters from `layout/theme.liquid`, because the palette in the settings is not what
lands on the page — and three of the four failures above were on those derived
washes, invisible on the settings screen.

## What still needs a human

These close the remaining 66 rows. None can be done from the code.

- **Screen-reader pass** on every page template. Criterion 1.3.2 requires it in so
  many words.
- **Full manual keyboard pass**, including the cart drawer, the filter drawer, the
  product gallery, quick-order and the account forms (2.1.1, 2.4.3).
- **200% zoom** on each page, confirming nothing is lost (1.4.4). Type is entirely
  rem-based and no fixed-height text container was found, so this is expected to
  pass — but it has not been observed.
- **W3C HTML validator** against the rendered pages (4.1.1). No duplicate runtime
  `id` was found by static analysis, but tag balance and nesting need the real output.
- **Look at the uploaded banner and tile images** and confirm none has text baked
  into the pixels (1.4.5). The theme renders all headings as live text.
- **Confirm with Shopify** that the spam challenge on the contact, account and
  comment forms is accessible and offers a non-visual alternative (1.1.1).
- **A מורשה נגישות שירות opinion.** תקנה 29 requires the statement and the
  adjustments be prepared in consultation with one, and the five-yearly periodic
  inspection (טופס 9) is carried out by them. This audit is a self-check to hand
  over as a starting point — it is not that opinion and does not substitute for it.

## Accessibility coordinator

דביר ארליכמן · 058-455-4333 · info@anshilo.com
