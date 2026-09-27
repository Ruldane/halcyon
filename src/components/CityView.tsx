"use client";

/**
 * The city through the exchange's tall windows. Each window bay frames one
 * district; the board's fields below share the bays' widths. Hover or focus
 * a window to see whose it is; click it for their card. On a phone the view
 * becomes one bay at a time, swiped or chosen from the nameplates.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { describeWindow, windowSentence } from "../client/describe";
import { DISTRICT_NAMES } from "../sim/census";
import { useExchange, useUI } from "./context";

export function CityView() {
  const { client, engine } = useExchange();
  const ready = useUI((s) => s.ready);
  const city = useUI((s) => s.city);
  const directory = useUI((s) => s.directory);
  const stage = useUI((s) => s.stage);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef(-1);
  const [focusText, setFocusText] = useState("");
  const dir = useMemo(() => new Map(directory.map((d) => [d.id, d])), [directory]);
  const dirRef = useRef(dir);
  useEffect(() => {
    dirRef.current = dir;
  }, [dir]);

  const publishStage = useCallback(() => {
    const c = engine.city;
    const wrap = wrapRef.current;
    if (!c || !wrap || !city) return;
    const bays = [0, 1, 2, 3, 4].map((d) => {
      const [l] = c.worldToScreen(city.districtX[d], 0);
      const [r] = c.worldToScreen(city.districtX[d + 1], 0);
      return { left: l, width: r - l };
    });
    client.store.set({ stage: { panorama: c.panorama, bays, visible: c.visibleDistricts(), width: c.cssW, height: c.cssH } });
  }, [client, engine, city]);

  // Attach the renderer once the city exists.
  useEffect(() => {
    if (!ready || !canvasRef.current || !wrapRef.current) return;
    engine.attachCity(canvasRef.current);
    const wrap = wrapRef.current;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      engine.resizeCity(r.width, r.height);
      publishStage();
    });
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      engine.detachCity();
    };
  }, [ready, engine, publishStage]);

  // The district chosen on a phone.
  const district = useUI((s) => s.district);
  useEffect(() => {
    if (!engine.city || engine.city.panorama) return;
    engine.city.focusDistrict(district, engine.still);
    const id = window.setTimeout(publishStage, engine.still ? 0 : 450);
    return () => window.clearTimeout(id);
  }, [district, engine, publishStage]);

  // Pointer: hover, click, and drag to pan on narrow screens.
  const drag = useRef<{ x: number; moved: number; id: number } | null>(null);
  const showCard = (i: number, x: number, y: number) => {
    const card = cardRef.current;
    if (!card || !city) return;
    if (i < 0) {
      card.hidden = true;
      return;
    }
    const words = describeWindow(i, city, client.owners, dirRef.current, client.tick);
    if (!words) return;
    card.hidden = false;
    card.querySelector("[data-name]")!.textContent = words.name + (words.occupation ? `, ${words.occupation}` : "");
    card.querySelector("[data-place]")!.textContent = `${words.place} · ${words.floor}`;
    card.querySelector("[data-status]")!.textContent = words.status;
    const w = wrapRef.current!.clientWidth;
    const left = Math.min(w - 250, Math.max(8, x + 14));
    const top = Math.max(8, y - 74);
    card.style.transform = `translate(${left}px, ${top}px)`;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const c = engine.city;
    if (!c) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (drag.current && drag.current.id === e.pointerId && !c.panorama) {
      const dx = e.clientX - drag.current.x;
      drag.current.x = e.clientX;
      drag.current.moved += Math.abs(dx);
      c.panBy(dx);
      showCard(-1, 0, 0);
      return;
    }
    if (e.pointerType === "touch") return;
    const i = c.hit(x, y, 10);
    engine.setHover(i);
    showCard(i, x, y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, moved: 0, id: e.pointerId };
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const c = engine.city;
    const d = drag.current;
    drag.current = null;
    if (!c) return;
    if (d && d.moved > 8) {
      publishStage();
      const centre = c.centreDistrict();
      if (centre !== client.store.get().district) client.store.set({ district: centre });
      return;
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const i = c.hit(e.clientX - r.left, e.clientY - r.top, e.pointerType === "touch" ? 18 : 10);
    if (i >= 0 && client.owners) {
      const owner = client.owners[i];
      if (owner >= 0) client.inspect(owner);
      if (e.pointerType === "touch") showCard(i, e.clientX - r.left, e.clientY - r.top);
    }
  };

  const onLeave = () => {
    engine.setHover(-1);
    showCard(-1, 0, 0);
  };

  // Keyboard: arrows move between lit windows; Enter opens the card.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const c = engine.city;
    if (!c || !city) return;
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (e.key in dirs) {
      e.preventDefault();
      const [dx, dy] = dirs[e.key];
      const from = focusRef.current;
      let best = -1;
      let bestScore = Infinity;
      const [fx, fy] = from >= 0 ? c.windowCentre(from) : [c.cssW / 2, c.cssH / 2];
      for (let i = 0; i < city.windows.length; i++) {
        if (i === from || c.windowState(i) === 0) continue;
        const [x, y] = c.windowCentre(i);
        if (x < 0 || x > c.cssW || y < 0 || y > c.cssH) continue;
        const vx = x - fx;
        const vy = y - fy;
        const along = vx * dx + vy * dy;
        if (from >= 0 && along <= 1) continue;
        const across = Math.abs(vx * dy - vy * dx);
        const score = from >= 0 ? along + across * 2.5 : Math.hypot(vx, vy);
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      }
      if (best >= 0) {
        focusRef.current = best;
        engine.setFocus(best);
        const words = describeWindow(best, city, client.owners, dirRef.current, client.tick);
        if (words) setFocusText(windowSentence(words));
        const [x, y] = c.windowCentre(best);
        showCard(best, x, y);
      }
    } else if (e.key === "Enter" || e.key === " ") {
      const i = focusRef.current;
      if (i >= 0 && client.owners && client.owners[i] >= 0) {
        e.preventDefault();
        client.inspect(client.owners[i]);
      }
    } else if (e.key === "Escape") {
      focusRef.current = -1;
      engine.setFocus(-1);
      showCard(-1, 0, 0);
    }
  };

  const panorama = stage?.panorama ?? true;

  return (
    <div className="windows" data-panorama={panorama ? "1" : "0"}>
      <div
        ref={wrapRef}
        className="windows__view"
        tabIndex={0}
        role="application"
        aria-roledescription="city view"
        aria-label="Halcyon through the exchange windows. Every lit window is someone at home or at work. Use the arrow keys to move between lit windows and Enter to read whose it is."
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onLeave}
        onBlur={() => {
          engine.setFocus(-1);
          showCard(-1, 0, 0);
        }}
        onKeyDown={onKeyDown}
      >
        <canvas ref={canvasRef} className="windows__canvas" aria-hidden="true" />
        <Frames />
        <div ref={cardRef} className="wincard" hidden aria-hidden="true">
          <p className="wincard__name" data-name />
          <p className="wincard__place" data-place />
          <p className="wincard__status" data-status />
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {focusText}
      </p>
      <Sill />
    </div>
  );
}

/** The window bays: stepped Deco heads, piers, glazing bars. */
function Frames() {
  const stage = useUI((s) => s.stage);
  if (!stage || !stage.width) return null;
  const { width: W, height: H } = stage;
  if (!stage.panorama) {
    return (
      <svg className="frames" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <path fillRule="evenodd" className="frames__wall" d={`M0 0H${W}V${H}H0Z ${bay(10, 10, W - 20, H - 10)}`} />
        <path className="frames__line" d={bay(10, 10, W - 20, H - 10)} />
      </svg>
    );
  }
  const pier = Math.max(8, Math.min(18, W * 0.009));
  const holes = stage.bays.map((b) => bay(b.left + pier / 2, 10, b.width - pier, H - 10)).join(" ");
  return (
    <svg className="frames" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path fillRule="evenodd" className="frames__wall" d={`M-20 -20H${W + 20}V${H + 20}H-20Z ${holes}`} />
      {stage.bays.map((b, i) => (
        <g key={i}>
          <path className="frames__line" d={bay(b.left + pier / 2, 10, b.width - pier, H - 10)} />
          <path className="frames__bar" d={`M${b.left + b.width / 3} ${H * 0.2}V${H} M${b.left + (2 * b.width) / 3} ${H * 0.2}V${H} M${b.left + pier / 2} ${H * 0.2}H${b.left + b.width - pier / 2}`} />
        </g>
      ))}
    </svg>
  );
}

/** A tall window with a stepped head. */
function bay(x: number, y: number, w: number, h: number): string {
  const s1 = Math.min(18, w * 0.08);
  const s2 = Math.min(34, w * 0.16);
  const step = 11;
  return `M${x} ${y + h} V${y + step * 2} H${x + s1} V${y + step} H${x + s2} V${y} H${x + w - s2} V${y + step} H${x + w - s1} V${y + step * 2} H${x + w} V${y + h} Z`;
}

/** The sill: each bay's nickel nameplate. On phones, they choose the bay. */
function Sill() {
  const { client } = useExchange();
  const stage = useUI((s) => s.stage);
  const district = useUI((s) => s.district);
  const census = useUI((s) => s.census);
  const down = useUI((s) => s.down);
  if (!stage) return <div className="sill" />;
  if (stage.panorama) {
    return (
      <div className="sill" aria-hidden="true">
        {stage.bays.map((b, d) => (
          <p key={d} className="plate" style={{ left: b.left + b.width / 2 }} data-down={down.includes(d) ? "1" : "0"}>
            {DISTRICT_NAMES[d]}
            {census && <span className="plate__n">{census.rows[d].up ? ` · ${census.rows[d].up} up` : ""}</span>}
          </p>
        ))}
      </div>
    );
  }
  return (
    <div className="sill sill--tabs" role="tablist" aria-label="Districts">
      {DISTRICT_NAMES.map((n, d) => (
        <button
          key={d}
          type="button"
          role="tab"
          aria-selected={district === d}
          className="plate plate--tab"
          data-down={down.includes(d) ? "1" : "0"}
          onClick={() => client.store.set({ district: d })}
        >
          {n.replace("The ", "")}
        </button>
      ))}
    </div>
  );
}
