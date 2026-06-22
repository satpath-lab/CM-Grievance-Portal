import { Router } from "express";
import { requireAuth, requirePermission } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import * as dash from "../services/dashboardService";

const router = Router();

/**
 * Public transparency endpoint — NO AUTH REQUIRED.
 *
 * The brief explicitly lists "Transparency" as an MVP capability, but
 * until now every dashboard endpoint required staff login — there was
 * no city-wide view for the public or press, only an individual citizen's
 * own tracked complaint. This closes that gap with data that is verified
 * safe to expose publicly: aggregate counts only, no citizen names, no
 * phone numbers, no individual officer names or scores (those stay
 * staff-only via /officer-accountability and /reopen-leaderboard above).
 * Department names are fine to show — they're government bodies, not
 * individuals.
 */
router.get(
  "/public",
  asyncHandler(async (_req, res) => {
    const [overview, healthScore, categories, districts, departmentSla, trend] = await Promise.all([
      dash.getOverviewStats(),
      dash.getCityHealthScore(),
      dash.getCategoryBreakdown(),
      dash.getDistrictBreakdown(),
      dash.getDepartmentSlaReport(),
      dash.getTrend(30),
    ]);

    res.json({
      // No PII whatsoever — every field below is a count or a percentage.
      totalFiled: overview.filedToday, // today's count only, not cumulative-with-names
      pending: overview.pending,
      resolvedThisWeek: overview.resolvedWeek,
      healthScore: healthScore.score,
      healthScoreComponents: healthScore.components,
      categories: categories.map((c: any) => ({ category: c.category, total: c.total })),
      districts: districts.map((d: any) => ({ district: d.district, total: d.total })), // critical count omitted — could be used to infer specific incidents
      departmentPerformance: departmentSla.map((d: any) => ({
        department: d.department,
        code: d.code,
        totalHandled: d.total,
        onTimePercent: d.slaPct,
      })),
      trend30Days: trend,
      generatedAt: new Date().toISOString(),
    });
  })
);

// All routes below require staff login. Field officers get their own
// workload entry implicitly through /officer routes, not this admin set.
router.use(requireAuth, requirePermission("view_dashboard"));

router.get("/overview", asyncHandler(async (_req, res) => res.json(await dash.getOverviewStats())));
router.get("/false-closure", asyncHandler(async (_req, res) => res.json(await dash.getFalseClosureMetrics())));
router.get("/officer-workload", asyncHandler(async (req, res) =>
  res.json(await dash.getOfficerWorkload(req.auth!.role === "dept_admin" ? req.auth!.departmentCode : undefined))
));
router.get("/reopen-leaderboard", asyncHandler(async (_req, res) => res.json(await dash.getReopenRateLeaderboard())));
router.get("/officer-accountability", asyncHandler(async (_req, res) => res.json(await dash.getOfficerAccountabilityScores())));
router.get("/health-score", asyncHandler(async (_req, res) => res.json(await dash.getCityHealthScore())));
router.get("/predictive-alerts", asyncHandler(async (_req, res) => res.json(await dash.getPredictiveAlerts())));
router.get("/districts", asyncHandler(async (_req, res) => res.json(await dash.getDistrictBreakdown())));
router.get("/categories", asyncHandler(async (_req, res) => res.json(await dash.getCategoryBreakdown())));
router.get("/department-sla", asyncHandler(async (_req, res) => res.json(await dash.getDepartmentSlaReport())));
router.get("/hotspots", asyncHandler(async (_req, res) => res.json(await dash.getHotspots())));

router.get(
  "/trend",
  asyncHandler(async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 14;
    res.json(await dash.getTrend(days));
  })
);

export default router;
