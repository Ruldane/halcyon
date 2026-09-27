"use client";

/**
 * The exchange at night: one room, seen in elevation. The city through the
 * tall windows above, the switchboard below, the supervisor's desk at the
 * right; beneath the room, the desk drawer (directory, census, log, archive).
 */
import { useEffect, useState } from "react";
import { ExchangeClient } from "../client/bridge";
import { Engine } from "../client/engine";
import { readParams } from "../client/params";
import { placeFrom } from "../sim/clock";
import { ExchangeContext, type Exchange } from "./context";
import { Signage } from "./Signage";
import { CityView } from "./CityView";
import { Switchboard } from "./Switchboard";
import { Desk } from "./Desk";
import { Slip } from "./Slip";
import { Drawer } from "./Drawer";
import { FramingNote } from "./FramingNote";
import { Announcer } from "./Announcer";
import { TestHooks } from "./TestHooks";

export function ExchangeApp() {
  const [x, setX] = useState<Exchange | null>(null);

  useEffect(() => {
    // One city per mount; StrictMode's second mount gets a fresh one and the
    // first is terminated in cleanup, so no worker is ever left running.
    const born = performance.now();
    const params = readParams(window.location.search);
    const client = new ExchangeClient();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const place = placeFrom(tz, -new Date(Date.now() + params.clockOffset).getTimezoneOffset());
    const engine = new Engine(client, place);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let still = params.still ?? reduce;
    try {
      const saved = window.localStorage.getItem("halcyon:still");
      if (params.still === null && saved !== null) still = saved === "1";
    } catch {
      /* storage unavailable: fine */
    }
    client.store.set({ still, timeZone: tz, offsetMinutes: place.offsetMinutes });
    engine.setStill(still);
    client.onTick(() => engine.noteTick());
    client.start(params);
    const onVis = () => client.send({ type: "visibility", hidden: document.visibilityState === "hidden" });
    document.addEventListener("visibilitychange", onVis);
    const onHide = () => client.send({ type: "save" });
    window.addEventListener("pagehide", onHide);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the exchange must be created on the client, after mount
    setX({ client, engine });
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
      engine.dispose();
      if (performance.now() - born > 2000) {
        // A real departure: give the save a moment to reach IndexedDB before the worker ends.
        client.send({ type: "save" });
        window.setTimeout(() => client.dispose(), 400);
      } else {
        // StrictMode's rehearsal mount: end it at once, so only one city ever runs.
        client.dispose();
      }
    };
  }, []);

  if (!x) return <Loading />;
  return (
    <ExchangeContext.Provider value={x}>
      <Room />
    </ExchangeContext.Provider>
  );
}

function Loading() {
  return (
    <div className="loading" role="status">
      <p className="loading__sign">Halcyon Exchange</p>
      <p className="loading__line">Connecting the board&hellip;</p>
    </div>
  );
}

function Room() {
  return (
    <>
      <a className="skip" href="#board">
        Skip to the switchboard
      </a>
      <a className="skip" href="#log">
        Skip to the night log
      </a>
      <div className="exchange">
        <Signage />
        <main id="main">
          <section className="room" aria-label="The exchange at night">
            <div className="room__stage">
              <CityView />
              <Switchboard />
            </div>
            <Desk />
          </section>
          <Drawer />
        </main>
      </div>
      <Slip />
      <FramingNote />
      <Announcer />
      <TestHooks />
    </>
  );
}
