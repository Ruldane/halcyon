# Halcyon Exchange

*Every call in the city of Halcyon passes through one switchboard. It is 1929, and the city never stops talking.*

A living harbour city of 277 people in 127 households and 37 businesses, on 142 telephone lines, running in a Web Worker beside the page. You work position three on the night shift. The city through the exchange's tall windows lights and darkens as its people wake, work, go out and sleep; the board lights as they ring each other; and your listening key lets you plug into any live line and read what is said. The lines click. People notice.

Halcyon, its exchange and every person in it are invented. Nothing here is presented as fact.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
npm run check        # lint, type-check, unit tests, production build (static export), browser tests
```

Individual steps: `npm run lint`, `npm run typecheck`, `npm test` (headless simulation tests, Vitest), `npm run build` (static export to `out/`), `npm run test:e2e` (Playwright against the export, served by `scripts/serve.mjs`). `npm start` serves `out/` on port 3260. There is no server, API, database or runtime network request: fonts are self-hosted through `next/font`, and every word the city says is written by its own grammar.

### Parameters, for tests and demonstrations

| Parameter | Effect |
|---|---|
| `?fresh` | Found a new city (forgets the saved one). |
| `?seed=7` | Found from a fixed seed (deterministic). |
| `?clock=2026-12-31T23:58` or `?clock=+30h` | Move the visitor's clock: day, night, Sundays, seasons, absence, New Year's Eve. |
| `?speed=8` / `?paused` | Start hastened, or held. |
| `?still` | Start with the still board (reduced-motion presentation). |
| `?force=storm,fire,operator,engage` | Make something happen now. |
| `?persist=0` | Do not save. |
| `?debug` | Frame-rate and quality-tier readout. |

Developer scripts: `node scripts/shots.mjs <name> <w> <h> "<query>" <waitMs> "<actions>"` (screenshots into `../.shots`), `node scripts/perf.mjs <w> <h> <cpuThrottle>` (frame times).

## The composition

One room, seen in elevation and read left to right like the board itself. Each district of the city is a window bay; the bay's jack field sits directly beneath it, so the architecture is the information architecture: the Wharf, Pell Street, Midtown, Lantern Row and Juniper Hill, harbour to hill. The supervisor's desk stands at the end of the room with the evening paper and the log. Beneath the room is the desk drawer: the directory, the census return, the whole log, and your own shifts. It is neither Alderwood's time scroll nor the Hollow Hill's descent; the camera never moves through the story, the city moves in front of you.

On phones the bays become one district at a time, swiped or chosen from the nameplates, each over its own jacks (48px targets), with the live calls as call tickets to tap.

Art direction, palette, type and the reference frames that informed them: `docs/ART-DIRECTION.md` and `docs/reference/`.

## What "alive" means here

- **Autonomy.** Citizens decide to ring from their needs, ties, schedules and news; calls signal, ring, connect and clear with real durations; windows follow each person's whereabouts. Leave the tab open and the city carries on.
- **Emergence.** Friendships, courtships, engagements, quarrels and reconciliations, loans and rent arrears, job losses and hirings, and above all rumours arise from simple rules. The only scripted person is Velda Orr, milliner, 14 Juniper Row, who owes her landlord and rings her sister at half past seven, as the brief asked; what happens to her is up to the city.
- **Needs and consequences.** Money (wages on Saturday, rent on Monday, households that keep their own, debts and loans), company (the lonely ring more and stay up later), rest (shifts and chronotype). A rumour about a debt reaching the creditor brings a demand for the rent; talk of a sweetheart reaching a fiancé brings a confrontation; hearing your own secret repeated breaks the habit of a lifetime.
- **Memory.** The city is saved to IndexedDB (versioned schema; an unreadable save founds a new city and says so). Return tomorrow and a bounded absence model (fifteen-minute steps for two days, two-hour steps after, thirty days at most) lives the time you missed by the same rules; the supervisor writes the absence into the log, and the last five minutes are lived in full so the board is busy when you sit down.
- **Real time and place.** The day follows your clock: morning rush, office hours, the lull after six, the evening, the clubs, the small hours (cab calls from the Blue Heron, the night nurse ringing the doctor, owls ringing owls). Sundays are quiet. The season, the sunset, and the moon's phase come from your date and hemisphere.
- **Reaction.** The city notices the visitor (below).
- **Individuality.** Every citizen has a name, address, trade, household, temperament, ties, secrets, a day, and a biography written from their recorded history.
- **Never identical twice.** Seeded and deterministic for tests (the phrase memory and the supervisor's place in her log are saved too, so a restored city replays exactly), diverging for each visitor by time, listening and chance.

## The surprises

1. **Listening in, and the city finding out.** Press any lit lamp or a ticket: the coral cord goes into that line and the conversation appears as it is spoken, generated from the callers' real relationship, moods, troubles, work and the rumours they carry. What is said changes the city at the moment it is said: a rumour passes (and mutates), a loan is agreed, a proposal is accepted, a supper is planned. But the line clicks. A party who hears it asks "Did you hear that?"; enough clicks and they begin to wonder aloud, and "someone at the Exchange is listening" becomes a rumour that travels and grows in the telling ("the operators listen to every call", "writes down everything we say in a ledger"). Wary citizens keep their secrets off the line, arrange to meet at the Automat instead (and are seen together, which starts rumours of its own), and the Evening Star runs a correspondent's letter, then a headline. The most wary ring position three itself; answer, and word that the Exchange "was kind about it" softens the city; leave it ringing, and the talk grows. Stop listening and the rumour cools and dies away over days. The supervisor notices too.
2. **Tomorrow's headline.** The masthead of the desk is the Halcyon Evening Star. Its editions (four o'clock, half past nine, and an Extra when big news breaks) are set by the simulation from whatever spread furthest or mattered most: an event the city lived through, or a rumour the Star's own reporters have picked up on their telephones (they ring round for news). Its weather column reads tomorrow from the almanac, so the forecast is, for once, correct.
3. **The storm.** Deterministic per city and date, likelier in your winter. The harbour master reads the glass the day before. Lines fall district by district, most exposed first; the field goes dark under a "Lines down" tag, calls are cut off mid-sentence, windows go to candlelight; then two repair crews restore districts in the order the city needs them (essential lines, households, people waiting to ring).
4. **Midnight, New Year's Eve.** On the real date every lamp on the board lights at once, the city floods the lines with greetings, and the Star sets an Extra.

Fires, weddings (with a change of name and a move of house), births, bankruptcies and reopenings, and opening nights with searchlights over Lantern Row emerge from state and the almanac, so the absence model knows what happened while you were away.

## Architecture

| Concern | Where |
|---|---|
| Simulation core (pure, headless, seeded) | `src/sim/`: `city.ts` founding, `layout.ts` architecture (every window belongs to a household or workplace), `sim.ts` the step, calls, effects, reactions, suspicion, `rumours.ts` versions and mutation, `schedule.ts` where people want to be, `events.ts` almanac, storms, fires, weddings, economy, `catchup.ts` absence model, `persist.ts` schema, `census.ts` readers (cards, traces, census, directory) |
| Grammars | `src/grammar/`: `conversation.ts` (moves with effects, realized as dialogue), `rumour.ts` (claim wording by exaggeration), `log.ts` (the supervisor's voice, absence entry, memorandum), `paper.ts` (the Star), `bio.ts`, `words.ts` |
| Worker and protocol | `src/worker/`: fixed 500 ms steps in real time, packed ticks (citizen bits, line lamps, calls) five times a second, IndexedDB every 20 s and on hide, catch-up on return |
| Bridge, store, engine | `src/client/`: `bridge.ts` (worker, slow state), `store.ts` (useSyncExternalStore), `engine.ts` (one rAF loop, lamps as DOM attributes, adaptive quality, test hooks) |
| Renderers | `src/render/`: `skyline.ts` (cached architecture), `city.ts` (windows layer redrawn incrementally, trains, the Light, searchlights, rain, fire, trace and listening overlays), `cords.ts` (sprung cloth cords) |
| Editorial UI | `src/components/`: signage, city view and frames, switchboard and keyshelf, desk (paper, log), slip (listening, tracing, card), drawer (directory, census, full log, archive), memorandum, announcer |

No per-frame values pass through React; nothing listens to scroll.

## Accessibility

- **Hold the board** (WCAG 2.2.2) in the signage stops the simulation and all motion; speed is a separate radio group. Lamps pulse at most once a second; lightning is a faint brightening at most every nine seconds.
- **Still board:** on by default under `prefers-reduced-motion`, and a setting for anyone. Lamps change without pulsing, cords appear rather than swing, beams stand still, trains jump between stations, the trace appears whole. The city lives on.
- **Keyboard:** skip links; the city view takes arrow keys to move between lit windows and Enter for the card; the board is one tab stop with arrow keys between jacks, Enter to listen to a live line or open the line-holder's card; the slip panel takes focus and returns it, Escape closes; trace hops step with the arrow keys.
- **Screen readers:** every jack's label reports its state; conversations are a polite live log; an opt-in, rate-limited narration of the night log; "What is Halcyon talking about now?" on demand; the census, directory and shifts are real tables; the operator's own line is announced when it rings.

## Performance

The simulation costs about 0.008 ms a step (Node), off the main thread. The architecture is cached; sky, architecture and windows are composited once and refreshed only when a light changes, and only the changed windows' neighbourhoods are redrawn. Frame intervals are watched in two-second windows; sustained slowness lowers the pixel ratio, then glows and beams, then caps at 30 fps, and recovers when the machine does.

Measured on the production export (Chrome, Windows laptop), 12-second samples of requestAnimationFrame intervals, Friday/Saturday evening, 277 citizens:

| Viewport | CPU | Median | p90 | p99 | Tier |
|---|---|---|---|---|---|
| 1440×900 | 1× | 16.7 ms | 16.7 ms | 16.8 ms | 0 |
| 1440×900 | 4× throttled | 16.7 ms | 16.7 ms | 16.8 ms | 0 |
| 2560×1440 | 1× | 16.7 ms | 16.7 ms | 16.8 ms | 0 |
| 2560×1440 | 4× throttled | 16.7 ms | 16.7 ms | 33.4 ms | 0 |
| 390×844 | 1× | 16.7 ms | 16.7 ms | 16.8 ms | 0 |
| 390×844 | 6× throttled | 16.7 ms | 16.7 ms | 33.4 ms | 0 |

## Dependencies

Only what the stack requires: Next.js 16.3.6 (App Router, static export), React 19.2.8 as pinned by that release, Tailwind CSS 4, TypeScript (strict). Development only: Vitest (headless simulation tests) and Playwright (behavioural browser tests). Typefaces, self-hosted through `next/font`: Poiret One (signage), Big Shoulders and Big Shoulders Stencil (labels, stamped numerals), League Gothic (the paper), Newsreader (text). The build notes that Next has no fallback metrics for Big Shoulders; the fonts load with `display: swap` regardless.
