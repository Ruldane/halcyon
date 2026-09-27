"use client";

import { createContext, useContext } from "react";
import type { ExchangeClient } from "../client/bridge";
import type { Engine } from "../client/engine";
import { useStore, type UIState } from "../client/store";
import { placeFrom, type Place } from "../sim/clock";

export interface Exchange {
  client: ExchangeClient;
  engine: Engine;
}

export const ExchangeContext = createContext<Exchange | null>(null);

export function useExchange(): Exchange {
  const x = useContext(ExchangeContext);
  if (!x) throw new Error("The exchange is not connected.");
  return x;
}

export function useUI<T>(pick: (s: UIState) => T): T {
  const { client } = useExchange();
  return useStore(client.store, pick);
}

/** The visitor's place (time zone, hemisphere), fixed at the start of the visit. */
export function usePlace(): Place {
  const tz = useUI((s) => s.timeZone);
  const off = useUI((s) => s.offsetMinutes);
  return placeFrom(tz, off);
}
