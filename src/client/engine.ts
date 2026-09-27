/**
 * The page's animation engine. One requestAnimationFrame loop draws the city
 * and the cords; lamps on the board are DOM, updated only when a line's state
 * changes. Nothing per-frame goes through React. Frame times are watched in
 * two-second windows; sustained slowness lowers the pixel ratio, then the
 * glow and beams, then caps the rate at 30 fps.
 */
import { daylight, local, sunTimes, type Place } from "../sim/clock";
import { CityRenderer, type Clock, type Overlay } from "../render/city";
import { CordRenderer, type JackPos } from "../render/cords";
import type { ExchangeClient } from "./bridge";
import { L, type TickMsg } from "../worker/protocol";

const SYNODIC = 29.530588853 * 86_400_000;
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

export class Engine {
  city: CityRenderer | null = null;
  cords: CordRenderer | null = null;
  private jackEls: (HTMLElement | null)[] = [];
  private operatorEl: HTMLElement | null = null;
  private lampCache = new Uint8Array(0);
  private boardEl: HTMLElement | null = null;
  private raf = 0;
  private running = false;
  private lastFrame = 0;
  private frameTimes: number[] = [];
  private lastQualityCheck = 0;
  private slowWindows = 0;
  private fastWindows = 0;
  quality = 0;
  fps = 0;
  private place: Place;
  overlay: Overlay = { listening: null, trace: null, follow: null, hover: -1, focus: -1, highlight: [] };
  still = false;
  private unsub: (() => void)[] = [];
  private debugEl: HTMLElement | null = null;
  private lastDraw = 0;
  private boardDirty = true;
  private nye = false;

  constructor(private client: ExchangeClient, place: Place) {
    this.place = place;
    this.unsub.push(client.onTick((t) => this.onTick(t)));
    const st = client.store;
    this.unsub.push(
      st.subscribe(() => {
        const s = st.get();
        if (s.still !== this.still) this.setStill(s.still);
        this.refreshOverlay();
      }),
    );
  }

  setHover(i: number) {
    this.overlay.hover = i;
  }

  setFocus(i: number) {
    this.overlay.focus = i;
  }

  setPlace(p: Place) {
    this.place = p;
  }

  attachCity(canvas: HTMLCanvasElement) {
    const s = this.client.store.get();
    if (!s.city) return;
    this.city = new CityRenderer(canvas, s.city);
    this.city.still = this.still;
    this.start();
  }

  detachCity() {
    this.city = null;
  }

  attachBoard(board: HTMLElement, cordCanvas: HTMLCanvasElement) {
    this.boardEl = board;
    this.cords = new CordRenderer(cordCanvas);
    this.cords.still = this.still;
    this.boardDirty = true;
  }

  registerJacks(els: (HTMLElement | null)[], operator: HTMLElement | null) {
    this.jackEls = els;
    this.operatorEl = operator;
    this.lampCache = new Uint8Array(els.length).fill(255);
    this.boardDirty = true;
    if (this.client.tick) this.applyLamps(this.client.tick);
  }

  /** Recompute where every jack sits, for the cords. */
  layoutBoard() {
    if (!this.boardEl || !this.cords) return;
    const box = this.boardEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.cords.resize(box.width, box.height, dpr);
    const pos: JackPos[] = [];
    let firstVisible = -1;
    for (let i = 0; i < this.jackEls.length; i++) {
      const el = this.jackEls[i];
      if (!el || el.offsetParent === null) {
        pos.push({ x: 0, y: 0, off: true });
        continue;
      }
      if (firstVisible < 0) firstVisible = i;
      const r = el.getBoundingClientRect();
      pos.push({ x: r.left + r.width / 2 - box.left, y: r.top + r.height * 0.62 - box.top, off: false });
    }
    // Off-screen jacks sit to the left or right of what is shown.
    const lines = this.client.store.get().city?.lines ?? [];
    const shown = new Set(lines.filter((l) => !pos[l.id]?.off).map((l) => l.district));
    const minD = Math.min(...shown);
    for (const l of lines) {
      const p = pos[l.id];
      if (p && p.off) p.x = l.district < minD ? -20 : box.width + 20;
    }
    this.cords.jacks = pos;
    const shelf = this.boardEl.querySelector<HTMLElement>("[data-shelf]");
    const hole = this.boardEl.querySelector<HTMLElement>("[data-listen-hole]");
    if (shelf) this.cords.shelfY = shelf.getBoundingClientRect().top - box.top + 6;
    if (hole && shelf) {
      // The listening cord leaves the shelf's top edge, clear of its label.
      const r = hole.getBoundingClientRect();
      this.cords.listenHole = [r.left + r.width / 2 - box.left, shelf.getBoundingClientRect().top - box.top + 4];
    }
    if (this.operatorEl && this.operatorEl.offsetParent !== null) {
      const r = this.operatorEl.getBoundingClientRect();
      this.cords.operatorJack = { x: r.left + r.width / 2 - box.left, y: r.top + r.height * 0.6 - box.top, off: false };
    }
    if (this.client.tick) this.syncCords(this.client.tick);
  }

  resizeCity(w: number, h: number) {
    this.city?.resize(w, h, window.devicePixelRatio || 1);
  }

  setStill(still: boolean) {
    this.still = still;
    if (this.city) this.city.still = still;
    if (this.cords) this.cords.still = still;
    document.documentElement.dataset.still = still ? "1" : "0";
  }

  setDebug(el: HTMLElement | null) {
    this.debugEl = el;
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    for (const u of this.unsub) u();
    this.unsub = [];
  }

  // -------------------------------------------------------------------------

  private onTick(t: TickMsg) {
    this.lastTickAt = performance.now();
    const owners = this.client.owners;
    if (this.city && owners) this.city.updateWindows(t, owners);
    this.applyLamps(t);
    this.syncCords(t);
    this.refreshOverlay();
    if (t.newYear !== this.nye) {
      this.nye = t.newYear;
      this.boardEl?.classList.toggle("nye", t.newYear);
    }
  }

  private syncCords(t: TickMsg) {
    if (!this.cords) return;
    const s = this.client.store.get();
    const opAnswered = !!s.listening && s.listening.operator && !s.listening.ended;
    this.cords.sync(t.calls, t.listening, opAnswered, performance.now());
  }

  private applyLamps(t: TickMsg) {
    const els = this.jackEls;
    const n = Math.min(els.length, t.lines.length);
    for (let i = 0; i < n; i++) {
      const v = t.lines[i];
      if (this.lampCache[i] === v) continue;
      this.lampCache[i] = v;
      const el = els[i];
      if (!el) continue;
      el.dataset.s = String(v & 15);
      el.dataset.l = v & 16 ? "1" : "0";
      const state = v & 15;
      const word = state === L.Idle ? "quiet" : state === L.Signal ? "calling the exchange" : state === L.Ring ? "ringing" : state === L.Talk ? "on a call, press to listen" : state === L.Clear ? "just hung up" : state === L.Busy ? "busy signal" : "line down";
      const base = el.dataset.label ?? "";
      el.setAttribute("aria-label", `${base}: ${word}${v & 16 ? ", you are listening" : ""}`);
    }
    if (this.operatorEl) this.operatorEl.dataset.s = t.operator ? "2" : "0";
  }

  private refreshOverlay() {
    const s = this.client.store.get();
    const t = this.client.tick;
    const owners = this.client.owners;
    const o = this.overlay;
    const listeningCall = s.listening && !s.listening.ended && t ? t.calls.find((c) => c.id === s.listening!.call) ?? null : null;
    o.listening = listeningCall;
    o.follow = s.following;
    const hl: number[] = [-1, -1, -1];
    if (owners && t) {
      if (listeningCall) {
        hl[0] = this.windowOf(listeningCall.from, t, owners);
        hl[1] = this.windowOf(listeningCall.answer, t, owners);
      }
      if (s.following !== null) hl[2] = this.windowOf(s.following, t, owners);
    }
    o.highlight = hl;
    if (s.trace && s.slip === "trace") {
      const born = o.trace && o.trace.hops.length && (o.trace as { id?: number }).id === s.trace.id ? o.trace.born : performance.now();
      const hops = s.trace.hops
        .filter((h) => h.parent >= 0 || h.alone || (h.root && s.trace!.tpl === "listener"))
        .sort((a, b) => a.t - b.t)
        .map((h) => ({ from: h.tellerWindow, to: h.hearerWindow, alone: h.alone || h.root }));
      const sorted = s.trace.hops.filter((h) => h.parent >= 0 || h.alone || (h.root && s.trace!.tpl === "listener")).sort((a, b) => a.t - b.t);
      const stepIdx = s.traceStep >= 0 ? sorted.findIndex((h) => h.v === s.traceStep) : -1;
      o.trace = { hops, step: stepIdx, born };
      (o.trace as { id?: number }).id = s.trace.id;
    } else o.trace = null;
  }

  /** The window a citizen is behind right now (home or work), or any of theirs. */
  windowOf(id: number, t: TickMsg, owners: Int16Array): number {
    if (id < 0 || !this.city) return -1;
    const s = this.client.store.get();
    const wins = s.city?.windows ?? [];
    const act = (t.citizens[id] ?? 0) & 7;
    let any = -1;
    for (let i = 0; i < owners.length; i++) {
      if (owners[i] !== id) continue;
      if (any < 0) any = i;
      if ((act === 2 && wins[i].uk === 1) || (act !== 2 && wins[i].uk === 0)) return i;
    }
    return any;
  }

  clock(tSim: number): Clock {
    const lt = local(tSim, this.place);
    const { rise, set } = sunTimes(lt, this.place.south);
    const d = daylight(lt, this.place.south);
    const dusk = Math.max(0, 1 - Math.min(Math.abs(lt.hour - set), Math.abs(lt.hour - rise)) / 1.1);
    const moon = (((tSim - NEW_MOON) % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC;
    return { hour: lt.hour, day: d, dow: lt.dow, dayIndex: lt.dayIndex, moon, dusk };
  }

  // -------------------------------------------------------------------------
  // The loop
  // -------------------------------------------------------------------------

  start() {
    if (this.running) return;
    this.running = true;
    const frame = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(frame);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private frame(now: number) {
    const tick = this.client.tick;
    const paused = (this.client.store.get().speed ?? 1) === 0;
    // Stillness and holding need far fewer frames.
    const budget = this.still || paused ? 250 : this.quality >= 3 ? 33 : 0;
    if (budget && now - this.lastDraw < budget && !(this.cords?.busy && !this.still)) return;
    const interval = now - this.lastFrame;
    this.lastFrame = now;
    this.lastDraw = now;
    // Sample every drawn frame (at the 30 fps cap too), but not the deliberate slowness of stillness.
    if (interval > 0 && interval < 500 && !(this.still || paused)) this.frameTimes.push(interval);
    if (this.city && tick) {
      // The city's clock runs smoothly between ticks.
      const simNow = tick.t + (paused ? 0 : Math.min(400, performance.now() - (this.lastTickAt ?? now)) * (tick.speed || 0));
      this.city.draw(now, this.clock(simNow), tick, this.overlay);
    }
    if (this.cords) this.cords.draw(now);
    if (now - this.lastQualityCheck > 2000) this.checkQuality(now);
  }

  private lastTickAt: number | null = null;

  noteTick() {
    this.lastTickAt = performance.now();
  }

  private checkQuality(now: number) {
    this.lastQualityCheck = now;
    const ft = this.frameTimes.sort((a, b) => a - b);
    this.frameTimes = [];
    if (ft.length < 20) return;
    const p90 = ft[Math.floor(ft.length * 0.9)];
    const med = ft[Math.floor(ft.length / 2)];
    this.fps = 1000 / med;
    const target = this.quality >= 3 ? 33.4 : 16.7;
    if (p90 > target * 1.55) {
      this.slowWindows++;
      this.fastWindows = 0;
    } else if (p90 < target * 1.12) {
      this.fastWindows++;
      this.slowWindows = 0;
    }
    if (this.slowWindows >= 2 && this.quality < 3) {
      this.quality++;
      this.slowWindows = 0;
      this.city?.setQuality(this.quality);
    } else if (this.fastWindows >= (this.quality >= 3 ? 4 : 8) && this.quality > 0) {
      this.quality--;
      this.fastWindows = 0;
      this.city?.setQuality(this.quality);
    }
    if (this.debugEl) this.debugEl.textContent = `${this.fps.toFixed(0)} fps · p90 ${p90.toFixed(1)} ms · tier ${this.quality} · ${this.city ? this.city.dpr.toFixed(2) : "-"}x`;
    (window as unknown as { __halcyonPerf?: object }).__halcyonPerf = { fps: this.fps, p90, median: med, tier: this.quality };
  }
}
