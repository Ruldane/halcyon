/**
 * The wording of a rumour. A claim is structured (who, what, how much, how
 * embroidered); its text is rendered here, so that when a retelling
 * exaggerates, swaps a name or inflates a sum, the words change with it and
 * the trace can show exactly which.
 */
import { CARS, LESSONS, NOVEL_ABOUT, PAWNED, RECIPES } from "../sim/data";
import type { Claim, World } from "../sim/types";
import { full, his, num } from "./words";

const HEDGES = [
  "",
  "They say ",
  "I heard ",
  "Don't repeat this, but ",
  "It's all over the street that ",
];

function nm(w: World, id: number): string {
  if (id < 0) return "someone";
  const c = w.citizens[id];
  return c ? full(c) : "someone";
}

function wp(w: World, id: number): string {
  return w.workplaces[id]?.name ?? "the shop";
}

function street(w: World, id: number): string {
  const c = w.citizens[id];
  if (!c) return "the street";
  return w.households[c.home]?.street ?? "the street";
}

function district(w: World, d: number): string {
  return ["the Wharf", "Pell Street", "Midtown", "Lantern Row", "Juniper Hill"][d] ?? "the city";
}

function weeks(n: number, x: number): string {
  const k = Math.max(1, Math.round(n));
  if (x >= 1) return `${num(Math.min(12, k))} months' rent`;
  return `${num(Math.min(12, k))} ${k === 1 ? "week's" : "weeks'"} rent`;
}

/** The claim as a bare statement, without hedging. */
export function claimBody(w: World, c: Claim): string {
  const S = nm(w, c.subj);
  const O = nm(w, c.other);
  const subj = w.citizens[c.subj];
  const pos = subj ? his(subj) : "their";
  const x = c.x;
  switch (c.tpl) {
    case "debt": {
      const cred = c.other >= 0 ? O : `${pos} landlord`;
      if (x <= 0) return `${S} owes ${cred} ${weeks(c.n, 0)}`;
      if (x === 1) return `${S} owes ${cred} ${weeks(c.n + 1, 1)}`;
      if (x === 2) return `${S} is behind with every shop on ${street(w, c.subj)}`;
      return `${S} is ruined and owes half of ${district(w, c.place)}`;
    }
    case "crush":
      return [`${S} is sweet on ${O}`, `${S} is walking out with ${O}`, `${S} is secretly engaged to ${O}`, `${S} means to elope with ${O}`][x];
    case "surprise":
      return [
        `${S} is planning a surprise party for ${O}`,
        `${S} is planning a surprise supper for ${O} at the Meridian`,
        `${S} has hired the whole of the Blue Heron for ${O}'s party`,
        `${S} is throwing ${O} a surprise wedding`,
      ][x];
    case "car": {
      const car = CARS[c.v % CARS.length];
      return [
        `${S} borrowed ${O}'s car without asking`,
        `${S} borrowed ${car} and kept it out all night`,
        `${S} dented ${car} and told no one`,
        `${S} drove ${car} off the end of Quay Street`,
      ][x];
    }
    case "novel": {
      const about = NOVEL_ABOUT[c.v % NOVEL_ABOUT.length];
      return [
        `${S} is writing a novel about ${about}`,
        `${S} has put ${about} in a novel, names and all`,
        `${S} has sold a novel about ${about} to a New York publisher`,
        `${S} has a novel coming out with all our names in it`,
      ][x];
    }
    case "lessons": {
      const l = LESSONS[c.v % LESSONS.length];
      return [`${S} is taking ${l}`, `${S} takes ${l} twice a week and tells no one`, `${S} is going on the stage`, `${S} is running away with a touring revue`][x];
    }
    case "inheritance":
      return [
        `${S} expects a little money from an aunt`,
        `${S} is coming into ${num(Math.max(2, c.n + 2))} hundred dollars`,
        `${S} is coming into a fortune`,
        `${S} has bought a house on Belvedere Road with ${pos} inheritance`,
      ][x];
    case "jobhunt":
      return [`${S} is looking for a new place`, `${S} is leaving ${wp(w, c.place)}`, `${S} has been let go from ${wp(w, c.place)}`, `${S} is leaving Halcyon for good`][x];
    case "pawned": {
      const item = PAWNED[c.v % PAWNED.length].replace(/^(her|his) /, `${pos} `);
      return [`${S} pawned ${item} at Novak's`, `${S} pawned ${item} and the good coat`, `${S} has pawned everything but the bed`, `${S} has pawned everything but the telephone`][x];
    }
    case "dog":
      return [
        `${S} keeps a dog the landlord doesn't know about`,
        `${S} keeps two dogs the landlord doesn't know about`,
        `${S} keeps a whole kennel behind ${pos} curtains`,
        `${S} keeps a goat on the roof`,
      ][x];
    case "letters":
      return [
        `${S} writes letters to ${O} and never sends them`,
        `${S} writes to ${O} every single day`,
        `${S} has had a letter back from ${O}`,
        `${S} and ${O} are engaged by post`,
      ][x];
    case "recipe": {
      const rc = RECIPES[c.v % RECIPES.length];
      return [`${S} knows the secret of ${rc}`, `${S} copied out the secret of ${rc}`, `${S} is selling the secret of ${rc}`, `${S} invented ${rc} in the first place`][x];
    }
    case "engaged":
      return [`${S} and ${O} are engaged`, `${S} and ${O} are to be married in the spring`, `${S} and ${O} are to be married on Saturday`, `${S} and ${O} were married in secret last week`][x];
    case "broken":
      return [`${S} has broken it off with ${O}`, `${S} gave ${O} back the ring`, `${S} threw ${O}'s ring in the harbour`, `${S} has left Halcyon over ${O}`][x];
    case "wedding":
      return [`${S} and ${O} were married at St. Jude's`, `${S} and ${O} were married with the whole Row in the church`, `${S} and ${O} were married and the mayor gave a speech`, `${S} and ${O} were married and the bride wore silver`][x];
    case "birth":
      return [`${S} has had a baby`, `${S} has had twins`, `${S} has had twins, and they're naming one after the doctor`, `${S} has had triplets`][x];
    case "fire":
      return [
        `there was a fire at ${wp(w, c.other)}`,
        `the fire at ${wp(w, c.other)} started in the kitchen`,
        `the whole of ${district(w, c.place)} nearly went up`,
        `half of ${district(w, c.place)} burned to the ground`,
      ][x];
    case "storm":
      return [`there's a storm coming`, `there's a bad storm coming`, `the worst storm in thirty years is coming`, `the harbour's going to flood`][x];
    case "bankrupt":
      return [`${wp(w, c.place)} is in trouble`, `${wp(w, c.place)} is closing`, `${wp(w, c.place)} has gone under`, `${wp(w, c.place)} was sold for a dollar`][x];
    case "opening":
      return [
        `${wp(w, c.place)} has an opening night`,
        `${wp(w, c.place)} has an orchestra from the capital tonight`,
        `${wp(w, c.place)} has a famous singer tonight`,
        `${wp(w, c.place)} has an elephant tonight`,
      ][x];
    case "seen":
      return [`${S} was seen with ${O} at ${venueName(w, c.place)}`, `${S} was seen holding hands with ${O} at ${venueName(w, c.place)}`, `${S} and ${O} are walking out`, `${S} and ${O} are engaged, whatever they say`][x];
    case "lostjob":
      return [`${S} has lost ${pos} place at ${wp(w, c.place)}`, `${S} was let go from ${wp(w, c.place)}`, `${S} was thrown out of ${wp(w, c.place)}`, `${S} is leaving Halcyon`][x];
    case "rehired":
      return [`${S} has found work at ${wp(w, c.place)}`, `${S} has a good place at ${wp(w, c.place)}`, `${S} is managing ${wp(w, c.place)}`, `${S} is buying ${wp(w, c.place)}`][x];
    case "answered":
      return [
        `someone at the Exchange answered the telephone, and was kind about it`,
        `the night operator is a decent sort after all`,
        `the operator promised not to listen any more`,
        `the Exchange has stopped listening altogether`,
      ][x];
    case "listener":
      return [
        `someone at the Exchange is listening in`,
        `the operators listen to every call`,
        `the Exchange writes down everything we say in a ledger`,
        `the Evening Star pays the Exchange for gossip`,
      ][x];
  }
  return `${S} has a secret`;
}

function venueName(w: World, id: number): string {
  return w.venues[id]?.name ?? "the Automat";
}

export function claimText(w: World, c: Claim, hedge: number): string {
  const body = claimBody(w, c);
  const h = HEDGES[Math.max(0, Math.min(HEDGES.length - 1, hedge))];
  const s = h + body;
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}

/** How far a retelling has drifted from the truth. */
export function fidelity(original: Claim, c: Claim, truth: boolean): "true" | "embroidered" | "untrue" {
  if (!truth) return "untrue";
  if (c.other !== original.other && original.other >= 0) return "untrue";
  const dx = c.x - original.x;
  if (dx <= 0 && Math.abs(c.n - original.n) < 1) return "true";
  if (dx <= 1) return "embroidered";
  return "untrue";
}
