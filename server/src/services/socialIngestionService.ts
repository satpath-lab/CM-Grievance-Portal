import { ProcessedMention, SocialDecision } from "../models/ProcessedMention";
import { fileGrievance } from "./grievanceService";
import { verifySocialMention } from "./groqService";
import { SocialMediaMention, fetchSocialMediaMentions } from "../integrations/socialMedia";

/**
 * Auto-extraction pipeline for social-media-tagged complaints.
 *
 * Reality check that shapes this design: there is no free, live way to
 * pull tagged posts from X/Twitter in 2026 — the official API's free
 * tier is write-only with a negligible read allowance, and every paid
 * tier starts at real money. So this pipeline is built to be agnostic
 * about WHERE mentions come from — it takes a `SocialMediaMention` shape
 * and verifies + auto-files it, regardless of whether that mention came
 * from the bundled mock feed (for demos), a generic webhook that a free
 * automation tool (IFTTT, Zapier, a manual paste-the-post form) can call,
 * or a real paid API integration added later. The hard, valuable part —
 * deciding whether a post is a genuine actionable complaint and routing
 * it correctly — is real and runs end-to-end either way.
 *
 * Three-way outcome per mention:
 *   auto_filed    — Groq is confident (>= 0.75) it's genuine AND actionable,
 *                    AND the post has coordinates. A real Grievance is
 *                    created automatically, no human click.
 *   needs_review   — plausibly genuine but missing detail/coordinates, or
 *                    Groq unavailable and the rule-based fallback can't
 *                    reach the confidence floor on its own. Surfaced to
 *                    CMO/admin staff to approve (with a location) or reject.
 *   rejected       — not a genuine complaint (spam/joke/ad/too vague). Logged
 *                    with a reason but never becomes a grievance.
 *
 * followerCount is read by NOTHING in this pipeline — verification and
 * routing depend only on the post's content, exactly to prevent the
 * documented inequity where high-follower accounts get faster service.
 */

const AUTO_FILE_CONFIDENCE_THRESHOLD = 0.75;

export interface ProcessMentionResult {
  postUrl: string;
  decision: SocialDecision;
  reason: string;
  confidence: number;
  grvId?: string;
}

export async function processSingleMention(
  mention: SocialMediaMention
): Promise<ProcessMentionResult> {
  // Idempotency — never process (or re-file) the same post twice.
  const existing = await ProcessedMention.findOne({ postUrl: mention.postUrl });
  if (existing) {
    return {
      postUrl: mention.postUrl,
      decision: existing.decision,
      reason: existing.reason,
      confidence: existing.confidence,
      grvId: existing.grvId,
    };
  }

  const verification = await verifySocialMention(mention.text);
  const hasLocation = typeof mention.lat === "number" && typeof mention.lng === "number";

  let decision: SocialDecision;
  let grvId: string | undefined;

  if (
    verification.isGenuineComplaint &&
    verification.hasActionableDetail &&
    verification.confidence >= AUTO_FILE_CONFIDENCE_THRESHOLD &&
    hasLocation
  ) {
    const { grievance } = await fileGrievance({
      citizenName: mention.handle,
      citizenPhone: "0000000000", // social-sourced — no phone on file, tracked by handle instead
      descriptionRaw: mention.text,
      district: "Auto-detected from social media",
      lat: mention.lat!,
      lng: mention.lng!,
      channel: "Social Media",
      sourceSystem: mention.platform,
      sourceRefId: mention.postUrl,
    });
    decision = "auto_filed";
    grvId = grievance.grvId;
  } else if (verification.isGenuineComplaint && verification.confidence >= 0.4) {
    decision = "needs_review"; // plausible, but not confident/detailed enough to auto-file unattended
  } else {
    decision = "rejected";
  }

  const reason =
    !hasLocation && verification.isGenuineComplaint
      ? `${verification.reason} (No coordinates attached to post — routed to review instead of auto-filed.)`
      : verification.reason;

  await ProcessedMention.create({
    postUrl: mention.postUrl,
    platform: mention.platform,
    handle: mention.handle,
    text: mention.text,
    decision,
    reason,
    confidence: verification.confidence,
    grvId,
  });

  return { postUrl: mention.postUrl, decision, reason, confidence: verification.confidence, grvId };
}

/**
 * Sweep the current mention feed and auto-process anything not yet seen.
 * Call this on a schedule (see index.ts) or on demand from the admin UI.
 * Already-processed postUrls are skipped automatically via the idempotency
 * check inside processSingleMention.
 */
export async function runSocialIngestionSweep(): Promise<ProcessMentionResult[]> {
  const { mentions } = fetchSocialMediaMentions();
  const results: ProcessMentionResult[] = [];
  for (const mention of mentions) {
    results.push(await processSingleMention(mention));
  }
  return results;
}

/**
 * Manual override — staff approves a "needs_review" mention into a real
 * grievance, supplying the location the automated check couldn't confirm
 * (most "needs_review" cases land here specifically for missing coordinates).
 */
export async function approveReviewedMention(opts: {
  postUrl: string;
  lat: number;
  lng: number;
  district: string;
  approverNote: string;
}) {
  const record = await ProcessedMention.findOne({ postUrl: opts.postUrl });
  if (!record) throw new Error("Mention not found");
  if (record.decision === "auto_filed") return record; // already filed, nothing to do

  const { grievance } = await fileGrievance({
    citizenName: record.handle,
    citizenPhone: "0000000000",
    descriptionRaw: record.text,
    district: opts.district,
    lat: opts.lat,
    lng: opts.lng,
    channel: "Social Media",
    sourceSystem: record.platform,
    sourceRefId: record.postUrl,
  });

  record.decision = "auto_filed";
  record.reason = `${record.reason} | Manually approved by staff: ${opts.approverNote}`;
  record.grvId = grievance.grvId;
  await record.save();
  return record;
}

/** Staff explicitly rejects a "needs_review" mention as not actionable. */
export async function rejectReviewedMention(postUrl: string, reason: string) {
  const record = await ProcessedMention.findOne({ postUrl });
  if (!record) throw new Error("Mention not found");
  record.decision = "rejected";
  record.reason = `${record.reason} | Manually rejected by staff: ${reason}`;
  await record.save();
  return record;
}
