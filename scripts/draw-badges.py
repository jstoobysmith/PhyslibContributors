"""Draws the four section badges as Feynman diagrams, echoing the Physlib logo.

    python3 scripts/draw-badges.py   # writes public/badges/<section>.svg
"""
import json, math, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
INK, ACCENT, PAPER = "#01010d", "#007bac", "#ffffff"
MONO = "Menlo, Consolas, 'Courier New', monospace"


def wave(x1, y1, x2, y2, periods=5, amp=9):
    """A photon line: a sine wave between two points."""
    n = 120
    dx, dy = x2 - x1, y2 - y1
    length = math.hypot(dx, dy)
    ux, uy = dx / length, dy / length
    nx, ny = -uy, ux
    pts = []
    for i in range(n + 1):
        t = i / n
        o = amp * math.sin(2 * math.pi * periods * t)
        pts.append((x1 + dx * t + nx * o, y1 + dy * t + ny * o))
    return f'<path d="M{" L".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" fill="none" stroke="{ACCENT}" stroke-width="4" stroke-linecap="round"/>'


def wave_arc(cx, cy, r, a0, a1, periods=6, amp=8):
    """A photon line along a circular arc (for loops)."""
    n = 160
    pts = []
    for i in range(n + 1):
        t = i / n
        a = a0 + (a1 - a0) * t
        rr = r + amp * math.sin(2 * math.pi * periods * t)
        pts.append((cx + rr * math.cos(a), cy - rr * math.sin(a)))
    return f'<path d="M{" L".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" fill="none" stroke="{ACCENT}" stroke-width="4" stroke-linecap="round"/>'


def fermion(x1, y1, x2, y2):
    """A fermion line with an arrow at its midpoint."""
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    a = math.atan2(y2 - y1, x2 - x1)
    s = 11
    tip = (mx + s * math.cos(a), my + s * math.sin(a))
    l = (mx - s * math.cos(a) + s * 0.8 * math.sin(a), my - s * math.sin(a) - s * 0.8 * math.cos(a))
    r = (mx - s * math.cos(a) - s * 0.8 * math.sin(a), my - s * math.sin(a) + s * 0.8 * math.cos(a))
    return (
        f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>'
        f'<path d="M{tip[0]:.1f},{tip[1]:.1f} L{l[0]:.1f},{l[1]:.1f} L{r[0]:.1f},{r[1]:.1f} Z" fill="{INK}"/>'
    )


def dot(x, y):
    return f'<circle cx="{x}" cy="{y}" r="5" fill="{INK}"/>'


DIAGRAMS = {
    # A second look: the self-energy loop.
    "review": lambda: fermion(110, 230, 160, 230) + fermion(160, 230, 240, 230) + fermion(240, 230, 290, 230)
    + wave_arc(200, 230, 40, 0, math.pi) + dot(160, 230) + dot(240, 230),
    # Scaffolding that keeps everything standing: a ladder.
    "maintenance": lambda: fermion(110, 165, 290, 165) + fermion(110, 245, 290, 245)
    + wave(165, 165, 165, 245, periods=3, amp=8) + wave(235, 165, 235, 245, periods=3, amp=8)
    + dot(165, 165) + dot(165, 245) + dot(235, 165) + dot(235, 245),
    # The same pieces, rearranged: s-channel exchange.
    "refactoring": lambda: fermion(110, 160, 160, 205) + fermion(160, 205, 110, 250)
    + wave(160, 205, 240, 205, periods=4) + fermion(240, 205, 290, 160) + fermion(290, 250, 240, 205)
    + dot(160, 205) + dot(240, 205),
    # The fundamental vertex everything else is built from.
    "foundations": lambda: fermion(110, 245, 200, 245) + fermion(290, 165, 200, 245)
    + wave(200, 245, 290, 245, periods=4) + dot(200, 245),
}


def badge(section):
    sid, numeral, name = section["id"], section["numeral"], section["name"]
    bottom = f"SECTION {numeral} · {name.upper()}"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400" role="img" aria-label="{section["reportName"]}">
  <title>{section["reportName"]}</title>
  <defs>
    <path id="top" d="M 62,200 A 138,138 0 0 1 338,200"/>
    <path id="bottom" d="M 52,200 A 148,148 0 0 0 348,200"/>
  </defs>
  <circle cx="200" cy="200" r="194" fill="{PAPER}" stroke="{INK}" stroke-width="4"/>
  <circle cx="200" cy="200" r="176" fill="none" stroke="{ACCENT}" stroke-width="1.5"/>
  <circle cx="200" cy="200" r="118" fill="none" stroke="{INK}" stroke-opacity="0.12" stroke-width="1.5"/>
  <text font-family="{MONO}" font-size="17" font-weight="600" letter-spacing="4" fill="{INK}" text-anchor="middle">
    <textPath href="#top" startOffset="50%">PHYSLIB · CONTRIBUTIONS</textPath>
  </text>
  <text font-family="{MONO}" font-size="15" font-weight="500" letter-spacing="3" fill="{ACCENT}" text-anchor="middle">
    <textPath href="#bottom" startOffset="50%">{bottom}</textPath>
  </text>
  <text x="200" y="128" font-family="Georgia, 'Times New Roman', serif" font-size="30" font-style="italic" fill="{INK}" text-anchor="middle">{numeral}</text>
  <g>{DIAGRAMS[sid]()}</g>
  <circle cx="44" cy="200" r="3.5" fill="{INK}"/>
  <circle cx="356" cy="200" r="3.5" fill="{INK}"/>
</svg>
'''


sections = json.loads((ROOT / "config" / "sections.json").read_text())
out = ROOT / "public" / "badges"
out.mkdir(parents=True, exist_ok=True)
for s in sections:
    (out / f"{s['id']}.svg").write_text(badge(s))
    print("wrote", out / f"{s['id']}.svg")
