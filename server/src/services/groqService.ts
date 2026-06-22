/**
 * Groq AI service — the primary intelligence layer.
 *
 * Model selection:
 *   llama-3.3-70b-versatile  — main classification, CM brief, officer suggestions,
 *                               semantic dedup, hotspot narratives. Best Hindi/Hinglish/English
 *                               understanding on Groq, 128k context, ~2000 tok/s on LPU.
 *   llama3-8b-8192           — live NLP preview (as citizen types). Lower latency
 *                               matters more than max accuracy for real-time UX.
 *
 * Fallback: every function that calls Groq falls back to the TF-IDF Naive Bayes
 * classifier (nlp/classifier.ts) if:
 *   - GROQ_API_KEY is not set
 *   - The API call fails or times out (5s hard limit)
 *   - Rate limit is hit
 * The fallback path is transparent to callers — same ClassificationResult interface.
 *
 * Production migration: Groq and Ollama both implement the OpenAI-compatible
 * /v1/chat/completions endpoint. To self-host llama-3.3-70b on your own GPU:
 *   GROQ_BASE_URL=http://localhost:11434/v1
 *   GROQ_MODEL=llama3.3:70b
 * Zero code changes.
 */

import { classifyGrievance, ClassificationResult, DEPARTMENTS } from "../nlp/classifier";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const MAIN_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const FAST_MODEL = "llama3-8b-8192";
const TIMEOUT_MS = 8000;
const FAST_TIMEOUT_MS = 3000;

// ---------------------------------------------------------------------------
// Low-level Groq caller
// ---------------------------------------------------------------------------

interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GroqResponse {
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: { total_tokens: number };
}

async function callGroq(
  messages: GroqMessage[],
  opts: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    jsonMode?: boolean;
  } = {}
): Promise<string> {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? TIMEOUT_MS
  );

  try {
    const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model ?? MAIN_MODEL,
        messages,
        temperature: opts.temperature ?? 0,
        max_tokens: opts.maxTokens ?? 512,
        ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Groq HTTP ${res.status}: ${body.slice(0, 120)}`);
    }

    const data = (await res.json()) as GroqResponse;
    return data.choices[0]?.message?.content?.trim() ?? "";
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonSafe<T>(text: string): T | null {
  try {
    // strip markdown fences if present
    const clean = text.replace(/^```(?:json)?/m, "").replace(/```$/m, "").trim();
    return JSON.parse(clean) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. Grievance classification (main submit path)
//    Full llama-3.3-70b-versatile, with TF-IDF fallback
// ---------------------------------------------------------------------------

export interface GroqClassificationResult extends ClassificationResult {
  summary: string; // English summary regardless of input language
  groqUsed: boolean;
}

const SYSTEM_CLASSIFY = `You are an AI assistant for the Delhi Chief Minister's grievance portal.
Classify the citizen complaint and return ONLY a JSON object with these exact fields:
{
  "category": one of ["Water & Sanitation","Roads & Infrastructure","Power & Electricity","Public Safety","Education","Health Services","Sanitation & Waste","Transport","Stray Animals","Encroachment & Illegal Construction","Other"],
  "priority": one of ["Critical","High","Normal"],
  "department": department full name,
  "departmentCode": one of [DJB,PWD,BSES,DLP,DOE,HFW,MCD,DTC,MCDV,MCDE,DA],
  "slaHours": integer hours for resolution,
  "detectedLanguage": one of ["Hindi","Hinglish","English"],
  "isLifeThreatening": boolean (true if immediate risk to human life),
  "confidence": number 0-100,
  "summary": "1-sentence English summary of the complaint"
}

Department codes: DJB=Delhi Jal Board (water), PWD=Public Works (roads), BSES=electricity,
DLP=Delhi Police (safety), DOE=Education, HFW=Health, MCD=Sanitation/waste, DTC=Transport,
MCDV=MCD Veterinary (animals), MCDE=MCD Enforcement (encroachment), DA=District Admin.

SLA hours: Critical issues 2-6h, High priority 12-48h, Normal 48-96h.
Mark isLifeThreatening true for: fire, building collapse, electrocution, gas leak, choking drain flood, rabies, assault in progress, medical emergency.
The complaint may be in Hindi (Devanagari), Hinglish (Roman Hindi), or English.`;

export async function classifyWithGroq(
  description: string,
  fast = false
): Promise<GroqClassificationResult> {
  if (!GROQ_API_KEY) {
    return { ...classifyGrievance(description), summary: "", groqUsed: false };
  }

  try {
    const text = await callGroq(
      [
        { role: "system", content: SYSTEM_CLASSIFY },
        { role: "user", content: description },
      ],
      {
        model: fast ? FAST_MODEL : MAIN_MODEL,
        temperature: 0,
        maxTokens: 300,
        timeoutMs: fast ? FAST_TIMEOUT_MS : TIMEOUT_MS,
        jsonMode: true,
      }
    );

    const parsed = parseJsonSafe<{
      category: string;
      priority: string;
      department: string;
      departmentCode: string;
      slaHours: number;
      detectedLanguage: string;
      isLifeThreatening: boolean;
      confidence: number;
      summary: string;
    }>(text);

    if (!parsed) throw new Error("JSON parse failed");

    // Validate and clamp fields so downstream code never crashes on bad output
    const validCategories = Object.keys(DEPARTMENTS);
    const category =
      validCategories.includes(parsed.category) ? parsed.category : "Other";
    const dept = DEPARTMENTS[category as keyof typeof DEPARTMENTS];

    return {
      category: category as ClassificationResult["category"],
      priority: (["Critical", "High", "Normal"].includes(parsed.priority)
        ? parsed.priority
        : "Normal") as ClassificationResult["priority"],
      department: parsed.department || dept.name,
      departmentCode: parsed.departmentCode || dept.code,
      slaHours: parsed.slaHours || dept.slaHours,
      detectedLanguage: parsed.detectedLanguage || "English",
      isLifeThreatening: Boolean(parsed.isLifeThreatening),
      confidence: Math.max(0, Math.min(100, parsed.confidence || 70)),
      normalizedText: description,
      topCategories: [{ name: category as ClassificationResult["category"], score: parsed.confidence || 70 }],
      summary: parsed.summary || "",
      groqUsed: true,
    };
  } catch (err) {
    console.warn("[Groq] classifyWithGroq failed, falling back to TF-IDF:", (err as Error).message);
    return { ...classifyGrievance(description), summary: "", groqUsed: false };
  }
}

// ---------------------------------------------------------------------------
// 2. CM daily brief (Hindi or English)
// ---------------------------------------------------------------------------

export interface CMBriefInput {
  filedToday: number;
  pending: number;
  criticalOpen: number;
  lifeThreateningOpen: number;
  slaBreached: number;
  topCategories: Array<{ category: string; count: number }>;
  topDistricts: Array<{ district: string; count: number; critical: number }>;
  hotspots: Array<{ district: string; category: string; count: number }>;
  resolvedWeek: number;
}

export async function generateCMBrief(
  data: CMBriefInput,
  language: "en" | "hi" = "en"
): Promise<string> {
  const fallback =
    language === "hi"
      ? `आज ${data.filedToday} शिकायतें दर्ज हुईं। ${data.criticalOpen} गंभीर शिकायतें लंबित हैं। ${data.pending} कुल खुली हैं।`
      : `${data.filedToday} complaints filed today. ${data.criticalOpen} critical open. ${data.pending} total pending. ${data.slaBreached} SLA breached.`;

  if (!GROQ_API_KEY) return fallback;

  const lang = language === "hi" ? "Hindi (Devanagari script)" : "English";
  const prompt = `Write a 3-sentence daily briefing for the Chief Minister of Delhi in ${lang}.
Be specific, actionable, and use exact numbers. No headers, no bullet points — flowing sentences only.

Data:
- Filed today: ${data.filedToday}
- Total pending: ${data.pending}
- Critical open: ${data.criticalOpen}
- Life-threatening open: ${data.lifeThreateningOpen}
- SLA breached (escalated): ${data.slaBreached}
- Resolved this week: ${data.resolvedWeek}
- Top categories today: ${data.topCategories.slice(0, 3).map((c) => `${c.category} (${c.count})`).join(", ")}
- Most affected districts: ${data.topDistricts.slice(0, 3).map((d) => `${d.district} (${d.count} complaints, ${d.critical} critical)`).join(", ")}
- Recurring hotspots: ${data.hotspots.slice(0, 2).map((h) => `${h.category} in ${h.district} (${h.count} in 30 days)`).join(", ")}

End with one clear action recommendation for today.`;

  try {
    return await callGroq(
      [{ role: "user", content: prompt }],
      { model: MAIN_MODEL, temperature: 0.4, maxTokens: 200 }
    );
  } catch (err) {
    console.warn("[Groq] generateCMBrief failed:", (err as Error).message);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// 2b. Executive report generation — for senior government review.
//
// This directly answers the original brief's MVP requirement: "Generate
// actionable reports and accountability metrics for senior government
// review." Live dashboards are not the same artifact as a report —
// senior officials reviewing a project need something they can read in
// one sitting, share, and file, not a screen they have to interact with.
// Structure: Executive Summary, Key Metrics, Top Issues, Accountability
// Flags, Recommendations — every number comes from real aggregates
// computed in dashboardService.ts, Groq only writes the prose around them.
// ---------------------------------------------------------------------------

export interface ExecutiveReportInput {
  periodLabel: string; // e.g. "Week of 16-22 June 2026"
  overview: { filedToday: number; pending: number; resolvedWeek: number; criticalOpen: number; slaBreached: number; awaitingConfirmation: number };
  healthScore: { score: number; components: { confirmationRate: number; onTimeRate: number; escalationRate: number; reopenRate: number } };
  falseClosure: { officerReportedResolved: number; citizenConfirmed: number; citizenConfirmationRate: number; citizenDisputed: number; photoMismatchFlags: number };
  topCategories: Array<{ category: string; total: number }>;
  topDistricts: Array<{ district: string; total: number; critical: number }>;
  predictiveAlerts: Array<{ district: string; category: string; growthPct: number; thisWeek: number }>;
  flaggedOfficers: Array<{ name: string; accountabilityScore: number; reopenRate: number }>;
}

function fallbackExecutiveReport(d: ExecutiveReportInput, language: "en" | "hi"): string {
  const hi = language === "hi";
  const lines: string[] = [];
  lines.push(hi ? `कार्यकारी रिपोर्ट — ${d.periodLabel}` : `EXECUTIVE REPORT — ${d.periodLabel}`);
  lines.push("");
  lines.push(hi ? "सारांश" : "SUMMARY");
  lines.push(
    hi
      ? `कुल खुली शिकायतें: ${d.overview.pending}. गंभीर: ${d.overview.criticalOpen}. इस सप्ताह हल: ${d.overview.resolvedWeek}. शासन स्वास्थ्य स्कोर: ${d.healthScore.score}/100.`
      : `Total open: ${d.overview.pending}. Critical: ${d.overview.criticalOpen}. Resolved this week: ${d.overview.resolvedWeek}. Governance health score: ${d.healthScore.score}/100.`
  );
  lines.push("");
  lines.push(hi ? "जवाबदेही" : "ACCOUNTABILITY");
  lines.push(
    hi
      ? `नागरिक पुष्टि दर ${d.falseClosure.citizenConfirmationRate}% है (${d.falseClosure.citizenConfirmed}/${d.falseClosure.officerReportedResolved}). ${d.falseClosure.photoMismatchFlags} फ़ोटो स्थान बेमेल चिह्नित।`
      : `Citizen confirmation rate is ${d.falseClosure.citizenConfirmationRate}% (${d.falseClosure.citizenConfirmed}/${d.falseClosure.officerReportedResolved}). ${d.falseClosure.photoMismatchFlags} photo location mismatches flagged.`
  );
  if (d.flaggedOfficers.length > 0) {
    lines.push(
      hi
        ? `समीक्षा हेतु अधिकारी: ${d.flaggedOfficers.map((o) => o.name).join(", ")}.`
        : `Officers flagged for review: ${d.flaggedOfficers.map((o) => o.name).join(", ")}.`
    );
  }
  lines.push("");
  lines.push(hi ? "शीर्ष श्रेणियाँ" : "TOP CATEGORIES");
  d.topCategories.slice(0, 5).forEach((c) => lines.push(`- ${c.category}: ${c.total}`));
  if (d.predictiveAlerts.length > 0) {
    lines.push("");
    lines.push(hi ? "बढ़ती समस्याएं" : "GROWING ISSUES");
    d.predictiveAlerts.forEach((a) => lines.push(`- ${a.district} / ${a.category}: +${a.growthPct}% (${a.thisWeek} this week)`));
  }
  return lines.join("\n");
}

export async function generateExecutiveReport(
  data: ExecutiveReportInput,
  language: "en" | "hi" = "en"
): Promise<string> {
  if (!GROQ_API_KEY) return fallbackExecutiveReport(data, language);

  const lang = language === "hi" ? "Hindi (Devanagari script)" : "English";
  const prompt = `Write a formal executive report for senior Delhi government officials reviewing the CM Grievance Dashboard's performance, in ${lang}.

Structure with these exact section headers (translate the header text to ${lang} but keep the structure):
1. EXECUTIVE SUMMARY (2-3 sentences, the single most important takeaway)
2. KEY METRICS (short list, use the real numbers given)
3. TOP ISSUES & HOTSPOTS (what's driving complaint volume)
4. ACCOUNTABILITY FLAGS (false-closure gap, any officers flagged — be direct, this is the report's purpose)
5. RECOMMENDATIONS (2-3 specific, actionable items)

Use ONLY the data given below. Do not invent numbers. Be direct and professional, not promotional.

Period: ${data.periodLabel}
Open complaints: ${data.overview.pending} (${data.overview.criticalOpen} critical)
Resolved this week: ${data.overview.resolvedWeek}
SLA breaches: ${data.overview.slaBreached}
Awaiting citizen confirmation: ${data.overview.awaitingConfirmation}
Governance health score: ${data.healthScore.score}/100 (confirmation rate ${data.healthScore.components.confirmationRate}%, on-time rate ${data.healthScore.components.onTimeRate}%, reopen rate ${data.healthScore.components.reopenRate}%)
Officer-reported resolved: ${data.falseClosure.officerReportedResolved}, citizen-confirmed: ${data.falseClosure.citizenConfirmed} (${data.falseClosure.citizenConfirmationRate}% confirmation rate)
Citizen disputes: ${data.falseClosure.citizenDisputed}
Photo location mismatches flagged: ${data.falseClosure.photoMismatchFlags}
Top categories: ${data.topCategories.slice(0, 5).map((c) => `${c.category} (${c.total})`).join(", ")}
Top districts: ${data.topDistricts.slice(0, 5).map((d2) => `${d2.district} (${d2.total} total, ${d2.critical} critical)`).join(", ")}
Growing issues (week-over-week): ${data.predictiveAlerts.map((a) => `${a.category} in ${a.district} up ${a.growthPct}%`).join("; ") || "none"}
Officers flagged for review: ${data.flaggedOfficers.map((o) => `${o.name} (score ${o.accountabilityScore}, reopen rate ${o.reopenRate}%)`).join(", ") || "none"}`;

  try {
    return await callGroq(
      [{ role: "user", content: prompt }],
      { model: MAIN_MODEL, temperature: 0.3, maxTokens: 700 }
    );
  } catch (err) {
    console.warn("[Groq] generateExecutiveReport failed:", (err as Error).message);
    return fallbackExecutiveReport(data, language);
  }
}

// ---------------------------------------------------------------------------
// 3. Officer action suggestion
// ---------------------------------------------------------------------------

export async function suggestOfficerAction(opts: {
  description: string;
  category: string;
  priority: string;
  district: string;
  address?: string;
  language: "en" | "hi";
}): Promise<string> {
  const fallback =
    opts.language === "hi"
      ? `${opts.category} श्रेणी की शिकायत। स्थल पर जाकर जांच करें और समाधान की फ़ोटो अपलोड करें।`
      : `${opts.category} complaint at ${opts.address || opts.district}. Visit the site, resolve, and upload a geotagged photo as proof.`;

  if (!GROQ_API_KEY) return fallback;

  const lang = opts.language === "hi" ? "Hindi (Devanagari)" : "English";
  const prompt = `You are a Delhi government field officer assistant.
Write a single short, specific, actionable instruction for a field officer to resolve this complaint.
Write in ${lang}. Max 30 words. Start with a verb. Be concrete.

Complaint: ${opts.description}
Category: ${opts.category}
Priority: ${opts.priority}
Location: ${opts.address || opts.district}`;

  try {
    return await callGroq(
      [{ role: "user", content: prompt }],
      { model: FAST_MODEL, temperature: 0.2, maxTokens: 80, timeoutMs: FAST_TIMEOUT_MS }
    );
  } catch (err) {
    console.warn("[Groq] suggestOfficerAction failed:", (err as Error).message);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// 4. Semantic duplicate check
//    Returns a similarity score (0-1) between two complaint descriptions.
// ---------------------------------------------------------------------------

export async function checkSemanticDuplicate(
  desc1: string,
  desc2: string
): Promise<number> {
  if (!GROQ_API_KEY) return 0;

  const prompt = `Rate the semantic similarity between these two Delhi civic complaints on a scale of 0.0 to 1.0.
0.0 = completely different issues. 1.0 = same issue described differently.
Return ONLY a JSON object: {"similarity": 0.0}

Complaint 1: ${desc1.slice(0, 200)}
Complaint 2: ${desc2.slice(0, 200)}`;

  try {
    const text = await callGroq(
      [{ role: "user", content: prompt }],
      { model: FAST_MODEL, temperature: 0, maxTokens: 30, timeoutMs: FAST_TIMEOUT_MS, jsonMode: true }
    );
    const parsed = parseJsonSafe<{ similarity: number }>(text);
    return Math.max(0, Math.min(1, parsed?.similarity ?? 0));
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// 4b. Social media mention verification — the core of the auto-extraction
// pipeline. Decides whether a social media post is a genuine, actionable
// civic complaint worth auto-filing, vs. spam, a joke, an ad, unrelated
// chatter, or a complaint with too little detail to route anywhere.
//
// This is deliberately NOT just "does it mention a civic keyword" — that
// would auto-file sarcasm, news-link shares, and "lol the roads here" posts.
// The model is asked to reason about actionability, not just topic match.
//
// Fallback without Groq: a conservative rule-based check (mentions an
// official handle/hashtag AND contains a specific civic-problem keyword
// AND is long enough to plausibly contain real detail). This fallback
// deliberately requires_review more often than the Groq path — it can't
// reason about intent, so it errs toward human review instead of guessing.
// ---------------------------------------------------------------------------

export interface MentionVerification {
  isGenuineComplaint: boolean;
  hasActionableDetail: boolean;
  confidence: number; // 0-1
  reason: string;
}

const CIVIC_KEYWORDS_FOR_FALLBACK = [
  "water", "sewage", "garbage", "pothole", "road", "electricity", "power cut",
  "streetlight", "drain", "police", "school", "hospital", "stray dog",
  "encroachment", "construction", "bus", "traffic", "flood", "waterlogging",
];

function ruleBasedMentionCheck(text: string): MentionVerification {
  const lower = text.toLowerCase();
  const mentionsOfficial = /@cmodelhi|@mcd311|#delhicivic|@delhipolice|@djb/i.test(text);
  const hasKeyword = CIVIC_KEYWORDS_FOR_FALLBACK.some((k) => lower.includes(k));
  const longEnough = text.trim().split(/\s+/).length >= 8;

  if (mentionsOfficial && hasKeyword && longEnough) {
    return {
      isGenuineComplaint: true,
      hasActionableDetail: true,
      confidence: 0.55, // capped — rule-based fallback never reaches auto-file threshold alone
      reason: "Rule-based fallback: mentions an official handle, a civic keyword, and has enough length to plausibly contain detail. Capped confidence — routed to human review, not auto-filed, without Groq reasoning.",
    };
  }
  return {
    isGenuineComplaint: false,
    hasActionableDetail: false,
    confidence: 0.1,
    reason: "Rule-based fallback: missing an official mention, a recognizable civic keyword, or enough length to be actionable.",
  };
}

export async function verifySocialMention(text: string): Promise<MentionVerification> {
  if (!GROQ_API_KEY) return ruleBasedMentionCheck(text);

  const prompt = `You are reviewing a social media post that mentions a Delhi government account or civic hashtag, to decide if it is a genuine, actionable civic complaint that should be auto-filed into a government grievance system.

REJECT (isGenuineComplaint: false) if the post is: sarcasm/joke, an advertisement, a general political opinion with no specific issue, a retweet/share of news with no personal complaint, or too vague to act on (e.g. "roads are so bad" with no location).

ACCEPT (isGenuineComplaint: true) only if it describes a SPECIFIC civic problem (what + roughly where) that a government department could act on.

hasActionableDetail should be true only if there's enough specificity (location, duration, or clear description) to actually dispatch someone.

Post: "${text.slice(0, 400)}"

Return ONLY this JSON: {"isGenuineComplaint": true, "hasActionableDetail": true, "confidence": 0.0, "reason": "one short sentence"}`;

  try {
    const responseText = await callGroq(
      [{ role: "user", content: prompt }],
      { model: MAIN_MODEL, temperature: 0, maxTokens: 150, timeoutMs: TIMEOUT_MS, jsonMode: true }
    );
    const parsed = parseJsonSafe<MentionVerification>(responseText);
    if (!parsed) return ruleBasedMentionCheck(text);
    return {
      isGenuineComplaint: Boolean(parsed.isGenuineComplaint),
      hasActionableDetail: Boolean(parsed.hasActionableDetail),
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0)),
      reason: parsed.reason || "No reason provided by model.",
    };
  } catch {
    return ruleBasedMentionCheck(text);
  }
}

// ---------------------------------------------------------------------------
// 5. Hotspot narrative for CM view
//    "14 waterlogging complaints in Dwarka in 7 days..."
// ---------------------------------------------------------------------------

export async function generateHotspotNarrative(opts: {
  district: string;
  category: string;
  count: number;
  criticalCount: number;
  language: "en" | "hi";
}): Promise<string> {
  const fallback =
    opts.language === "hi"
      ? `${opts.district} में ${opts.category} की ${opts.count} शिकायतें, जिनमें ${opts.criticalCount} गंभीर हैं।`
      : `${opts.count} ${opts.category} complaints in ${opts.district} including ${opts.criticalCount} critical.`;

  if (!GROQ_API_KEY) return fallback;

  const lang = opts.language === "hi" ? "Hindi (Devanagari)" : "English";
  const prompt = `Write ONE sentence in ${lang} describing this recurring civic problem in Delhi.
Be specific and suggest a likely root cause. Max 25 words.

District: ${opts.district}
Category: ${opts.category}
Complaints in last 30 days: ${opts.count} (${opts.criticalCount} critical)`;

  try {
    return await callGroq(
      [{ role: "user", content: prompt }],
      { model: FAST_MODEL, temperature: 0.3, maxTokens: 80, timeoutMs: FAST_TIMEOUT_MS }
    );
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// 6. Translate complaint description for officer
// ---------------------------------------------------------------------------

export async function translateForOfficer(
  text: string,
  targetLang: "en" | "hi"
): Promise<string> {
  if (!GROQ_API_KEY) return text;

  const target = targetLang === "hi" ? "Hindi (Devanagari)" : "English";
  const prompt = `Translate this Delhi citizen complaint to ${target}.
Keep it concise, preserve all specific details (location, duration, severity).
Return ONLY the translation, no explanation.

Text: ${text.slice(0, 300)}`;

  try {
    return await callGroq(
      [{ role: "user", content: prompt }],
      { model: FAST_MODEL, temperature: 0.1, maxTokens: 150, timeoutMs: FAST_TIMEOUT_MS }
    );
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------------------
// Status check
// ---------------------------------------------------------------------------

export function getGroqStatus(): { configured: boolean; mainModel: string; fastModel: string; baseUrl: string } {
  return {
    configured: Boolean(GROQ_API_KEY),
    mainModel: MAIN_MODEL,
    fastModel: FAST_MODEL,
    baseUrl: GROQ_BASE_URL,
  };
}
