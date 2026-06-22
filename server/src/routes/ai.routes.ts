import { Router } from "express";
import { requireAuth, requireAuthSSE } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { addAlertClient, getConnectedClientCount } from "../services/alertService";
import { generateCMBrief, generateHotspotNarrative, suggestOfficerAction, getGroqStatus, generateExecutiveReport } from "../services/groqService";
import * as dash from "../services/dashboardService";
import { Grievance } from "../models/Grievance";

const router = Router();

// ---------------------------------------------------------------------------
// SSE stream — CM + CMO team clients connect here for real-time alerts
// ---------------------------------------------------------------------------

router.get(
  "/alerts/stream",
  requireAuthSSE,
  (req, res) => {
    if (req.auth!.role !== "super_admin" && !req.auth!.permissions?.includes("receive_alerts")) {
      return res.status(403).json({ error: "Not authorized for alerts stream" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // prevent nginx buffering

    // Send initial connection confirmation
    res.write(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`);

    const clientId = crypto.randomUUID();
    addAlertClient(clientId, res, req.auth!.role);

    // Heartbeat every 30s to keep connection alive through proxies
    const heartbeat = setInterval(() => {
      try { res.write(":heartbeat\n\n"); } catch { clearInterval(heartbeat); }
    }, 30000);

    req.on("close", () => clearInterval(heartbeat));
  }
);

router.get(
  "/alerts/status",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({ connectedClients: getConnectedClientCount() });
  })
);

// ---------------------------------------------------------------------------
// Groq AI endpoints
// ---------------------------------------------------------------------------

router.get(
  "/groq/status",
  asyncHandler(async (_req, res) => {
    res.json(getGroqStatus());
  })
);

/** AI-generated CM daily brief (Hindi or English) — cached in process memory for 1 hour */
let briefCache: { data: string; lang: string; expiresAt: number } | null = null;

router.get(
  "/groq/cm-brief",
  requireAuth,
  asyncHandler(async (req, res) => {
    const lang = (req.query.lang as string) === "hi" ? "hi" : "en";

    if (briefCache && briefCache.lang === lang && briefCache.expiresAt > Date.now()) {
      return res.json({ brief: briefCache.data, cached: true });
    }

    const [overview, categories, districts, hotspots] = await Promise.all([
      dash.getOverviewStats(),
      dash.getCategoryBreakdown(),
      dash.getDistrictBreakdown(),
      dash.getHotspots(),
    ]);

    const brief = await generateCMBrief(
      {
        filedToday: overview.filedToday,
        pending: overview.pending,
        criticalOpen: overview.criticalOpen,
        lifeThreateningOpen: overview.lifeThreateningOpen,
        slaBreached: overview.slaBreached,
        resolvedWeek: overview.resolvedWeek,
        topCategories: categories.map((c: any) => ({ category: c.category, count: c.total })).slice(0, 5),
        topDistricts: districts.map((d: any) => ({ district: d.district, count: d.total, critical: d.critical })).slice(0, 5),
        hotspots: hotspots.map((h: any) => ({ district: h.district, category: h.category, count: h.count })).slice(0, 3),
      },
      lang
    );

    briefCache = { data: brief, lang, expiresAt: Date.now() + 3600_000 };
    res.json({ brief, cached: false });
  })
);

/**
 * Executive report — for senior government review. Directly answers the
 * original brief's MVP requirement: "Generate actionable reports and
 * accountability metrics for senior government review." This produces a
 * one-sitting-readable document (Executive Summary, Key Metrics, Top
 * Issues, Accountability Flags, Recommendations), not another dashboard
 * screen. Restricted to cmo_team/cm/super_admin — this is the artifact
 * that gets shared upward, so access is narrower than the live dashboards.
 */
router.get(
  "/groq/executive-report",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.auth!.role !== "super_admin" && !req.auth!.permissions?.includes("generate_executive_report")) {
      return res.status(403).json({ error: "Executive reports are restricted to roles with that permission" });
    }
    const lang = (req.query.lang as string) === "hi" ? "hi" : "en";

    const [overview, healthScore, falseClosure, categories, districts, predictiveAlerts, accountability] =
      await Promise.all([
        dash.getOverviewStats(),
        dash.getCityHealthScore(),
        dash.getFalseClosureMetrics(),
        dash.getCategoryBreakdown(),
        dash.getDistrictBreakdown(),
        dash.getPredictiveAlerts(),
        dash.getOfficerAccountabilityScores(),
      ]);

    const flaggedOfficers = (accountability as any[])
      .filter((o) => o.reviewRequired)
      .map((o) => ({ name: o.name, accountabilityScore: o.accountabilityScore, reopenRate: o.reopenRate }));

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400_000);
    const periodLabel = `${weekAgo.toISOString().slice(0, 10)} to ${now.toISOString().slice(0, 10)}`;

    const report = await generateExecutiveReport(
      {
        periodLabel,
        overview: {
          filedToday: overview.filedToday,
          pending: overview.pending,
          resolvedWeek: overview.resolvedWeek,
          criticalOpen: overview.criticalOpen,
          slaBreached: overview.slaBreached,
          awaitingConfirmation: overview.awaitingConfirmation,
        },
        healthScore,
        falseClosure: {
          officerReportedResolved: falseClosure.officerReportedResolved,
          citizenConfirmed: falseClosure.citizenConfirmed,
          citizenConfirmationRate: falseClosure.citizenConfirmationRate,
          citizenDisputed: falseClosure.citizenDisputed,
          photoMismatchFlags: falseClosure.photoMismatchFlags,
        },
        topCategories: (categories as any[]).map((c) => ({ category: c.category, total: c.total })),
        topDistricts: (districts as any[]).map((d) => ({ district: d.district, total: d.total, critical: d.critical })),
        predictiveAlerts: predictiveAlerts as any[],
        flaggedOfficers,
      },
      lang
    );

    res.json({ report, periodLabel, generatedAt: now.toISOString() });
  })
);

/** Groq action suggestion for a specific grievance */
router.get(
  "/groq/suggest/:grvId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const g = await Grievance.findOne({ grvId: req.params.grvId });
    if (!g) return res.status(404).json({ error: "Grievance not found" });

    const lang = (req.query.lang as string) === "hi" ? "hi" : "en";
    const suggestion = await suggestOfficerAction({
      description: g.descriptionRaw,
      category: g.category,
      district: g.district,
      address: g.address,
      priority: g.priority,
      language: lang,
    });

    res.json({ grvId: g.grvId, suggestion, lang });
  })
);

/** Groq hotspot narrative */
router.get(
  "/groq/hotspot-narrative",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { district, category, count, criticalCount, lang } = req.query as Record<string, string>;
    const narrative = await generateHotspotNarrative({
      district: district || "Delhi",
      category: category || "General",
      count: parseInt(count) || 1,
      criticalCount: parseInt(criticalCount) || 0,
      language: lang === "hi" ? "hi" : "en",
    });
    res.json({ narrative });
  })
);

/**
 * Predictive alert narration — the detection itself (week-over-week growth
 * rate) is deterministic math in dashboardService.getPredictiveAlerts().
 * Groq is used ONLY to phrase the finding in plain language; if Groq is
 * unavailable the raw numbers are still useful on their own.
 */
router.get(
  "/groq/predictive-narrative",
  requireAuth,
  asyncHandler(async (req, res) => {
    const lang = (req.query.lang as string) === "hi" ? "hi" : "en";
    const alerts = await dash.getPredictiveAlerts();
    if (alerts.length === 0) {
      return res.json({ narrative: lang === "hi" ? "कोई महत्वपूर्ण वृद्धि नहीं पाई गई।" : "No significant growth trends detected this week.", alerts });
    }
    const top = alerts[0];
    const narrative = await generateHotspotNarrative({
      district: top.district,
      category: top.category,
      count: top.thisWeek,
      criticalCount: 0,
      language: lang,
    });
    res.json({ narrative, alerts });
  })
);

export default router;
