"use client";

import { useExchange, usePlace, useUI } from "./context";
import { clockText, dateText, local } from "../sim/clock";
import { Fan } from "./ornament";

export function Signage() {
  const { client } = useExchange();
  const t = useUI((s) => s.t);
  const speed = useUI((s) => s.speed);
  const ahead = useUI((s) => s.ahead);
  const ready = useUI((s) => s.ready);
  const storm = useUI((s) => s.storm);
  const debug = useUI((s) => s.debug);
  const error = useUI((s) => s.error);
  const place = usePlace();
  const lt = t ? local(t, place) : null;
  const held = speed === 0;
  const shift = lt ? (lt.hour >= 20 || lt.hour < 6 ? "Night shift" : lt.hour < 14 ? "Day shift" : "Evening shift") : "";

  return (
    <header className="signage">
      <div className="signage__mark">
        <Fan className="signage__fan" />
        <h1 className="signage__name">
          <span className="signage__halcyon">Halcyon</span>
          <span className="signage__exchange">Exchange</span>
        </h1>
      </div>
      <p className="signage__clock" aria-live="off">
        {lt ? (
          <>
            <span className="signage__shift">{shift}</span>
            <span className="signage__date">{dateText(lt)}</span>
            <time className="signage__time" dateTime={new Date(t).toISOString()}>
              {clockText(lt.hour)}
            </time>
            {ahead > 60_000 && <span className="signage__ahead">Halcyon runs {Math.round(ahead / 60_000)} min ahead of you</span>}
            {storm && <span className="signage__storm">Storm</span>}
          </>
        ) : (
          <span className="signage__date">Connecting&hellip;</span>
        )}
      </p>
      <div className="signage__keys" role="group" aria-label="The board">
        <button type="button" className="key key--hold" aria-pressed={held} onClick={() => client.togglePause()} disabled={!ready}>
          <span className="key__lever" aria-hidden="true" />
          <span className="key__label">{held ? "Board held. Resume" : "Hold the board"}</span>
        </button>
        <div className="speed" role="radiogroup" aria-label="Speed of the city">
          {[1, 8].map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={speed === v}
              className="key key--speed"
              onClick={() => client.setSpeed(v)}
              disabled={!ready}
              title={v === 1 ? "Real time" : "Eight times faster"}
            >
              {v === 1 ? "Real time" : "Hasten ×8"}
            </button>
          ))}
        </div>
        {debug && <span className="debug" data-debug />}
        {error && (
          <span className="signage__error" role="alert">
            The board has a fault. Reload the page to reconnect.
          </span>
        )}
      </div>
    </header>
  );
}
