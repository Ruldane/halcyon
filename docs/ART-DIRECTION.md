# Halcyon Exchange: art direction

Design read: an art-directed living simulation for a curious, design-literate visitor, in a 1929
architectural-rendering / Art Deco / telephone-machinery language. Native CSS + Tailwind v4, a
worker-fed Canvas 2D city, DOM switchboard. Dials: variance 9, motion 7, density 3.

## Reference frames (generated, studied, not shipped)

`reference/01-city-dusk.jpg`, `02-switchboard.jpg`, `03-paper.jpg`, `04-rumour.jpg`.

What they taught:

1. **The window frame is the composition.** Three to five tall windows with stepped (ziggurat)
   heads divide the skyline into bays. The mullions are strong, dark and geometric; the city is
   seen *between* them. We make each bay a district, and put that district's jack field directly
   beneath it. The building's elevation and the board's layout become one grid.
2. **Scarcity makes the lamps.** The switchboard frame is a dense field of ivory rings; only a
   few lamps are lit. Drama comes from the ratio. Do not light the board up for effect; let the
   simulation light it.
3. **Nickel pilasters, chevrons and fans are structure.** Ornament frames fields and marks
   thresholds (cornice, sill, keyshelf edge). Never sprinkled.
4. **The paper is condensed caps over narrow columns, with one coral rule.** The masthead flanks
   the title with fans. The headline spans the full measure in two lines.
5. **A rumour reads as arcs over the rooftops**, hopping window to window, with a numbered
   legend beside it. Arcs, not straight lines: they separate the path from the architecture.

## Composition: an architectural elevation, read left to right

Not a descent (Hollow Hill) and not a time scroll (Alderwood). The first screen is one room seen
in elevation: the city through the exchange's tall windows above, the switchboard below, the
supervisor's desk at the right. Everything aligns on vertical axes. Each district is a bay: its
skyline above, its jack field below. You read Halcyon from the harbour (left) to the hill
(right), the way an operator reads the board. Below the room lies the desk drawer: the directory,
the census, the full log, the archive.

On phones the bays become a swipeable sequence: one district of skyline over its own jack field,
with the live calls as call tickets you can tap to listen.

## Palette (one hot accent, with a job)

| Token | Role |
|---|---|
| night teal `#0b2327` → `#123338` | ground: sky, walls, board face |
| ivory `#ece4cf` | Bakelite jacks, paper, text |
| lamp light `#ffd88f` | light itself: lit windows, lit lamps (material, not UI accent) |
| jade `#5fae96` | cords' cloth, connected lines, ornament lines |
| nickel `#a9b5b2` | plugs, rules, numerals, secondary text |
| **coral `#ff7b67`** | **the visitor's presence**: the listening cord, traced rumours, suspicion |

The accent means one thing: *you*. Wherever coral appears, the visitor has touched the city.

## Type

- **Poiret One**: the exchange's Deco signage. Large sizes only.
- **Big Shoulders** (and its Stencil cut for stamped board numerals): labels, keys, census.
- **League Gothic**: the evening paper's headlines (Alternate Gothic lineage).
- **Newsreader**: the log, directory, conversations, paper columns.

## Motion language

- Lamps: filament ease (120 ms). Calling lamps pulse at 1 Hz at most, never a flash.
- Cords: spring up from the keyshelf into the jack, hang with damped sway; drop on clear.
- City: windows warm on over 200 ms; El trains cross; searchlights sweep slowly on club nights;
  the lighthouse turns.
- Trace: the path draws hop by hop.
- Reduced motion: lamps change without pulsing, cords appear, no sweeping beams, trains jump
  between stations, the trace appears whole. The city keeps living.
