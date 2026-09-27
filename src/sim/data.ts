/**
 * Halcyon's gazetteer: districts, streets, names, occupations, businesses.
 * All invented. Surnames are drawn broadly, as a harbour city's would be.
 */
import type { VenueKind, WorkKind } from "./types";

export interface DistrictDef {
  name: string;
  short: string;
  streets: string[];
}

export const DISTRICTS: DistrictDef[] = [
  { name: "The Wharf", short: "Wharf", streets: ["Quay Street", "Tarry Lane", "Brine Street"] },
  { name: "Pell Street", short: "Pell St.", streets: ["Pell Street", "Cooper's Row", "Mercy Street"] },
  { name: "Midtown", short: "Midtown", streets: ["Meridian Avenue", "Exchange Place", "Bank Street"] },
  { name: "Lantern Row", short: "Lantern", streets: ["Lantern Row", "Carmine Street", "Orchard Walk"] },
  { name: "Juniper Hill", short: "Juniper", streets: ["Juniper Row", "Hill Crescent", "Belvedere Road"] },
];

export const FEMALE = [
  "Ida", "Mabel", "Hazel", "Lorna", "Edith", "Opal", "Florence", "Winifred", "Ruth", "Irene",
  "Myrtle", "Agnes", "Dora", "Nell", "Pearl", "Viola", "Bess", "Thea", "Minnie", "Esther", "Lottie", "Elsie",
  "Rosa", "Greta", "Maud", "June", "Cora", "Lillian", "Iris", "Beatrice", "Hattie", "Lena", "Olive", "Clara",
  "Stella", "Fern", "Marguerite", "Sadie", "Vera", "Wilma", "Delia", "Josephine", "Alma", "Harriet", "Nora",
  "Constance", "Philippa", "Ottilie", "Rhoda", "Zelda", "Birdie", "Lucille", "Mae", "Faye", "Gertrude",
  "Dolores", "Imogen", "Tessa", "Letitia", "Yvonne", "Noreen", "Sylvia", "Ada", "Eunice", "Florrie", "Loretta",
];

export const MALE = [
  "Ambrose", "Otis", "Clement", "Horace", "Leland", "Virgil", "Rufus", "Emmett", "Silas", "Wendell", "Jasper",
  "Cyril", "Homer", "Floyd", "Chester", "Lyle", "Merritt", "Harlan", "Osgood", "Barnaby", "Felix", "Julius",
  "Ignatius", "Monty", "Dudley", "Percy", "Walter", "Gus", "Arno", "Rollo", "Tobias", "Lionel", "Elmer",
  "Hollis", "Carl", "Anton", "Stanislaus", "Mateo", "Luther", "Everett", "Basil", "Conrad", "Desmond",
  "Ellis", "Fitz", "Gideon", "Hector", "Irving", "Jules", "Kasimir", "Lucius", "Milo", "Nestor", "Orville",
  "Reuben", "Sterling", "Thaddeus", "Ulysses", "Vernon", "Warren", "Ezra", "Abner", "Cornelius", "Linus",
];

export const SURNAMES = [
  "Orr", "Pym", "Amsel", "Quill", "Marchbanks", "Gilly", "Tolliver", "Dimmock", "Ashby", "Crane", "Vesey",
  "Hollis", "Brandt", "Kettering", "Loomis", "Merriweather", "Oakes", "Paley", "Rook", "Sayer", "Voss",
  "Winslow", "Yarrow", "Bellamy", "Coade", "Drury", "Esterly", "Fairweather", "Grice", "Hartigan", "Ingle",
  "Jessop", "Kinsella", "Lark", "Mulvaney", "Nettles", "Pruett", "Quarles", "Rudd", "Stroud", "Thackery",
  "Upjohn", "Varga", "Whitlow", "Abernathy", "Birch", "Corliss", "Dunmore", "Everly", "Finch", "Galloway",
  "Halloran", "Ives", "Jarvis", "Kemp", "Lindqvist", "Marsh", "Novak", "Petrakis", "Rinaldi", "Byrne",
  "O'Hara", "Moretti", "Castellano", "Weiss", "Haddad", "Svoboda", "Janssen", "Delacroix", "Mendes",
  "Ferreira", "Kowalski", "Brody", "Calloway", "Devereux", "Eckhart", "Farrow", "Gorman", "Hale", "Imrie",
  "Jellicoe", "Keane", "Lutz", "Mallory", "Nash", "Ormsby", "Pardee", "Rafferty", "Sorensen", "Talbot",
  "Ustinov", "Vance", "Wren", "Yeats", "Zeller", "Ambler", "Blythe", "Cobb", "Dacre", "Emory", "Flint",
  "Gantry", "Hobbs", "Ivers", "Joss", "Kettle", "Lowell", "Munro", "Nolan", "Osei", "Prentice", "Quint",
  "Rhee", "Sully", "Tate", "Ulrich", "Vail", "Webb", "Aldous", "Bram", "Carrow", "Duffy",
];

export interface OccDef {
  title: string;
  kind: WorkKind | null;
  start: number;
  end: number; // may exceed 24
  days: number; // bitmask, bit 0 = Sunday
  wage: number; // dollars a week
  cls: 0 | 1 | 2;
  /** Probability the holder is a woman, as the period would have it. */
  f: number;
}

const WK = 62; // Mon-Fri
const WK6 = 126; // Mon-Sat
const ALL = 127;
const NIGHTS = 121; // Wed-Sun

export const OCC: Record<string, OccDef> = {
  harbourmaster: { title: "harbour master", kind: "harbour", start: 7, end: 17, days: WK6, wage: 70, cls: 1, f: 0 },
  harbourclerk: { title: "harbour clerk", kind: "harbour", start: 8, end: 17, days: WK6, wage: 28, cls: 1, f: 0.4 },
  customs: { title: "customs officer", kind: "customs", start: 7, end: 16, days: WK6, wage: 38, cls: 1, f: 0.1 },
  shipagent: { title: "shipping agent", kind: "shipping", start: 8, end: 17, days: WK6, wage: 45, cls: 1, f: 0.1 },
  stevedore: { title: "stevedore", kind: "shipping", start: 6, end: 16, days: WK6, wage: 27, cls: 0, f: 0 },
  sailor: { title: "ship's hand", kind: "shipping", start: 6, end: 14, days: ALL, wage: 22, cls: 0, f: 0 },
  fishmonger: { title: "fishmonger", kind: "fish", start: 4, end: 12, days: WK6, wage: 24, cls: 0, f: 0.3 },
  flourmerchant: { title: "flour merchant", kind: "flour", start: 5.5, end: 16, days: WK6, wage: 60, cls: 1, f: 0.2 },
  carter: { title: "carter", kind: "flour", start: 5, end: 14, days: WK6, wage: 22, cls: 0, f: 0 },
  keeper: { title: "lighthouse keeper", kind: "lighthouse", start: 18, end: 30, days: ALL, wage: 30, cls: 0, f: 0.2 },
  ferryman: { title: "ferry pilot", kind: "ferry", start: 6, end: 19, days: WK6, wage: 30, cls: 0, f: 0 },
  baker: { title: "baker", kind: "bakery", start: 3.5, end: 12, days: WK6, wage: 30, cls: 0, f: 0.3 },
  countergirl: { title: "shop assistant", kind: "bakery", start: 7, end: 15, days: WK6, wage: 14, cls: 0, f: 0.9 },
  laundress: { title: "laundress", kind: "laundry", start: 7, end: 18, days: WK6, wage: 15, cls: 0, f: 0.85 },
  pawnbroker: { title: "pawnbroker", kind: "pawn", start: 9, end: 19, days: WK6, wage: 45, cls: 1, f: 0.2 },
  fireman: { title: "fireman", kind: "fire", start: 8, end: 32, days: ALL, wage: 35, cls: 0, f: 0 },
  druggist: { title: "druggist", kind: "drugstore", start: 8, end: 21, days: WK6, wage: 45, cls: 1, f: 0.2 },
  sodajerk: { title: "soda clerk", kind: "drugstore", start: 11, end: 21, days: WK6, wage: 14, cls: 0, f: 0.4 },
  grocer: { title: "grocer", kind: "grocery", start: 7, end: 19, days: WK6, wage: 35, cls: 1, f: 0.3 },
  insuranceagent: { title: "insurance agent", kind: "insurance", start: 9, end: 17.5, days: WK, wage: 42, cls: 1, f: 0.1 },
  clerk: { title: "clerk", kind: "insurance", start: 9, end: 17, days: WK, wage: 28, cls: 1, f: 0.35 },
  typist: { title: "typist", kind: "insurance", start: 9, end: 17, days: WK, wage: 20, cls: 1, f: 0.9 },
  bankmanager: { title: "bank manager", kind: "bank", start: 9, end: 17, days: WK, wage: 110, cls: 2, f: 0 },
  teller: { title: "bank teller", kind: "bank", start: 9, end: 16, days: WK6, wage: 30, cls: 1, f: 0.3 },
  editor: { title: "editor", kind: "paper", start: 10, end: 20, days: WK6, wage: 75, cls: 2, f: 0.2 },
  reporter: { title: "reporter", kind: "paper", start: 11, end: 21, days: WK6, wage: 40, cls: 1, f: 0.35 },
  compositor: { title: "compositor", kind: "paper", start: 12, end: 20, days: WK6, wage: 36, cls: 0, f: 0.1 },
  mayor: { title: "mayor", kind: "cityhall", start: 9, end: 18, days: WK, wage: 120, cls: 2, f: 0.1 },
  alderman: { title: "alderman", kind: "cityhall", start: 10, end: 16, days: WK, wage: 60, cls: 2, f: 0.15 },
  secretary: { title: "secretary", kind: "cityhall", start: 9, end: 17, days: WK, wage: 24, cls: 1, f: 0.85 },
  shopclerk: { title: "shop clerk", kind: "store", start: 9, end: 18, days: WK6, wage: 18, cls: 0, f: 0.7 },
  floorwalker: { title: "floorwalker", kind: "store", start: 9, end: 18, days: WK6, wage: 32, cls: 1, f: 0.2 },
  deskclerk: { title: "night clerk", kind: "hotel", start: 20, end: 32, days: ALL, wage: 22, cls: 0, f: 0.3 },
  bellhop: { title: "bellhop", kind: "hotel", start: 14, end: 23, days: ALL, wage: 15, cls: 0, f: 0.1 },
  hotelmanager: { title: "hotel manager", kind: "hotel", start: 9, end: 19, days: WK6, wage: 70, cls: 2, f: 0.2 },
  lawyer: { title: "attorney", kind: "law", start: 9, end: 18, days: WK, wage: 90, cls: 2, f: 0.1 },
  stenographer: { title: "stenographer", kind: "law", start: 9, end: 17, days: WK, wage: 24, cls: 1, f: 0.9 },
  operator: { title: "telephone operator", kind: "exchange", start: 22, end: 30, days: ALL, wage: 20, cls: 1, f: 0.95 },
  supervisor: { title: "night supervisor", kind: "exchange", start: 21, end: 29, days: ALL, wage: 34, cls: 1, f: 1 },
  clubowner: { title: "club proprietor", kind: "club", start: 18, end: 27, days: NIGHTS, wage: 80, cls: 1, f: 0.3 },
  bandleader: { title: "bandleader", kind: "club", start: 20, end: 27, days: NIGHTS, wage: 48, cls: 1, f: 0.2 },
  musician: { title: "musician", kind: "club", start: 20, end: 27, days: NIGHTS, wage: 35, cls: 0, f: 0.25 },
  hatcheck: { title: "hat-check attendant", kind: "club", start: 20, end: 26, days: NIGHTS, wage: 16, cls: 0, f: 0.8 },
  waiter: { title: "waiter", kind: "club", start: 19, end: 27, days: NIGHTS, wage: 18, cls: 0, f: 0.4 },
  dancehost: { title: "dance instructor", kind: "dancehall", start: 16, end: 24, days: WK6, wage: 26, cls: 0, f: 0.6 },
  hallowner: { title: "dance-hall proprietor", kind: "dancehall", start: 14, end: 25, days: WK6, wage: 60, cls: 1, f: 0.3 },
  projectionist: { title: "projectionist", kind: "pictures", start: 13, end: 24, days: ALL, wage: 30, cls: 0, f: 0.1 },
  usher: { title: "usherette", kind: "pictures", start: 14, end: 23.5, days: ALL, wage: 13, cls: 0, f: 0.85 },
  cinemamanager: { title: "picture-house manager", kind: "pictures", start: 12, end: 23, days: ALL, wage: 50, cls: 1, f: 0.2 },
  cook: { title: "cook", kind: "automat", start: 5, end: 14, days: WK6, wage: 22, cls: 0, f: 0.5 },
  counterhand: { title: "counter hand", kind: "automat", start: 10, end: 20, days: ALL, wage: 16, cls: 0, f: 0.5 },
  milliner: { title: "milliner", kind: "milliner", start: 9, end: 18, days: WK6, wage: 38, cls: 1, f: 0.95 },
  apprentice: { title: "milliner's apprentice", kind: "milliner", start: 9, end: 18, days: WK6, wage: 11, cls: 0, f: 0.9 },
  florist: { title: "florist", kind: "florist", start: 6, end: 17, days: WK6, wage: 34, cls: 1, f: 0.6 },
  cafeowner: { title: "café proprietor", kind: "cafe", start: 6, end: 22, days: ALL, wage: 40, cls: 1, f: 0.3 },
  cabbie: { title: "cab driver", kind: "taxi", start: 17, end: 29, days: WK6, wage: 28, cls: 0, f: 0.05 },
  bookseller: { title: "bookseller", kind: "books", start: 10, end: 19, days: WK6, wage: 30, cls: 1, f: 0.5 },
  doctor: { title: "doctor", kind: "infirmary", start: 8, end: 18, days: WK6, wage: 120, cls: 2, f: 0.15 },
  nurse: { title: "nurse", kind: "infirmary", start: 19, end: 31, days: ALL, wage: 24, cls: 1, f: 0.95 },
  daynurse: { title: "nurse", kind: "infirmary", start: 7, end: 19, days: WK6, wage: 24, cls: 1, f: 0.95 },
  matron: { title: "matron", kind: "infirmary", start: 7, end: 19, days: WK6, wage: 40, cls: 1, f: 1 },
  reverend: { title: "minister", kind: "church", start: 9, end: 17, days: ALL, wage: 30, cls: 1, f: 0 },
  sexton: { title: "sexton", kind: "church", start: 7, end: 15, days: ALL, wage: 16, cls: 0, f: 0 },
  teacher: { title: "schoolteacher", kind: "school", start: 8, end: 15.5, days: WK, wage: 32, cls: 1, f: 0.75 },
  housekeeper: { title: "housekeeper", kind: "service", start: 6, end: 20, days: WK6, wage: 14, cls: 0, f: 0.9 },
  chauffeur: { title: "chauffeur", kind: "service", start: 8, end: 20, days: WK6, wage: 22, cls: 0, f: 0 },
};

export interface WorkDef {
  name: string;
  kind: WorkKind;
  district: number;
  street: number;
  /** Owner occupation first, then staff. */
  roles: string[];
  revenue: number;
  trade?: string[];
  venue?: { name: string; kind: VenueKind; pay?: boolean };
  /** Starts the story short of money. */
  struggling?: boolean;
  special?: string;
}

export const WORKPLACES: WorkDef[] = [
  // The Wharf
  { name: "Harbour Master's Office", kind: "harbour", district: 0, street: 0, roles: ["harbourmaster", "harbourclerk", "harbourclerk"], revenue: 90, trade: ["Gantry & Sons, Shipping", "Customs House"] },
  { name: "Customs House", kind: "customs", district: 0, street: 0, roles: ["customs", "customs", "customs", "harbourclerk"], revenue: 110 },
  { name: "Gantry & Sons, Shipping", kind: "shipping", district: 0, street: 1, roles: ["shipagent", "shipagent", "clerk", "stevedore", "stevedore", "stevedore", "stevedore", "stevedore", "stevedore", "sailor", "sailor", "sailor"], revenue: 260, trade: ["Ambler's Department Store", "Marchbanks Florist", "Pardee Flour & Grain"] },
  { name: "Brine Street Fish Market", kind: "fish", district: 0, street: 2, roles: ["fishmonger", "fishmonger", "fishmonger"], revenue: 70, trade: ["Loomis Automat", "Hotel Meridian"] },
  { name: "Pardee Flour & Grain", kind: "flour", district: 0, street: 1, roles: ["flourmerchant", "clerk", "carter", "carter"], revenue: 120, trade: ["Kettle's Bakery", "Loomis Automat", "Café Petrakis"] },
  { name: "Halcyon Light", kind: "lighthouse", district: 0, street: 0, roles: ["keeper"], revenue: 20 },
  { name: "Harbour Ferry", kind: "ferry", district: 0, street: 0, roles: ["ferryman", "ferryman"], revenue: 45 },
  // Pell Street
  { name: "Kettle's Bakery", kind: "bakery", district: 1, street: 0, roles: ["baker", "baker", "countergirl"], revenue: 60, trade: ["Pardee Flour & Grain", "Loomis Automat", "Hotel Meridian"] },
  { name: "Pell Street Laundry", kind: "laundry", district: 1, street: 2, roles: ["laundress", "laundress", "laundress", "laundress"], revenue: 55, trade: ["Hotel Meridian", "St. Brigid's Infirmary"] },
  { name: "Novak's Loan Office", kind: "pawn", district: 1, street: 1, roles: ["pawnbroker"], revenue: 40 },
  { name: "Mercy Street Fire Station", kind: "fire", district: 1, street: 2, roles: ["fireman", "fireman", "fireman", "fireman", "fireman"], revenue: 80, special: "FIRE" },
  { name: "Crane's Drugstore", kind: "drugstore", district: 1, street: 0, roles: ["druggist", "sodajerk"], revenue: 50, trade: ["St. Brigid's Infirmary"], venue: { name: "Crane's soda fountain", kind: "cafe", pay: true } },
  { name: "Rudd's Grocery", kind: "grocery", district: 1, street: 1, roles: ["grocer", "shopclerk"], revenue: 55, trade: ["Brine Street Fish Market", "Pardee Flour & Grain"] },
  // Midtown
  { name: "Halcyon Mutual Insurance", kind: "insurance", district: 2, street: 0, roles: ["insuranceagent", "insuranceagent", "insuranceagent", "clerk", "clerk", "clerk", "typist", "typist", "typist"], revenue: 240, trade: ["Harbour Savings Bank", "Voss & Quill, Attorneys"] },
  { name: "Harbour Savings Bank", kind: "bank", district: 2, street: 2, roles: ["bankmanager", "teller", "teller", "teller", "clerk", "clerk"], revenue: 300, trade: ["Halcyon Mutual Insurance", "City Hall"] },
  { name: "The Halcyon Evening Star", kind: "paper", district: 2, street: 1, roles: ["editor", "reporter", "reporter", "reporter", "compositor", "compositor", "typist"], revenue: 160, trade: ["City Hall", "Ambler's Department Store"] },
  { name: "City Hall", kind: "cityhall", district: 2, street: 1, roles: ["mayor", "alderman", "alderman", "secretary", "secretary"], revenue: 200, trade: ["The Halcyon Evening Star"] },
  { name: "Ambler's Department Store", kind: "store", district: 2, street: 0, roles: ["floorwalker", "shopclerk", "shopclerk", "shopclerk", "shopclerk", "shopclerk"], revenue: 280, trade: ["Gantry & Sons, Shipping", "Velda's Millinery"] },
  { name: "Hotel Meridian", kind: "hotel", district: 2, street: 0, roles: ["hotelmanager", "deskclerk", "deskclerk", "bellhop", "bellhop", "housekeeper"], revenue: 220, trade: ["Pell Street Laundry", "Kettle's Bakery", "Brine Street Fish Market"] },
  { name: "Voss & Quill, Attorneys", kind: "law", district: 2, street: 2, roles: ["lawyer", "lawyer", "stenographer"], revenue: 180, trade: ["Halcyon Mutual Insurance"] },
  { name: "The Exchange", kind: "exchange", district: 2, street: 1, roles: ["supervisor", "operator", "operator", "operator"], revenue: 150 },
  // Lantern Row
  { name: "The Blue Heron", kind: "club", district: 3, street: 0, roles: ["clubowner", "bandleader", "musician", "musician", "musician", "hatcheck", "waiter", "waiter"], revenue: 150, trade: ["Pardee Flour & Grain", "Marchbanks Florist"], venue: { name: "The Blue Heron", kind: "club" } },
  { name: "The Palais de Danse", kind: "dancehall", district: 3, street: 1, roles: ["hallowner", "dancehost", "dancehost", "musician", "musician"], revenue: 110, venue: { name: "the Palais", kind: "dance" }, struggling: true },
  { name: "The Orpheum", kind: "pictures", district: 3, street: 0, roles: ["cinemamanager", "projectionist", "usher", "usher"], revenue: 95, venue: { name: "the Orpheum", kind: "pictures" } },
  { name: "Loomis Automat", kind: "automat", district: 3, street: 2, roles: ["cook", "cook", "counterhand", "counterhand"], revenue: 85, trade: ["Kettle's Bakery", "Brine Street Fish Market"], venue: { name: "the Automat", kind: "automat", pay: true } },
  { name: "Velda's Millinery", kind: "milliner", district: 4, street: 0, roles: ["milliner", "apprentice"], revenue: 45, trade: ["Ambler's Department Store"] },
  { name: "Marchbanks Florist", kind: "florist", district: 3, street: 1, roles: ["florist", "shopclerk"], revenue: 40, trade: ["Gantry & Sons, Shipping", "Church of St. Jude"] },
  { name: "Café Petrakis", kind: "cafe", district: 3, street: 1, roles: ["cafeowner", "waiter"], revenue: 38, trade: ["Pardee Flour & Grain"], venue: { name: "Café Petrakis", kind: "cafe" }, struggling: true },
  { name: "Lantern Cab Company", kind: "taxi", district: 3, street: 2, roles: ["cabbie", "cabbie", "cabbie", "cabbie"], revenue: 70 },
  { name: "Dimmock's Books", kind: "books", district: 3, street: 2, roles: ["bookseller"], revenue: 25 },
  // Juniper Hill
  { name: "St. Brigid's Infirmary", kind: "infirmary", district: 4, street: 2, roles: ["doctor", "doctor", "matron", "nurse", "nurse", "daynurse", "daynurse"], revenue: 200, trade: ["Crane's Drugstore", "Pell Street Laundry"], special: "DOCTOR" },
  { name: "Church of St. Jude", kind: "church", district: 4, street: 1, roles: ["reverend", "sexton"], revenue: 30, trade: ["Marchbanks Florist"], venue: { name: "St. Jude's", kind: "church" } },
  { name: "Juniper Hill School", kind: "school", district: 4, street: 1, roles: ["teacher", "teacher", "teacher"], revenue: 60 },
];

/** Venues without a workplace behind them. */
export const OPEN_VENUES: { name: string; kind: VenueKind; district: number }[] = [
  { name: "the pier", kind: "pier", district: 0 },
  { name: "Belvedere Gardens", kind: "park", district: 4 },
];

export const CARS = ["the Packard", "the Hupmobile", "the little Ford", "the Studebaker", "the delivery van", "the Pierce-Arrow"];
export const LESSONS = ["dancing lessons at the Palais", "singing lessons", "French lessons", "flying lessons at the aerodrome", "swimming lessons", "saxophone lessons"];
export const PAWNED = ["her mother's brooch", "his watch", "the good silver", "his overcoat", "the gramophone", "a ring"];
export const NOVEL_ABOUT = ["the harbour", "Pell Street", "the whole city", "everyone on the Row", "a lighthouse keeper", "the Exchange"];
export const RECIPES = ["the Automat's pie", "Kettle's rye", "the Blue Heron's punch", "Mrs. Rudd's chowder"];
