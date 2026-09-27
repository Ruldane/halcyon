/**
 * Messages between the page and the city's worker. Per-tick state is packed
 * into small typed arrays; everything else is plain structured data sent
 * only when it changes or when asked for.
 */
import type { CardData, Census, DirEntry, RumourListing, Trace } from "../sim/census";
import type { Building, Win } from "../sim/layout";
import type { LogEntry, Paper, Visit } from "../sim/types";

export interface InitParams {
  seed: number | null;
  fresh: boolean;
  /** Added to Date.now() in the worker: lets tests and visitors move the clock. */
  clockOffset: number;
  timeZone: string;
  offsetMinutes: number;
  speed: number;
  persist: boolean;
  force: ForceWhat[];
}

export type ForceWhat = "storm" | "fire" | "operator" | "engage";

export type ToWorker =
  | { type: "init"; params: InitParams }
  | { type: "speed"; speed: number }
  | { type: "listen"; call: number | null }
  | { type: "answerOperator" }
  | { type: "inspect"; id: number | null }
  | { type: "trace"; id: number | null }
  | { type: "summary" }
  | { type: "visibility"; hidden: boolean }
  | { type: "save" }
  | { type: "reset" }
  | { type: "force"; what: ForceWhat };

export interface LineView {
  id: number;
  number: string;
  district: number;
  kind: string;
  label: string;
  slot: number;
  /** Household or workplace id that owns it, for the hover card. */
  owner: number;
}

export interface StaticCity {
  width: number;
  districtX: number[];
  hill: [number, number];
  el: { x0: number; x1: number; stations: number[] };
  buildings: Building[];
  windows: Win[];
  far: number[];
  lines: LineView[];
  venues: { id: number; name: string; district: number; building: number }[];
  /** Household building ids, workplace building ids (for fires and openings). */
  households: { id: number; building: number; street: string; number: number; members: number[] }[];
  workplaces: { id: number; name: string; building: number; line: number; owner: number }[];
  supervisor: string;
  note: { text: string[]; signed: string };
}

export interface CallView {
  id: number;
  from: number;
  answer: number;
  to: number;
  fromLine: number;
  toLine: number;
  phase: "signal" | "ring" | "talk" | "clear" | "noanswer" | "busy";
  pair: number;
  placed: number;
  talkAt: number;
  listened: boolean;
}

/** Line lamp states. */
export const L = { Idle: 0, Signal: 1, Ring: 2, Talk: 3, Clear: 4, Busy: 5, Down: 6 } as const;

export interface TickMsg {
  type: "tick";
  t: number;
  speed: number;
  ahead: number;
  /** Per citizen: bits 0-2 activity, bit 3 on the telephone, bit 4 wary, bit 5 candle (power out, awake). */
  citizens: Uint8Array;
  /** Per line: state (L), with bit 4 set when the visitor is listening on it. */
  lines: Uint8Array;
  calls: CallView[];
  owners: Int16Array | null;
  operator: { ringing: boolean; from: number; fromLine: number; call: number } | null;
  storm: { rain: number; wind: number } | null;
  fire: { building: number; since: number } | null;
  opening: number;
  newYear: boolean;
  down: number[];
  listening: number;
}

export interface HeardMsg {
  call: number;
  who: 0 | 1 | 2;
  name: string;
  text: string;
  t: number;
  rumour: number;
}

export type FromWorker =
  | {
      type: "ready";
      city: StaticCity;
      directory: DirEntry[];
      owners: Int16Array;
      seed: number;
      created: number;
      founded: boolean;
      resetReason: "schema" | "corrupt" | null;
      absence: string | null;
      log: LogEntry[];
      paper: Paper | null;
      visits: Visit[];
      south: boolean;
      firstVisit: boolean;
    }
  | TickMsg
  | { type: "heard"; lines: HeardMsg[] }
  | { type: "log"; entries: LogEntry[] }
  | { type: "paper"; paper: Paper }
  | { type: "census"; census: Census; rumours: RumourListing[] }
  | { type: "card"; card: CardData | null }
  | { type: "trace"; trace: Trace | null }
  | { type: "summary"; text: string }
  | { type: "directory"; directory: DirEntry[] }
  | { type: "returned"; text: string | null; away: number }
  | { type: "visits"; visits: Visit[] }
  | { type: "saved"; at: number }
  | { type: "perf"; msPerStep: number }
  | { type: "error"; message: string };
