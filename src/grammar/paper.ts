/**
 * The Halcyon Evening Star. Its headline is set from whatever has spread
 * furthest or mattered most: an event the city lived through, or a rumour
 * the Star's own reporters have picked up on the telephone (the paper only
 * prints what its people have heard). Tomorrow's weather comes from the
 * almanac, so the forecast is, for once, correct.
 */
import { DAY, HOUR, MINUTE, clockText, local, type LocalTime } from "../sim/clock";
import { almanac } from "../sim/events";
import { isNews } from "../sim/rumours";
import type { Simulation } from "../sim/sim";
import type { Paper, PaperItem, Rumour, SimEvent, World } from "../sim/types";
import { claimBody } from "./rumour";
import { full, num, tidy } from "./words";

const DISTRICT = ["the Wharf", "Pell Street", "Midtown", "Lantern Row", "Juniper Hill"];
const UP = (s: string) => s.toUpperCase();

interface Story {
  key: string;
  score: number;
  headline: string;
  deck: string;
}

function surname(w: World, id: number): string {
  return w.citizens[id]?.last ?? "";
}

function eventStory(w: World, e: SimEvent, now: number): Story | null {
  const age = (now - e.t) / HOUR;
  const fresh = Math.max(0.15, 1 - age / 30);
  const A = e.a >= 0 ? w.citizens[e.a] : null;
  const B = e.b >= 0 ? w.citizens[e.b] : null;
  const key = `e${e.kind}${e.id}`;
  switch (e.kind) {
    case "fire": {
      const place = e.b >= 0 ? w.workplaces[e.b].name : DISTRICT[e.district];
      return { key, score: 9 * fresh, headline: `FIRE ON ${UP(DISTRICT[e.district].replace("the ", ""))}: ${UP(place.replace(/^The /, ""))} EMPTIED`, deck: "Residents take shelter with family; Mercy Street company answers a telephone call within minutes." };
    }
    case "linesdown":
      return { key: `storm${Math.floor(e.t / DAY)}`, score: 8.5 * fresh, headline: `STORM CUTS LINES; ${UP(DISTRICT[e.district].replace("the ", ""))} IN THE DARK`, deck: "Exchange crews out through the night; subscribers asked to keep calls short." };
    case "engaged":
      if (!A || !B) return null;
      return { key, score: 7 * fresh, headline: `${UP(A.last)}-${UP(B.last)} ENGAGEMENT ANNOUNCED`, deck: `${full(A)} and ${full(B)} to marry; the proposal, we are told, was made by telephone.` };
    case "wedding":
      if (!A || !B) return null;
      return { key, score: 7.5 * fresh, headline: `WEDDING AT ST. JUDE'S`, deck: `${full(A)} and ${full(B)} married before a full church; ${DISTRICT[e.district]} turns out.` };
    case "broken":
      if (!A || !B) return null;
      return { key, score: 5 * fresh, headline: `AN ENGAGEMENT ENDS`, deck: `The ${surname(w, e.a)}-${surname(w, e.b)} match is off. Neither party would speak to the Star, which the Star respects.` };
    case "bankrupt": {
      const wp = w.workplaces[e.n];
      return { key, score: 8 * fresh, headline: `${UP(wp?.name ?? "LOCAL FIRM")} CLOSES ITS DOORS`, deck: "Staff let go; creditors to meet. A familiar name leaves the city directory." };
    }
    case "opening": {
      const wp = w.workplaces[e.n];
      return { key, score: 6 * fresh, headline: `OPENING NIGHT ON LANTERN ROW`, deck: `${wp?.name ?? "A Lantern Row hall"} promises a band, a crowd and searchlights. The Star will send a man.` };
    }
    case "birth":
      if (!A) return null;
      return { key, score: 3.5 * fresh, headline: `A NEW CITIZEN FOR ${UP(DISTRICT[e.district].replace("the ", ""))}`, deck: `A child for ${full(A)}. Mother and baby well.` };
    case "newyear":
      return { key, score: 12 * fresh, headline: `NINETEEN THIRTY! CITY RINGS IN THE NEW YEAR`, deck: "Every lamp on the Exchange board lit at midnight; the harbour answered with its whistles." };
    default:
      return null;
  }
}

function rumourStory(w: World, r: Rumour, pressKnows: boolean): Story | null {
  if (r.dead || r.knowers < 5) return null;
  if (r.tpl === "listener") {
    const share = r.knowers / w.citizens.length;
    if (share < 0.08) return null;
    return {
      key: `r${r.id}`,
      score: 3 + share * 30,
      headline: share > 0.25 ? "IS THE EXCHANGE LISTENING?" : "CLICKS ON THE LINE, SUBSCRIBERS SAY",
      deck: `${num(r.knowers)} residents report a sound on their telephones "like someone lifting a receiver in another room". The Exchange declines to comment.`,
    };
  }
  if (!pressKnows || isNews(r.tpl) || r.tpl === "answered") return null;
  const best = r.versions.reduce((a, v) => (v.claim.x > a.claim.x ? v : a), r.versions[0]);
  const S = r.subject >= 0 ? w.citizens[r.subject] : null;
  const body = claimBody(w, best.claim);
  const topics: Record<string, string> = {
    debt: "MONEY WORRIES",
    crush: "A ROMANCE",
    surprise: "A SURPRISE",
    car: "A BORROWED MOTORCAR",
    novel: "A NOVEL",
    lessons: "SECRET LESSONS",
    inheritance: "AN INHERITANCE",
    jobhunt: "A RESIGNATION",
    pawned: "A PAWNSHOP",
    dog: "A DOG",
    letters: "LETTERS",
    recipe: "A RECIPE",
    seen: "A ROMANCE",
    storm: "THE WEATHER",
  };
  const topic = topics[r.tpl] ?? "TALK";
  const where = S ? DISTRICT[w.households[S.home].district] : "the city";
  return {
    key: `r${r.id}`,
    score: 2 + r.knowers * 0.35 * (isNews(r.tpl) ? 1.2 : 1),
    headline: `TALK OF ${topic} SWEEPS ${UP(where.replace("the ", ""))}`,
    deck: `"${body.charAt(0).toUpperCase() + body.slice(1)}," say ${num(r.knowers)} residents. The Star cannot confirm it, and has tried.`,
  };
}

const QUIET: [string, string][] = [
  ["HARBOUR CALM; CITY TALKS OF WEATHER", "A day without incident, the Star regrets to report."],
  ["COUNCIL SITS LATE, DECIDES LITTLE", "Aldermen agree to meet again, which is itself agreed upon."],
  ["FOG ON THE CROSSING; FERRY RUNS BY BELL", "Passengers describe the journey as 'atmospheric'."],
  ["LANTERN ROW BUSY; ORPHEUM FULL", "A quiet week elsewhere; the pictures do well."],
];

export function composePaper(sim: Simulation, lt: LocalTime): Paper | null {
  const w = sim.w;
  const now = w.t;
  const cur = w.paper;
  // Editions: four o'clock, half past nine, and an Extra for big news.
  const editionHour = lt.hour >= 21.5 ? 21.5 : lt.hour >= 16 ? 16 : lt.hour >= 5 ? 5 : -2.5;
  const editionStart = now - (lt.hour - editionHour) * HOUR;
  const name = editionHour === 21.5 ? "Late City Edition" : editionHour === 16 ? "Evening Edition" : editionHour === 5 ? "Morning Final" : "Night Final";

  const press = w.citizens.filter((c) => c.work >= 0 && w.workplaces[c.work].kind === "paper");
  const stories: Story[] = [];
  for (const e of w.events) {
    if (now - e.t > 30 * HOUR) continue;
    const s = eventStory(w, e, now);
    if (s) stories.push(s);
  }
  for (const r of w.rumours) {
    const pressKnows = press.some((p) => p.knows[r.id] !== undefined);
    const s = rumourStory(w, r, pressKnows);
    if (s) stories.push(s);
  }
  stories.sort((a, b) => b.score - a.score);
  const lead = stories[0];
  const due = !cur || editionStart > cur.t;
  const extra = !!(lead && cur && lead.key !== cur.key && lead.score >= 7.5 && lead.score > (cur ? scoreOf(stories, cur.key) + 2 : 0));
  if (!due && !extra) return null;
  const headline = lead ? lead.headline : QUIET[lt.dayIndex % QUIET.length][0];
  const deck = lead ? lead.deck : QUIET[lt.dayIndex % QUIET.length][1];
  const key = lead ? lead.key : `quiet${lt.dayIndex}`;
  if (cur && !due && cur.key === key) return null;

  const items: PaperItem[] = [];
  for (const s of stories.slice(1, 3)) items.push({ head: s.headline, body: s.deck, key: s.key });
  // Tomorrow's weather, from the almanac.
  const tomorrow = almanac(w.seed, lt.dayIndex + 1, local(now + DAY, sim.place).month, sim.place.south);
  const today = w.storm && w.storm.end > now;
  items.push({
    head: "THE WEATHER",
    body: today
      ? "Gales tonight, easing by morning. Lines may be affected; the Exchange asks for patience."
      : tomorrow.storm
        ? `A storm expected tomorrow from about ${clockText(tomorrow.storm.start)}. The harbour master advises moorings be doubled.`
        : "Fair, with evening mist off the harbour. No storm expected.",
    key: "weather",
  });
  // The Exchange's own figures.
  const yesterday = w.hourly.reduce((a, b) => a + b, 0);
  items.push({
    head: "EXCHANGE NOTES",
    body:
      yesterday < 400
        ? "The Exchange reports a busy board and a new operator on position three, who is said to be learning quickly."
        : `The Exchange connected ${yesterday.toLocaleString("en-US")} calls in the last two days. The busiest hour was the one after supper, as ever.`,
    key: "exchange",
  });
  const listener = w.rumours.find((r) => r.tpl === "listener" && !r.dead);
  const listenerItem = !!listener && listener.knowers >= 6 && !headline.includes("EXCHANGE") && !headline.includes("CLICKS");
  if (listenerItem) {
    items.unshift({ head: "A CORRESPONDENT WRITES", body: `"Is it only my line that clicks? I have begun to say nothing on the telephone that I would not say in church." Several readers have written in the same vein.`, key: "listener" });
  }
  return {
    edition: (cur?.edition ?? 0) + 1,
    t: now,
    name: extra ? "Extra" : name,
    headline,
    deck: tidy(deck),
    key,
    items: items.slice(0, 4).map((i) => ({ ...i, body: tidy(i.body) })),
    listenerItem,
  };
}

function scoreOf(stories: Story[], key: string): number {
  return stories.find((s) => s.key === key)?.score ?? 0;
}

void MINUTE;
