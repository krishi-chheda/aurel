"use client";

// Health map: the user's records as a 3D sphere drawn on a 2D canvas (no 3D library). Ported from the ClinicalBrief
// knowledge-graph "scope" and restyled for Aurel. Items spread evenly over a sphere around "you", grouped by type;
// drag to rotate (with momentum), scroll to zoom, hover to light a node and its links, click for details.
// "Tour" turns to face each type in turn. Motion: the sphere expands out of the centre on entry and turns slowly
// while idle; under prefers-reduced-motion there is no auto-rotation or entrance and the tour jumps.
// The frame loop runs on gsap.ticker (pauses with the tab).
import { colors, darkColors, type GraphEdge, type GraphNode } from "@aurel/shared";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { gsap } from "@/lib/motion";

type GraphType = { type: string; plural: string };

// Type hues sit alongside the brand palette; biomarkers take their reference-range status colour instead.
const HUES = {
  light: { Patient: colors.primary, Category: colors.inkSubtle, Biomarker: colors.success, Report: colors.info, Plan: colors.accent,
    Goal: "#6D5BD0", Action: "#2F7F8F", Appointment: "#B5487A", warn: colors.warning, link: "#5B676D", chip: "255,255,255", text: "31,39,43" },
  dark: { Patient: darkColors.primary, Category: darkColors.inkSubtle, Biomarker: darkColors.success, Report: darkColors.info, Plan: darkColors.accent,
    Goal: "#A99BF0", Action: "#6FC3D1", Appointment: "#E58FB5", warn: darkColors.warning, link: "#B2BEC5", chip: "22,29,33", text: "236,241,244" },
} as const;
type Pal = (typeof HUES)["light"] | (typeof HUES)["dark"];
const hueOf = (n: { type: string; status?: string }, pal: Pal) =>
  n.type === "Biomarker" && (n.status === "above" || n.status === "below") ? pal.warn
    : (pal as Record<string, string>)[n.type] ?? pal.Category;
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, a)})`;
};
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };
const norm = (v: number[]) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const easeOut = gsap.parseEase("power2.out");

// Point i of n spread evenly over the sphere (Fibonacci spiral); items are ordered by type, so each type gets a band.
function fib(i: number, n: number) {
  const y = n === 1 ? 0 : 0.92 - (1.84 * i) / (n - 1), r = Math.sqrt(1 - y * y), a = i * 2.39996;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

type P3 = { id: string; v: number[]; node: GraphNode; delay: number };
type Proj = { x: number; y: number; z: number; s: number };
// Below this map width the layout goes compact: legend becomes a swipeable row, labels appear on tap only.
const COMPACT_W = 560;
const shorten = (s: string, max = 30) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export function KnowledgeGraph({ nodes, edges, types, selectedId, onSelect, title = "Health map", preview = false, height = "h-[520px] sm:h-[460px]" }: {
  nodes: GraphNode[]; edges: GraphEdge[]; types: GraphType[]; selectedId: string | null;
  onSelect: (n: GraphNode) => void; title?: string; height?: string;
  /** Small, non-interactive thumbnail: no legend, footer or input; only "you" is labelled. */
  preview?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [caption, setCaption] = useState("");
  const [touring, setTouring] = useState(false);
  const [dark, setDark] = useState(false);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [compact, setCompact] = useState(false);
  // Everything the frame loop reads lives in one mutable ref (no React render per frame).
  const st = useRef({
    yaw: 0.4, pitch: -0.25, vYaw: 0, vPitch: 0, zoom: 1, expand: 0, idleAt: 0, hover: null as string | null,
    focusType: null as string | null, drag: null as null | { x: number; y: number; moved: number },
    pts: [] as P3[], byId: new Map<string, P3>(), centre: "", edges: [] as GraphEdge[],
    proj: new Map<string, Proj>(), hl: new Map<string, number>(), dark: false, compact: false,
    selectedId: null as string | null, reduce: false, tour: null as gsap.core.Timeline | null,
  });
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; });

  const visible = nodes.filter((n) => n.type === "Patient" || !hidden[n.type]);
  const visibleIds = new Set(visible.map((n) => n.id));
  const visibleEdges = edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
  const present = types.filter((t) => t.type !== "Patient" && visible.some((n) => n.type === t.type));
  const count = (t: string) => nodes.filter((n) => n.type === t).length;

  // Follow the OS light/dark setting live (Aurel themes via prefers-color-scheme).
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => { setDark(mq.matches); st.current.dark = mq.matches; };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Positions: "you" at the centre, items over the sphere grouped by type.
  const key = visible.map((n) => n.id).join("|");
  useEffect(() => {
    const s = st.current;
    const rank = (t: string) => types.findIndex((x) => x.type === t);
    const items = visible.filter((n) => n.type !== "Patient").sort((a, b) => rank(a.type) - rank(b.type) || a.id.localeCompare(b.id));
    s.pts = [
      ...visible.filter((n) => n.type === "Patient").map((n) => ({ id: n.id, v: [0, 0, 0], node: n, delay: 0 })),
      ...items.map((n, i) => ({ id: n.id, v: fib(i, items.length).map((c) => c * (0.86 + hash(n.id) * 0.14)), node: n, delay: hash(n.id + "d") })),
    ];
    s.byId = new Map(s.pts.map((p) => [p.id, p]));
    s.centre = visible.find((n) => n.type === "Patient")?.id ?? "";
    s.edges = visibleEdges;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, edges, types]);

  useEffect(() => { st.current.selectedId = selectedId; }, [selectedId]);

  // Entrance: the sphere expands out of the centre.
  useEffect(() => {
    const s = st.current;
    s.reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (s.reduce) { s.expand = 1; return; }
    s.expand = 0;
    const tw = gsap.to(s, { expand: 1, duration: 1.3, ease: "power3.out", delay: 0.15 });
    return () => { tw.kill(); };
  }, []);

  const stopTour = () => {
    const s = st.current;
    s.tour?.kill(); s.tour = null; s.focusType = null; setCaption(""); setTouring(false);
  };
  const stopTourRef = useRef(stopTour);
  useEffect(() => { stopTourRef.current = stopTour; });

  // Frame loop + input.
  useEffect(() => {
    const cv = canvas.current!, ctx = cv.getContext("2d")!, s = st.current;
    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      const r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
      W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr;
      // Compact is decided by the wrapper's width (the canvas shrinks in compact mode, so measure the parent).
      const wrapW = cv.parentElement?.getBoundingClientRect().width ?? W;
      const c = preview || wrapW < COMPACT_W;
      if (c !== s.compact) { s.compact = c; setCompact(c); }
    };
    const ro = new ResizeObserver(resize); ro.observe(cv); resize();

    const project = (v: number[]): Proj => {
      const [x, y, z] = v, cy = Math.cos(s.yaw), sy = Math.sin(s.yaw), cp = Math.cos(s.pitch), sp = Math.sin(s.pitch);
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy, y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      const R = (preview ? Math.min(W * 0.4, H * 0.4) : s.compact ? Math.min(W * 0.44, H * 0.42) : Math.min(W * 0.38, H * 0.36)) * s.zoom, persp = 3 / (3 - z2);
      return { x: W / 2 + x1 * R * persp, y: H / 2 + 6 + y2 * R * persp, z: z2, s: persp };
    };
    const neighbours = (id: string) => s.edges.flatMap((e) => (e.source === id ? [e.target] : e.target === id ? [e.source] : []));

    const tick = (time: number, dt: number) => {
      if (!W) return;
      const sec = Math.min(dt, 50) / 1000, now = performance.now();
      const pal: Pal = s.dark ? HUES.dark : HUES.light;
      if (!s.drag) {
        s.yaw += s.vYaw; s.pitch += s.vPitch; s.vYaw *= 0.94; s.vPitch *= 0.94;
        if (!s.reduce && !s.tour && !s.hover && now - s.idleAt > 2500) s.yaw += 0.12 * sec;
      }
      s.pitch = Math.max(-1.2, Math.min(1.2, s.pitch));

      const focus = s.hover ?? s.selectedId;
      const lit = focus ? new Set([focus, ...neighbours(focus)]) : null;
      for (const p of s.pts) {
        const target = s.focusType ? (p.node.type === s.focusType || p.id === s.centre ? 1 : 0.12) : lit ? (lit.has(p.id) ? 1 : 0.12) : 1;
        const cur = s.hl.get(p.id) ?? 1;
        s.hl.set(p.id, cur + (target - cur) * Math.min(1, sec * 10));
        const e = s.reduce ? 1 : Math.max(0, Math.min(1, s.expand * 1.35 - p.delay * 0.35));
        s.proj.set(p.id, project(p.v.map((c) => c * easeOut(e))));
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Links: spokes to the centre faint, links between items stronger; lit links take the item's colour.
      for (const e of s.edges) {
        const a = s.proj.get(e.source), b = s.proj.get(e.target);
        if (!a || !b) continue;
        const h = Math.min(s.hl.get(e.source) ?? 1, s.hl.get(e.target) ?? 1);
        const item = s.byId.get(e.source === s.centre ? e.target : e.source)?.node;
        const hot = !!focus && (e.source === focus || e.target === focus);
        const spoke = e.source === s.centre || e.target === s.centre;
        const depth = ((a.z + b.z) / 2 + 1) / 2;
        ctx.strokeStyle = hot && item ? rgba(hueOf(item, pal), 0.85) : rgba(pal.link, (spoke ? 0.16 : 0.34) * (0.4 + depth * 0.6) * h * s.expand);
        ctx.lineWidth = hot ? 1.4 : 0.8;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }

      // Nodes back to front: soft glow, core, ring for completed actions, selection ring, pulse on "you".
      const order = [...s.pts].sort((p, q) => s.proj.get(p.id)!.z - s.proj.get(q.id)!.z);
      for (const p of order) {
        const q = s.proj.get(p.id)!, h = s.hl.get(p.id) ?? 1, depth = (q.z + 1) / 2;
        const centre = p.id === s.centre, c = hueOf(p.node, pal);
        const r = (centre ? 8 : p.node.type === "Category" ? 4.6 : 3.6) * q.s * (p.id === s.hover ? 1.5 : 1), a = (0.35 + depth * 0.65) * h;
        const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r * 4);
        g.addColorStop(0, rgba(c, (s.dark ? 0.5 : 0.28) * a)); g.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, r * 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = rgba(c, Math.min(1, a + 0.15)); ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
        if (centre && !s.reduce) {
          const ph = (time % 2.4) / 2.4;
          ctx.strokeStyle = rgba(c, 0.45 * (1 - ph)); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(q.x, q.y, r * (1.4 + ph * 2.4), 0, Math.PI * 2); ctx.stroke();
        }
        if (p.node.type === "Action" && p.node.status === "done") {
          ctx.strokeStyle = rgba(c, a); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(q.x, q.y, r + 3, 0, Math.PI * 2); ctx.stroke();
        }
        if (p.id === s.selectedId) {
          ctx.strokeStyle = pal.Patient; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(q.x, q.y, r + 6, 0, Math.PI * 2); ctx.stroke();
        }
      }

      // Labels: the front half, or whatever is lit. Chip with a coloured edge; right-half labels open leftwards.
      if (s.expand > 0.6 && !preview) {
        ctx.textBaseline = "middle";
        for (const p of order) {
          const q = s.proj.get(p.id)!, h = s.hl.get(p.id) ?? 1, centre = p.id === s.centre;
          // Compact: label only "you", the tapped point and its links (or the toured type) - never the whole front half.
          // Tapping "you" lights everything, so in compact it labels just the centre.
          const litLabels = s.compact && focus === s.centre ? null : lit;
          // Compact: while another point is selected, the centre label steps aside so the selection reads clearly.
          const showCentre = centre && (!s.compact || !focus || focus === s.centre);
          const show = centre ? showCentre : litLabels ? litLabels.has(p.id) : s.focusType ? p.node.type === s.focusType : !s.compact && q.z > 0.15;
          if (!show || (s.compact && !centre && p.id === focus)) continue; // compact: the in-map card names the selection
          const text = centre ? p.node.label : shorten(p.node.label, s.compact ? 22 : 30);
          ctx.font = `${centre ? "600 13px" : s.compact ? "500 10.5px" : "500 11px"} Inter, ui-sans-serif, system-ui, sans-serif`;
          const tw = ctx.measureText(text).width + 14;
          const left = !centre && q.x > W * 0.62;
          const x = centre ? q.x - tw / 2 : left ? q.x - 12 - tw : q.x + 12, y = centre ? q.y + 28 : q.y;
          const a = Math.min(1, (0.45 + ((q.z + 1) / 2) * 0.55) * h * (s.expand - 0.6) / 0.4);
          ctx.fillStyle = `rgba(${pal.chip},${(s.dark ? 0.78 : 0.9) * a})`;
          ctx.beginPath(); ctx.roundRect(x, y - 10, tw, 20, 5); ctx.fill();
          ctx.fillStyle = rgba(hueOf(p.node, pal), a); ctx.fillRect(left ? x + tw - 2.5 : x, y - 7, 2.5, 14);
          ctx.fillStyle = `rgba(${pal.text},${a})`; ctx.fillText(text, x + 7, y + 0.5);
        }
      }
    };
    gsap.ticker.add(tick);

    const hit = (ev: PointerEvent) => {
      const r = cv.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
      let best: P3 | null = null, bestScore = Infinity;
      for (const p of s.pts) {
        const q = s.proj.get(p.id); if (!q) continue;
        const d = Math.hypot(q.x - mx, q.y - my);
        if (d < 16 && d - q.z * 6 < bestScore) { best = p; bestScore = d - q.z * 6; } // nearer nodes win ties
      }
      return best;
    };
    const down = (ev: PointerEvent) => {
      cv.setPointerCapture(ev.pointerId); s.drag = { x: ev.clientX, y: ev.clientY, moved: 0 };
      s.idleAt = performance.now(); if (s.tour) stopTourRef.current();
    };
    const move = (ev: PointerEvent) => {
      if (s.drag) {
        const dx = ev.clientX - s.drag.x, dy = ev.clientY - s.drag.y;
        s.drag.moved += Math.abs(dx) + Math.abs(dy); s.drag.x = ev.clientX; s.drag.y = ev.clientY;
        s.vYaw = dx * 0.006; s.vPitch = dy * 0.006; s.yaw += s.vYaw; s.pitch += s.vPitch; s.idleAt = performance.now();
      } else {
        const p = hit(ev); s.hover = p?.id ?? null; cv.style.cursor = p ? "pointer" : "grab";
      }
    };
    const up = (ev: PointerEvent) => {
      if (s.drag && s.drag.moved < 5) {
        s.vYaw = s.vPitch = 0;
        const p = hit(ev);
        if (p) onSelectRef.current(p.node);
      }
      s.drag = null; s.idleAt = performance.now();
    };
    const leave = () => { s.hover = null; };
    const wheel = (ev: WheelEvent) => {
      ev.preventDefault(); s.zoom = Math.max(0.6, Math.min(2.2, s.zoom * (ev.deltaY < 0 ? 1.08 : 0.92))); s.idleAt = performance.now();
    };
    if (preview) return () => { gsap.ticker.remove(tick); ro.disconnect(); };
    cv.addEventListener("pointerdown", down); cv.addEventListener("pointermove", move); cv.addEventListener("pointerup", up);
    cv.addEventListener("pointerleave", leave); cv.addEventListener("wheel", wheel, { passive: false });
    return () => {
      gsap.ticker.remove(tick); ro.disconnect(); s.tour?.kill();
      cv.removeEventListener("pointerdown", down); cv.removeEventListener("pointermove", move); cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointerleave", leave); cv.removeEventListener("wheel", wheel);
    };
  }, [preview]);

  // Tour: turn to face each type (the centre of its nodes, shortest way round), name it, move on.
  const startTour = () => {
    const s = st.current;
    if (s.tour) { stopTour(); return; }
    const dur = s.reduce ? 0 : 1.1;
    const tl = gsap.timeline({ onComplete: stopTour });
    let yaw = s.yaw;
    present.forEach((t) => {
      const group = s.pts.filter((p) => p.node.type === t.type);
      if (!group.length) return;
      const [dx, dy, dz] = norm([0, 1, 2].map((k) => group.reduce((acc, p) => acc + p.v[k], 0)));
      let ty = Math.atan2(-dx, dz);
      ty += Math.round((yaw - ty) / (2 * Math.PI)) * 2 * Math.PI; yaw = ty;
      tl.to(s, { yaw: ty, pitch: Math.atan2(dy, Math.hypot(dx, dz)), duration: dur, ease: "power3.inOut",
        onStart: () => { s.focusType = t.type; s.vYaw = s.vPitch = 0; setCaption(`${t.plural} · ${group.length}`); } })
        .to({}, { duration: 1.4 });
    });
    s.tour = tl; setTouring(true);
  };

  const pal = dark ? HUES.dark : HUES.light;
  const centreLabel = nodes.find((n) => n.type === "Patient")?.label ?? "You";
  const picked = selectedId ? nodes.find((n) => n.id === selectedId) : undefined;
  return (
    <div className={`relative overflow-hidden rounded-lg border border-line bg-[radial-gradient(ellipse_at_center,var(--c-primary-soft)_0%,var(--c-surface)_70%)] ${height}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-4 pt-3 text-[11px] text-ink-subtle">
        <span className="font-semibold uppercase tracking-[0.14em] text-primary">{title}</span>
        <span className="h-px flex-1 bg-line" />
        {!preview && <span>{compact ? "Drag to rotate · tap a point" : "Drag to rotate · scroll to zoom · select a point"}</span>}
      </div>

      {!preview && <div className={compact
        ? "absolute inset-x-0 top-9 z-10 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none]"
        : "absolute left-3 top-10 z-10 flex flex-col items-start gap-1.5"}>
        {types.filter((t) => t.type !== "Patient" && count(t.type)).map((t) => {
          const on = !hidden[t.type];
          return (
            <button key={t.type} onClick={() => setHidden((h) => ({ ...h, [t.type]: on }))} aria-pressed={on}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${on
                ? "border-line bg-surface/85 text-ink hover:border-line-strong" : "border-line/60 bg-surface/40 text-ink-subtle line-through"}`}>
              <span className={`h-2 w-2 rounded-full ${on ? "" : "opacity-30"}`} style={{ background: hueOf({ type: t.type }, pal) }} />
              {t.plural} <span className="text-ink-subtle">{count(t.type)}</span>
            </button>
          );
        })}
      </div>}

      <canvas ref={canvas} className={`absolute inset-x-0 w-full cursor-grab touch-none ${preview ? "top-9 bottom-10 h-[calc(100%-76px)]" : compact ? "top-[72px] bottom-12 h-[calc(100%-120px)]" : "inset-y-0 h-full"}`} role="img" aria-hidden={preview || undefined}
        aria-label={`3D map of ${nodes.length - 1} records linked to ${centreLabel}. The list below the map selects one.`} />

      {caption && (
        <div className="absolute left-1/2 top-12 z-10 -translate-x-1/2 rounded-md border border-line bg-surface/90 px-3 py-1.5 text-xs font-semibold text-primary">
          {caption}
        </div>
      )}

      {!preview && compact && picked && picked.type !== "Patient" && (
        <div className="absolute inset-x-3 bottom-14 z-20 flex items-center gap-3 rounded-lg border border-line bg-surface/95 px-3 py-2.5 shadow-lg">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: hueOf(picked, pal) }} />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] text-ink-subtle">{types.find((t) => t.type === picked.type)?.plural ?? picked.type}</span>
            <span className="block truncate text-sm font-medium">{picked.label}</span>
          </span>
          {picked.link && <Link href={picked.link} className="shrink-0 text-sm font-medium text-primary">Open →</Link>}
        </div>
      )}

      {!preview && <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 px-4 pb-3 text-[11px] text-ink-subtle">
        <span className="truncate">
          {visible.length - 1} records{!compact && <> · {visibleEdges.length} links</>}
          {visible.some((n) => n.type === "Biomarker") && <> · <span style={{ color: pal.warn }}>●</span> {compact ? "out of range" : "outside reference range"}</>}
        </span>
        <button onClick={startTour} className="pointer-events-auto flex shrink-0 items-center gap-2 rounded-md border border-line bg-surface/90 px-3 py-1.5 text-xs font-medium text-ink hover:border-primary">
          <span className="text-primary">{touring ? "■" : "▶"}</span>{touring ? "Stop" : "Tour"}
        </button>
      </div>}

      {/* Keyboard and screen-reader access to every node. */}
      {!preview && <ul className="sr-only">
        {nodes.map((n) => (
          <li key={n.id}><button onClick={() => onSelect(n)}>{n.type}: {n.label}</button></li>
        ))}
      </ul>}
    </div>
  );
}
