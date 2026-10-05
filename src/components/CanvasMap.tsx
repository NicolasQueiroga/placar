import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { RaceData, UFProgress } from '../types';
import { partyColor } from '../tse';

/**
 * Canvas map engine — 5,570 municipalities, hand-rendered.
 *
 * Passive reading (their philosophy, ours too):
 *   fill      = winning party color, tone = margin of victory
 *   hover     = tooltip: mun name, both candidates, votes
 *   click     = zoom to municipality; click ocean/again = zoom out
 *   wheel     = zoom; drag = pan
 * Data: public/mun-results.json (static 1st round) merged with live
 * UF-level results for the current race.
 */

/* ---------- topojson decode (no dependency — arcs are quantized deltas) ---------- */

interface TopoGeometry {
  type: 'Polygon' | 'MultiPolygon';
  arcs: number[][] | number[][][];
  properties: { id: string; n: string; uf: string; p?: number };
}
interface Topo {
  type: 'Topology';
  arcs: number[][][];
  transform: { scale: [number, number]; translate: [number, number] };
  objects: { municipios: { type: 'GeometryCollection'; geometries: TopoGeometry[] } };
}

interface MunShape {
  id: string;
  name: string;
  uf: string;
  path: Path2D;
  box: [number, number, number, number]; // x0,y0,x1,y1
  cx: number;
  cy: number;
}

function decodeTopo(topo: Topo): { muns: MunShape[]; box: [number, number, number, number]; borders: Path2D } {
  const { arcs, transform } = topo;
  const [sx, sy] = transform.scale;
  const [tx, ty] = transform.translate;

  // decode all arcs to absolute points.
  // topo y is NORTHING (grows up — RR~10.4M, RS~6.5M); canvas y grows down.
  // Flip: y' = -y, then the bbox fit centers everything. North ends up on top.
  const points: number[][][] = arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map((d) => {
      x += d[0];
      y += d[1];
      return [x * sx + tx, -(y * sy + ty)];
    });
  });

  const ring = (arcIdxs: number[]): [number, number][] => {
    const abs: [number, number][] = [];
    for (const i of arcIdxs) {
      const a = i < 0 ? points[~i].slice().reverse() : points[i];
      // skip duplicated joint point
      for (let k = abs.length > 0 ? 1 : 0; k < a.length; k++) abs.push(a[k] as [number, number]);
    }
    return abs;
  };

  const muns: MunShape[] = [];
  let bx0 = Infinity;
  let by0 = Infinity;
  let bx1 = -Infinity;
  let by1 = -Infinity;

  for (const g of topo.objects.municipios.geometries) {
    const polys = g.type === 'Polygon' ? [g.arcs as number[][]] : (g.arcs as number[][][]);
    const path = new Path2D();
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of polys) {
      for (const r of p) {
        const pts = ring(r);
        if (pts.length < 3) continue;
        path.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) path.lineTo(pts[k][0], pts[k][1]);
        path.closePath();
        for (const [px, py] of pts) {
          if (px < x0) x0 = px;
          if (py < y0) y0 = py;
          if (px > x1) x1 = px;
          if (py > y1) y1 = py;
        }
      }
    }
    muns.push({
      id: g.properties.id,
      name: g.properties.n,
      uf: g.properties.uf,
      path,
      box: [x0, y0, x1, y1],
      cx: (x0 + x1) / 2,
      cy: (y0 + y1) / 2,
    });
    bx0 = Math.min(bx0, x0);
    by0 = Math.min(by0, y0);
    bx1 = Math.max(bx1, x1);
    by1 = Math.max(by1, y1);
  }
  // single combined path for all borders — one stroke call instead of 5,570
  const borders = new Path2D();
  for (const m of muns) borders.addPath(m.path);
  return { muns, box: [bx0, by0, bx1, by1], borders };
}

/* ---------- color: party color × margin tone ---------- */

// 4-step tone ramp from panel-dark to party color, by margin quartile
const TONES = [0.28, 0.46, 0.66, 0.92];

function hexToRgb(h: string): [number, number, number] {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const BG = hexToRgb('#100e09');

function tone(color: string, t: number): string {
  const [r, g, b] = hexToRgb(color);
  const mix = (c: number) => Math.round(BG[0] + (c - BG[0]) * t);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function marginTone(color: string, margin: number): string {
  // margin in percentage points: <5 tight, 5-15 solid, 15-30 strong, >30 landslide
  const i = margin < 5 ? 0 : margin < 15 ? 1 : margin < 30 ? 2 : 3;
  return tone(color, TONES[i]);
}

/* ---------- results loading ---------- */

interface MunResult {
  a: string;
  pa: number;
  va: number;
  b: string;
  pb: number;
  vb: number;
}
let munResults: Record<string, MunResult> | null = null;
async function ensureResults(): Promise<Record<string, MunResult>> {
  if (munResults) return munResults;
  const r = await fetch('/mun-results.json');
  munResults = (await r.json()) as Record<string, MunResult>;
  return munResults;
}

interface Geo {
  muns: MunShape[];
  box: [number, number, number, number];
  borders: Path2D;
}
let topoCache: Geo | null = null;
async function ensureGeo() {
  if (topoCache) return topoCache;
  const r = await fetch('/br-municipios.topo.json');
  const topo = (await r.json()) as Topo;
  topoCache = decodeTopo(topo);
  return topoCache;
}

/* ---------- component ---------- */

interface View {
  ox: number;
  oy: number;
  k: number;
}

export const CanvasMap = memo(function CanvasMap({
  ufProgress,
  ufResults,
  mode = 'presidente',
}: {
  ufProgress: Map<string, UFProgress>;
  ufResults: Map<string, RaceData>;
  /** 'presidente' = mun-level static data; otherwise UF-level live colors */
  mode?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [hover, setHover] = useState<{ mun: MunShape; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const view = useRef<View>({ ox: 0, oy: 0, k: 1 });
  const target = useRef<View>({ ox: 0, oy: 0, k: 1 });
  const rafRef = useRef<number>(0);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const hoverRef = useRef<{ id: string } | null>(null);

  // load geo + results once
  const geo = useRef<Geo | null>(null);
  const results = useRef<Record<string, MunResult> | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([ensureGeo(), ensureResults()]).then(([g, r]) => {
      if (!alive) return;
      geo.current = g;
      results.current = r;
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // spatial grid for hit-testing — CELL in GEO METERS (~25km cells ≈ topo units)
  // bbox is ~4.6M × 4.3M meters → ~185×175 cells total. Small map, instant lookups.
  const grid = useMemo(() => {
    if (!geo.current) return null;
    const CELL = 25000;
    const map = new Map<number, MunShape[]>();
    for (const m of geo.current.muns) {
      const [x0, y0, x1, y1] = m.box;
      for (let gy = Math.floor(y0 / CELL); gy <= Math.floor(y1 / CELL); gy++) {
        for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) {
          const key = gy * 100000 + gx;
          let arr = map.get(key);
          if (!arr) map.set(key, (arr = []));
          arr.push(m);
        }
      }
    }
    return { map, CELL };
  }, [loaded]);

  // offscreen base: colored map rendered ONCE per data change in geo coords.
  // Main loop just blits it — 5,570 fills happen once, not every frame.
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const renderBase = () => {
    if (!geo.current || !results.current) return;
    const [x0, y0, x1, y1] = geo.current.box;
    const gw = x1 - x0;
    const gh = y1 - y0;
    // target ~2400px on the long side — crisp to ~4x zoom, ~23MB RGBA, safe on mobile
    const RES = 2400 / Math.max(gw, gh);
    const w = Math.ceil(gw * RES);
    const h = Math.ceil(gh * RES);
    let c = baseRef.current;
    if (!c) {
      c = document.createElement('canvas');
      baseRef.current = c;
    }
    c.width = w;
    c.height = h;
    const bctx = c.getContext('2d')!;
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, w, h);
    bctx.setTransform(RES, 0, 0, RES, -x0 * RES, -y0 * RES);

    const res = results.current;
    const ufLeader = new Map<string, { color: string; margin: number }>();
    if (mode !== 'presidente') {
      for (const [uf, r] of ufResults) {
        const a = r.candidates[0];
        const b = r.candidates[1];
        if (!a) continue;
        ufLeader.set(uf, {
          color: partyColor(a.party, a.coalition),
          margin: b ? Math.abs(a.percent - b.percent) : 30,
        });
      }
    }

    // two passes: fills grouped by color (minimize state changes), then borders once
    const byColor = new Map<string, Path2D>();
    for (const m of geo.current.muns) {
      let fill = '#221f18';
      if (mode === 'presidente') {
        const r = res[m.id];
        if (r) fill = marginTone(partyColorByName(r.a), Math.abs(r.pa - r.pb));
      } else {
        const l = ufLeader.get(m.uf);
        if (l) fill = marginTone(l.color, l.margin);
      }
      let p = byColor.get(fill);
      if (!p) byColor.set(fill, (p = new Path2D()));
      p.addPath(m.path);
    }
    for (const [color, p] of byColor) {
      bctx.fillStyle = color;
      bctx.fill(p);
    }
    bctx.strokeStyle = 'rgba(15,14,13,.55)';
    bctx.lineWidth = 2000; // geo meters ≈ 1px at base resolution
    bctx.stroke(geo.current.borders);
  };

  // fit view to container
  const fit = () => {
    const wrap = wrapRef.current;
    if (!wrap || !geo.current) return;
    const [x0, y0, x1, y1] = geo.current.box;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight || 460;
    const k = Math.min(W / (x1 - x0), H / (y1 - y0)) * 0.96;
    target.current = { k, ox: (W - (x1 - x0) * k) / 2 - x0 * k, oy: (H - (y1 - y0) * k) / 2 - y0 * k };
  };

  // main draw
  const draw = () => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !geo.current || !results.current) return;
    const dpr = window.devicePixelRatio || 1;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight || 460;
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // smooth view interpolation
    const v = view.current;
    const t = target.current;
    v.k += (t.k - v.k) * 0.18;
    v.ox += (t.ox - v.ox) * 0.18;
    v.oy += (t.oy - v.oy) * 0.18;
    const still = Math.abs(t.k - v.k) < 0.001 && Math.abs(t.ox - v.ox) < 0.5 && Math.abs(t.oy - v.oy) < 0.5;
    if (still) {
      v.k = t.k;
      v.ox = t.ox;
      v.oy = t.oy;
    }

    ctx.save();
    ctx.translate(v.ox, v.oy);
    ctx.scale(v.k, v.k);

    // blit the pre-rendered base — one drawImage instead of 5,570 fills
    if (baseRef.current) {
      const [x0, y0, x1, y1] = geo.current!.box;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(baseRef.current, x0, y0, x1 - x0, y1 - y0);
    }

    // overlays: at most 2 shapes — hover + selected
    const selMun = selected ? geo.current!.muns.find((m) => m.id === selected) : null;
    if (selMun) {
      ctx.save();
      ctx.shadowColor = 'rgba(250,250,249,.5)';
      ctx.shadowBlur = 10 / v.k;
      ctx.strokeStyle = '#FAFAF9';
      ctx.lineWidth = 2 / v.k;
      ctx.stroke(selMun.path);
      ctx.restore();
    }
    if (hover && hover.mun.id !== selected) {
      ctx.strokeStyle = 'rgba(250,250,249,.7)';
      ctx.lineWidth = 1.4 / v.k;
      ctx.stroke(hover.mun.path);
    }

    ctx.restore();

    if (!still) schedule();
  };

  // single-flight scheduler — never stack rAF chains
  const schedule = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  };

  // base render on data change (expensive path runs ONCE)
  useEffect(() => {
    if (!loaded) return;
    renderBase();
    fit();
    view.current = { ...target.current };
    schedule();
    return () => cancelAnimationFrame(rafRef.current);
  }, [loaded, selected, ufProgress, ufResults, mode]);

  useEffect(() => {
    const onResize = () => {
      if (!loaded) return;
      fit();
      schedule();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [loaded]);

  /* ---------- interaction ---------- */

  const toGeo = (clientX: number, clientY: number): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const v = view.current;
    return [(clientX - rect.left - v.ox) / v.k, (clientY - rect.top - v.oy) / v.k];
  };

  const hitTest = (clientX: number, clientY: number): MunShape | null => {
    if (!grid || !geo.current) return null;
    const [gx, gy] = toGeo(clientX, clientY);
    const key = Math.floor(gy / grid.CELL) * 100000 + Math.floor(gx / grid.CELL);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return null;
    for (const m of grid.map.get(key) ?? []) {
      if (gx >= m.box[0] && gx <= m.box[2] && gy >= m.box[1] && gy <= m.box[3]) {
        if (ctx.isPointInPath(m.path, gx, gy)) return m;
      }
    }
    return null;
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (dragRef.current) {
      const d = dragRef.current;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      target.current = {
        ...target.current,
        ox: target.current.ox + dx,
        oy: target.current.oy + dy,
      };
      d.x = e.clientX;
      d.y = e.clientY;
      schedule();
      return;
    }
    const m = hitTest(e.clientX, e.clientY);
    const prev = hoverRef.current;
    if (m?.id !== prev?.id) {
      hoverRef.current = m ? { id: m.id } : null;
      setHover(m ? { mun: m, x: e.clientX, y: e.clientY } : null); // full update only on mun change
    } else if (m && prev) {
      // same mun — just move the tooltip, no canvas redraw needed
      setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h));
    }
  };

  // hover overlay redraw — cheap blit + ≤2 strokes, scheduled at most once per frame
  useEffect(() => {
    if (!loaded) return;
    cancelAnimationFrame(rafRef.current);
    schedule();
  }, [hover]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const t = target.current;
    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    const k2 = Math.min(400, Math.max(0.5, t.k * factor));
    target.current = { k: k2, ox: mx - ((mx - t.ox) / t.k) * k2, oy: my - ((my - t.oy) / t.k) * k2 };
    schedule();
  };

  const onClick = (e: React.MouseEvent) => {
    if (dragRef.current?.moved) return;
    const m = hitTest(e.clientX, e.clientY);
    if (!m || m.id === selected) {
      setSelected(null);
      fit();
    } else {
      setSelected(m.id);
      zoomTo(m);
    }
    schedule();
  };

  const zoomTo = (m: MunShape) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight || 460;
    const [x0, y0, x1, y1] = m.box;
    const k = Math.min(W, H) / Math.max(x1 - x0, y1 - y0) * 0.5;
    target.current = { k, ox: W / 2 - m.cx * k, oy: H / 2 - m.cy * k };
  };

  // tooltip content
  const tip = useMemo(() => {
    if (!hover) return null;
    if (mode !== 'presidente') {
      const r = ufResults.get(hover.mun.uf);
      const a = r?.candidates[0];
      const b = r?.candidates[1];
      return {
        name: hover.mun.name,
        uf: hover.mun.uf,
        body: a
          ? `${a.ballotName} ${a.percent.toFixed(1).replace('.', ',')}%${b ? ` · ${b.ballotName} ${b.percent.toFixed(1).replace('.', ',')}%` : ''} (${hover.mun.uf})`
          : 'sem dados',
      };
    }
    if (!results.current) return null;
    const r = results.current[hover.mun.id];
    if (!r) return { name: hover.mun.name, uf: hover.mun.uf, body: 'sem dados' };
    return {
      name: hover.mun.name,
      uf: hover.mun.uf,
      body: `${r.a} ${r.pa.toFixed(1).replace('.', ',')}% · ${r.b} ${r.pb.toFixed(1).replace('.', ',')}%`,
    };
  }, [hover, mode, ufResults]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 460, cursor: hover ? 'pointer' : 'grab' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
        onMouseMove={onMouseMove}
        onMouseDown={(e) => {
          dragRef.current = { x: e.clientX, y: e.clientY, moved: false };
        }}
        onMouseUp={() => {
          setTimeout(() => (dragRef.current = null), 0);
        }}
        onMouseLeave={() => {
          dragRef.current = null;
          setHover(null);
        }}
        onWheel={onWheel}
        onClick={onClick}
      />
      {tip && hover && (
        <div
          style={{
            position: 'fixed',
            left: hover.x + 14,
            top: hover.y + 14,
            background: '#1c1913',
            border: '1px solid var(--line)',
            borderRadius: 4,
            padding: '8px 12px',
            pointerEvents: 'none',
            zIndex: 20,
            maxWidth: 280,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13 }}>
            {tip.name} <span className="num" style={{ color: 'var(--text-faint)', fontWeight: 400 }}>· {tip.uf}</span>
          </div>
          <div className="num" style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 3 }}>
            {tip.body}
          </div>
        </div>
      )}
      {!loaded && (
        <div
          className="num"
          style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 12, color: 'var(--text-faint)' }}
        >
          carregando mapa…
        </div>
      )}
    </div>
  );
});

/* party color by ballot name for the static mun dataset */
const NAME_COLOR: Record<string, string> = {};
export function registerMunPartyColors(pairs: [string, string][]) {
  for (const [name, color] of pairs) NAME_COLOR[name.toUpperCase()] = color;
}
function partyColorByName(ballotName: string): string {
  const n = ballotName.toUpperCase();
  if (NAME_COLOR[n]) return NAME_COLOR[n];
  // fall back to the shared palette via party guess (PL=Flávio, PT=Lula in 2026 runoff)
  if (n.includes('LULA')) return partyColor('PT', 'PT');
  if (n.includes('BOLSONARO') || n.includes('FLAVIO')) return partyColor('PL', 'PL');
  return '#8a8175';
}
