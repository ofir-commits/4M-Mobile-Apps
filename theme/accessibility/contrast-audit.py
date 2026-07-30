#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Measure every colour pair the theme can actually put on screen.

Run it after changing anything under "Colours" in the theme editor:

    python3 theme/accessibility/contrast-audit.py

It exits non-zero if any text pair falls under its WCAG 2.0 AA threshold, so it
can go in a pre-commit hook or CI step.

Why a script rather than a browser extension: the palette in
config/settings_data.json is not what lands on the page. layout/theme.liquid
derives four more colours from it with Liquid's color_mix and color_lighten
filters, and three of the four failures found in the July 2026 audit were on
those derived washes — invisible to anyone eyeballing the settings screen. The
filters are reimplemented here so the derived values are measured too.

Thresholds are WCAG 2.0 AA, which is what ת"י 5568 adopts:
  body text        4.5:1
  large text       3.0:1   (>= 18pt, or 14pt bold)
  UI boundaries    3.0:1   (1.4.11 — WCAG 2.1, applied here as good practice on
                            anything a user must see to operate a control)
"""
import colorsys
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SETTINGS = os.path.join(ROOT, 'config', 'settings_data.json')


# ---------------------------------------------------------------- colour maths
def rgb(c):
    c = c.lstrip('#')
    if len(c) == 3:
        c = ''.join(ch * 2 for ch in c)
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def _linear(v):
    v /= 255
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def luminance(c):
    r, g, b = (_linear(v) for v in rgb(c))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def to_hex(triple):
    return '#%02X%02X%02X' % tuple(int(round(max(0, min(255, v)))) for v in triple)


def color_lighten(c, points):
    """Liquid's color_lighten: add `points` to HSL lightness."""
    r, g, b = (v / 255 for v in rgb(c))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return to_hex([v * 255 for v in colorsys.hls_to_rgb(h, min(1.0, l + points / 100), s)])


def color_mix(c1, c2, weight):
    """Liquid's color_mix: `weight` percent of c1, the rest c2."""
    a, b = rgb(c1), rgb(c2)
    return to_hex([a[i] * weight / 100 + b[i] * (100 - weight) / 100 for i in range(3)])


# ------------------------------------------------------------------- the palette
def palette():
    with open(SETTINGS, encoding='utf-8') as fh:
        current = json.load(fh)['current']

    p = {k[len('color_'):]: v for k, v in current.items()
         if k.startswith('color_') and isinstance(v, str) and v.startswith('#')}

    # Hard-coded in layout/theme.liquid rather than settable.
    p['on_accent'] = '#FFFFFF'
    p['on_ink'] = '#EEF1F6'
    p['tile_bg'] = current.get('color_tile_bg', '#EFE9DF')

    # Derived in layout/theme.liquid — keep in step with it.
    p['ink_soft'] = color_lighten(p['ink'], 7)
    p['ink_line'] = color_lighten(p['ink'], 16)
    p['accent_soft'] = color_mix(p['accent'], '#ffffff', 8)
    p['accent_tint'] = color_mix(p['accent'], '#ffffff', 14)
    p['accent_ink'] = p['accent_hover']
    return p


# (label, foreground, background, kind)
CHECKS = [
    ('body text on white',                          'text',         'background',     'body'),
    ('body text on page canvas',                    'text',         'page',           'body'),
    ('body text on surface-alt',                    'text',         'surface_alt',    'body'),
    ('body text on surface-sunken',                 'text',         'surface_sunken', 'body'),
    ('body text on tile background',                'text',         'tile_bg',        'body'),
    ('muted text on white',                         'text_muted',   'background',     'body'),
    ('muted text on page canvas',                   'text_muted',   'page',           'body'),
    ('muted text on surface-alt',                   'text_muted',   'surface_alt',    'body'),
    ('muted text on surface-sunken',                'text_muted',   'surface_sunken', 'body'),
    ('muted text on tile background',               'text_muted',   'tile_bg',        'body'),
    ('headings (ink) on white',                     'ink',          'background',     'body'),
    ('headings (ink) on page canvas',               'ink',          'page',           'body'),
    ('link / accent text on white',                 'accent',       'background',     'body'),
    ('link / accent text on page canvas',           'accent',       'page',           'body'),
    ('link hover on white',                         'accent_hover', 'background',     'body'),
    ('primary button label',                        'on_accent',    'accent',         'body'),
    ('primary button label, hover',                 'on_accent',    'accent_hover',   'body'),
    ('dark button label',                           'on_ink',       'ink',            'body'),
    ('dark button label, hover',                    'on_ink',       'ink_soft',       'body'),
    # .btn--quiet, .badge--soft, .price__save, .variant-pill selected, .facet__selected
    ('accent ink on the soft wash',                 'accent_ink',   'accent_soft',    'body'),
    ('accent ink on the tint wash',                 'accent_ink',   'accent_tint',    'body'),
    ('success text on white',                       'success',      'background',     'body'),
    ('danger text on white',                        'danger',       'background',     'body'),
    ('warning text on white',                       'warning',      'background',     'body'),
    ('sale price on white',                         'sale',         'background',     'body'),
    ('sale price on page canvas',                   'sale',         'page',           'body'),
    ('offer badge label on amber',                  None,           'highlight',      'body'),  # literal below
    ('highlight (amber) text on ink',               'highlight',    'ink',            'body'),
    ('focus ring on white',                         'accent',       'background',     'ui'),
    ('focus ring on page canvas',                   'accent',       'page',           'ui'),
    ('focus ring on ink',                           'accent',       'ink',            'ui'),
    ('form control border on white',                'border_strong', 'background',    'ui'),
    ('form control border on page canvas',          'border_strong', 'page',          'ui'),
]

# .badge--offer names its own foreground rather than using a token.
LITERALS = {'offer badge label on amber': '#3D2600'}

NEEDED = {'body': 4.5, 'large': 3.0, 'ui': 3.0}


def main():
    p = palette()
    rows, failures = [], 0

    for label, fg, bg, kind in CHECKS:
        fore = LITERALS[label] if fg is None else p[fg]
        back = p[bg]
        r = ratio(fore, back)
        need = NEEDED[kind]
        rows.append((r / need, label, fore, back, r, need, kind, r >= need))

    rows.sort()
    width = max(len(row[1]) for row in rows)
    print('derived: accent_soft=%s accent_tint=%s accent_ink=%s ink_soft=%s\n'
          % (p['accent_soft'], p['accent_tint'], p['accent_ink'], p['ink_soft']))

    for _, label, fore, back, r, need, kind, ok in rows:
        if not ok:
            failures += 1
        print('%s %-*s  %s on %s  %5.2f:1  (needs %.1f)  [%s]'
              % ('OK  ' if ok else 'FAIL', width, label, fore, back, r, need, kind))

    print('\n%d of %d pairs fall short' % (failures, len(rows)))
    print('Note: decorative card borders and icon plates are excluded on purpose — a border '
          'that carries no information is outside 1.4.11, and a graphic is judged at 3:1.')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
