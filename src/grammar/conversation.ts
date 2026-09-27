/**
 * What is said on the line.
 *
 * A call is planned as moves (greeting, small talk, a rumour passed, a loan
 * asked for, a proposal, a plan to meet, goodbye), each of which may carry an
 * effect on the simulation. The moves are realized here as short exchanges
 * in the callers' own voices, from their real relationship, moods, troubles,
 * work and the rumours they carry. The effects are applied by the simulation
 * at the moment the line is spoken, so listening in means hearing the city
 * change.
 *
 * The voice is sharp and kind. Nothing crude, nothing cruel.
 */
import { tieOf } from "../sim/city";
import { clockText, type LocalTime } from "../sim/clock";
import { LESSONS, NOVEL_ABOUT, PAWNED, RECIPES } from "../sim/data";
import type { Rng } from "../sim/rng";
import { choosePassable, mutate } from "../sim/rumours";
import { Act, K, type Beat, type Call, type Citizen, type Effect, type Purpose, type Rumour, type Secret, type Tie, type World } from "../sim/types";
import { claimText } from "./rumour";
import { He, cap, dollars, formal, full, him, he, num, Picker, tidy } from "./words";

export interface TalkCtx {
  w: World;
  rng: Rng;
  t: number;
  lt: LocalTime;
  call: Call;
  /** Caller. */
  A: Citizen;
  /** Who answered. */
  B: Citizen | null;
  /** Whom the caller wanted. */
  T: Citizen | null;
  purpose: Purpose;
  guarded: boolean;
  south: boolean;
}

interface Line {
  who: 0 | 1 | 2;
  text: string;
  fx?: Effect;
  pause?: number;
}

/** The city's own memory of what it has lately said, so the picks are saved and replayed exactly. */
const P = <T,>(c: { rng: Rng; w: World }, key: string, opts: readonly T[]) => new Picker(5, c.w.said).pick(c.rng, key, opts);

// ---------------------------------------------------------------------------
// Relationship words
// ---------------------------------------------------------------------------

function tie(a: Citizen, b: Citizen | null): Tie | undefined {
  return b ? tieOf(a, b.id) : undefined;
}

/** What A calls B when greeting. */
function address(a: Citizen, b: Citizen): string {
  const t = tieOf(a, b.id);
  if (!t) return formal(b);
  if (t.k & (K.SPOUSE | K.ROMANCE)) return b.first;
  if (t.kin === "mother") return "Mother";
  if (t.kin === "father") return "Father";
  if (t.kin === "grandmother") return "Gran";
  if (t.kin === "grandfather") return "Grandpa";
  if (t.kin === "aunt") return `Aunt ${b.first}`;
  if (t.kin === "uncle") return `Uncle ${b.first}`;
  if (t.k & (K.KIN | K.FRIEND)) return b.first;
  if (t.k & (K.COLLEAGUE | K.NEIGHBOUR) && Math.abs(a.age - b.age) < 15 && t.s > 0.4) return b.first;
  return formal(b);
}

/** How A announces themself to B. */
function selfName(a: Citizen, b: Citizen, w: World): string {
  const t = tieOf(a, b.id);
  if (!t) {
    const wp = a.work >= 0 && a.act === Act.Work ? w.workplaces[a.work] : null;
    return wp ? `${full(a)}, from ${wp.name}` : full(a);
  }
  if (t.k & (K.SPOUSE | K.ROMANCE)) return "me";
  const back = tieOf(b, a.id);
  if (back?.kin === "sister" || back?.kin === "brother") return `your ${back.kin}`;
  if (back?.kin === "mother") return "your mother";
  if (back?.kin === "father") return "your father";
  if (t.k & (K.KIN | K.FRIEND)) return a.first;
  if (t.k & (K.BUSINESS | K.EMPLOYER | K.EMPLOYEE | K.LANDLORD | K.TENANT)) {
    const wp = a.work >= 0 ? w.workplaces[a.work] : null;
    return wp && a.act === Act.Work ? `${formal(a)}, at ${wp.name}` : formal(a);
  }
  return full(a);
}

const timeOfDay = (h: number) => (h < 5 ? "night" : h < 12 ? "morning" : h < 17.5 ? "afternoon" : h < 22 ? "evening" : "night");

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

function answerLine(c: TalkCtx): string {
  const { w, B, call, lt } = c;
  const line = w.lines[call.toLine];
  if (!B || !line) return "Position three.";
  const tod = timeOfDay(lt.hour);
  if (line.kind === "special" || line.kind === "work") {
    const wp = w.workplaces[line.owner];
    if (!wp) return "Hello?";
    switch (wp.kind) {
      case "fire":
        return "Mercy Street fire station.";
      case "infirmary":
        return B.job === "nurse" || B.job === "daynurse" || B.job === "matron" ? `St. Brigid's. ${B.job === "matron" ? "Matron" : "Nurse"} ${B.last} speaking.` : `St. Brigid's Infirmary.`;
      case "paper":
        return P(c, "ans-paper", ["City desk.", "Evening Star, city desk.", `Star. ${B.last} speaking.`]);
      case "hotel":
        return "Hotel Meridian, front desk.";
      case "cityhall":
        return B.job === "mayor" ? "The mayor's office. The mayor speaking, as it happens." : "City Hall, the mayor's office.";
      case "bank":
        return `Harbour Savings, good ${tod}.`;
      case "club":
        return P(c, "ans-club", ["Blue Heron.", "The Heron. Speak up, the band's on.", "Blue Heron, who's calling?"]);
      case "bakery":
        return lt.hour < 7 ? "Kettle's. We're not open, but we're up." : "Kettle's Bakery.";
      case "exchange":
        return "Exchange. Supervisor.";
      case "service":
        return `The ${w.citizens[w.households[w.citizens[B.id].home].members[0]].last} residence.`;
      default:
        return P(c, "ans-work", [`${wp.name}, good ${tod}.`, `${wp.name}.`, `${wp.name}. ${B.last} speaking.`]);
    }
  }
  if (line.kind === "pay") return "Hello? This is the pay telephone.";
  const h = w.households[line.owner];
  if (h?.kind === "boarding") return P(c, "ans-board", [`${formal(w.citizens[h.members[0]])}'s. Who do you want?`, "Boarding house. Speak up."]);
  if (B.act === Act.Asleep) return P(c, "ans-sleep", ["Mm. Hello?", "Hello? What time is it?", "Who is it? Is someone dead?"]);
  if (lt.hour >= 23 || lt.hour < 5) return P(c, "ans-late", ["Hello? At this hour?", "Hello?", "Yes? Hello?"]);
  if (h && h.cls >= 1 && B.id === h.members[0]) return P(c, "ans-res", [`${B.last} residence.`, `Halcyon ${w.lines[call.toLine].number}.`, "Hello?"]);
  return P(c, "ans-home", ["Hello?", "Hello, who's this?", "Yes, hello?", `${w.lines[call.toLine].number}.`]);
}

function greeting(c: TalkCtx, target: Citizen): string {
  const { A, w } = c;
  const who = selfName(A, target, w);
  const addr = address(A, target);
  const t = tieOf(A, target.id);
  if (t && t.k & (K.SPOUSE | K.ROMANCE)) return P(c, "greet-love", [`It's me.`, `${addr}? It's me.`, `Hello, you. It's me.`]);
  if (who === "your sister" || who === "your brother" || who === "your mother" || who === "your father") return P(c, "greet-kin", [`${addr}, it's ${who}.`, `It's ${who}. Are you busy?`]);
  if (t && t.k & (K.KIN | K.FRIEND)) return P(c, "greet-friend", [`${addr}! It's ${who}.`, `${addr}, it's ${who}. Have you a minute?`, `It's ${who}. Is this a bad time?`]);
  return P(c, "greet-formal", [`${addr}? ${cap(who)} here.`, `Good ${timeOfDay(c.lt.hour)}, ${addr}. It's ${who}.`, `${addr}. ${cap(who)}.`]);
}

// ---------------------------------------------------------------------------
// Small talk, drawn from real state
// ---------------------------------------------------------------------------

const WORK_TALK: Record<string, [string, string][]> = {
  bakery: [["Up at half past three again. The rye wouldn't rise.", "It never does when you watch it."], ["We sold out of rolls by eight.", "Then bake more rolls."]],
  flour: [["The barge was late, so the whole city will have late bread.", "Blame the tide."], ["Forty sacks out before breakfast.", "You'll have arms like a stevedore."]],
  shipping: [["A whole ship of oranges today. The quay smells like Christmas.", "Bring me one."], ["The foreman shouted at the crane all morning. The crane won.", "Cranes usually do."]],
  fish: [["The mackerel were running. So was I, after them.", "You smell of it, I expect."], ["Nobody wants skate. I don't know why I buy it.", "Hope, I suppose."]],
  harbour: [["Three steamers and a yacht in one tide. The yacht thinks it owns the harbour.", "Yachts always do."]],
  customs: [["A crate of clocks came through today. Every one set to a different time.", "Which one was right?"]],
  laundry: [["Two hundred sheets from the Meridian. Who sleeps in two hundred sheets?", "Rich people, in shifts."]],
  pawn: [["Someone pawned a saxophone and a wedding dress on the same morning.", "I don't want to know the story."]],
  fire: [["Quiet shift. We polished the bell twice.", "Long may it stay quiet."], ["A cat up the Customs House flagpole. Don't ask.", "Did you get it down?"]],
  drugstore: [["Sold more cough syrup today than soda.", "It's the weather."]],
  grocery: [["The eggs came in cracked again.", "Make an omelette of it."]],
  insurance: [["I insured a man's moustache today. I'm not joking.", "What's it worth?"], ["Mr. Hartigan read every clause aloud to me. Every one.", "Were they good clauses?"]],
  bank: [["The ledger balanced at ten to five. I nearly wept.", "Go home and put your feet up."]],
  paper: [["Nothing's happened all day and I'm to write two columns of it.", "Make something happen."], ["The editor cut my piece in half and kept the wrong half.", "Editors do."]],
  cityhall: [["Four committees and not one decision.", "That sounds like a decision."]],
  store: [["A lady tried on nine hats and bought a pair of gloves.", "Sensible woman."], ["The lifts broke and the whole third floor sulked.", "Poor third floor."]],
  hotel: [["A guest asked for a room facing the sea. We haven't one. I gave him a map.", "That's service."]],
  law: [["Mr. Voss dictates like a man running for a tram.", "Did you catch it?"]],
  exchange: [["The board was lit like a Christmas tree at nine.", "Everyone had something to say."]],
  club: [["The drummer's lost his brushes again.", "Lend him a broom."], ["We played the new number four times. They wanted a fifth.", "Then it's a hit."]],
  dancehall: [["Taught the foxtrot to a man with two left feet. By ten he had one.", "Progress."]],
  pictures: [["The film broke in the love scene. They nearly rioted.", "What happened after?"], ["Six people came to the matinee and four of them were asleep.", "Restful picture?"]],
  automat: [["Somebody put a button in the pie machine.", "Did they get a pie?"]],
  milliner: [["Mrs. Ambler wants a hat like a soup tureen, and she shall have one.", "With a ladle?"], ["I've put a whole pheasant on a hat. Well, the feathers.", "The pheasant won't mind now."]],
  florist: [["The lilies came in early and the roses came in late.", "Then it's a lily week."]],
  cafe: [["Three coffees sold before noon. Three.", "It'll pick up."]],
  taxi: [["Took a lady to the pier and back three times. She couldn't decide.", "Did she pay three times?"], ["A man wanted to go to the moon. I took him to Lantern Row.", "Close enough."]],
  books: [["Sold a copy of the same novel twice to the same man.", "He must have liked it."]],
  infirmary: [["Two babies and a broken arm, and it's only ten.", "Busy night."], ["The matron found a ward cat. It's staying.", "Of course it is."]],
  church: [["The organ has a note that won't stop. We call it Brother Humphrey.", "Is Brother Humphrey coming on Sunday?"]],
  school: [["The Hollis boy has discovered long division and is very cross about it.", "Aren't we all."]],
  service: [["Madam changed the menu four times. We're having fish.", "Fish again?"]],
  lighthouse: [["Polished the lens. You can see yourself in it, eight times over.", "Once is enough for me."]],
  ferry: [["Fog on the crossing. We went by the bell.", "Rather you than me."]],
};

const HOME_TALK: [string, string][] = [
  ["The kettle's on. Nobody's drinking it. I just like the noise.", "That's company, of a sort."],
  ["I've read the same page of my library book four times.", "Is it a good page?"],
  ["The people upstairs are moving the furniture again.", "At this hour?"],
  ["I made soup. There's too much soup.", "Freeze it on the sill."],
  ["The wireless is all dance bands tonight.", "Turn it up and dance, then."],
  ["I've been mending the same stocking since Tuesday.", "Buy another stocking."],
];

const LONELY: [string, string][] = [
  ["It's been a quiet week. I've talked to the cat more than to people.", "Well, you're talking to me now."],
  ["Nobody's rung in days. I thought the line was down.", "It isn't. I'm here."],
];

function weatherTalk(c: TalkCtx): [string, string] | null {
  const { w, lt } = c;
  if (w.storm && w.storm.start - c.t < 12 * 3_600_000 && w.storm.end > c.t) {
    return w.storm.start <= c.t
      ? P(c, "wx-storm", [["Listen to that wind.", "The shutters are going like a drum."], ["Is your light still on? Ours flickered.", "Still on. Knock wood."]] as [string, string][])
      : P(c, "wx-pre", [["The glass is falling. There's weather coming.", "My knee said so this morning."], ["The sky over the harbour's gone a funny colour.", "Bring the washing in."]] as [string, string][]);
  }
  const m = c.south ? (lt.month + 6) % 12 : lt.month;
  const winter = m === 11 || m <= 1;
  const summer = m >= 5 && m <= 7;
  if (winter) return P(c, "wx-w", [["Isn't it bitter out?", "The pipes froze Tuesday."], ["It's dark by four. I hate it.", "Light a lamp and hate it less."]] as [string, string][]);
  if (summer) return P(c, "wx-s", [["It's close tonight.", "All the windows on the street are open."], ["The tar's soft on Pell Street.", "Mind your shoes."]] as [string, string][]);
  return null;
}

function smallTalk(c: TalkCtx, a: Citizen, b: Citizen, n: number): Line[] {
  const out: Line[] = [];
  const pool: [number, [string, string]][] = [];
  const wk = a.work >= 0 ? c.w.workplaces[a.work]?.kind : undefined;
  if (wk && WORK_TALK[wk]) pool.push([2, P(c, "work-" + wk, WORK_TALK[wk])]);
  const wkB = b.work >= 0 ? c.w.workplaces[b.work]?.kind : undefined;
  if (wkB && WORK_TALK[wkB]) {
    const [s, r] = P(c, "work-" + wkB, WORK_TALK[wkB]);
    pool.push([1.5, [`How was work?`, `${s}${r ? "" : ""}`]]);
  }
  const wx = weatherTalk(c);
  if (wx) pool.push([1.6, wx]);
  if (a.company < 0.35) pool.push([2, P(c, "lonely", LONELY)]);
  pool.push([1, P(c, "home", HOME_TALK)]);
  if (b.expecting > 0) pool.push([2, [`How are you keeping? When's the baby due?`, `${cap(num(Math.max(1, Math.round((b.expecting - c.t) / (7 * 86_400_000)))))} weeks, the doctor says. It feels like ninety.`]]);
  if (a.children > 0) pool.push([1, P(c, "kids", [["The baby's cutting a tooth. Nobody's sleeping.", "Rub a little brandy on the gum."], ["The little one said her first word. It was 'no'.", "A girl after my own heart."]] as [string, string][])]);
  if (a.debts.length && (tie(a, b)?.tr ?? 0) > 0.55) pool.push([1.3, [`Money's tight this week.`, P(c, "money-r", [`It's tight everywhere.`, `Saturday's coming. Hang on till Saturday.`, `Oh, love.`])]]);
  if (c.w.openingDay === c.lt.dayIndex && c.lt.hour > 16) pool.push([2, [`Did you see the searchlights over Lantern Row?`, `Somebody's opening something. The whole sky's in on it.`]]);
  if (c.w.fire && c.t - c.w.fire.start < 20 * 3_600_000) pool.push([2.2, [`Did you hear about the fire?`, `I smelled it before I heard it.`]]);
  const miss = tie(a, b)?.miss ?? 0;
  if (miss > 0) pool.push([3, [`You didn't ring. ${miss > 1 ? "Not for days." : "Yesterday."}`, P(c, "miss-r", ["I know. I'm sorry.", "I know. It's been a week.", "I'm ringing now, aren't I?"])]]);
  if (a.suspicion > 0.28 && a.suspicion < 0.6) pool.push([1.5, [`Is this line quite private, do you think?`, P(c, "priv-r", ["It's the telephone. Nothing's private.", "Why, what have you done?", "As private as anything in this city."])]]);
  for (let i = 0; i < n && pool.length; i++) {
    const idx = c.rng.weighted(pool.map((p) => p[0]));
    const [s, r] = pool.splice(idx, 1)[0][1];
    const aWho: 0 | 1 = a.id === c.A.id ? 0 : 1;
    out.push({ who: aWho, text: s });
    out.push({ who: (1 - aWho) as 0 | 1, text: r });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rumours and secrets on the line
// ---------------------------------------------------------------------------

const LEADS = ["Did you hear?", "You'll never guess.", "I shouldn't say, but you'll hear it anyway.", "Now, this is only what I heard.", "Listen to this.", "I had it from someone who'd know."];
const WOW = ["No! Truly?", "Well, I never.", "You don't say.", "Who'd have thought it.", "Goodness.", "And in broad daylight, I suppose."];
const DOUBT = ["I'll believe that when I see it.", "Who told you that?", "That doesn't sound like anyone I know.", "Somebody's been at the sherry."];
const KNEW = ["Oh, I heard that on Tuesday.", "Everybody knows that.", "Old news, love.", "I heard it better than that."];
const KIND = ["The poor thing.", "Oh, that's a shame.", "Somebody should take round a pie."];
const GLAD = ["Good for them.", "Well, isn't that lovely.", "About time too."];

function rumourMood(r: Rumour): "sad" | "glad" | "odd" {
  if (["debt", "pawned", "lostjob", "bankrupt", "fire", "broken", "storm"].includes(r.tpl)) return "sad";
  if (["engaged", "wedding", "birth", "inheritance", "rehired", "opening"].includes(r.tpl)) return "glad";
  return "odd";
}

function tellLines(c: TalkCtx, teller: Citizen, hearer: Citizen, r: Rumour): Line[] {
  const tWho: 0 | 1 = teller.id === c.A.id ? 0 : 1;
  const hWho = (1 - tWho) as 0 | 1;
  const vi = teller.knows[r.id];
  const from = r.versions[vi];
  const claim = mutate(c.rng, c.w, teller, from.claim, r.tpl);
  let hedge = from.hedge;
  if (c.rng.chance(0.45)) hedge = Math.max(0, hedge - 1);
  if (teller.traits.discretion > 0.7 && c.rng.chance(0.5)) hedge = Math.max(hedge, 1);
  if (teller.suspicion > 0.4) hedge = Math.max(hedge, 3);
  const said = claimText(c.w, claim, hedge);
  const already = hearer.knows[r.id] !== undefined;
  const lines: Line[] = [];
  if (r.tpl === "listener") {
    lines.push({ who: tWho, text: P(c, "lead-l", ["Keep your voice down.", "I'll say this quietly.", "Now don't laugh."]) + " " + said, fx: { kind: "tell", a: teller.id, b: hearer.id, rumour: r.id, claim, n: hedge } });
    lines.push({ who: hWho, text: already ? P(c, "l-knew", ["I've heard that too.", "So I've been told.", "I don't doubt it."]) : P(c, "l-new", ["Surely not.", "Then we'd better talk about the weather.", "Good heavens. Hello, whoever you are."]) });
    return lines;
  }
  lines.push({ who: tWho, text: P(c, "lead", LEADS) + " " + said, fx: { kind: "tell", a: teller.id, b: hearer.id, rumour: r.id, claim, n: hedge } });
  let react: string;
  if (already) react = P(c, "knew", KNEW);
  else if (hearer.traits.credulity < 0.3) react = P(c, "doubt", DOUBT);
  else {
    const m = rumourMood(r);
    react = m === "sad" ? P(c, "kind", KIND) : m === "glad" ? P(c, "glad", GLAD) : P(c, "wow", WOW);
  }
  lines.push({ who: hWho, text: react });
  if (react === "Who told you that?") {
    const src = from.teller !== teller.id ? c.w.citizens[from.teller] : null;
    lines.push({ who: tWho, text: src && c.rng.chance(0.5) ? `${formal(src)}. And ${he(src)} had it from someone else.` : P(c, "nevermind", ["Never you mind who.", "A little bird.", "Everyone, dear. Everyone."]) });
  }
  return lines;
}

/** A secret, in the first person. */
function secretSaid(c: TalkCtx, a: Citizen, s: Secret): string {
  const O = s.other >= 0 ? c.w.citizens[s.other] : null;
  const wp = a.work >= 0 ? c.w.workplaces[a.work]?.name : "work";
  switch (s.tpl) {
    case "debt": {
      const d = a.debts[0];
      const weeks = d ? Math.max(1, Math.round((c.t - d.since) / (7 * 86_400_000))) : 2;
      return `I'm ${num(weeks)} ${weeks === 1 ? "week" : "weeks"} behind with the rent, and ${O ? formal(O) : "the landlord"} knows it.`;
    }
    case "crush":
      return `I think I'm sweet on ${O ? full(O) : "someone"}. There. I've said it.`;
    case "surprise":
      return `I'm planning a party for ${O ? O.first : "someone"}. A surprise. Don't you dare.`;
    case "car":
      return `I borrowed ${O ? full(O) + "'s" : "a"} car on Sunday. ${O ? He(O) : "Nobody"} doesn't know.`.replace("Nobody doesn't", "Nobody");
    case "novel":
      return `I'm writing a novel. About ${NOVEL_ABOUT[s.n % NOVEL_ABOUT.length]}.`;
    case "lessons":
      return `I've been taking ${LESSONS[s.n % LESSONS.length]}. Don't laugh.`;
    case "inheritance":
      return `An aunt of mine may leave me something. Don't tell a soul.`;
    case "jobhunt":
      return `I'm looking for a new place. Not a word at ${wp}.`;
    case "pawned":
      return `I pawned ${PAWNED[s.n % PAWNED.length].replace(/^(her|his) /, "my ")}. Just till Saturday.`;
    case "dog":
      return `I've got a dog. The landlord mustn't know. His name is Admiral.`;
    case "letters":
      return `I write letters to ${O ? full(O) : "someone"}. I never send them.`;
    case "recipe":
      return `I know how they make ${RECIPES[s.n % RECIPES.length]}. I worked it out.`;
  }
}

function confideLines(c: TalkCtx, a: Citizen, b: Citizen, s: Secret): Line[] {
  const aWho: 0 | 1 = a.id === c.A.id ? 0 : 1;
  const bWho = (1 - aWho) as 0 | 1;
  return [
    { who: aWho, text: P(c, "conf-lead", ["Can I tell you something? You mustn't tell a soul.", "Promise you won't repeat this.", "I have to tell someone or I'll burst."]) },
    { who: bWho, text: P(c, "conf-ok", ["Cross my heart.", "Who would I tell?", "Go on."]) },
    { who: aWho, text: secretSaid(c, a, s), fx: { kind: "confide", a: a.id, b: b.id, n: a.secrets.indexOf(s) } },
    { who: bWho, text: P(c, "conf-r", ["Your secret's safe with me.", "Well! I won't breathe a word.", "Oh, you goose. Of course I won't."]) },
  ];
}

// ---------------------------------------------------------------------------
// Purposes
// ---------------------------------------------------------------------------

const ORDERS: Record<string, [string, string][]> = {
  "bakery>flour": [["Two sacks of rye and one of white, by six if you can.", "By six. The cart's loading now."], ["The last lot of flour had a mouse in it. A small mouse, but a mouse.", "I'll knock it off the bill."]],
  "flour>bakery": [["Your rye's in. Shall I send it round?", "Send it round, and the invoice after."]],
  "automat>bakery": [["Forty pies for the lunch machines.", "Forty. Apple?"]],
  "bakery>automat": [["Do you want the usual forty?", "Forty-five. It's raining, people eat pie."]],
  "hotel>laundry": [["We'll need sixty sheets back by Thursday.", "Thursday, ironed and folded."]],
  "laundry>hotel": [["Your sheets are ready. And somebody left a pearl in a pillowcase.", "Keep it safe. I'll find out whose."]],
  "florist>shipping": [["Have the bulbs come in from Rotterdam?", "Tuesday's boat. Weather permitting."]],
  "club>florist": [["Twelve white carnations for the tables. No lilies, the drummer sneezes.", "No lilies. Noted."]],
  "infirmary>drugstore": [["We're short of iodine and gauze.", "I'll send the boy up the hill with it."]],
  "paper>cityhall": [["Has the mayor a statement on the harbour?", "The mayor always has a statement. Whether it says anything is another matter."]],
  "cityhall>paper": [["The mayor would like a correction printed.", "Which part was wrong?"]],
  "store>milliner": [["Mrs. Ambler wants six of the green hats for the window.", "Six green hats. I'll need a week."]],
  "milliner>store": [["Your hats are ready. The feathers are extra.", "The feathers are always extra."]],
  "fish>automat": [["The chowder fish is on the cart.", "Tell the carter to use the back door, the front smells of pie."]],
  "grocery>fish": [["What's good today?", "Haddock. The mackerel's gone to the hotel."]],
  "club>taxi": [["A cab to Juniper Row for two, and they've had a very good evening.", "Five minutes. Tell them not to sing in the cab."], ["Two cabs at the side door. The band.", "The band pays extra for the drum."]],
  "hotel>taxi": [["A cab for the gentleman in forty-one. He's catching the early boat.", "Tell him the early boat leaves at six whatever he thinks."]],
  "dancehall>taxi": [["A cab for a lady who has danced too much.", "On its way. Is she all right?"]],
  "infirmary>infirmary": [["Doctor? It's the ward. Mrs. Hale's fever's up again.", "I'll come. Keep her cool. Twenty minutes."], ["Sorry to wake you, Doctor. The boy in bed four is asking for you.", "Tell him I'm coming. Tell him to count to a thousand."]],
  "church>florist": [["Flowers for Sunday. Something that doesn't drop its petals on the choir.", "Chrysanthemums. They're very well behaved."]],
};

function orderLines(c: TalkCtx, a: Citizen, b: Citizen): Line[] {
  const ka = a.work >= 0 ? c.w.workplaces[a.work]?.kind : "";
  const kb = b.work >= 0 ? c.w.workplaces[b.work]?.kind : "";
  const key = `${ka}>${kb}`;
  const pairs = ORDERS[key];
  if (pairs) {
    const [s, r] = P(c, "order-" + key, pairs);
    return [
      { who: 0, text: s },
      { who: 1, text: r, fx: { kind: "warm", a: a.id, b: b.id, n: 1 } },
    ];
  }
  const CUSTOMER: Record<string, [string, string][]> = {
    insurance: [["Halcyon Mutual here, about your policy. It's due on the first.", "I know. I know it is."], ["Have you ever considered insuring your furniture?", "Not until this moment, no."]],
    bank: [["Harbour Savings. Your account is a little overdrawn.", "How little?"], ["The bank would like a word about your deposit box.", "It's only letters in it. And a spoon."]],
    store: [["Ambler's. Your order has come in: one hat box, one hat.", "I'll send the boy."], ["Ambler's calling. The coat you liked is reduced.", "By how much?"]],
    law: [["Mr. Voss would like you to come in and sign.", "Sign what?"]],
    drugstore: [["Crane's. Your prescription is ready.", "Is it the pink one or the brown one?"]],
    grocery: [["Rudd's. We've the eggs you asked after.", "Are they cracked?"]],
    pawn: [["Novak's. Your watch is ready to be redeemed, whenever you are.", "Whenever I am is the trouble."]],
    milliner: [["Your hat is finished. It's rather wonderful.", "I'll come on Saturday."]],
    florist: [["Marchbanks. The lilies you ordered are in.", "Oh! I'd forgotten I'd ordered them."]],
  };
  const cust = CUSTOMER[ka ?? ""];
  if (cust && !tieOf(a, b.id)) {
    const [s, r] = P(c, "cust-" + ka, cust);
    return [
      { who: 0, text: s },
      { who: 1, text: r },
    ];
  }
  return P(c, "business", [
    [
      { who: 0 as const, text: "About the invoice from last week." },
      { who: 1 as const, text: "It's paid. Or it will be by Friday." },
    ],
    [
      { who: 0 as const, text: "We'll want the usual on Thursday." },
      { who: 1 as const, text: "The usual on Thursday. Very good." },
    ],
    [
      { who: 0 as const, text: "I have a question about the account." },
      { who: 1 as const, text: "Everybody does. What is it?" },
    ],
  ]);
}

function romanceLines(c: TalkCtx, a: Citizen, b: Citizen, t: Tie | undefined): Line[] {
  const late = c.lt.hour >= 22 || c.lt.hour < 4;
  const out: Line[] = [];
  const sweet: [string, string][] = [
    ["I only rang to hear your voice.", "Well, here it is. What do you think of it?"],
    ["I miss you already, and it's been four hours.", "Four and a half."],
    ["The band played our song tonight.", "Did you dance?"],
    ["I walked past your window twice today.", "I know. I saw you. The second time you pretended to read a poster."],
    ["Say something so I can hear it.", "Something."],
    ["Are you warm enough? It's turned cold.", "I've the cat on my feet. I'm very warm."],
    ["I bought a gramophone record for you. It's terrible.", "Then I'll love it."],
  ];
  const lateSweet: [string, string][] = [
    ["Are you still awake?", "No. I'm talking in my sleep."],
    ["Go to sleep.", "You go to sleep."],
    ["I can see the lighthouse from here.", "I can see the gasworks."],
  ];
  const rounds = late ? 4 : 3;
  for (let i = 0; i < rounds; i++) {
    const useLate = late && i % 2 === 1;
    const [s, r] = P(c, useLate ? "rom-late" : "rom", useLate ? lateSweet : sweet);
    out.push(i % 2 ? { who: 1, text: s } : { who: 0, text: s }, i % 2 ? { who: 0, text: r } : { who: 1, text: r });
    if (i === 1) out.push({ who: 2, text: P(c, "rom-pause", ["A long, comfortable silence on the line.", "Neither of them says anything for a while.", "Somebody laughs, and the line hums."]), pause: 5200 });
  }
  const engaged = t ? (t.k & K.ENGAGED) !== 0 : false;
  const canPropose = !engaged && t && t.s > 0.82 && a.age >= 19 && b.age >= 19 && !a.ties.some((x) => x.k & (K.SPOUSE | K.ENGAGED)) && !b.ties.some((x) => x.k & (K.SPOUSE | K.ENGAGED));
  if (canPropose && c.lt.hour >= 19 && c.rng.chance(0.22)) {
    const back = tieOf(b, a.id);
    const ok = c.rng.chance(Math.min(0.9, (back?.s ?? 0.5) * 0.95 + b.traits.nerve * 0.1));
    out.push({ who: 0, text: P(c, "propose", ["I've been thinking. And I'd rather ask now, before I lose my nerve. Will you marry me?", "This is a silly way to ask, down a wire. But will you marry me?"]) });
    out.push({ who: 2, text: "A long pause on the line.", pause: 2600 });
    out.push({
      who: 1,
      text: ok ? P(c, "yes", ["Yes. Oh, yes. You goose. Yes.", "Yes. Ask me again tomorrow so I can say it again."]) : P(c, "notyet", ["Ask me again in the spring.", "Not like this. Not down a wire. Ask me properly."]),
      fx: { kind: "propose", a: a.id, b: b.id, ok },
    });
  } else if (engaged && c.rng.chance(0.4)) {
    out.push({ who: 0, text: P(c, "eng", ["Mother wants the wedding in June. I want it on Saturday.", "I've told the whole of Juniper Row. I'm sorry.", "Have you told your family yet?"]) }, { who: 1, text: P(c, "eng-r", ["Saturday's a lovely day.", "I told the Automat. Everyone at the Automat.", "I've told everyone who'll listen."]) });
  }
  if (c.rng.chance(0.35) && !late) out.push(...planLines(c, a, b, c.rng.chance(0.5) ? "pictures" : "dance"));
  return out;
}

function venueFor(c: TalkCtx, kind: "pictures" | "dance" | "supper" | "talk" | "meet"): number {
  const w = c.w;
  const prefs = kind === "pictures" ? ["pictures"] : kind === "dance" ? ["dance"] : kind === "supper" ? ["cafe", "automat"] : ["automat", "cafe", "pier"];
  const open = w.venues.filter((x) => prefs.includes(x.kind) && (x.workplace < 0 || w.workplaces[x.workplace].open));
  const v = open.length ? open[c.rng.int(0, open.length - 1)] : w.venues.find((x) => x.kind === "automat") ?? w.venues[0];
  return v.id;
}

function planLines(c: TalkCtx, a: Citizen, b: Citizen, why: "pictures" | "dance" | "supper" | "talk" | "meet"): Line[] {
  const venue = venueFor(c, why);
  const v = c.w.venues[venue];
  // Tomorrow evening, or tonight if it's early.
  const dayStart = c.t - (c.lt.hour % 24) * 3_600_000;
  const hour = why === "talk" || why === "meet" ? Math.max(c.lt.hour + 1, 12.5) : 19.5 + c.rng.int(0, 2) * 0.5;
  let at = dayStart + hour * 3_600_000;
  if (at < c.t + 40 * 60_000) at += 86_400_000;
  const when = `${at - dayStart >= 86_400_000 ? "tomorrow at " : ""}${clockText(hour)}`;
  const aWho: 0 | 1 = a.id === c.A.id ? 0 : 1;
  const suggestion =
    why === "pictures"
      ? `There's a new picture at the Orpheum. ${cap(when)}?`
      : why === "dance"
        ? `Come to the Palais. ${cap(when)}. I'll wear the blue.`
        : why === "supper"
          ? `Supper at ${v.name}, ${when}?`
          : `Meet me at ${v.name}. ${cap(when)}.`;
  return [
    { who: aWho, text: suggestion, fx: { kind: "plan", a: a.id, b: b.id, venue, at } },
    { who: (1 - aWho) as 0 | 1, text: P(c, "plan-ok", ["I'll be there.", "With bells on.", "If I'm late, wait.", "Save me a seat."]) },
  ];
}

// ---------------------------------------------------------------------------
// The planner
// ---------------------------------------------------------------------------

export function planTalk(c: TalkCtx): Line[] {
  const { A, B, T, w, purpose } = c;
  const lines: Line[] = [];
  if (!B) return lines;
  lines.push({ who: 1, text: answerLine(c) });

  // Wrong numbers are their own comedy.
  if (purpose === "wrong") {
    const pairs: Line[][] = [
      [
        { who: 0, text: "Is that Rudd's? I want a pound of butter." },
        { who: 1, text: `This is ${w.lines[c.call.toLine].label.split(",")[0]}.` },
        { who: 0, text: "Well, have you any butter?" },
        { who: 1, text: "Goodnight." },
      ],
      [
        { who: 0, text: "Is that the fish market?" },
        { who: 1, text: "Do I sound like a fish market?" },
        { who: 0, text: "A little, yes." },
      ],
      [
        { who: 0, text: "Harold? Harold, is that you?" },
        { who: 1, text: "There's no Harold here." },
        { who: 0, text: "There never is. Sorry to trouble you." },
      ],
    ];
    return lines.concat(P(c, "wrong", pairs));
  }

  // Service calls.
  if (purpose === "fire") {
    const f = w.fire;
    const place = f && f.workplace >= 0 ? w.workplaces[f.workplace].name : f ? `the building on ${w.households[f.households[0]]?.street ?? "Pell Street"}` : "Pell Street";
    lines.push(
      { who: 0, text: `Fire! There's a fire at ${place}. Come quick.`, fx: { kind: "fire", a: A.id, b: B.id } },
      { who: 1, text: "On our way. Get everyone out and keep them out." },
      { who: 0, text: "They're out. Hurry." },
    );
    return lines;
  }
  if (purpose === "doctor") {
    lines.push(
      { who: 0, text: P(c, "doc", ["It's the baby. I think it's coming.", "It's time. The baby. Now."]) },
      { who: 1, text: "The doctor's on the way. Boil some water and stay calm." },
      { who: 0, text: "I am calm. I'm very calm. Is boiling water calm?" },
      { who: 1, text: "It gives you something to do." },
    );
    return lines;
  }
  if (purpose === "operator") {
    lines.push(
      { who: 0, text: P(c, "op-1", ["Operator? No, don't connect me. I want to speak to you.", "Is this the Exchange? I want whoever's listening.", "Operator. I know somebody's there."]) },
      { who: 2, text: "The line hums.", pause: 2400 },
      {
        who: 0,
        text: P(c, "op-2", [
          "People are saying the lines aren't private any more. I don't mind for myself. But my sister rings me when she's frightened, and she's stopped.",
          "I don't know who you are. I just want to say: it's a small city. We have to live in it after you've hung up.",
          "If you're listening, please. Not tonight. Tonight I need to say something to someone and I need it to be just us.",
        ]),
        fx: { kind: "suspect", a: A.id, b: -1, n: 1 },
      },
      { who: 0, text: "Goodnight, whoever you are." },
    );
    return lines;
  }

  // Someone else answered: ask for the one you wanted.
  if (T && B.id !== T.id) {
    const reach = T.act;
    lines.push({ who: 0, text: P(c, "askfor", [`Is ${address(A, T)} there?`, `May I speak to ${formal(T)}?`, `I'd like ${T.first}, please, if ${he(T)}'s about.`]) });
    if (T.call < 0 && (reach === Act.Home || (reach === Act.Work && w.lines[c.call.toLine].kind !== "home"))) {
      lines.push({ who: 1, text: P(c, "fetch", ["Hold the line.", `One moment, I'll fetch ${him(T)}.`, `${T.first}! Telephone!`]) }, { who: 2, text: "Footsteps, a door.", pause: 2200 }, { who: 1, text: `Hello? ${T.first} speaking.`, fx: { kind: "warm", a: A.id, b: B.id, n: 0 } });
      // Now the call proceeds with the one who was wanted.
      c.B = T;
    } else {
      const where =
        reach === Act.Asleep
          ? `${cap(he(T))}'s asleep, and I'm not waking ${him(T)}.`
          : reach === Act.Work
            ? `${cap(he(T))}'s at work.`
            : reach === Act.Out
              ? `${cap(he(T))}'s out. ${T.venue >= 0 ? `At ${w.venues[T.venue]?.name}, I think.` : ""}`.trim()
              : `${cap(he(T))}'s away.`;
      lines.push({ who: 1, text: where }, { who: 0, text: P(c, "msg", ["Tell " + him(T) + " I rang.", "Would you say I called? " + A.first + ".", "Never mind. I'll try tomorrow."]) });
      // Messages are how news gets about: sometimes they chat anyway.
      if (tieOf(A, B.id) && c.rng.chance(0.5)) {
        const r = choosePassable(c.rng, w, A, B, c.guarded);
        if (r) lines.push(...tellLines(c, A, B, r));
      }
      lines.push({ who: 1, text: P(c, "msg-bye", ["I'll tell " + him(T) + ".", "Goodnight.", "Right you are."]) });
      return lines;
    }
  }

  const target = c.B!;
  lines.push({ who: 0, text: greeting(c, target) });
  const t = tieOf(A, target.id);
  const guarded = c.guarded || A.suspicion > 0.55 || target.suspicion > 0.62;

  if (purpose === "guarded" || (guarded && ["news", "confide", "romance", "chat", "habit"].includes(purpose) && c.rng.chance(Math.max(A.suspicion, target.suspicion)))) {
    lines.push(
      { who: 1, text: P(c, "g1", ["What is it?", "Is something the matter?", "You sound strange."]) },
      { who: 0, text: P(c, "g2", ["Not on the telephone.", "I can't say. Not on this line.", "I'd rather not say it down a wire."]) },
    );
    lines.push(...planLines(c, A, target, "talk"));
    lines.push({ who: 1, text: P(c, "g3", ["Is this about the Exchange?", "You're frightening me a little.", "All right. All right."]) }, { who: 0, text: "Goodbye." });
    return lines;
  }

  switch (purpose) {
    case "order":
    case "business":
      lines.push(...orderLines(c, A, target));
      if (c.rng.chance(0.3)) lines.push(...smallTalk(c, A, target, 1));
      break;
    case "romance":
      lines.push(...romanceLines(c, A, target, t));
      break;
    case "askloan": {
      const amount = Math.max(3, Math.round(A.debts.reduce((s, d) => s + d.amount, 0) || 5));
      const can = target.money > amount + 10;
      const willing = can && c.rng.chance(0.25 + target.traits.warmth * 0.6 + (t?.s ?? 0) * 0.2);
      lines.push(
        { who: 0, text: P(c, "ask", [`I hate to ask. Could you see your way to ${dollars(amount)} till Saturday?`, `I'm in a hole. ${cap(dollars(amount))} would get me out of it.`]) },
        {
          who: 1,
          text: willing ? P(c, "lend", ["Of course. Come by in the morning.", "You'll have it tomorrow. Don't mention it again.", "Yes. And don't pay me back before you can."]) : P(c, "nolend", ["I haven't got it, love. I wish I had.", "Not this week. Ask me next week.", "I can't. I'm sorry. Truly."]),
          fx: { kind: "loan", a: target.id, b: A.id, n: amount, ok: willing },
        },
      );
      break;
    }
    case "repay": {
      const d = A.debts.find((x) => x.to === target.id);
      lines.push({ who: 0, text: `I've got your ${dollars(d?.amount ?? 5)}. Every cent.` }, { who: 1, text: P(c, "repaid", ["You didn't have to hurry.", "Well! Thank you.", "Buy yourself something with the change."]), fx: { kind: "repay", a: A.id, b: target.id, n: d?.amount ?? 0 } });
      break;
    }
    case "demand": {
      const d = target.debts.find((x) => x.to === A.id);
      const weeks = d ? Math.max(1, Math.round((c.t - d.since) / (7 * 86_400_000))) : 1;
      const pays = target.money >= (d?.amount ?? 0) && d;
      lines.push(
        { who: 0, text: `That's ${num(weeks)} ${weeks === 1 ? "week" : "weeks"} now, ${formal(target)}.` },
        { who: 1, text: pays ? "I'll bring it round tomorrow. All of it." : P(c, "plead", ["Saturday. You have my word.", "The shop's been slow. Give me till the end of the month.", "I know. I know. I'm not sleeping for it."]), fx: pays ? { kind: "repay", a: target.id, b: A.id, n: d!.amount } : { kind: "quarrel", a: A.id, b: target.id, n: 0.3 } },
        { who: 0, text: pays ? "Very good." : P(c, "demand-r", ["See that it is.", "Saturday, then. Not a day later.", "I'm not a charity, you know. But Saturday."]) },
      );
      break;
    }
    case "quarrel": {
      const pairs: [string, string, string][] = [
        ["You said you'd be there, and you weren't.", "I said I'd try.", "Trying isn't the same thing."],
        ["Your van was across my door again.", "It's a public street.", "Then park it in public, not in my doorway."],
        ["I heard what you said about my hat.", "I said it was brave.", "You know exactly what 'brave' means."],
        ["You told everyone before I could.", "I was pleased for you!", "Then be pleased quietly."],
      ];
      const [a1, b1, a2] = P(c, "quarrel", pairs);
      lines.push({ who: 0, text: a1 }, { who: 1, text: b1 }, { who: 0, text: a2, fx: { kind: "quarrel", a: A.id, b: target.id, n: 0.5 } });
      break;
    }
    case "makeup":
      lines.push(
        { who: 0, text: P(c, "sorry", ["I was wrong about the van. And the hat. And Tuesday.", "I've been cross with you for a month and I can't remember why.", "I'm ringing to say I'm sorry. Don't make me say it twice."]) },
        { who: 1, text: P(c, "sorry-r", ["We were both wrong. Come for supper.", "Oh, thank goodness. I was going to ring you.", "Say it twice. I like hearing it."]), fx: { kind: "reconcile", a: A.id, b: target.id } },
      );
      break;
    case "sympathy":
      lines.push(
        { who: 0, text: P(c, "symp", ["I heard. I'm so sorry. Is there anything I can do?", "I just wanted to ring. How are you bearing up?"]) },
        { who: 1, text: P(c, "symp-r", ["Everyone's all right. That's the main thing.", "Better for hearing you.", "Bring a pie. Bring two."]), fx: { kind: "warm", a: A.id, b: target.id, n: 2 } },
      );
      break;
    case "congratulate":
      lines.push(
        { who: 0, text: P(c, "congr", ["I hear congratulations are in order!", "Is it true? Oh, I'm so glad."]) },
        { who: 1, text: P(c, "congr-r", ["News travels.", "It's true. I can't stop smiling.", "Who told you? Never mind. Yes!"]), fx: { kind: "warm", a: A.id, b: target.id, n: 2 } },
      );
      break;
    case "jobhunt": {
      const wp = target.work >= 0 ? w.workplaces[target.work] : null;
      const room = !!wp && wp.open && wp.staff.length < wp.capacity;
      const ok = room && c.rng.chance(0.45);
      lines.push(
        { who: 0, text: wp ? `I heard you might want a hand at ${wp.name}.` : "Do you know of any work going?" },
        { who: 1, text: ok ? "Come in Monday at seven. Wear boots." : P(c, "nojob", ["Nothing now. Try after Christmas.", "I'll ask. I can't promise.", "Everybody's asking. I'm sorry."]), fx: { kind: "hire", a: A.id, b: target.id, ok, n: wp?.id ?? -1 } },
      );
      break;
    }
    case "confront": {
      const rumour = w.rumours.find((r) => !r.dead && (r.tpl === "crush" || r.tpl === "seen") && r.subject === target.id && A.knows[r.id] !== undefined);
      const other = rumour ? w.citizens[rumour.versions[A.knows[rumour.id]].claim.other] : null;
      lines.push(
        { who: 0, text: `Is it true, what they're saying about you${other ? ` and ${full(other)}` : ""}?` },
        { who: 1, text: P(c, "conf-1", ["Who's saying it?", "What are they saying?", "Oh, for heaven's sake."]) },
        { who: 0, text: "Everyone. The whole street." },
        { who: 1, text: P(c, "conf-2", ["It isn't true. You know it isn't.", "We had a coffee. One coffee.", "And you believed them."]), fx: { kind: "quarrel", a: A.id, b: target.id, n: 0.7 } },
      );
      break;
    }
    case "invite":
      lines.push(...planLines(c, A, target, "supper"));
      break;
    case "plan":
      lines.push(...planLines(c, A, target, c.rng.pick(["pictures", "supper", "dance"] as const)));
      break;
    case "newyear":
      lines.push(
        { who: 0, text: P(c, "ny", ["Happy New Year!", "It's midnight! Happy New Year!", "Nineteen thirty! Can you believe it?"]) },
        { who: 1, text: P(c, "ny-r", ["Happy New Year! Can you hear the whistles on the harbour?", "Happy New Year, you. Every bell in the city's going.", "The Blue Heron's singing so loud I can hear it from here."]), fx: { kind: "warm", a: A.id, b: target.id, n: 3 } },
      );
      break;
    case "checkin":
      lines.push({ who: 0, text: P(c, "chk", ["Just checking you got home.", "Only ringing to see you're all right.", "Did you remember to lock the door?"]) }, { who: 1, text: P(c, "chk-r", ["Home and dry.", "I'm all right. Go to bed.", "I did. I think I did. I'll go and see."]) });
      break;
    case "confide": {
      const s = A.secrets.find((x) => x.rumour < 0);
      if (s) lines.push(...confideLines(c, A, target, s));
      else lines.push(...smallTalk(c, A, target, 2));
      break;
    }
    case "habit":
      lines.push({ who: 1, text: P(c, "habit", ["Right on time.", "I was just looking at the clock.", "You're late. Two minutes."]) });
      lines.push(...smallTalk(c, A, target, 3));
      break;
    case "news":
    case "chat":
    default:
      lines.push(...smallTalk(c, A, target, purpose === "news" ? 2 : 3 + (c.rng.chance(0.45) ? 1 : 0)));
  }

  // Talk turns to other people: the rumour mill.
  if (!["fire", "doctor", "demand", "order", "business", "wrong"].includes(purpose)) {
    const first = c.rng.chance(purpose === "news" ? 0.95 : 0.2 + 0.5 * A.traits.gossip) ? choosePassable(c.rng, w, A, target, guarded) : null;
    if (first) lines.push(...tellLines(c, A, target, first));
    if (c.rng.chance(0.1 + 0.35 * target.traits.gossip)) {
      const second = choosePassable(c.rng, w, target, A, guarded);
      if (second && second !== first) lines.push(...tellLines(c, target, A, second));
    }
    // Close friends confide.
    const trust = t?.tr ?? 0;
    if (purpose !== "confide" && trust > 0.7 && !guarded && c.rng.chance(0.12)) {
      const s = A.secrets.find((x) => x.rumour < 0);
      if (s) lines.push(...confideLines(c, A, target, s));
    }
    // And make plans.
    if (purpose === "chat" && t && t.k & (K.FRIEND | K.KIN) && c.rng.chance(0.18)) lines.push(...planLines(c, A, target, "supper"));
  }

  // Goodbyes.
  const late = c.lt.hour >= 22 || c.lt.hour < 5;
  const bizz = purpose === "order" || purpose === "business";
  const close = !!t && (t.k & (K.KIN | K.ROMANCE | K.SPOUSE) || (t.k & K.FRIEND && (A.sex === "f" || target.sex === "f")));
  const closing: [string, string][] = bizz
    ? [["Very good. Good day to you.", "Good day."], ["I'll let you get on.", "Much obliged."]]
    : late
      ? [["Go to bed.", "You first."], ["Goodnight, then.", "Goodnight. Sleep tight."], ["I'll let you go. It's late.", "It's always late when you ring."]]
      : close
        ? [["I must go, the kettle's screaming.", "Go on, then."], ["Ring me tomorrow.", "I will. Bye now."], ["Give my love to everyone.", "I will. Bye."], ["Well. I'll see you Sunday.", "Sunday. Bye, love."]]
        : [["I must go, the kettle's screaming.", "Go on, then."], ["Ring me tomorrow.", "I will. Goodbye."], ["Well. I'll let you get on.", "Goodbye, then."], ["Mind how you go.", "And you."]];
  const [x, y] = P(c, bizz ? "bye-b" : late ? "bye-l" : "bye", closing);
  lines.push({ who: 0, text: x }, { who: 1, text: y });
  return lines;
}

/** Time a list of lines into beats, as people actually speak. */
export function toBeats(c: TalkCtx, lines: Line[]): Beat[] {
  const beats: Beat[] = [];
  let at = 600;
  for (const l of lines) {
    const pace = l.who === 2 ? l.pause ?? 1800 : 1800 + l.text.length * 62 + c.rng.range(0, 1300);
    beats.push({ at, who: l.who, text: tidy(l.text), fx: l.fx });
    at += pace;
  }
  return beats;
}

/** A line to replace a secret when the speaker grows wary mid-call. */
export function guardedReplacement(c: { rng: Rng; w: World }): string {
  return P(c, "guard-rep", ["Never mind. I'll tell you when I see you.", "Actually, not now. Later.", "It'll keep. It's nothing.", "I'll tell you Thursday. In person."]);
}

export function clickReaction(c: { rng: Rng; w: World }, who: Citizen): string {
  return P(c, "click-r", [
    "Did you hear that?",
    "Hello? Is somebody there?",
    `There it is again. That click.`,
    "Is someone on this line?",
    `Listen. Did the line just click, ${who.first}?`,
  ]);
}

export function clickAnswer(c: { rng: Rng; w: World }): string {
  return P(c, "click-a", ["It's the line. It does that.", "It's the wind in the wires.", "Hello? No one. Go on.", "I heard it too."]);
}

