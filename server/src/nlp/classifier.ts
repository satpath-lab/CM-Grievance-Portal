/**
 * Auto-categorization & severity classification engine.
 *
 * TF-IDF weighted Multinomial Naive Bayes, pure TypeScript, zero
 * external ML dependencies, zero API cost, runs in-process. This is
 * the "Auto segregation algorithm" required by the brief, and it is
 * language-aware: text is first normalized through langLayer.ts so
 * Hindi and Hinglish input classify exactly as well as English.
 *
 * Severity escalation: a critical-keyword scan runs independently of
 * the category model and can promote (never demote) a complaint's
 * priority — e.g. "building collapse" always escalates to Critical
 * regardless of which category it lands in, addressing the brief's
 * "critical life-threatening complaint alerts" requirement.
 */

import { TRAINING_DATA, Category, BasePriority } from "./trainingData";
import { normalizeToEnglish } from "./langLayer";

const STOPWORDS = new Set([
  "the","a","an","is","in","on","at","to","for","of","and","or","but",
  "not","no","with","by","from","this","that","are","was","were","has",
  "have","had","been","be","it","its","i","my","our","your","their",
  "we","they","he","she","as","so","do","did","does","will","would",
  "can","could","should","may","might","am","us","me","him","her",
  "also","very","just","even","then","now","still","only","more","some",
  "here","there","who","what","which","when","how","into",
]);

function tokenize(text: string): string[] {
  const cleaned = text.toLowerCase().replace(/[^a-z\s]/g, " ");
  return cleaned.split(/\s+/).filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function termFrequency(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  const n = tokens.length || 1;
  const tf = new Map<string, number>();
  for (const [tok, count] of counts) tf.set(tok, count / n);
  return tf;
}

class TfIdfNaiveBayes {
  private classTermWeights = new Map<Category, Map<string, number>>();
  private classTotals = new Map<Category, number>();
  private classDocCounts = new Map<Category, number>();
  private idf = new Map<string, number>();
  private vocab = new Set<string>();
  private totalDocs = 0;
  private classes = new Set<Category>();

  fit(rows: Array<[string, Category, BasePriority]>): void {
    this.totalDocs = rows.length;
    const tokenizedRows = rows.map(
      ([text, cat]) => [tokenize(text), cat] as [string[], Category]
    );

    const docFreq = new Map<string, number>();
    for (const [tokens] of tokenizedRows) {
      for (const tok of new Set(tokens)) {
        docFreq.set(tok, (docFreq.get(tok) ?? 0) + 1);
      }
    }
    for (const [tok, df] of docFreq) {
      this.idf.set(tok, Math.log((this.totalDocs + 1) / (df + 1)) + 1);
      this.vocab.add(tok);
    }

    for (const [tokens, cat] of tokenizedRows) {
      this.classes.add(cat);
      this.classDocCounts.set(cat, (this.classDocCounts.get(cat) ?? 0) + 1);
      const tf = termFrequency(tokens);
      if (!this.classTermWeights.has(cat)) {
        this.classTermWeights.set(cat, new Map());
      }
      const weights = this.classTermWeights.get(cat)!;
      for (const [tok, freq] of tf) {
        const w = freq * (this.idf.get(tok) ?? 1);
        weights.set(tok, (weights.get(tok) ?? 0) + w);
        this.classTotals.set(cat, (this.classTotals.get(cat) ?? 0) + w);
      }
    }
  }

  predictProba(text: string): Map<Category, number> {
    const tokens = tokenize(text);
    if (tokens.length === 0) {
      const uniform = new Map<Category, number>();
      for (const c of this.classes) uniform.set(c, 1 / this.classes.size);
      return uniform;
    }

    const tf = termFrequency(tokens);
    const logScores = new Map<Category, number>();
    const vocabSize = this.vocab.size;

    for (const cls of this.classes) {
      let logProb = Math.log(
        (this.classDocCounts.get(cls) ?? 0) / this.totalDocs
      );
      const total = this.classTotals.get(cls) ?? 0;
      const weights = this.classTermWeights.get(cls) ?? new Map();

      for (const [tok, freq] of tf) {
        const tfidfW = freq * (this.idf.get(tok) ?? 1);
        const stored = weights.get(tok) ?? 0;
        logProb += Math.log((stored + tfidfW) / (total + vocabSize));
      }
      logScores.set(cls, logProb);
    }

    const maxScore = Math.max(...logScores.values());
    const expScores = new Map<Category, number>();
    let sumExp = 0;
    for (const [cls, score] of logScores) {
      const e = Math.exp(score - maxScore);
      expScores.set(cls, e);
      sumExp += e;
    }

    const proba = new Map<Category, number>();
    for (const [cls, e] of expScores) proba.set(cls, e / sumExp);
    return proba;
  }
}

const model = new TfIdfNaiveBayes();
model.fit(TRAINING_DATA);

// ---------------------------------------------------------------------------
// Department routing table (mirrors DEPT_CODES used by the Open311 adapter)
// ---------------------------------------------------------------------------

export interface DeptInfo {
  name: string;
  code: string;
  slaHours: number; // baseline SLA for Normal-priority complaints in this category
}

export const DEPARTMENTS: Record<Category, DeptInfo> = {
  "Water & Sanitation": { name: "Delhi Jal Board", code: "DJB", slaHours: 24 },
  "Roads & Infrastructure": { name: "Public Works Department", code: "PWD", slaHours: 48 },
  "Power & Electricity": { name: "BSES / TPDDL", code: "BSES", slaHours: 12 },
  "Public Safety": { name: "Delhi Police", code: "DLP", slaHours: 2 },
  "Education": { name: "Directorate of Education", code: "DOE", slaHours: 72 },
  "Health Services": { name: "Health & Family Welfare Dept.", code: "HFW", slaHours: 48 },
  "Sanitation & Waste": { name: "MCD Sanitation Wing", code: "MCD", slaHours: 24 },
  "Transport": { name: "DIMTS / DTC", code: "DTC", slaHours: 48 },
  "Stray Animals": { name: "MCD Veterinary Wing", code: "MCDV", slaHours: 24 },
  "Encroachment & Illegal Construction": { name: "MCD Enforcement Wing", code: "MCDE", slaHours: 72 },
  "Other": { name: "District Administration", code: "DA", slaHours: 72 },
};

// ---------------------------------------------------------------------------
// Urgency / life-threatening escalation signals
// ---------------------------------------------------------------------------

const URGENCY_SIGNALS: Array<[string, BasePriority]> = [
  // Life-threatening — always escalate to Critical
  ["died", "Critical"], ["death", "Critical"], ["dead body", "Critical"],
  ["fire", "Critical"], ["explosion", "Critical"], ["gas leak", "Critical"],
  ["collapsed", "Critical"], ["collapse", "Critical"], ["sinkhole", "Critical"],
  ["bleeding", "Critical"], ["unconscious", "Critical"], ["not breathing", "Critical"],
  ["ambulance", "Critical"], ["hospital emergency", "Critical"],
  ["child injured", "Critical"], ["infant", "Critical"], ["electrocution", "Critical"],
  ["live wire", "Critical"], ["rabies", "Critical"], ["building collapse", "Critical"],
  ["weapon", "Critical"], ["help emergency", "Critical"], ["life", "Critical"],
  // High
  ["accident", "High"], ["injury", "High"], ["injured", "High"],
  ["flood", "High"], ["flooded", "High"],
  ["no water", "High"], ["no supply", "High"], ["contamination", "High"],
  ["harassment", "High"], ["attacked", "High"], ["assault", "High"],
  ["dangerous", "High"], ["hazard", "High"], ["unsafe", "High"],
  ["blocked", "High"], ["broken", "High"], ["leaking", "High"],
  ["not working", "High"], ["not coming", "High"], ["urgent", "High"],
];

function detectUrgencyOverride(rawText: string, normalizedText: string): BasePriority | null {
  const haystacks = [rawText.toLowerCase(), normalizedText.toLowerCase()];
  for (const [phrase, severity] of URGENCY_SIGNALS) {
    if (haystacks.some((h) => h.includes(phrase))) return severity;
  }
  return null;
}

const PRIORITY_RANK: Record<BasePriority, number> = { Critical: 3, High: 2, Normal: 1 };

const basePriorityByCategory: Partial<Record<Category, BasePriority>> = {};
{
  const counts = new Map<Category, Map<BasePriority, number>>();
  for (const [, cat, pri] of TRAINING_DATA) {
    if (!counts.has(cat)) counts.set(cat, new Map());
    const m = counts.get(cat)!;
    m.set(pri, (m.get(pri) ?? 0) + 1);
  }
  for (const [cat, m] of counts) {
    let best: BasePriority = "Normal";
    let bestCount = -1;
    for (const [pri, count] of m) {
      if (count > bestCount) { best = pri; bestCount = count; }
    }
    basePriorityByCategory[cat] = best;
  }
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ClassificationResult {
  category: Category;
  confidence: number; // 0-100
  priority: BasePriority;
  department: string;
  departmentCode: string;
  slaHours: number;
  detectedLanguage: string;
  normalizedText: string;
  topCategories: Array<{ name: Category; score: number }>;
  isLifeThreatening: boolean;
}

export function classifyGrievance(rawDescription: string): ClassificationResult {
  const { normalizedText, detectedLanguage } = normalizeToEnglish(rawDescription);

  const proba = model.predictProba(normalizedText);
  let category: Category = "Other";
  let bestScore = -1;
  for (const [cat, score] of proba) {
    if (score > bestScore) { bestScore = score; category = cat; }
  }
  const confidence = Math.round(bestScore * 1000) / 10;

  const urgency = detectUrgencyOverride(rawDescription, normalizedText);
  const base = basePriorityByCategory[category] ?? "Normal";
  const priority: BasePriority =
    urgency && PRIORITY_RANK[urgency] > PRIORITY_RANK[base] ? urgency : base;

  const dept = DEPARTMENTS[category];

  const topCategories = Array.from(proba.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, score]) => ({ name, score: Math.round(score * 1000) / 10 }));

  const isLifeThreatening =
    priority === "Critical" &&
    URGENCY_SIGNALS.some(
      ([phrase, sev]) =>
        sev === "Critical" &&
        (rawDescription.toLowerCase().includes(phrase) ||
          normalizedText.toLowerCase().includes(phrase))
    );

  return {
    category,
    confidence,
    priority,
    department: dept.name,
    departmentCode: dept.code,
    slaHours: dept.slaHours,
    detectedLanguage,
    normalizedText,
    topCategories,
    isLifeThreatening,
  };
}
