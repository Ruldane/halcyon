/**
 * Halcyon keeps the visitor's clock. Simulation time is real epoch
 * milliseconds; the local wall clock comes from the visitor's UTC offset, and
 * the season from their hemisphere (inferred from the time zone name).
 */

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export type Season = "winter" | "spring" | "summer" | "autumn";

export interface Place {
  offsetMinutes: number;
  south: boolean;
  timeZone: string;
}

const SOUTHERN = [
  /^Australia\//,
  /^Antarctica\//,
  /^Pacific\/(Auckland|Chatham|Fiji|Tongatapu|Apia|Noumea|Efate|Norfolk)/,
  /^America\/(Argentina|Sao_Paulo|Santiago|Montevideo|Asuncion|La_Paz|Lima|Bahia|Recife|Fortaleza|Maceio|Belem|Cuiaba|Campo_Grande|Porto_Velho|Punta_Arenas|Buenos_Aires|Cordoba|Mendoza)/,
  /^Africa\/(Johannesburg|Maputo|Harare|Lusaka|Windhoek|Gaborone|Maseru|Mbabane|Blantyre|Lubumbashi|Luanda)/,
  /^Indian\/(Mauritius|Reunion|Antananarivo|Mayotte)/,
  /^Atlantic\/(St_Helena|Stanley)/,
  /^Etc\/GMT\+/,
];

export function placeFrom(timeZone: string, offsetMinutes: number): Place {
  const tz = timeZone || "UTC";
  const south = SOUTHERN.some((r) => r.test(tz)) && !/^Etc\//.test(tz);
  return { offsetMinutes, south, timeZone: tz };
}

export interface LocalTime {
  /** Days since the epoch in local time. */
  dayIndex: number;
  /** Hours since local midnight, fractional. */
  hour: number;
  /** 0 = Sunday. */
  dow: number;
  month: number;
  date: number;
  year: number;
  dayOfYear: number;
}

export function local(t: number, place: Place): LocalTime {
  const lt = t + place.offsetMinutes * MINUTE;
  const d = new Date(lt);
  const dayIndex = Math.floor(lt / DAY);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return {
    dayIndex,
    hour: (lt - dayIndex * DAY) / HOUR,
    dow: d.getUTCDay(),
    month: d.getUTCMonth(),
    date: d.getUTCDate(),
    year: d.getUTCFullYear(),
    dayOfYear: Math.floor((lt - start) / DAY),
  };
}

export function seasonOf(month: number, south: boolean): Season {
  const m = south ? (month + 6) % 12 : month;
  if (m === 11 || m <= 1) return "winter";
  if (m <= 4) return "spring";
  if (m <= 7) return "summer";
  return "autumn";
}

/** Day length in hours at Halcyon's latitude (about 42 degrees). */
export function dayLength(dayOfYear: number, south: boolean): number {
  const phase = (2 * Math.PI * (dayOfYear - 80)) / 365;
  const s = Math.sin(phase) * (south ? -1 : 1);
  return 12 + 3.1 * s;
}

export function sunTimes(lt: LocalTime, south: boolean): { rise: number; set: number } {
  const dl = dayLength(lt.dayOfYear, south);
  const noon = 12.4;
  return { rise: noon - dl / 2, set: noon + dl / 2 };
}

/** 0 at night, 1 in full day, eased through twilight. */
export function daylight(lt: LocalTime, south: boolean): number {
  const { rise, set } = sunTimes(lt, south);
  const h = lt.hour;
  const edge = (x: number) => Math.min(1, Math.max(0, x));
  const up = edge((h - (rise - 0.6)) / 1.2);
  const down = edge(((set + 0.6) - h) / 1.2);
  const v = Math.min(up, down);
  return v * v * (3 - 2 * v);
}

export function isNewYearsEve(lt: LocalTime): boolean {
  return (lt.month === 11 && lt.date === 31 && lt.hour >= 22) || (lt.month === 0 && lt.date === 1 && lt.hour < 1.5);
}

/** Minutes from local midnight on the 1st of January, when inside the NYE window; negative before. */
export function minutesToNewYear(lt: LocalTime): number | null {
  if (lt.month === 11 && lt.date === 31 && lt.hour >= 22) return (lt.hour - 24) * 60;
  if (lt.month === 0 && lt.date === 1 && lt.hour < 1.5) return lt.hour * 60;
  return null;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const dayName = (dow: number) => DAYS[dow];
export const monthName = (m: number) => MONTHS[m];

/** "11.42 p.m.", the exchange's style. */
export function clockText(hour: number): string {
  const h24 = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  if (h24 === 0 && m === 0) return "midnight";
  if (h24 === 12 && m === 0) return "noon";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}.${String(m).padStart(2, "0")} ${h24 < 12 ? "a.m." : "p.m."}`;
}

export function dateText(lt: LocalTime): string {
  return `${DAYS[lt.dow]} ${lt.date} ${MONTHS[lt.month]}`;
}

/** "3 hours", "2 days", "40 minutes": for the log. */
export function spanText(ms: number): string {
  const m = Math.round(ms / MINUTE);
  if (m < 2) return "a minute";
  if (m < 60) return `${m} minutes`;
  const h = Math.round(ms / HOUR);
  if (h < 2) return "an hour";
  if (h < 36) return `${h} hours`;
  const d = Math.round(ms / DAY);
  return d < 2 ? "a day" : `${d} days`;
}
