/**
 * The shape of Halcyon. Everything in `World` is plain data: it is what the
 * worker saves to IndexedDB and what the headless tests inspect.
 */

export const Act = { Asleep: 0, Home: 1, Work: 2, Out: 3, Away: 4 } as const;
export type Act = (typeof Act)[keyof typeof Act];

/** Tie kind bits. A tie may carry several (a sister who is also a rival). */
export const K = {
  KIN: 1,
  FRIEND: 2,
  ROMANCE: 4,
  RIVAL: 8,
  BUSINESS: 16,
  SPOUSE: 32,
  ENGAGED: 64,
  NEIGHBOUR: 128,
  COLLEAGUE: 256,
  LANDLORD: 512, // the other is my landlord
  TENANT: 1024, // the other is my tenant
  EMPLOYER: 2048, // the other employs me
  EMPLOYEE: 4096, // the other works for me
} as const;

export type Kin =
  | "wife" | "husband" | "sister" | "brother" | "mother" | "father" | "daughter" | "son"
  | "cousin" | "aunt" | "uncle" | "niece" | "nephew" | "grandmother" | "grandfather" | "granddaughter" | "grandson"
  | "sister-in-law" | "brother-in-law";

export interface Tie {
  /** The other citizen. */
  o: number;
  /** Kind bits (K). */
  k: number;
  /** Warmth of the tie, 0..1. */
  s: number;
  /** Rivalry, 0..1. */
  r: number;
  /** Trust, 0..1: how freely secrets pass. */
  tr: number;
  /** Last contact (sim ms), by telephone or in person. */
  last: number;
  /** Calls, lifetime. */
  n: number;
  /** Habitual hour of calling (-1 none) and confidence 0..1. */
  hh: number;
  hc: number;
  /** Consecutive days a habitual call has been missed. */
  miss: number;
  /** Day index on which a miss was last counted. */
  md?: number;
  /** What the other is to me, when kin. */
  kin?: Kin;
}

export interface Traits {
  /** Sociability. */
  soc: number;
  /** Love of news. */
  gossip: number;
  /** Keeps secrets. */
  discretion: number;
  warmth: number;
  /** Boldness. */
  nerve: number;
  credulity: number;
  /** Chronotype: -1 lark .. +1 owl. */
  owl: number;
  thrift: number;
  /** Churchgoer. */
  pious: number;
}

export interface Debt {
  to: number; // citizen id
  amount: number; // dollars
  since: number;
  /** "rent" debts count weeks for the biography. */
  rent: boolean;
}

export interface Secret {
  tpl: SecretTpl;
  other: number;
  n: number;
  /** Rumour id once it has left the citizen's keeping. */
  rumour: number;
}

export type SecretTpl =
  | "debt" | "crush" | "surprise" | "car" | "novel" | "lessons" | "inheritance" | "jobhunt"
  | "pawned" | "dog" | "letters" | "recipe";

export type RumourTpl =
  | SecretTpl
  | "engaged" | "broken" | "fire" | "storm" | "bankrupt" | "opening" | "wedding" | "birth"
  | "seen" | "lostjob" | "listener" | "rehired" | "answered";

export interface Hist {
  t: number;
  /** Short code; see grammar/bio.ts. */
  e: string;
  o?: number;
  n?: number;
}

export interface Plan {
  with: number;
  at: number; // sim ms
  venue: number;
  why: "meet" | "pictures" | "dance" | "supper" | "church" | "talk";
}

export interface Citizen {
  id: number;
  first: string;
  last: string;
  sex: "f" | "m";
  title: string;
  age: number;
  home: number; // household
  job: string | null; // occupation key
  work: number; // workplace id, -1 none
  employed: boolean;
  traits: Traits;
  money: number;
  debts: Debt[];
  company: number; // 0 lonely .. 1 content
  rest: number; // 0 exhausted .. 1 rested
  mood: number; // -1 .. 1
  act: Act;
  /** Venue id when out, -1 otherwise. */
  venue: number;
  actSince: number;
  call: number; // current call id, -1
  suspicion: number;
  clicks: number;
  ties: Tie[];
  /** rumour id -> version index known. */
  knows: Record<number, number>;
  secrets: Secret[];
  hist: Hist[];
  plans: Plan[];
  /** Next time this citizen may try to place a call. */
  nextTry: number;
  /** A call they mean to make (retry after no answer / busy). */
  retry: { to: number; at: number; purpose: Purpose } | null;
  expecting: number; // due time or 0
  children: number;
  /** Displaced by fire or storm until. */
  displacedUntil: number;
  /** Family name before marriage. */
  maiden?: string;
}

export type HouseKind = "family" | "single" | "boarding" | "hotel" | "ship" | "lighthouse";

export interface Household {
  id: number;
  kind: HouseKind;
  district: number;
  street: string;
  number: number;
  flat: string;
  line: number; // -1 uses the pay station
  members: number[];
  landlord: number; // citizen, -1 owned
  rent: number; // weekly
  building: number;
  cls: 0 | 1 | 2;
}

export type WorkKind =
  | "harbour" | "customs" | "shipping" | "fish" | "flour" | "lighthouse" | "ferry"
  | "bakery" | "laundry" | "pawn" | "fire" | "drugstore" | "grocery"
  | "insurance" | "bank" | "paper" | "cityhall" | "store" | "hotel" | "law" | "exchange"
  | "club" | "dancehall" | "pictures" | "automat" | "milliner" | "florist" | "cafe" | "taxi" | "books"
  | "infirmary" | "church" | "school" | "service";

export interface Workplace {
  id: number;
  name: string;
  kind: WorkKind;
  district: number;
  street: string;
  number: number;
  line: number;
  owner: number;
  staff: number[];
  capacity: number;
  till: number;
  revenue: number; // dollars per day at a good week
  open: boolean;
  closedUntil: number;
  building: number;
  /** Suppliers and customers (workplace ids). */
  trade: number[];
  /** Days the till has been under water. */
  redDays: number;
}

export type VenueKind = "club" | "dance" | "pictures" | "automat" | "cafe" | "church" | "park" | "pier";

export interface Venue {
  id: number;
  name: string;
  kind: VenueKind;
  district: number;
  workplace: number;
  /** A pay telephone at the venue (line id) or -1. */
  line: number;
}

export type LineKind = "home" | "work" | "pay" | "special";

export interface Line {
  id: number;
  number: string;
  district: number;
  kind: LineKind;
  /** household id, workplace id, venue id, or -1. */
  owner: number;
  label: string;
  /** Position within its district's field. */
  slot: number;
}

export type CallPhase = "signal" | "ring" | "talk" | "clear" | "noanswer" | "busy";

export type Purpose =
  | "chat" | "habit" | "news" | "romance" | "business" | "order" | "askloan" | "demand" | "repay"
  | "invite" | "plan" | "quarrel" | "makeup" | "sympathy" | "jobhunt" | "confront" | "fire"
  | "doctor" | "newyear" | "wrong" | "operator" | "guarded" | "congratulate" | "confide" | "checkin";

export interface Effect {
  kind:
    | "tell" | "confide" | "loan" | "repay" | "plan" | "propose" | "quarrel" | "reconcile" | "hire"
    | "click" | "warm" | "invite" | "spoil" | "break" | "fire" | "suspect";
  a: number;
  b: number;
  n?: number;
  rumour?: number;
  claim?: Claim;
  venue?: number;
  at?: number;
  ok?: boolean;
}

export interface Beat {
  /** ms after the talk begins. */
  at: number;
  /** 0 = the caller's side, 1 = the called side, 2 = the line itself (a click, a pause). */
  who: 0 | 1 | 2;
  text: string;
  fx?: Effect;
  done?: boolean;
}

export interface Call {
  id: number;
  from: number;
  /** Intended party (citizen) or -1 for a service line. */
  to: number;
  /** Who actually answered. */
  answer: number;
  fromLine: number;
  toLine: number;
  purpose: Purpose;
  phase: CallPhase;
  placed: number;
  phaseAt: number;
  talkAt: number;
  endAt: number;
  pair: number;
  beats: Beat[];
  beat: number;
  listened: number; // ms listened
  heardBy: boolean;
  guarded: boolean;
}

export interface Claim {
  tpl: RumourTpl;
  subj: number;
  other: number;
  /** Amount or count (weeks, dollars, days). */
  n: number;
  /** Exaggeration, 0..3. */
  x: number;
  /** A place: district or workplace, template-dependent. */
  place: number;
  /** Template-specific variant (which car, which lessons). */
  v: number;
}

export interface Version {
  id: number;
  parent: number;
  teller: number;
  /** The one who heard it; equal to teller when they worked it out alone. */
  hearer: number;
  t: number;
  claim: Claim;
  text: string;
  call: number; // -1 in person
  hedge: number;
}

export interface Rumour {
  id: number;
  tpl: RumourTpl;
  subject: number;
  truth: boolean;
  origin: number;
  born: number;
  versions: Version[];
  heat: number;
  knowers: number;
  peak: number;
  lastTold: number;
  dead: boolean;
  /** For event rumours, the event id. */
  event: number;
}

export type EventKind =
  | "fire" | "fireout" | "storm" | "stormend" | "linesdown" | "linesup" | "engaged" | "broken" | "wedding"
  | "birth" | "bankrupt" | "opening" | "lostjob" | "rehired" | "newyear" | "reached" | "spoiled"
  | "moved" | "evicted" | "loan" | "reconciled" | "quarrel" | "suspicion" | "operatorcall" | "meeting"
  | "missedhabit" | "longcall" | "firstcall" | "nightcall" | "paper";

export interface SimEvent {
  id: number;
  t: number;
  kind: EventKind;
  a: number;
  b: number;
  district: number;
  rumour: number;
  n: number;
  /** Importance 0..3 for the log and paper. */
  w: number;
}

export interface Storm {
  day: number;
  start: number;
  end: number;
  severity: number;
  /** Planned fall time per district (ms) or 0 when it will hold. */
  fall: number[];
  /** Restored time per district, set by the repair crews. */
  up: number[];
  /** Crews at work: district index or -1. */
  crews: number[];
  crewDone: number[];
}

export interface Fire {
  building: number;
  district: number;
  start: number;
  end: number;
  reopen: number;
  households: number[];
  workplace: number;
  reported: boolean;
}

export interface LogEntry {
  id: number;
  t: number;
  text: string;
  kind: string;
  w: number;
  refs: number[];
  rumour: number;
}

export interface PaperItem {
  head: string;
  body: string;
  key: string;
}

export interface Paper {
  edition: number;
  t: number;
  name: string;
  headline: string;
  deck: string;
  key: string;
  items: PaperItem[];
  listenerItem: boolean;
}

export interface Visit {
  start: number;
  end: number;
  listened: number;
  traced: number[];
}

export interface World {
  seed: number;
  created: number;
  t: number;
  step: number;
  rng: [number, number, number, number];
  citizens: Citizen[];
  households: Household[];
  workplaces: Workplace[];
  venues: Venue[];
  lines: Line[];
  lineCall: number[];
  lineDown: boolean[];
  calls: Call[];
  nextCallId: number;
  rumours: Rumour[];
  events: SimEvent[];
  nextEventId: number;
  storm: Storm | null;
  fire: Fire | null;
  log: LogEntry[];
  nextLogId: number;
  paper: Paper | null;
  papers: Paper[];
  visits: Visit[];
  /** Calls completed per local hour, last 48 hours (ring by hour index). */
  hourly: number[];
  hourlyAt: number[];
  callsTotal: number;
  lastPayday: number;
  lastRentDay: number;
  lastDaily: number;
  openingDay: number;
  openingVenue: number;
  newYearDone: number;
  weddings: { a: number; b: number; at: number }[];
  /** Calls the visitor has listened to, and when last noted in the log. */
  listened: number;
  listenedMs: number;
  lastListenNote: number;
  /** Almanac already applied for this local day. */
  almanacDay: number;
  editionDue: number;
  /** Which people (by id) each rumour has already been logged as reaching. */
  reachedLogged: string[];
  /** What the city has lately said, by phrase family, so it varies itself. */
  said: Record<string, number[]>;
  nextRumourId: number;
  /** The supervisor's place in her log: last event written up, last entry, last ambient note. */
  logMark: { event: number; entry: number; ambient: number; listened: number };
  /** A special line: the operator's own position. */
  operatorCall: number;
}
