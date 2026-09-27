/**
 * The page's slow state, for React: the paper, the log, the census, what is
 * heard on the line, the card in hand. Per-frame values (lamps, cords,
 * windows) never pass through here; the engine reads them directly.
 */
import { useSyncExternalStore } from "react";
import type { CardData, Census, DirEntry, RumourListing, Trace } from "../sim/census";
import type { LogEntry, Paper, Visit } from "../sim/types";
import type { CallView, HeardMsg, StaticCity } from "../worker/protocol";

export type Slip = "none" | "listen" | "trace" | "card";

export interface Listening {
  call: number;
  fromLine: number;
  toLine: number;
  from: number;
  answer: number;
  lines: HeardMsg[];
  ended: boolean;
  operator: boolean;
}

export interface Stage {
  panorama: boolean;
  /** Each district's bay, in CSS pixels across the stage. */
  bays: { left: number; width: number }[];
  visible: number[];
  width: number;
  height: number;
}

export interface UIState {
  ready: boolean;
  error: string | null;
  city: StaticCity | null;
  directory: DirEntry[];
  seed: number;
  created: number;
  founded: boolean;
  resetReason: "schema" | "corrupt" | null;
  firstVisit: boolean;
  south: boolean;
  t: number;
  speed: number;
  heldSpeed: number;
  ahead: number;
  paper: Paper | null;
  paperFlash: number;
  log: LogEntry[];
  absence: string | null;
  returned: string | null;
  census: Census | null;
  rumours: RumourListing[];
  calls: CallView[];
  operatorRinging: boolean;
  slip: Slip;
  listening: Listening | null;
  pastListens: Listening[];
  trace: Trace | null;
  traceStep: number;
  card: CardData | null;
  cardId: number | null;
  following: number | null;
  summary: string | null;
  visits: Visit[];
  still: boolean;
  narrate: boolean;
  noteOpen: boolean;
  district: number;
  storm: boolean;
  down: number[];
  newYear: boolean;
  savedAt: number | null;
  msPerStep: number;
  debug: boolean;
  stage: Stage | null;
  timeZone: string;
  offsetMinutes: number;
}

export const initialState: UIState = {
  ready: false,
  error: null,
  city: null,
  directory: [],
  seed: 0,
  created: 0,
  founded: false,
  resetReason: null,
  firstVisit: false,
  south: false,
  t: 0,
  speed: 1,
  heldSpeed: 1,
  ahead: 0,
  paper: null,
  paperFlash: 0,
  log: [],
  absence: null,
  returned: null,
  census: null,
  rumours: [],
  calls: [],
  operatorRinging: false,
  slip: "none",
  listening: null,
  pastListens: [],
  trace: null,
  traceStep: -1,
  card: null,
  cardId: null,
  following: null,
  summary: null,
  visits: [],
  still: false,
  narrate: false,
  noteOpen: false,
  district: 2,
  storm: false,
  down: [],
  newYear: false,
  savedAt: null,
  msPerStep: 0,
  debug: false,
  stage: null,
  timeZone: "UTC",
  offsetMinutes: 0,
};

type Listener = () => void;

export class Store {
  private state: UIState = initialState;
  private ls = new Set<Listener>();

  get = () => this.state;

  set(patch: Partial<UIState> | ((s: UIState) => Partial<UIState>)) {
    const p = typeof patch === "function" ? patch(this.state) : patch;
    let changed = false;
    for (const k in p) {
      if ((p as Record<string, unknown>)[k] !== (this.state as unknown as Record<string, unknown>)[k]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = { ...this.state, ...p };
    for (const l of this.ls) l();
  }

  subscribe = (l: Listener) => {
    this.ls.add(l);
    return () => void this.ls.delete(l);
  };
}

export function useStore<T>(store: Store, pick: (s: UIState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => pick(store.get()),
    () => pick(initialState),
  );
}
