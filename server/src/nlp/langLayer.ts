/**
 * Language detection and normalization layer.
 *
 * The brief is explicit: this is a North India / Delhi CM portal, so
 * Hindi support is not optional. Citizens filing grievances will write
 * in Devanagari Hindi, Romanised Hindi ("Hinglish" — by far the most
 * common typing pattern on Indian keyboards), or English, often mixed
 * in the same sentence. This module normalizes all three into an
 * English token stream the classifier was trained on, and reports
 * which language was detected so officers/CM can see the original
 * language alongside the translation.
 *
 * No external translation API is used (no cost, no network dependency,
 * no data leaving the server) — this is a self-contained dictionary +
 * transliteration approach tuned specifically for Delhi civic
 * vocabulary (water, roads, power, police, schools, hospitals, etc.)
 */

export type DetectedScript =
  | "devanagari"
  | "latin"
  | "mixed";

export type DetectedLanguage =
  | "Hindi"
  | "Hinglish"
  | "English";

function inRange(code: number, lo: number, hi: number): boolean {
  return code >= lo && code <= hi;
}

export function detectScript(text: string): DetectedScript {
  let devanagari = 0;
  let latin = 0;

  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (inRange(code, 0x0900, 0x097f)) devanagari++;
    else if (/[a-zA-Z]/.test(ch)) latin++;
  }

  const total = devanagari + latin;
  if (total === 0) return "latin";
  if (devanagari / total >= 0.5) return "devanagari";
  if (latin / total >= 0.85) return "latin";
  return "mixed";
}

// ---------------------------------------------------------------------------
// Devanagari character-level transliteration table
// ---------------------------------------------------------------------------

const DEVA_MAP: Record<string, string> = {
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo",
  "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऋ": "ri",
  "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo",
  "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ृ": "ri",
  "ं": "n", "ः": "h", "ँ": "n", "़": "",
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
  "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
  "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh",
  "ष": "sh", "स": "s", "ह": "h", "ळ": "l",
  "क़": "q", "ख़": "kh", "ग़": "gh", "ज़": "z", "ड़": "r",
  "ढ़": "rh", "फ़": "f",
  "्": "", "।": ".", "॥": ".", "ॐ": "om",
  "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
  "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
};

function transliterateDevanagari(text: string): string {
  let out = "";
  for (const ch of text) {
    out += DEVA_MAP[ch] ?? ch;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Civic keyword dictionary — Hindi/Hinglish/transliterated-Devanagari forms
// → English terms the TF-IDF classifier was trained on.
// ---------------------------------------------------------------------------

export const HINDI_CIVIC_KEYWORDS: Record<string, string> = {
  // Water — covers Hinglish typing AND post-transliteration Devanagari forms
  "paani": "water", "pani": "water", "paanee": "water", "paanii": "water",
  "jal": "water", "nali": "drain", "naalee": "drain", "naali": "drain",
  "naala": "drainage", "nala": "drainage", "nalka": "tap", "kuan": "well",
  "boring": "borewell", "tanker": "tanker", "sewage": "sewage",
  "ganda": "dirty", "gande": "dirty", "pipa": "pipeline", "pipe": "pipe",
  "leakage": "leaking", "sukhaa": "dry", "band": "blocked", "bharaa": "flooded",
  "tooti": "tap broken", "nal": "tap",

  // Roads
  "sadak": "road", "srk": "road", "rasta": "road", "gadhaa": "pothole",
  "gaddha": "pothole", "khaddaa": "pothole", "pul": "bridge",
  "footpath": "footpath", "patri": "footpath", "traffic": "traffic",
  "khambha": "pole", "streetlight": "streetlight", "toot": "broken",
  "tutaa": "broken", "tuta": "broken",

  // Power
  "bijli": "electricity", "bijlee": "electricity", "current": "electricity",
  "light": "electricity", "transformer": "transformer",
  "traansphaarmr": "transformer", "kharaab": "broken", "khraab": "broken",
  "blackout": "power cut", "power": "electricity",
  "meter": "meter", "bill": "bill", "voltage": "voltage", "katauti": "power cut",

  // Public safety
  "police": "police", "chor": "theft", "choraa": "theft", "chori": "theft",
  "dacoiti": "robbery", "loot": "robbery", "maar": "assault", "pitaai": "assault",
  "chheri": "harassment", "chedkhani": "harassment", "darr": "fear",
  "khatra": "danger", "fir": "fir", "thana": "police station",
  "ladki": "woman", "chain": "chain snatching",

  // Health
  "hospital": "hospital", "doctor": "doctor", "dawai": "medicine",
  "ambulance": "ambulance", "clinic": "clinic", "dawakhana": "dispensary",
  "bukhar": "fever", "bimaar": "sick", "beemari": "disease",
  "dengue": "dengue", "malaria": "malaria", "fogging": "fogging",
  "aarogya": "health", "mareez": "patient",

  // Education
  "school": "school", "teacher": "teacher", "master": "teacher",
  "fees": "fees", "khana": "food", "midday": "midday meal",
  "chhutti": "absent", "building": "building", "toilet": "toilet",
  "padhai": "studies", "bachche": "children",

  // Sanitation
  "kachara": "garbage", "kchraa": "garbage", "kchara": "garbage",
  "kachraa": "garbage", "kuda": "garbage", "safai": "cleaning",
  "gandagi": "filth", "jhadu": "sweeping", "ganda paani": "dirty water",

  // Transport
  "bus": "bus", "auto": "auto", "metro": "metro", "route": "route",
  "dtc": "bus", "driver": "driver", "kiraya": "fare", "rickshaw": "auto",

  // Animals
  "kutta": "stray dog", "kutte": "stray dogs", "gaay": "cow",
  "bandar": "monkey", "saand": "bull",

  // Urgency / emergency
  "maut": "death", "mara": "died", "mar gaya": "died",
  "aag": "fire", "barood": "explosion", "bachao": "help emergency",
  "khoon": "bleeding", "durghatna": "accident", "takkar": "accident",
  "baadhh": "flood", "baadh": "flood", "giraa": "collapsed",
  "girne": "collapse", "dhasak": "collapse", "tatkal": "urgent",
  "jaldi": "urgent", "khatarnaak": "dangerous", "jaan": "life",

  // Filler / grammar words — neutralised so they don't dilute the signal
  "nheen": "not", "nhiin": "not", "nahi": "not", "nahin": "not",
  "ghnte": "hours", "ghante": "hours", "din": "days", "se": "",
  "hai": "", "ho": "", "raha": "", "rahi": "", "gaya": "", "gayi": "",
  "mein": "in", "ke": "", "ki": "", "ka": "", "hain": "",
  "bahut": "very", "bhut": "very", "kab": "when", "kyun": "why",
  "humara": "our", "hamare": "our", "mera": "my", "humne": "we",
};

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface NormalizationResult {
  normalizedText: string;
  detectedLanguage: DetectedLanguage;
  script: DetectedScript;
}

function isLikelyHinglish(text: string): boolean {
  const hinglishMarkers = new Set(Object.keys(HINDI_CIVIC_KEYWORDS));
  const words = text.toLowerCase().split(/\s+/);
  if (words.length === 0) return false;
  const matches = words.filter((w) =>
    hinglishMarkers.has(w.replace(/[^a-z]/g, ""))
  ).length;
  return matches / words.length >= 0.12;
}

function applyKeywordMap(text: string, map: Record<string, string>): string {
  return text
    .toLowerCase()
    .split(/(\s+)/)
    .map((tok) => {
      const clean = tok.replace(/[^a-z]/g, "");
      return clean in map ? map[clean] : tok;
    })
    .join("");
}

export function normalizeToEnglish(rawText: string): NormalizationResult {
  const script = detectScript(rawText);
  let working = rawText;
  let detectedLanguage: DetectedLanguage;

  if (script === "devanagari" || script === "mixed") {
    working = transliterateDevanagari(working);
    detectedLanguage = "Hindi";
  } else {
    detectedLanguage = isLikelyHinglish(rawText) ? "Hinglish" : "English";
  }

  working = applyKeywordMap(working, HINDI_CIVIC_KEYWORDS);

  return {
    normalizedText: working.trim().replace(/\s+/g, " "),
    detectedLanguage,
    script,
  };
}
