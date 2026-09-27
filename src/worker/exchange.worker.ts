/// <reference lib="webworker" />
/**
 * Halcyon lives here, off the main thread.
 *
 * A fixed-step loop advances the city in real time (paused, or a little
 * faster, at the visitor's asking). Every fifth of a second the page gets a
 * packed tick: each citizen's whereabouts, each line's lamp, the calls on the
 * board. Listening, tracing and the directory are answered on request. The
 * city is saved to IndexedDB every twenty seconds and when the tab is hidden;
 * on return the absence is modelled and written up.
 */
import { composePaper } from "../grammar/paper";
import { firstShift, framingNote, supervisor } from "../grammar/log";
import { full } from "../grammar/words";
import { catchUp } from "../sim/catchup";
import { directory, listRumours, readCard, readTrace, takeCensus, talkingAbout } from "../sim/census";
import { tieOf } from "../sim/city";
import { HOUR, MINUTE, local, minutesToNewYear, placeFrom, type Place } from "../sim/clock";
import { districtDown } from "../sim/events";
import { restore, snapshot } from "../sim/persist";
import { DT, OPERATOR_LINE, Simulation } from "../sim/sim";
import { Act, K } from "../sim/types";
import { L, type CallView, type ForceWhat, type FromWorker, type HeardMsg, type InitParams, type StaticCity, type ToWorker } from "./protocol";
import { clearSnapshot, loadSnapshot, saveSnapshot } from "./store";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let sim: Simulation | null = null;
let params: InitParams | null = null;
let place: Place | null = null;
let speed = 1;
let hidden = false;
let loopTimer: ReturnType<typeof setTimeout> | null = null;
let lastReal = 0;
let acc = 0;
let lastTick = 0;
let lastCensus = 0;
let lastCard = 0;
let lastTrace = 0;
let lastSave = 0;
let lastPerf = 0;
let stepMs = 0;
let stepN = 0;
let inspectId: number | null = null;
let traceId: number | null = null;
let ownersSent = -1;
let saving = false;
let hourKey = -1;
const perDistrictHour = [0, 0, 0, 0, 0];
const countedCalls = new Set<number>();

const LOOP_MS = 100;
const MAX_AHEAD = 6 * HOUR;

const post = (msg: FromWorker, transfer: Transferable[] = []) => ctx.postMessage(msg, transfer);
const realNow = () => Date.now() + (params?.clockOffset ?? 0);

ctx.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  try {
    handle(m);
  } catch (e) {
    post({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};

function handle(m: ToWorker) {
  switch (m.type) {
    case "init":
      void init(m.params);
      break;
    case "speed": {
      const was = speed;
      speed = Math.max(0, Math.min(16, m.speed));
      if (was === 0 && speed > 0) resync();
      postTick();
      break;
    }
    case "listen":
      if (sim) {
        sim.setListen(m.call);
        drain();
        postTick();
      }
      break;
    case "answerOperator":
      if (sim && sim.answerOperator()) {
        drain();
        postTick();
      }
      break;
    case "inspect":
      inspectId = m.id;
      postCard();
      break;
    case "trace":
      traceId = m.id;
      if (m.id !== null && sim) {
        sim.markTraced(m.id);
        const v = sim.w.visits[sim.w.visits.length - 1];
        if (v && !v.traced.includes(m.id)) v.traced.push(m.id);
        post({ type: "visits", visits: sim.w.visits.slice(-40) });
      }
      postTrace();
      break;
    case "summary":
      if (sim) post({ type: "summary", text: talkingAbout(sim) });
      break;
    case "visibility":
      hidden = m.hidden;
      if (hidden) {
        stop();
        void save();
      } else {
        if (speed > 0) resync();
        start();
      }
      break;
    case "save":
      void save();
      break;
    case "reset":
      void (async () => {
        stop();
        await clearSnapshot();
        if (params) await init({ ...params, fresh: true, seed: null });
      })();
      break;
    case "force":
      force(m.what);
      break;
  }
}

// ---------------------------------------------------------------------------
// Founding, restoring, returning
// ---------------------------------------------------------------------------

async function init(p: InitParams) {
  stop();
  params = p;
  speed = p.speed;
  place = placeFrom(p.timeZone, p.offsetMinutes);
  const now = realNow();
  let resetReason: "schema" | "corrupt" | null = null;
  let absence: string | null = null;
  let founded = false;
  sim = null;
  if (p.fresh) await clearSnapshot();
  if (p.persist && !p.fresh) {
    const snap = await loadSnapshot();
    if (snap) {
      const res = restore(snap, place);
      if ("sim" in res) sim = res.sim;
      else {
        resetReason = res.reset;
        await clearSnapshot();
      }
    }
  }
  if (sim && p.seed !== null && sim.w.seed !== p.seed) sim = null;
  const firstVisit = !sim;
  if (!sim) {
    const seed = p.seed ?? (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0);
    sim = Simulation.found(seed, now, place);
    founded = true;
  }
  sim.place = place;
  sim.composePaper = composePaper;
  if (!founded && now > sim.w.t) {
    const r = catchUp(sim, now);
    absence = r?.text ?? null;
  }
  for (const f of p.force) force(f, true);
  const lt = local(sim.w.t, place);
  if (!sim.w.paper) {
    const paper = composePaper(sim, lt);
    if (paper) {
      sim.w.paper = paper;
      sim.w.papers.push(paper);
    }
  }
  if (founded) sim.addLog({ t: now, text: firstShift(sim), kind: "shift", w: 1, refs: [], rumour: -1 });
  sim.w.visits.push({ start: now, end: now, listened: 0, traced: [] });
  if (sim.w.visits.length > 60) sim.w.visits.splice(0, sim.w.visits.length - 60);
  sim.out = { events: [], log: [], heard: [], paper: null, ownersChanged: false };
  ownersSent = sim.ownersVersion;
  countedCalls.clear();
  post({
    type: "ready",
    city: staticCity(sim),
    directory: directory(sim),
    owners: sim.owners.slice(),
    seed: sim.w.seed,
    created: sim.w.created,
    founded,
    resetReason,
    absence,
    log: sim.w.log.slice(-80),
    paper: sim.w.paper,
    visits: sim.w.visits.slice(-40),
    south: place.south,
    firstVisit,
  });
  postTick();
  postCensus();
  lastSave = performance.now();
  if (p.persist) void save();
  start();
}

function staticCity(s: Simulation): StaticCity {
  const w = s.w;
  const L0 = s.layout;
  const sup = supervisor(w);
  return {
    width: L0.width,
    districtX: L0.districtX,
    hill: L0.hill,
    el: L0.el,
    buildings: L0.buildings,
    windows: L0.windows,
    far: L0.far,
    lines: w.lines.map((l) => ({ id: l.id, number: l.number, district: l.district, kind: l.kind, label: l.label, slot: l.slot, owner: l.owner })),
    venues: w.venues.map((v) => ({ id: v.id, name: v.name, district: v.district, building: v.workplace >= 0 ? w.workplaces[v.workplace].building : -1 })),
    households: w.households.map((h) => ({ id: h.id, building: h.building, street: h.street, number: h.number, members: h.members.slice() })),
    workplaces: w.workplaces.map((x) => ({ id: x.id, name: x.name, building: x.building, line: x.line, owner: x.owner >= 0 ? x.owner : x.staff[0] ?? -1 })),
    supervisor: sup ? full(sup) : "the supervisor",
    note: framingNote(w),
  };
}

/** Catch the city up with the real clock after a pause or a hidden tab. */
function resync() {
  if (!sim) return;
  const now = realNow();
  const behind = now - sim.w.t;
  if (behind < 2000) return;
  const r = catchUp(sim, now);
  drain();
  post({ type: "returned", text: r?.text ?? null, away: behind });
  lastReal = performance.now();
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

function start() {
  stop();
  lastReal = performance.now();
  acc = 0;
  loopTimer = setTimeout(loop, LOOP_MS);
}

function stop() {
  if (loopTimer) clearTimeout(loopTimer);
  loopTimer = null;
}

function loop() {
  loopTimer = null;
  if (!sim || hidden) return;
  const now = performance.now();
  const elapsed = Math.min(400, now - lastReal);
  lastReal = now;
  let steps = 0;
  if (speed > 0) {
    // Never run too far ahead of the visitor's own clock.
    const ahead = sim.w.t - realNow();
    const eff = ahead > MAX_AHEAD ? Math.min(speed, 1) : speed;
    if (ahead > MAX_AHEAD && speed > 1) speed = 1;
    acc += elapsed * eff;
    const maxSteps = Math.ceil(eff * 3) + 4;
    const t0 = performance.now();
    while (acc >= DT && steps < maxSteps) {
      sim.step();
      acc -= DT;
      steps++;
    }
    if (acc > DT * 6) acc = DT * 6;
    stepMs += performance.now() - t0;
    stepN += steps;
  }
  drain();
  if (now - lastTick >= 190) postTick();
  if (now - lastCensus > 2000) postCensus();
  if (inspectId !== null && now - lastCard > 1500) postCard();
  if (traceId !== null && now - lastTrace > 4000) postTrace();
  if (now - lastPerf > 3000 && stepN) {
    post({ type: "perf", msPerStep: stepMs / stepN });
    stepMs = 0;
    stepN = 0;
    lastPerf = now;
  }
  if (params?.persist && now - lastSave > 20_000) void save();
  const spent = performance.now() - now;
  loopTimer = setTimeout(loop, Math.max(8, LOOP_MS - spent));
}

async function save() {
  if (!sim || saving || !params?.persist) return;
  saving = true;
  lastSave = performance.now();
  const v = sim.w.visits[sim.w.visits.length - 1];
  if (v) {
    v.end = realNow();
    v.listened = sim.w.listened;
  }
  const ok = await saveSnapshot(snapshot(sim, realNow()));
  saving = false;
  if (ok) post({ type: "saved", at: realNow() });
}

// ---------------------------------------------------------------------------
// Outgoing
// ---------------------------------------------------------------------------

function drain() {
  if (!sim) return;
  const out = sim.out;
  const w = sim.w;
  if (out.heard.length) {
    const lines: HeardMsg[] = out.heard.map((h) => {
      const call = w.calls.find((c) => c.id === h.call);
      let name = "";
      if (call && h.who !== 2) {
        const id = h.who === 0 ? call.from : call.toLine === OPERATOR_LINE ? call.from : call.answer;
        const c = id >= 0 ? w.citizens[id] : null;
        name = c ? full(c) : "";
      }
      return { call: h.call, who: h.who, name, text: h.text, t: h.t, rumour: h.rumour };
    });
    post({ type: "heard", lines });
    out.heard = [];
  }
  if (out.log.length) {
    post({ type: "log", entries: out.log });
    out.log = [];
  }
  if (out.paper) {
    post({ type: "paper", paper: out.paper });
    out.paper = null;
  }
  if (out.ownersChanged) {
    out.ownersChanged = false;
    post({ type: "directory", directory: directory(sim) });
  }
  // Calls per district this hour, for the census.
  const lt = local(w.t, sim.place);
  const hk = lt.dayIndex * 24 + Math.floor(lt.hour);
  if (hk !== hourKey) {
    hourKey = hk;
    perDistrictHour.fill(0);
    countedCalls.clear();
  }
  for (const c of w.calls) {
    if (c.phase === "talk" && !countedCalls.has(c.id) && c.fromLine >= 0) {
      countedCalls.add(c.id);
      perDistrictHour[w.lines[c.fromLine].district]++;
    }
  }
  out.events = [];
}

function postTick() {
  if (!sim) return;
  lastTick = performance.now();
  const w = sim.w;
  const lt = local(w.t, sim.place);
  const down = [0, 1, 2, 3, 4].filter((d) => districtDown(sim!, d));
  const citizens = new Uint8Array(w.citizens.length);
  for (let i = 0; i < w.citizens.length; i++) {
    const c = w.citizens[i];
    let v = c.act & 7;
    if (c.call >= 0) v |= 8;
    if (c.suspicion > 0.3) v |= 16;
    if (down.length && down.includes(w.households[c.home].district) && c.act === Act.Home) v |= 32;
    citizens[i] = v;
  }
  const lines = new Uint8Array(w.lines.length);
  for (let i = 0; i < w.lines.length; i++) if (w.lineDown[i]) lines[i] = L.Down;
  const calls: CallView[] = [];
  const newYear = (() => {
    const m = minutesToNewYear(lt);
    return m !== null && m >= 0 && m < 1;
  })();
  for (const c of w.calls) {
    const listened = sim.listen === c.id;
    const mark = listened ? 16 : 0;
    const set = (l: number, s: number) => {
      if (l >= 0 && l < lines.length && lines[l] !== L.Down) lines[l] = s | mark;
    };
    switch (c.phase) {
      case "signal":
        set(c.fromLine, L.Signal);
        break;
      case "ring":
        set(c.fromLine, L.Signal);
        set(c.toLine, L.Ring);
        break;
      case "talk":
        set(c.fromLine, L.Talk);
        set(c.toLine, L.Talk);
        break;
      case "clear":
        set(c.fromLine, L.Clear);
        set(c.toLine, L.Clear);
        break;
      default:
        set(c.fromLine, L.Busy);
    }
    calls.push({ id: c.id, from: c.from, answer: c.answer, to: c.to, fromLine: c.fromLine, toLine: c.toLine, phase: c.phase, pair: c.pair, placed: c.placed, talkAt: c.talkAt, listened });
  }
  const op = w.operatorCall >= 0 ? w.calls.find((c) => c.id === w.operatorCall) : undefined;
  const storm = w.storm && w.storm.start <= w.t && w.storm.end > w.t ? { rain: 0.4 + w.storm.severity * 0.6, wind: w.storm.severity } : null;
  const opening = w.openingDay === lt.dayIndex && lt.hour >= 19 && w.openingVenue >= 0 ? w.workplaces[w.openingVenue].building : -1;
  let owners: Int16Array | null = null;
  if (ownersSent !== sim.ownersVersion) {
    owners = sim.owners.slice();
    ownersSent = sim.ownersVersion;
  }
  const transfer: Transferable[] = [citizens.buffer, lines.buffer];
  if (owners) transfer.push(owners.buffer);
  post(
    {
      type: "tick",
      t: w.t,
      speed,
      ahead: Math.max(0, w.t - realNow()),
      citizens,
      lines,
      calls,
      owners,
      operator: op && op.phase === "ring" ? { ringing: true, from: op.from, fromLine: op.fromLine, call: op.id } : null,
      storm,
      fire: w.fire && w.fire.end ? { building: w.fire.building, since: w.fire.start } : null,
      opening,
      newYear,
      down,
      listening: sim.listen,
    },
    transfer,
  );
}

function postCensus() {
  if (!sim) return;
  lastCensus = performance.now();
  post({ type: "census", census: takeCensus(sim, perDistrictHour), rumours: listRumours(sim) });
}

function postCard() {
  if (!sim) return;
  lastCard = performance.now();
  post({ type: "card", card: inspectId === null ? null : readCard(sim, inspectId) });
}

function postTrace() {
  if (!sim) return;
  lastTrace = performance.now();
  post({ type: "trace", trace: traceId === null ? null : readTrace(sim, traceId) });
}

// ---------------------------------------------------------------------------
// For demonstrations and tests: make something happen now.
// ---------------------------------------------------------------------------

function force(what: ForceWhat, quiet = false) {
  if (!sim) return;
  const w = sim.w;
  const lt = local(w.t, sim.place);
  switch (what) {
    case "storm":
      w.storm = {
        day: lt.dayIndex,
        start: w.t,
        end: w.t + 3 * HOUR,
        severity: 1,
        fall: [w.t + 20_000, w.t + 25 * MINUTE, w.t + 45 * MINUTE, w.t + 60 * MINUTE, w.t + 70_000],
        up: [0, 0, 0, 0, 0],
        crews: [-1, -1],
        crewDone: [0, 0],
      };
      break;
    case "fire": {
      const b = sim.layout.buildings.find((x) => x.style === "tenement" && x.district === 1);
      if (b) {
        w.fire = { building: b.id, district: 1, start: w.t + 5000, end: 0, reopen: 0, households: w.households.filter((h) => h.building === b.id).map((h) => h.id), workplace: w.workplaces.find((x) => x.building === b.id)?.id ?? -1, reported: false };
      }
      break;
    }
    case "operator": {
      const c = w.citizens.find((x) => x.act === Act.Home && w.households[x.home].line >= 0 && x.call < 0);
      if (c) {
        c.suspicion = 0.9;
        sim.placeCall(c, -1, "operator");
      }
      break;
    }
    case "engage": {
      const a = w.citizens.find((c) => c.job === "florist");
      const b = a ? w.citizens.find((c) => c.ties.some((t) => t.o === a.id && t.k & K.ROMANCE)) : undefined;
      if (a && b && !(tieOf(a, b.id)!.k & K.ENGAGED)) sim.engage(a, b, -1);
      break;
    }
  }
  if (!quiet) {
    drain();
    postTick();
  }
}

void MINUTE;
