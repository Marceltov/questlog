"""Generates public/backdrop-dark.svg and public/backdrop-light.svg: an original town and mountains, at night and at dawn, of no game in
particular. Deterministic: run `python3 scripts/backdrop.py public` after changing it, and commit the SVGs."""

import random
import sys

W, H = 1600, 900


def ridge(seed, base, amp, step, rough):
    r = random.Random(seed)
    pts = []
    y = base
    for x in range(-20, W + 40, step):
        y += r.uniform(-rough, rough)
        y = max(base - amp, min(base + amp * 0.4, y))
        pts.append((x, y))
    d = f"M-20 {H} " + " ".join(f"L{x:.0f} {y:.0f}" for x, y in pts) + f" L{W + 40} {H} Z"
    return d


def town(seed, base):
    r = random.Random(seed)
    x = 380
    parts = [f"M{x} {H}", f"L{x} {base}"]
    windows = []
    while x < 1240:
        w = r.choice([18, 24, 30, 40, 52])
        h = r.randint(30, 110)
        kind = r.random()
        top = base - h
        if kind < 0.18:  # spire
            parts += [f"L{x} {top}", f"L{x + w / 2:.0f} {top - r.randint(70, 150)}", f"L{x + w} {top}"]
        elif kind < 0.36:  # gabled roof
            parts += [f"L{x} {top}", f"L{x + w / 2:.0f} {top - w * 0.7:.0f}", f"L{x + w} {top}"]
        elif kind < 0.46:  # dome
            parts += [f"L{x} {top}", f"A{w / 2} {w / 2} 0 0 1 {x + w} {top}"]
        else:  # crenellated tower
            parts.append(f"L{x} {top}")
            c = w / 4
            for i in range(4):
                parts += [f"L{x + i * c:.0f} {top - (6 if i % 2 == 0 else 0)}", f"L{x + (i + 1) * c:.0f} {top - (6 if i % 2 == 0 else 0)}"]
            parts.append(f"L{x + w} {top}")
        for _ in range(r.randint(0, 2)):
            windows.append((x + r.uniform(4, w - 6), r.uniform(top + 12, base - 8)))
        x += w
        parts.append(f"L{x} {base - r.randint(0, 20)}")
    parts += [f"L{x} {H}", "Z"]
    return " ".join(parts), windows


def svg(night):
    if night:
        sky = [("0", "#0b0d14"), ("0.5", "#1b1a28"), ("0.78", "#3d2820"), ("1", "#5c331f")]
        layers = ["#2a2838", "#201e2c", "#16151f", "#0b0b11"]
        moon = "#e9dfc8"
        win = "#f0955a"
        mist = "#2a2230"
        stars = True
    else:
        sky = [("0", "#e6dccb"), ("0.5", "#efe2cc"), ("0.82", "#f3d6b4"), ("1", "#f0c39a")]
        layers = ["#cfc3b3", "#b9ab9b", "#a19282", "#8a7c6f"]
        moon = "#fff6e6"
        win = "#b4532a"
        mist = "#f6f2ea"
        stars = False
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMax slice">',
        "<defs>",
        '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">' + "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in sky) + "</linearGradient>",
        f'<radialGradient id="glow"><stop offset="0" stop-color="{moon}" stop-opacity="0.35"/>'
        f'<stop offset="1" stop-color="{moon}" stop-opacity="0"/></radialGradient>',
        f'<linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{mist}" stop-opacity="0"/>'
        f'<stop offset="0.5" stop-color="{mist}" stop-opacity="{0.55 if night else 0.6}"/>'
        f'<stop offset="1" stop-color="{mist}" stop-opacity="0"/></linearGradient>',
        "</defs>",
        f'<rect width="{W}" height="{H}" fill="url(#sky)"/>',
    ]
    if stars:
        r = random.Random(7)
        out.append(
            '<g fill="#e9dfc8">'
            + "".join(
                f'<circle cx="{r.uniform(0, W):.0f}" cy="{r.uniform(0, H * 0.5):.0f}" r="{r.choice([0.6, 0.8, 1, 1.3])}" opacity="{r.uniform(0.25, 0.8):.2f}"/>'
                for _ in range(140)
            )
            + "</g>"
        )
    out += ['<circle cx="1180" cy="210" r="180" fill="url(#glow)"/>', f'<circle cx="1180" cy="210" r="46" fill="{moon}" opacity="{0.92 if night else 0.8}"/>']
    out.append(f'<path d="{ridge(1, 560, 120, 40, 28)}" fill="{layers[0]}"/>')
    out.append(f'<path d="{ridge(2, 640, 90, 30, 22)}" fill="{layers[1]}"/>')
    out.append(f'<rect x="0" y="560" width="{W}" height="200" fill="url(#mist)"/>')
    t, windows = town(3, 700)
    # The town stands on a hill, so its first and last walls end in the slope, not in a straight edge.
    out.append(f'<ellipse cx="820" cy="760" rx="560" ry="90" fill="{layers[2]}"/>')
    out.append(f'<path d="{t}" fill="{layers[2]}"/>')
    out.append(
        f'<g fill="{win}">' + "".join(f'<rect x="{x:.0f}" y="{y:.0f}" width="3" height="5" opacity="{0.9 if night else 0.5}"/>' for x, y in windows) + "</g>"
    )
    out.append(f'<path d="{ridge(4, 790, 50, 50, 18)}" fill="{layers[3]}"/>')
    out.append("</svg>")
    return "\n".join(out) + "\n"


for name, night in [("dark", True), ("light", False)]:
    with open(f"{sys.argv[1]}/backdrop-{name}.svg", "w") as f:
        f.write(svg(night))
