/**
 * The night log, kept by the supervisor in her own dry hand (well, type).
 * Entries are written from the simulation's events, rate-limited so the log
 * reads like a person noticing things rather than a machine printing them,
 * with ambient notes on quiet nights and a note on the visitor's listening.
 */
import { DAY, HOUR, MINUTE, clockText, dateText, local, spanText, type LocalTime, type Place } from "../sim/clock";
import { OCC } from "../sim/data";
import { Rng } from "../sim/rng";
import type { Simulation } from "../sim/sim";
import { Act, type Citizen, type LogEntry, type SimEvent, type World } from "../sim/types";
import { cap, formal, full, him, his, num, plural, Picker, tidy } from "./words";

const DISTRICT = ["the Wharf", "Pell Street", "Midtown", "Lantern Row", "Juniper Hill"];

/** A picker whose memory is the city's own (so a reloaded city says the same). */
const pick = {
  mem: {} as Record<string, number[]>,
  bind(mem: Record<string, number[]>) {
    this.mem = mem;
  },
  pick<T>(r: Rng, key: string, options: readonly T[]): T {
    return new Picker(6, this.mem).pick(r, `log-${key}`, options);
  },
};

export function supervisor(w: World): Citizen | undefined {
  return w.citizens.find((c) => c.job === "supervisor");
}

function lineNo(w: World, c: Citizen): string {
  if (c.act === Act.Work && c.work >= 0) {
    const l = w.lines[w.workplaces[c.work].line];
    if (l) return l.number;
  }
  const h = w.households[c.home];
  return h && h.line >= 0 ? w.lines[h.line].number : "";
}

/** "Miss Orr (4-12)" */
function who(w: World, id: number, withLine = true): string {
  const c = w.citizens[id];
  if (!c) return "a subscriber";
  const n = lineNo(w, c);
  return withLine && n ? `${formal(c)} (${n})` : formal(c);
}

function job(c: Citizen): string {
  return c.job ? OCC[c.job]?.title ?? c.job : "";
}

export type LogDraft = Omit<LogEntry, "id">;

export class LogWriter {
  write(sim: Simulation, lt: LocalTime): LogDraft[] {
    const w = sim.w;
    const out: LogDraft[] = [];
    const mark = w.logMark;
    // The supervisor's choice of words is her own, and the same on any replay.
    const rng = new Rng((w.step * 2654435761) >>> 0);
    pick.bind(w.said);
    if (!mark.event) mark.event = w.events.length ? w.events[w.events.length - 1].id - 1 : 0;
    for (const e of w.events) {
      if (e.id <= mark.event) continue;
      mark.event = e.id;
      if (e.w <= 0) continue;
      if (e.w === 1 && w.t - mark.entry < 4 * MINUTE) continue;
      const text = eventText(sim, e, rng);
      if (!text) continue;
      out.push({ t: e.t, text, kind: e.kind, w: e.w, refs: [e.a, e.b].filter((x) => x >= 0), rumour: e.rumour });
      mark.entry = w.t;
    }
    // The visitor, noted: only when there has been new listening since the last note.
    const fresh = w.listened - mark.listened;
    if (fresh > 0 && w.t - w.lastListenNote > 50 * MINUTE && w.t - mark.entry > 2 * MINUTE) {
      const call = w.calls.find((c) => c.id === sim.listen);
      const mins = Math.max(1, Math.round(w.listenedMs / MINUTE));
      let text: string;
      if (call && sim.listen >= 0) {
        text = pick.pick(rng, "listen-now", [
          `Position three has a listening cord up on ${w.lines[call.fromLine].number}. Noted.`,
          `Someone on position three is listening to ${w.lines[call.fromLine].number}. The key is there to be used, I suppose.`,
        ]);
      } else {
        text = pick.pick(rng, "listen", [
          `Position three has listened in ${plural(fresh, "time")} since my last note, ${plural(mins, "minute")} on the key in all. It is not forbidden. It is not encouraged.`,
          `The listening key on position three has been used ${plural(fresh, "more time")}. The subscribers are not fools.`,
          `${cap(plural(fresh, "more call"))} listened to from position three. I have asked no questions yet.`,
        ]);
      }
      w.lastListenNote = w.t;
      mark.listened = w.listened;
      out.push({ t: w.t, text, kind: "listening", w: 1, refs: [], rumour: -1 });
      mark.entry = w.t;
    }
    // A quiet stretch: note the board.
    if (w.t - mark.entry > 14 * MINUTE && w.t - mark.ambient > 14 * MINUTE) {
      const text = ambient(sim, lt, rng);
      if (text) {
        out.push({ t: w.t, text, kind: "ambient", w: 0, refs: [], rumour: -1 });
        mark.entry = w.t;
        mark.ambient = w.t;
      }
    }
    return out;
  }
}

function eventText(sim: Simulation, e: SimEvent, rng: Rng): string | null {
  const w = sim.w;
  const A = e.a >= 0 ? w.citizens[e.a] : null;
  const B = e.b >= 0 ? w.citizens[e.b] : null;
  const P = <T,>(k: string, o: readonly T[]) => pick.pick(rng, k, o);
  switch (e.kind) {
    case "firstcall":
      if (!A) return null;
      return P("first", [
        `First call of the morning: ${who(w, e.a)} to ${B ? who(w, e.b) : "a line that did not answer"}.${A.work >= 0 && w.workplaces[A.work].kind === "bakery" ? " It is always the bread." : ""}`,
        `The board wakes. ${who(w, e.a)} first, as usual${B ? `, to ${who(w, e.b)}` : ""}.`,
      ]);
    case "nightcall":
      if (!A || !B) return null;
      return P("night", [
        `${who(w, e.a)} rang ${who(w, e.b)}. Nobody rings anybody at this hour for a good reason, and very often for a better one.`,
        `A light on ${DISTRICT[e.district]} at this hour: ${who(w, e.a)}, to ${who(w, e.b)}.`,
        `${who(w, e.a)} to ${who(w, e.b)}. The small hours have their regulars.`,
      ]);
    case "longcall":
      if (!A || !B) return null;
      return P("long", [
        `${who(w, e.a)} and ${who(w, e.b)} were on the line for ${plural(e.n, "minute")}. The cord was warm.`,
        `${plural(e.n, "minute")} between ${formal(A)} and ${formal(B)}. Whatever it was, it needed saying.`,
      ]);
    case "missedhabit":
      if (!A || !B) return null;
      return e.n === 1
        ? P("miss1", [
            `${who(w, e.a)} did not ring ${formal(B)} this evening. ${cap(A.sex === "f" ? "She" : "He")} always rings.`,
            `No call from ${formal(A)} to ${formal(B)} tonight. First time in weeks.`,
          ])
        : `Third day now that ${formal(A)} has not rung ${formal(B)}.`;
    case "engaged":
      if (!A || !B) return null;
      return P("eng", [
        `${full(A)} and ${full(B)} are engaged. It was settled on the telephone, which I think is a first for this board.`,
        `${full(A)} and ${full(B)}: engaged, as of ${clockText(local(e.t, sim.place).hour)}. Their families' lines have not stopped since.`,
      ]);
    case "broken":
      if (!A || !B) return null;
      return `The engagement between ${full(A)} and ${full(B)} is off. Both lines quiet the rest of the evening.`;
    case "wedding":
      if (!A || !B) return null;
      return `${full(A)} and ${full(B)} married at St. Jude's. The Hill talked of nothing else until dark.`;
    case "birth":
      if (!A) return null;
      return P("birth", [
        `A baby for ${formal(A)}${B ? ` and ${formal(B)}` : ""}. The Infirmary was rung first, the grandmother eleven minutes after.`,
        `Born tonight: a child to ${full(A)}. Juniper Hill's lines lit one after another like a string of lamps.`,
      ]);
    case "fire": {
      const b = sim.layout.buildings[e.n];
      const place = e.b >= 0 ? w.workplaces[e.b].name : b?.address || DISTRICT[e.district];
      return `Fire at ${place}, ${DISTRICT[e.district]}. ${A ? `${who(w, e.a)} rang Mercy Street.` : ""} The lines on the street lit one after another.`;
    }
    case "fireout":
      return `The fire is out. No one hurt. ${cap(DISTRICT[e.district])} will talk of nothing else tomorrow.`;
    case "linesdown": {
      const lines = w.lines.filter((l) => l.district === e.district).map((l) => l.number).sort();
      return `Storm. ${cap(DISTRICT[e.district])}: ${plural(e.n, "line")} down, ${lines[0]} to ${lines[lines.length - 1]}. That end of the board has gone dark.`;
    }
    case "linesup":
      return P("up", [
        `${cap(DISTRICT[e.district])} restored by the ${e.n === 0 ? "first" : "second"} crew. The lamps came back in order, like a row of people waking.`,
        `Lines up again on ${DISTRICT[e.district]}. Four calls were waiting before the crew had packed its ladders.`,
      ]);
    case "stormend":
      return "The storm has blown itself out. All lines working.";
    case "bankrupt": {
      const wp = w.workplaces[e.n];
      return `${wp?.name ?? "A business"} has closed its doors. Its line rang six times this afternoon and no one answered.`;
    }
    case "opening": {
      const wp = w.workplaces[e.n];
      return `Opening night at ${wp?.name ?? "Lantern Row"}. Searchlights from eight. Expect the Row's lines to be busy.`;
    }
    case "rehired": {
      const wp = w.workplaces[e.n];
      if (!A || !wp) return null;
      return `${full(A)} has a place at ${wp.name}. The call that did it lasted under a minute.`;
    }
    case "reached": {
      if (!A) return null;
      const r = w.rumours.find((x) => x.id === e.rumour);
      if (!r) return null;
      const S = r.subject >= 0 ? w.citizens[r.subject] : null;
      if (e.w >= 3 && A === S) {
        // The subject has heard it.
        const conf = B;
        return conf
          ? `${full(A)} has heard what is being said about ${him(A)}. It came, by ${plural(e.n, "telephone")}, from ${his(A)} own confidence to ${full(conf)}.`
          : `${full(A)} has heard what is being said about ${him(A)}.`;
      }
      const about = S ? `the talk about ${full(S)}` : "a piece of talk";
      return P("reached", [
        `${cap(about)} has reached the ${job(A)}. It took ${plural(e.n, "telephone")} to get there.`,
        `${cap(about)} is now with ${formal(A)}, ${job(A)}. It passed through ${plural(e.n, "pair")} of hands on the way.`,
      ]);
    }
    case "spoiled":
      if (!A || !B) return null;
      return `The surprise ${full(A)} was planning for ${full(B)} is no longer a surprise. ${full(B)} was told on the telephone, by a friend, kindly.`;
    case "quarrel":
      if (!A || !B) return null;
      return P("quarrel", [
        `${who(w, e.a)} and ${who(w, e.b)} had words on the line. The words were civil. The pauses were not.`,
        `A sharp one between ${formal(A)} and ${formal(B)}. Both hung up first.`,
      ]);
    case "reconciled":
      if (!A || !B) return null;
      return `${formal(A)} and ${formal(B)} are speaking again. Six minutes, and most of it laughing.`;
    case "meeting":
      if (!A || !B || e.w < 1) return null;
      return P("meet", [
        `${formal(A)} and ${formal(B)} spoke for less than a minute and then met at ${w.venues[e.n]?.name ?? "the Automat"}. They used to say it all on the telephone.`,
        `${formal(A)} and ${formal(B)} were seen together at ${w.venues[e.n]?.name ?? "the Automat"}, after a call that said nothing at all.`,
        `Another pair who would rather meet than talk: ${formal(A)} and ${formal(B)}, at ${w.venues[e.n]?.name ?? "the Automat"}.`,
      ]);
    case "suspicion":
      if (e.a < 0) return "Nobody has mentioned listening on the lines for two days. Good.";
      return P("susp", [
        `${who(w, e.a)} heard a click on ${A ? his(A) : "the"} line and has begun to wonder. So have I.`,
        `${who(w, e.a)} asked, down the line, whether anyone else was on it. The other party laughed. ${A ? cap(A.sex === "f" ? "she" : "he") : "They"} did not.`,
      ]);
    case "operatorcall":
      if (!A) return null;
      return e.n === 0
        ? `A call came to the operator's own position from ${who(w, e.a)}, asking for "whoever is listening". The position did not answer.`
        : `${who(w, e.a)} rang the operator's position and was answered. I have not asked what was said.`;
    case "newyear":
      return "Midnight. Every lamp on the board at once. A happy new year, from the night staff.";
    default:
      return null;
  }
}

function ambient(sim: Simulation, lt: LocalTime, rng: Rng): string | null {
  const w = sim.w;
  const up = w.calls.filter((c) => c.phase === "talk").length;
  const byD = [0, 0, 0, 0, 0];
  for (const c of w.calls) if (c.fromLine >= 0) byD[w.lines[c.fromLine].district]++;
  const busiest = byD.indexOf(Math.max(...byD));
  const h = lt.hour;
  const opts: string[] = [];
  if (up === 0) opts.push("Board quiet. Not a lamp lit. I can hear the clock.", "Nothing on the board. The girls are doing the crossword.");
  else if (up <= 2) opts.push(`${cap(plural(up, "line"))} up. A quiet stretch.`, `Board quiet. ${cap(plural(up, "cord"))} up, most of it ${DISTRICT[busiest]}.`);
  else opts.push(`${cap(plural(up, "call"))} up at once, ${DISTRICT[busiest]} busiest.`, `Busy. ${cap(num(up))} cords up, and ${DISTRICT[busiest]} wants more.`);
  if (h >= 2 && h < 5) opts.push(`${clockText(h)}. The Infirmary, a cab, and someone on Pell Street who can't sleep. The usual company.`);
  if (lt.dow === 0 && h > 8 && h < 13) opts.push("Sunday. Half the board asleep and the other half at church.");
  if (h >= 17.5 && h < 19) opts.push("The offices have gone home. The evening calls haven't started. This is the lull.");
  if (w.storm && w.storm.start > w.t && w.storm.start - w.t < 6 * HOUR) opts.push("The glass is falling. The harbour master has told everyone twice.");
  const guarded = w.citizens.filter((c) => c.suspicion > 0.35).length;
  if (guarded > 8) opts.push(`${cap(num(guarded))} subscribers now keep their voices down on the telephone. Calls are shorter. The Automat is doing well.`);
  return opts.length ? pick.pick(rng, "amb", opts) : null;
}

// ---------------------------------------------------------------------------
// The absence entry
// ---------------------------------------------------------------------------

export interface AbsenceReport {
  from: number;
  to: number;
  calls: number;
  events: SimEvent[];
  spread: { rumour: number; before: number; after: number }[];
  suspicionBefore: number;
  suspicionAfter: number;
  habitsBroken: { a: number; b: number }[];
  capped: boolean;
}

/** A citizen's name as it was at time t (before a wedding, their own name). */
function nameAt(w: World, id: number, t: number): string {
  const c = w.citizens[id];
  if (!c) return "someone";
  const wed = c.hist.find((h) => h.e === "married");
  if (c.maiden && wed && wed.t > t) return `${c.first} ${c.maiden}`;
  return full(c);
}

export function absenceEntry(w: World, place: Place, rep: AbsenceReport): string {
  const a = local(rep.from, place);
  const b = local(rep.to, place);
  const sameDay = a.dayIndex === b.dayIndex;
  const span = sameDay
    ? `${clockText(a.hour)} to ${clockText(b.hour)}`
    : `${dateText(a)}, ${clockText(a.hour)}, to ${dateText(b)}, ${clockText(b.hour)}`;
  const parts: string[] = [];
  parts.push(`While you were off shift (${span}, ${spanText(rep.to - rep.from)}): ${rep.calls.toLocaleString("en-US")} calls connected.`);
  const seen = new Set<string>();
  const mention = (e: SimEvent): string | null => {
    const A = e.a >= 0 ? w.citizens[e.a] : null;
    const B = e.b >= 0 ? w.citizens[e.b] : null;
    const when = clockText(local(e.t, place).hour);
    switch (e.kind) {
      case "engaged":
        return A && B ? `${nameAt(w, A.id, e.t)} and ${nameAt(w, B.id, e.t)} ${w.weddings.some((x) => x.a === A.id || x.b === A.id) || !A.maiden ? "are engaged" : "got engaged"}.` : null;
      case "broken":
        return A && B ? `${nameAt(w, A.id, e.t)} and ${nameAt(w, B.id, e.t)} have broken it off.` : null;
      case "wedding":
        return A && B ? `${full(A)} and ${full(B)} were married.` : null;
      case "birth":
        return A ? `A baby for ${formal(A)}.` : null;
      case "fire":
        return `A fire on ${DISTRICT[e.district]} at ${when}; the residents spent the night with family. No one hurt.`;
      case "linesdown":
        return `A storm took ${DISTRICT[e.district]}'s lines down; the crews had them back by morning.`;
      case "bankrupt":
        return `${w.workplaces[e.n]?.name ?? "A business"} has closed.`;
      case "opening":
        return `Opening night at ${w.workplaces[e.n]?.name ?? "Lantern Row"}.`;
      case "reached": {
        if (!A) return null;
        const r = w.rumours.find((x) => x.id === e.rumour);
        const S = r && r.subject >= 0 ? w.citizens[r.subject] : null;
        if (A === S) return `${full(A)} has heard what's being said about ${him(A)}.`;
        return S ? `The talk about ${full(S)} reached the ${job(A)} at ${when}.` : null;
      }
      case "spoiled":
        return A && B ? `The surprise for ${full(B)} is spoiled.` : null;
      case "rehired":
        return A ? `${full(A)} found work.` : null;
      case "reconciled":
        return A && B ? `${formal(A)} and ${formal(B)} made it up.` : null;
      case "operatorcall":
        return A ? `${formal(A)} rang the operator's position, asking for whoever listens.` : null;
      default:
        return null;
    }
  };
  // Storms and engagements are told once, together.
  const downs = [...new Set(rep.events.filter((e) => e.kind === "linesdown").map((e) => e.district))];
  if (downs.length) {
    const names = downs.map((d) => DISTRICT[d]);
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
    parts.push(`${downs.length > 2 ? "Storms" : "A storm"} took down the lines on ${list}; the crews had them back by morning.`);
  }
  const engaged = rep.events.filter((e) => e.kind === "engaged");
  if (engaged.length > 2) {
    const couples = engaged.slice(0, 3).map((e) => `${nameAt(w, e.a, e.t)} and ${nameAt(w, e.b, e.t)}`);
    parts.push(`${cap(num(engaged.length))} engagements: ${couples.join("; ")}${engaged.length > 3 ? ", and more" : ""}.`);
  }
  const ranked = [...rep.events].filter((e) => e.kind !== "linesdown" && !(engaged.length > 2 && e.kind === "engaged")).sort((x, y) => y.w - x.w || x.t - y.t);
  let n = 0;
  let reached = 0;
  for (const e of ranked) {
    if (n >= 6) break;
    if (e.kind === "reached" && ++reached > 2) continue;
    const s = mention(e);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    parts.push(s);
    n++;
  }
  for (const h of rep.habitsBroken.slice(0, 1)) {
    const A = w.citizens[h.a];
    const B = w.citizens[h.b];
    if (A && B) parts.push(`${formal(A)} has stopped ringing ${formal(B)} in the evenings.`);
  }
  const top = rep.spread.filter((s) => s.after - s.before >= 3).sort((x, y) => y.after - y.before - (x.after - x.before))[0];
  if (top) {
    const r = w.rumours.find((x) => x.id === top.rumour);
    if (r && r.tpl !== "listener") {
      const S = r.subject >= 0 ? w.citizens[r.subject] : null;
      parts.push(`The talk about ${S ? full(S) : "it"} went from ${num(top.before)} mouths to ${num(top.after)}.`);
    }
  }
  if (rep.suspicionBefore > 0.08 && rep.suspicionAfter < rep.suspicionBefore * 0.7) parts.push("Talk of listening on the lines has quietened.");
  else if (rep.suspicionAfter > rep.suspicionBefore + 0.03) parts.push("More people are talking about the Exchange listening in. Some of them on the telephone.");
  if (rep.capped) parts.push("The log for the rest of your absence is incomplete. Too much happened.");
  if (n === 0 && rep.calls < 50) parts.push("Nothing of note.");
  return tidy(parts.join(" "));
}

/** The first line in a new operator's log. */
export function firstShift(sim: Simulation): string {
  const w = sim.w;
  const up = w.calls.filter((c) => c.phase === "talk").length;
  const byD = [0, 0, 0, 0, 0];
  for (const c of w.calls) if (c.fromLine >= 0) byD[w.lines[c.fromLine].district]++;
  const busiest = byD.indexOf(Math.max(...byD));
  return tidy(`New operator on position three. ${up ? `${cap(plural(up, "cord"))} up as the new operator sat down, ${DISTRICT[busiest]} busiest.` : "The board quiet as the new operator sat down."} I have left the memorandum at the position.`);
}

export function framingNote(w: World): { text: string[]; signed: string } {
  const s = supervisor(w);
  const name = s ? `${s.first.charAt(0)}. ${s.last}` : "The supervisor";
  return {
    signed: `${name}, Night Supervisor`,
    text: [
      "To the new operator on position three.",
      "Every call in Halcyon comes through this board. You will see the lamps light when someone lifts a receiver, and the cords go up when we connect them. Mostly the board runs itself. It has done for years.",
      "Your position has a listening key. Press any lit lamp on the board, or a ticket on the shelf, and your cord goes into that line: you will hear what is said. I will not tell you not to. I will tell you that the lines click, that people are not stupid, and that a city which thinks it is overheard stops saying what it means.",
      "Anyone in the city can be looked up in the directory, and anything they say about each other can be traced, if you have the patience. The drawer under the desk has it all.",
      "The log is mine. Read it if you like.",
    ],
  };
}

void DAY;
