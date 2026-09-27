/**
 * The page's side of the worker bridge. Owns the worker, keeps the latest
 * tick for the engine (lamps, cords, windows), and feeds slow state to the
 * store for React. Created once per mount; disposed cleanly, so React's
 * StrictMode double mount never leaves a second city running.
 */
import type { PageParams } from "./params";
import { Store } from "./store";
import type { FromWorker, TickMsg, ToWorker } from "../worker/protocol";

type TickListener = (t: TickMsg) => void;

export class ExchangeClient {
  readonly store = new Store();
  private worker: Worker | null = null;
  tick: TickMsg | null = null;
  owners: Int16Array | null = null;
  private tickLs = new Set<TickListener>();
  private readyLs = new Set<() => void>();
  disposed = false;

  start(p: PageParams) {
    this.worker = new Worker(new URL("../worker/exchange.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.receive(ev.data);
    this.worker.onerror = (ev) => this.store.set({ error: ev.message || "The exchange's worker failed." });
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const offsetMinutes = -new Date(Date.now() + p.clockOffset).getTimezoneOffset();
    this.store.set({ debug: p.debug, speed: p.paused ? 0 : p.speed, heldSpeed: p.speed || 1 });
    this.send({
      type: "init",
      params: { seed: p.seed, fresh: p.fresh, clockOffset: p.clockOffset, timeZone: tz, offsetMinutes, speed: p.paused ? 0 : p.speed, persist: p.persist, force: p.force },
    });
  }

  dispose() {
    this.disposed = true;
    this.worker?.terminate();
    this.worker = null;
    this.tickLs.clear();
    this.readyLs.clear();
  }

  send(m: ToWorker) {
    this.worker?.postMessage(m);
  }

  onTick(l: TickListener) {
    this.tickLs.add(l);
    return () => void this.tickLs.delete(l);
  }

  onReady(l: () => void) {
    this.readyLs.add(l);
    return () => void this.readyLs.delete(l);
  }

  // Commands ------------------------------------------------------------------

  setSpeed(speed: number) {
    const s = this.store.get();
    this.store.set({ speed, heldSpeed: speed > 0 ? speed : s.heldSpeed });
    this.send({ type: "speed", speed });
  }

  togglePause() {
    const s = this.store.get();
    this.setSpeed(s.speed > 0 ? 0 : s.heldSpeed || 1);
  }

  listen(callId: number | null) {
    const s = this.store.get();
    if (callId === null) {
      this.send({ type: "listen", call: null });
      this.store.set({ listening: s.listening ? { ...s.listening, ended: true } : null });
      return;
    }
    const call = s.calls.find((c) => c.id === callId) ?? this.tick?.calls.find((c) => c.id === callId);
    if (!call) return;
    const past = s.listening && s.listening.lines.length ? [s.listening, ...s.pastListens].slice(0, 6) : s.pastListens;
    this.store.set({
      listening: { call: call.id, fromLine: call.fromLine, toLine: call.toLine, from: call.from, answer: call.answer, lines: [], ended: false, operator: false },
      pastListens: past,
      slip: "listen",
    });
    this.send({ type: "listen", call: callId });
  }

  answerOperator() {
    const op = this.tick?.operator;
    if (!op) return;
    const s = this.store.get();
    const past = s.listening && s.listening.lines.length ? [s.listening, ...s.pastListens].slice(0, 6) : s.pastListens;
    this.store.set({
      listening: { call: op.call, fromLine: op.fromLine, toLine: -2, from: op.from, answer: -1, lines: [], ended: false, operator: true },
      pastListens: past,
      slip: "listen",
    });
    this.send({ type: "answerOperator" });
  }

  inspect(id: number | null) {
    this.store.set({ cardId: id, slip: id === null ? "none" : "card", card: id === null ? null : this.store.get().card?.id === id ? this.store.get().card : null });
    this.send({ type: "inspect", id });
  }

  follow(id: number | null) {
    this.store.set({ following: id });
  }

  trace(id: number | null) {
    this.store.set({ slip: id === null ? "none" : "trace", traceStep: -1, trace: id === null ? null : this.store.get().trace?.id === id ? this.store.get().trace : null });
    this.send({ type: "trace", id });
  }

  closeSlip() {
    const s = this.store.get();
    if (s.slip === "listen" && s.listening && !s.listening.ended) this.listen(null);
    if (s.slip === "trace") this.send({ type: "trace", id: null });
    if (s.slip === "card") this.send({ type: "inspect", id: null });
    this.store.set({ slip: "none", trace: s.slip === "trace" ? null : s.trace, cardId: s.slip === "card" ? null : s.cardId });
  }

  summary() {
    this.send({ type: "summary" });
  }

  reset() {
    this.store.set({ ready: false, listening: null, trace: null, card: null, slip: "none", log: [] });
    this.send({ type: "reset" });
  }

  // Incoming --------------------------------------------------------------------

  private receive(m: FromWorker) {
    const st = this.store;
    switch (m.type) {
      case "ready":
        this.owners = m.owners;
        st.set({
          ready: true,
          city: m.city,
          directory: m.directory,
          seed: m.seed,
          created: m.created,
          founded: m.founded,
          resetReason: m.resetReason,
          absence: m.absence,
          log: m.log,
          paper: m.paper,
          visits: m.visits,
          south: m.south,
          firstVisit: m.firstVisit,
          noteOpen: m.firstVisit,
        });
        for (const l of this.readyLs) l();
        break;
      case "tick": {
        if (m.owners) this.owners = m.owners;
        this.tick = m;
        for (const l of this.tickLs) l(m);
        const s = st.get();
        // Slow state, at most a few times a second.
        const callsChanged = s.calls.length !== m.calls.length || s.calls.some((c, i) => c.id !== m.calls[i]?.id || c.phase !== m.calls[i]?.phase || c.answer !== m.calls[i]?.answer || c.listened !== m.calls[i]?.listened);
        const patch: Partial<typeof s> = {
          t: Math.floor(m.t / 15_000) * 15_000,
          ahead: Math.floor(m.ahead / 60_000) * 60_000,
          operatorRinging: !!m.operator,
          storm: !!m.storm,
          newYear: m.newYear,
        };
        if (callsChanged) patch.calls = m.calls;
        if (m.down.join() !== s.down.join()) patch.down = m.down;
        if (m.speed !== s.speed) patch.speed = m.speed;
        // A listened call that has ended.
        if (s.listening && !s.listening.ended && s.listening.call >= 0 && !m.calls.some((c) => c.id === s.listening!.call && c.phase !== "clear")) {
          patch.listening = { ...s.listening, ended: true };
        }
        st.set(patch);
        break;
      }
      case "heard": {
        const s = st.get();
        if (!s.listening) break;
        const mine = m.lines.filter((l) => l.call === s.listening!.call);
        if (!mine.length) break;
        st.set({ listening: { ...s.listening, lines: [...s.listening.lines, ...mine] } });
        break;
      }
      case "log": {
        const s = st.get();
        st.set({ log: [...s.log, ...m.entries].slice(-200) });
        break;
      }
      case "paper":
        st.set({ paper: m.paper, paperFlash: Date.now() });
        break;
      case "census":
        st.set({ census: m.census, rumours: m.rumours });
        break;
      case "card": {
        const s = st.get();
        if (m.card === null || m.card.id === s.cardId) st.set({ card: m.card });
        break;
      }
      case "trace": {
        const s = st.get();
        if (s.slip === "trace" || m.trace === null) st.set({ trace: m.trace });
        break;
      }
      case "summary":
        st.set({ summary: m.text });
        break;
      case "directory":
        st.set({ directory: m.directory });
        break;
      case "returned":
        st.set({ returned: m.text });
        break;
      case "visits":
        st.set({ visits: m.visits });
        break;
      case "saved":
        st.set({ savedAt: m.at });
        break;
      case "perf":
        st.set({ msPerStep: m.msPerStep });
        break;
      case "error":
        console.error(`Halcyon exchange: ${m.message}`);
        st.set({ error: m.message });
        break;
    }
  }
}
