"""Generates public/backdrop-dark.svg and public/backdrop-light.svg: an open almanac, by daylight and by candlelight. Faint sepia ink on
aged pages (a star chart, moon phases, a compass rose, ruled lines) and an ember ribbon. Deterministic: run
`python3 scripts/backdrop.py public` after changing it, and commit the SVGs."""

import math
import random
import sys

W, H = 1600, 900
GUTTER = 800

PALETTES = {
    "light": {
        "desk": ["#d8cbb6", "#bfae94"],
        "page": "#f3e9d4",
        "edge": "#d9c6a3",
        "ink": "#7a6347",
        "ink_soft": 0.32,
        "ribbon": "#b4532a",
        "glow": None,
    },
    "dark": {
        "desk": ["#16141a", "#0b0a0e"],
        "page": "#2e271e",
        "edge": "#1d1812",
        "ink": "#b49a74",
        "ink_soft": 0.3,
        "ribbon": "#c8643a",
        "glow": "#f0a35e",
    },
}


def ruled(x0, x1, y0, y1, r, opacity):
    """Lines of faded handwriting: each word a scribble of small up-and-down strokes, so it reads as script, not as a placeholder."""
    out = []
    y = y0
    while y < y1:
        x = x0
        while x < x1 - 20:
            w = r.uniform(18, 64)
            if x + w > x1:
                break
            pts = [f"M{x:.0f} {y:.1f}"]
            px = x
            while px < x + w:
                step = r.uniform(3, 5)
                up = r.choice([-5.5, -3.5, -2.5]) if r.random() < 0.25 else -2.5
                pts.append(f"Q{px + step / 2:.1f} {y + up:.1f} {px + step:.1f} {y:.1f}")
                px += step
            o = opacity * r.uniform(0.6, 1)
            out.append(f'<path d="{" ".join(pts)}" fill="none" stroke-width="1.2" stroke-linecap="round" opacity="{o:.2f}"/>')
            x += w + r.uniform(6, 10)
        y += 18
    return "".join(out)


def star_chart(cx, cy, rad, r):
    out = [
        f'<circle cx="{cx}" cy="{cy}" r="{rad}" fill="none" stroke-width="2"/>',
        f'<circle cx="{cx}" cy="{cy}" r="{rad - 14}" fill="none" stroke-width="1"/>',
    ]
    for k in (0.33, 0.66):
        out.append(f'<circle cx="{cx}" cy="{cy}" r="{rad * k:.0f}" fill="none" stroke-width="0.8" stroke-dasharray="3 5"/>')
    for i in range(72):
        a = math.tau * i / 72
        tick = 10 if i % 6 == 0 else 5
        x0, y0 = cx + (rad - 14) * math.cos(a), cy + (rad - 14) * math.sin(a)
        x1, y1 = cx + (rad - 14 + tick) * math.cos(a), cy + (rad - 14 + tick) * math.sin(a)
        out.append(f'<line x1="{x0:.1f}" y1="{y0:.1f}" x2="{x1:.1f}" y2="{y1:.1f}" stroke-width="1"/>')
    for i in range(12):
        a = math.tau * i / 12
        out.append(f'<line x1="{cx}" y1="{cy}" x2="{cx + (rad - 14) * math.cos(a):.1f}" y2="{cy + (rad - 14) * math.sin(a):.1f}" stroke-width="0.5"/>')
    for _ in range(4):  # constellations
        a0, d0 = r.uniform(0, math.tau), r.uniform(0.2, 0.75) * rad
        pts = []
        for _ in range(r.randint(4, 6)):
            pts.append((cx + d0 * math.cos(a0), cy + d0 * math.sin(a0)))
            a0 += r.uniform(-0.35, 0.35)
            d0 = max(20, min(rad - 30, d0 + r.uniform(-30, 30)))
        out.append('<polyline points="' + " ".join(f"{x:.0f},{y:.0f}" for x, y in pts) + '" fill="none" stroke-width="0.8"/>')
        out += [f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r.choice([1.8, 2.4, 3])}" stroke="none" fill="currentColor"/>' for x, y in pts]
    return "".join(out)


def moon_phases(x, y0, n, gap, size):
    """A column of moon phases, new to full: the lit part is a half disc and an ellipse for the terminator."""
    out = []
    for i in range(n):
        cy = y0 + i * gap
        f = i / (n - 1)
        out.append(f'<circle cx="{x}" cy="{cy}" r="{size}" fill="none" stroke-width="1"/>')
        if f == 0:
            continue
        rx = size * abs(1 - 2 * f)
        sweep = 0 if f < 0.5 else 1
        d = f"M{x} {cy - size} A{size} {size} 0 0 1 {x} {cy + size} A{rx:.1f} {size} 0 0 {sweep} {x} {cy - size} Z"
        out.append(f'<path d="{d}" stroke="none" fill="currentColor" opacity="0.55"/>')
    return "".join(out)


def compass(cx, cy, rad):
    out = [
        f'<circle cx="{cx}" cy="{cy}" r="{rad}" fill="none" stroke-width="1.5"/>',
        f'<circle cx="{cx}" cy="{cy}" r="{rad * 0.82:.0f}" fill="none" stroke-width="0.8"/>',
    ]
    for i, length in enumerate([1, 0.55] * 4):
        a = math.tau * i / 8 - math.pi / 2
        tip = (cx + rad * 0.95 * length * math.cos(a), cy + rad * 0.95 * length * math.sin(a))
        side = rad * 0.12
        left = (cx + side * math.cos(a - math.pi / 2), cy + side * math.sin(a - math.pi / 2))
        rr = (cx + side * math.cos(a + math.pi / 2), cy + side * math.sin(a + math.pi / 2))
        d = f"M{left[0]:.1f} {left[1]:.1f} L{tip[0]:.1f} {tip[1]:.1f} L{rr[0]:.1f} {rr[1]:.1f} Z"
        out.append(f'<path d="{d}" fill="currentColor" opacity="{0.5 if i % 2 == 0 else 0.3}"/>')
    n = (cx, cy - rad - 22)
    out.append(f'<path d="M{n[0] - 7} {n[1] + 8} L{n[0] - 7} {n[1] - 8} L{n[0] + 7} {n[1] + 8} L{n[0] + 7} {n[1] - 8}" fill="none" stroke-width="2"/>')
    return "".join(out)


def svg(mode):
    p = PALETTES[mode]
    r = random.Random(11)
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">',
        "<defs>",
        f'<radialGradient id="desk" cx="0.5" cy="0.45" r="0.8"><stop offset="0" stop-color="{p["desk"][0]}"/>'
        f'<stop offset="1" stop-color="{p["desk"][1]}"/></radialGradient>',
        f'<radialGradient id="page" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stop-color="{p["page"]}"/>'
        f'<stop offset="1" stop-color="{p["edge"]}"/></radialGradient>',
        '<linearGradient id="gutter" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0"/>'
        '<stop offset="0.5" stop-color="#000" stop-opacity="0.28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>',
    ]
    if p["glow"]:
        out.append(
            f'<radialGradient id="glow" cx="0.68" cy="0.4" r="0.6"><stop offset="0" stop-color="{p["glow"]}" stop-opacity="0.16"/>'
            f'<stop offset="1" stop-color="{p["glow"]}" stop-opacity="0"/></radialGradient>'
        )
    out += ["</defs>", f'<rect width="{W}" height="{H}" fill="url(#desk)"/>']
    # The page stack under the pages, then the two pages, curving down to the gutter.
    for i in range(5, 0, -1):
        left, right, dy = 40 - i * 3, W - 40 + i * 3, i * 4
        top = f"M{left} {50 + dy} Q{GUTTER / 2} {30 + dy} {GUTTER} {64 + dy} Q{GUTTER * 1.5} {30 + dy} {right} {50 + dy}"
        bottom = f"L{right} {H - 30 + dy} Q{GUTTER * 1.5} {H - 50 + dy} {GUTTER} {H - 18 + dy} Q{GUTTER / 2} {H - 50 + dy} {left} {H - 30 + dy} Z"
        out.append(f'<path d="{top} {bottom}" fill="{p["edge"]}" opacity="0.6"/>')
    out.append(f'<path d="M40 50 Q{GUTTER / 2} 30 {GUTTER} 64 L{GUTTER} {H - 18} Q{GUTTER / 2} {H - 50} 40 {H - 30} Z" fill="url(#page)"/>')
    out.append(f'<path d="M{GUTTER} 64 Q{GUTTER * 1.5} 30 {W - 40} 50 L{W - 40} {H - 30} Q{GUTTER * 1.5} {H - 50} {GUTTER} {H - 18} Z" fill="url(#page)"/>')
    out.append(f'<rect x="{GUTTER - 70}" y="40" width="140" height="{H - 40}" fill="url(#gutter)"/>')
    # The ink.
    ink = f'<g color="{p["ink"]}" stroke="{p["ink"]}" fill="{p["ink"]}" opacity="{p["ink_soft"] * 2:.2f}">'
    out.append(ink)
    out.append(f'<g fill="none">{star_chart(380, 380, 210, r)}</g>')
    out.append(ruled(150, 640, 640, 820, r, 0.7))
    out.append(ruled(960, 1130, 150, 820, r, 0.7))
    out.append(moon_phases(900, 160, 9, 72, 17))
    out.append(f'<g fill="none">{compass(1330, 660, 105)}</g>')
    out.append(ruled(1240, 1500, 150, 470, r, 0.7))
    out.append("</g>")
    # The ribbon, over the right page.
    rb = p["ribbon"]
    out.append(f'<path d="M1160 40 L1196 40 L1196 760 L1178 742 L1160 760 Z" fill="{rb}" opacity="0.9"/>')
    out.append('<path d="M1160 40 L1196 40 L1196 760 L1178 742 L1160 760 Z" fill="url(#gutter)" opacity="0.4"/>')
    if p["glow"]:
        out.append(f'<rect width="{W}" height="{H}" fill="url(#glow)"/>')
    out.append("</svg>")
    return "\n".join(o for o in out if o) + "\n"


for name in PALETTES:
    with open(f"{sys.argv[1]}/backdrop-{name}.svg", "w") as f:
        f.write(svg(name))
