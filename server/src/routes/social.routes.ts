import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { fetchSocialMediaMentions, SocialMediaMention } from "../integrations/socialMedia";
import {
  runSocialIngestionSweep,
  processSingleMention,
  approveReviewedMention,
  rejectReviewedMention,
} from "../services/socialIngestionService";
import { ProcessedMention } from "../models/ProcessedMention";
import { requireAuth, requirePermission } from "../middleware/auth";
import { asyncHandler, AppError } from "../middleware/errorHandler";

const router = Router();

/**
 * Feed view — shows every mention from the current source (mock feed for
 * demo; see /webhook below for how a real source plugs in) alongside its
 * processed status, so the UI can show "Auto-filed", "Needs review", or
 * "Rejected" instead of a generic list everyone has to manually triage.
 */
router.get(
  "/feed",
  requireAuth,
  requirePermission("manage_social_media"),
  asyncHandler(async (_req, res) => {
    const { mentions, note } = fetchSocialMediaMentions();
    const processed = await ProcessedMention.find({
      postUrl: { $in: mentions.map((m) => m.postUrl) },
    });
    const statusByUrl = new Map(processed.map((p) => [p.postUrl, p]));

    const enriched = mentions.map((m) => {
      const p = statusByUrl.get(m.postUrl);
      return {
        ...m,
        status: p?.decision || "unprocessed",
        statusReason: p?.reason || null,
        grvId: p?.grvId || null,
      };
    });

    res.json({ mentions: enriched, note });
  })
);

/**
 * Run the auto-extraction sweep on demand. In production this also runs
 * automatically every 10 minutes (see index.ts background sweeps) — this
 * endpoint lets staff trigger it immediately for a demo or after adding
 * a new mock entry, instead of waiting for the next scheduled run.
 */
router.post(
  "/sweep",
  requireAuth,
  requirePermission("manage_social_media"),
  asyncHandler(async (_req, res) => {
    const results = await runSocialIngestionSweep();
    res.json({
      processed: results.length,
      autoFiled: results.filter((r) => r.decision === "auto_filed").length,
      needsReview: results.filter((r) => r.decision === "needs_review").length,
      rejected: results.filter((r) => r.decision === "rejected").length,
      results,
    });
  })
);

/** Staff approves a needs_review mention, supplying the location it lacked. */
const approveSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  district: z.string().min(2),
  note: z.string().default(""),
});

router.post(
  "/:postUrl/approve",
  requireAuth,
  requirePermission("manage_social_media"),
  asyncHandler(async (req, res) => {
    const body = approveSchema.parse(req.body);
    try {
      const record = await approveReviewedMention({
        postUrl: decodeURIComponent(req.params.postUrl),
        lat: body.lat,
        lng: body.lng,
        district: body.district,
        approverNote: body.note,
      });
      res.json(record);
    } catch (e) {
      throw new AppError((e as Error).message, 404);
    }
  })
);

router.post(
  "/:postUrl/reject",
  requireAuth,
  requirePermission("manage_social_media"),
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().default("Not actionable") }).parse(req.body);
    try {
      const record = await rejectReviewedMention(decodeURIComponent(req.params.postUrl), reason);
      res.json(record);
    } catch (e) {
      throw new AppError((e as Error).message, 404);
    }
  })
);

/**
 * Generic inbound webhook — the actual answer to "how does this connect
 * to real social media without a paid API". Any free automation tool
 * that CAN see a tagged post — an IFTTT applet, a Zapier free-tier zap,
 * a browser extension, or simply a staff member relaying a post they
 * saw — can POST here. The endpoint doesn't care how the post was
 * discovered; it runs the exact same verify-and-auto-file pipeline as
 * the scheduled sweep over the mock feed. Authenticated with a shared
 * secret header instead of a user JWT, since external automation tools
 * can't do an interactive login.
 */
const webhookSchema = z.object({
  platform: z.enum(["Twitter/X", "Facebook", "Instagram"]).default("Twitter/X"),
  // Defaults to public_tag since that's the only channel any real
  // automation tool can see today. A future DM integration would set
  // this explicitly to "direct_message" — same field, same pipeline.
  sourceChannel: z.enum(["public_tag", "direct_message"]).default("public_tag"),
  handle: z.string().min(1),
  postUrl: z.string().min(1),
  text: z.string().min(5),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

router.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    const secret = process.env.SOCIAL_WEBHOOK_SECRET || "";
    const provided = req.headers["x-webhook-secret"];
    if (!secret || provided !== secret) {
      throw new AppError("Invalid or missing webhook secret", 401);
    }

    const body = webhookSchema.parse(req.body);
    const mention: SocialMediaMention = {
      platform: body.platform,
      sourceChannel: body.sourceChannel,
      handle: body.handle,
      postUrl: body.postUrl,
      text: body.text,
      postedAt: new Date().toISOString(),
      followerCount: 0, // unknown from webhook source — never used for priority anyway
      lat: body.lat,
      lng: body.lng,
    };

    const result = await processSingleMention(mention);
    res.status(201).json(result);
  })
);

/**
 * Manual "report a post I saw" form — for staff who personally see a
 * tagged complaint (on their own phone, in a WhatsApp forward, etc.) and
 * want to relay it. Requires login (any staff role), unlike the webhook.
 * Goes through the identical pipeline as everything else above.
 */
const reportSchema = z.object({
  platform: z.enum(["Twitter/X", "Facebook", "Instagram"]).default("Twitter/X"),
  sourceChannel: z.enum(["public_tag", "direct_message"]).default("public_tag"),
  handle: z.string().min(1),
  postUrl: z.string().min(1).optional(),
  text: z.string().min(5),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

router.post(
  "/report",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = reportSchema.parse(req.body);
    const mention: SocialMediaMention = {
      platform: body.platform,
      sourceChannel: body.sourceChannel,
      handle: body.handle,
      postUrl: body.postUrl || `manual-report-${crypto.randomUUID()}`,
      text: body.text,
      postedAt: new Date().toISOString(),
      followerCount: 0,
      lat: body.lat,
      lng: body.lng,
    };
    const result = await processSingleMention(mention);
    res.status(201).json(result);
  })
);

export default router;
