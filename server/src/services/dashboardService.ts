import { Grievance } from "../models/Grievance";
import { User } from "../models/User";
import { Department } from "../models/Department";
import { isWithinRadius, LatLng } from "../utils/geo";

// ---------------------------------------------------------------------------
// Core stats
// ---------------------------------------------------------------------------

export async function getOverviewStats() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 86400_000);

  const [
    filedToday,
    pending,
    resolvedWeek,
    criticalOpen,
    lifeThreateningOpen,
    slaBreached,
    awaitingConfirmation,
  ] = await Promise.all([
    Grievance.countDocuments({ filedAt: { $gte: startOfToday } }),
    Grievance.countDocuments({
      status: { $nin: ["Confirmed Resolved", "Auto Closed"] },
    }),
    Grievance.countDocuments({
      status: "Confirmed Resolved",
      confirmedAt: { $gte: weekAgo },
    }),
    Grievance.countDocuments({
      priority: "Critical",
      status: { $nin: ["Confirmed Resolved", "Auto Closed"] },
    }),
    Grievance.countDocuments({
      isLifeThreatening: true,
      status: { $nin: ["Confirmed Resolved", "Auto Closed"] },
    }),
    Grievance.countDocuments({
      status: "Escalated",
    }),
    Grievance.countDocuments({ status: "Resolved Pending Confirmation" }),
  ]);

  return {
    filedToday,
    pending,
    resolvedWeek,
    criticalOpen,
    lifeThreateningOpen,
    slaBreached,
    awaitingConfirmation,
  };
}

// ---------------------------------------------------------------------------
// False-closure gap — the headline anti-corruption metric.
// Compares "officer says resolved" vs "citizen actually confirmed" so
// the CM dashboard surfaces the same kind of gap the Andhra Pradesh IVR
// audit exposed (90% officer-reported resolution vs 22% citizen
// satisfaction), instead of only ever showing the inflated number.
// ---------------------------------------------------------------------------

export async function getFalseClosureMetrics() {
  const officerReportedResolved = await Grievance.countDocuments({
    status: {
      $in: ["Resolved Pending Confirmation", "Confirmed Resolved", "Auto Closed", "Reopened"],
    },
  });

  const citizenConfirmed = await Grievance.countDocuments({ status: "Confirmed Resolved" });
  const citizenDisputed = await Grievance.countDocuments({
    "citizenFeedback.satisfied": false,
  });
  const autoClosedNoResponse = await Grievance.countDocuments({ status: "Auto Closed" });
  const photoMismatchFlags = await Grievance.countDocuments({
    "resolutionProof.locationMismatchFlag": true,
  });
  const totalReopens = await Grievance.aggregate([
    { $group: { _id: null, total: { $sum: "$reopenCount" } } },
  ]);

  const confirmationRate =
    officerReportedResolved > 0
      ? Math.round((citizenConfirmed / officerReportedResolved) * 1000) / 10
      : 0;

  return {
    officerReportedResolved,
    citizenConfirmed,
    citizenDisputed,
    autoClosedNoResponse,
    photoMismatchFlags,
    totalReopens: totalReopens[0]?.total ?? 0,
    citizenConfirmationRate: confirmationRate, // the metric that matters, not raw "resolved" count
  };
}

// ---------------------------------------------------------------------------
// Officer workload & bandwidth — "simple yet powerful employee dashboard
// fallback" + "officers contacts and bandwidth and active works overview"
// from the brief's good-to-have list.
// ---------------------------------------------------------------------------

export async function getOfficerWorkload(departmentCode?: string) {
  const deptFilter: Record<string, unknown> = { role: "field_officer", isActive: true };
  if (departmentCode) {
    const dept = await Department.findOne({ code: departmentCode });
    deptFilter.department = dept?._id || "__no_match__";
  }
  const officers = await User.find(deptFilter).populate(
    "department"
  );

  const results = await Promise.all(
    officers.map(async (officer) => {
      const [activeCount, criticalCount, resolvedTotal, reopenedOnThem, awaitingConfirm] =
        await Promise.all([
          Grievance.countDocuments({
            assignedOfficer: officer._id,
            status: { $nin: ["Confirmed Resolved", "Auto Closed"] },
          }),
          Grievance.countDocuments({
            assignedOfficer: officer._id,
            priority: "Critical",
            status: { $nin: ["Confirmed Resolved", "Auto Closed"] },
          }),
          Grievance.countDocuments({
            assignedOfficer: officer._id,
            status: "Confirmed Resolved",
          }),
          Grievance.countDocuments({
            assignedOfficer: officer._id,
            status: "Reopened",
          }),
          Grievance.countDocuments({
            assignedOfficer: officer._id,
            status: "Resolved Pending Confirmation",
          }),
        ]);

      return {
        officerId: officer._id,
        name: officer.name,
        phone: officer.phone,
        department: (officer.department as any)?.name ?? "Unassigned",
        activeCount,
        criticalCount,
        resolvedTotal,
        reopenedOnThem,
        awaitingConfirm,
        onLeave: (officer as any).onLeave || false,
        // Simple load flag the admin UI can color-code without any math:
        loadStatus: (officer as any).onLeave
          ? "On Leave"
          : activeCount > 15 ? "Overloaded" : activeCount > 8 ? "Busy" : "Available",
      };
    })
  );

  return results.sort((a, b) => b.activeCount - a.activeCount);
}

// ---------------------------------------------------------------------------
// Reopen-rate leaderboard — surfaces officers/departments whose "resolved"
// complaints get disputed most often, the core anti-gaming signal.
// ---------------------------------------------------------------------------

export async function getReopenRateLeaderboard() {
  const rows = await Grievance.aggregate([
    { $match: { assignedOfficer: { $exists: true } } },
    {
      $group: {
        _id: "$assignedOfficer",
        totalHandled: { $sum: 1 },
        totalReopens: { $sum: "$reopenCount" },
        confirmedResolved: {
          $sum: { $cond: [{ $eq: ["$status", "Confirmed Resolved"] }, 1, 0] },
        },
      },
    },
    { $match: { totalHandled: { $gte: 1 } } },
  ]);

  const officerIds = rows.map((r) => r._id);
  const officers = await User.find({ _id: { $in: officerIds } });
  const officerMap = new Map(officers.map((o) => [String(o._id), o]));

  return rows
    .map((r) => {
      const officer = officerMap.get(String(r._id));
      const reopenRate =
        r.totalHandled > 0 ? Math.round((r.totalReopens / r.totalHandled) * 1000) / 10 : 0;
      return {
        officerId: r._id,
        name: officer?.name ?? "Unknown",
        totalHandled: r.totalHandled,
        totalReopens: r.totalReopens,
        confirmedResolved: r.confirmedResolved,
        reopenRate,
        auditFlag: reopenRate > 20, // >20% reopen rate is a red flag worth a manual review
      };
    })
    .sort((a, b) => b.reopenRate - a.reopenRate);
}

// ---------------------------------------------------------------------------
// District / category / SLA breakdowns
// ---------------------------------------------------------------------------

export async function getDistrictBreakdown() {
  return Grievance.aggregate([
    {
      $group: {
        _id: "$district",
        total: { $sum: 1 },
        pending: {
          $sum: { $cond: [{ $not: [{ $in: ["$status", ["Confirmed Resolved", "Auto Closed"]] }] }, 1, 0] },
        },
        critical: { $sum: { $cond: [{ $eq: ["$priority", "Critical"] }, 1, 0] } },
      },
    },
    { $project: { district: "$_id", total: 1, pending: 1, critical: 1, _id: 0 } },
    { $sort: { total: -1 } },
  ]);
}

export async function getCategoryBreakdown() {
  return Grievance.aggregate([
    {
      $group: {
        _id: "$category",
        total: { $sum: 1 },
        pending: {
          $sum: { $cond: [{ $not: [{ $in: ["$status", ["Confirmed Resolved", "Auto Closed"]] }] }, 1, 0] },
        },
      },
    },
    { $project: { category: "$_id", total: 1, pending: 1, _id: 0 } },
    { $sort: { total: -1 } },
  ]);
}

export async function getDepartmentSlaReport() {
  const depts = await Department.find();
  const results = await Promise.all(
    depts.map(async (dept) => {
      const total = await Grievance.countDocuments({ department: dept._id });
      const confirmedResolved = await Grievance.countDocuments({
        department: dept._id,
        status: "Confirmed Resolved",
      });
      const onTimeResolved = await Grievance.countDocuments({
        department: dept._id,
        status: "Confirmed Resolved",
        $expr: { $lte: ["$resolvedAt", "$dueAt"] },
      });
      const slaPct = confirmedResolved > 0 ? Math.round((onTimeResolved / confirmedResolved) * 100) : 0;
      return {
        department: dept.name,
        code: dept.code,
        total,
        confirmedResolved,
        onTimeResolved,
        slaPct,
      };
    })
  );
  return results.sort((a, b) => b.total - a.total);
}

export async function getTrend(days = 14) {
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await Grievance.aggregate([
    { $match: { filedAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$filedAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const map = new Map(rows.map((r) => [r._id, r.count]));
  const result: Array<{ date: string; count: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    result.push({ date: d, count: map.get(d) ?? 0 });
  }
  return result;
}

export async function getHotspots(minCount = 4) {
  const since = new Date(Date.now() - 30 * 86400_000);
  return Grievance.aggregate([
    { $match: { filedAt: { $gte: since } } },
    {
      $group: {
        _id: { district: "$district", category: "$category" },
        count: { $sum: 1 },
        criticalCount: { $sum: { $cond: [{ $eq: ["$priority", "Critical"] }, 1, 0] } },
        departmentCode: { $first: "$departmentCode" },
      },
    },
    { $match: { count: { $gte: minCount } } },
    { $sort: { count: -1 } },
    { $limit: 12 },
    {
      $project: {
        district: "$_id.district",
        category: "$_id.category",
        count: 1,
        criticalCount: 1,
        departmentCode: 1,
        _id: 0,
      },
    },
  ]);
}

// ---------------------------------------------------------------------------
// Nearby grievances — "CM visit mode"
// ---------------------------------------------------------------------------

export async function getNearbyOpenGrievances(center: LatLng, radiusMeters: number) {
  // MongoDB can do this natively with a geo index; for an MVP without
  // a 2dsphere GeoJSON migration, we filter a bounded box first (cheap)
  // then refine with exact haversine distance (precise).
  const latDelta = radiusMeters / 111_000; // ~111km per degree latitude
  const lngDelta = radiusMeters / (111_000 * Math.cos((center.lat * Math.PI) / 180));

  const candidates = await Grievance.find({
    status: { $nin: ["Confirmed Resolved", "Auto Closed"] },
    lat: { $gte: center.lat - latDelta, $lte: center.lat + latDelta },
    lng: { $gte: center.lng - lngDelta, $lte: center.lng + lngDelta },
  }).limit(200);

  return candidates.filter((g) => isWithinRadius(center, { lat: g.lat, lng: g.lng }, radiusMeters));
}

// ---------------------------------------------------------------------------
// Predictive hotspot alerts — week-over-week growth detection.
//
// JANSETU's proposal claims an "AI predicts crisis 14 days out" feature.
// We implement the honest, defensible version of that idea: a transparent
// week-over-week growth-rate calculation per district+category (no opaque
// ML claims), surfaced as an early-warning signal. Anything growing >40%
// week-over-week with at least 4 complaints this week is flagged. Groq is
// used only to phrase the finding in plain language — the detection itself
// is deterministic and auditable, not a black-box prediction.
// ---------------------------------------------------------------------------

export interface PredictiveAlert {
  district: string;
  category: string;
  thisWeek: number;
  lastWeek: number;
  growthPct: number;
  departmentCode: string;
}

export async function getPredictiveAlerts(): Promise<PredictiveAlert[]> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400_000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400_000);

  const [thisWeekRows, lastWeekRows] = await Promise.all([
    Grievance.aggregate([
      { $match: { filedAt: { $gte: weekAgo, $lte: now } } },
      { $group: { _id: { district: "$district", category: "$category" }, count: { $sum: 1 }, departmentCode: { $first: "$departmentCode" } } },
    ]),
    Grievance.aggregate([
      { $match: { filedAt: { $gte: twoWeeksAgo, $lt: weekAgo } } },
      { $group: { _id: { district: "$district", category: "$category" }, count: { $sum: 1 } } },
    ]),
  ]);

  const lastWeekMap = new Map(
    lastWeekRows.map((r: any) => [`${r._id.district}|${r._id.category}`, r.count])
  );

  const alerts: PredictiveAlert[] = [];
  for (const row of thisWeekRows as any[]) {
    const key = `${row._id.district}|${row._id.category}`;
    const lastWeekCount = lastWeekMap.get(key) ?? 0;
    if (row.count < 4) continue; // ignore noise — too few complaints to mean anything
    const growthPct = lastWeekCount === 0 ? 100 : Math.round(((row.count - lastWeekCount) / lastWeekCount) * 100);
    if (growthPct >= 40) {
      alerts.push({
        district: row._id.district,
        category: row._id.category,
        thisWeek: row.count,
        lastWeek: lastWeekCount,
        growthPct,
        departmentCode: row.departmentCode,
      });
    }
  }
  return alerts.sort((a, b) => b.growthPct - a.growthPct).slice(0, 8);
}

// ---------------------------------------------------------------------------
// Delhi Health Score — a single composite number for the CM's mobile view.
//
// JANSETU's proposal calls this "Delhi Health Score: 92%" with no stated
// formula. We define ours explicitly and transparently, as a weighted
// blend of four measurable signals — so it's defensible under scrutiny,
// not a vibes-based number:
//   40% citizen confirmation rate   (the anti-false-closure metric)
//   25% on-time resolution rate     (SLA adherence)
//   20% (1 - escalation rate)       (how much breaches the system)
//   15% (1 - reopen rate)           (genuine fix rate)
// ---------------------------------------------------------------------------

export async function getCityHealthScore(): Promise<{
  score: number;
  components: { confirmationRate: number; onTimeRate: number; escalationRate: number; reopenRate: number };
}> {
  const [falseClosure, slaReport, overview] = await Promise.all([
    getFalseClosureMetrics(),
    getDepartmentSlaReport(),
    getOverviewStats(),
  ]);

  const totalFiled = await Grievance.countDocuments();
  const totalResolved = slaReport.reduce((s, d) => s + d.confirmedResolved, 0);
  const totalOnTime = slaReport.reduce((s, d) => s + d.onTimeResolved, 0);

  const confirmationRate = falseClosure.citizenConfirmationRate / 100;
  const onTimeRate = totalResolved > 0 ? totalOnTime / totalResolved : 0.5; // neutral prior with no data
  const escalationRate = totalFiled > 0 ? overview.slaBreached / totalFiled : 0;
  const reopenRate =
    falseClosure.officerReportedResolved > 0
      ? falseClosure.totalReopens / falseClosure.officerReportedResolved
      : 0;

  const score =
    confirmationRate * 0.4 + onTimeRate * 0.25 + (1 - escalationRate) * 0.2 + (1 - reopenRate) * 0.15;

  return {
    score: Math.round(Math.max(0, Math.min(1, score)) * 100),
    components: {
      confirmationRate: Math.round(confirmationRate * 100),
      onTimeRate: Math.round(onTimeRate * 100),
      escalationRate: Math.round(escalationRate * 100),
      reopenRate: Math.round(reopenRate * 100),
    },
  };
}

// ---------------------------------------------------------------------------
// Officer Accountability Score — combines reopen rate, citizen confirmation
// rate, and SLA adherence into one 0-100 score per officer, instead of
// surfacing reopen rate alone. This is the defensible version of CivicPulse's
// "Public Accountability Score" — every input is itself already computed
// and auditable elsewhere on this dashboard, so the composite can't hide
// a bad number behind a good one.
// ---------------------------------------------------------------------------

export async function getOfficerAccountabilityScores() {
  const officers = await User.find({ role: "field_officer", isActive: true });

  const scores = await Promise.all(
    officers.map(async (o) => {
      const totalHandled = await Grievance.countDocuments({ assignedOfficer: o._id });
      if (totalHandled === 0) return null;

      const confirmedResolved = await Grievance.countDocuments({ assignedOfficer: o._id, status: "Confirmed Resolved" });
      const reopened = await Grievance.countDocuments({ assignedOfficer: o._id, status: "Reopened" });
      const onTimeResolved = await Grievance.countDocuments({
        assignedOfficer: o._id,
        status: "Confirmed Resolved",
        $expr: { $lte: ["$resolvedAt", "$dueAt"] },
      });
      const mismatchFlags = await Grievance.countDocuments({
        assignedOfficer: o._id,
        "resolutionProof.locationMismatchFlag": true,
      });

      const confirmationRate = confirmedResolved / totalHandled;
      const onTimeRate = confirmedResolved > 0 ? onTimeResolved / confirmedResolved : 0.5;
      const reopenRate = reopened / totalHandled;
      const mismatchRate = mismatchFlags / totalHandled;

      const score =
        confirmationRate * 0.45 + onTimeRate * 0.25 + (1 - reopenRate) * 0.2 + (1 - mismatchRate) * 0.1;

      return {
        officerId: o._id,
        name: o.name,
        totalHandled,
        accountabilityScore: Math.round(Math.max(0, Math.min(1, score)) * 100),
        confirmationRate: Math.round(confirmationRate * 100),
        reopenRate: Math.round(reopenRate * 100),
        mismatchFlags,
        reviewRequired: reopenRate > 0.25 || mismatchRate > 0.15,
      };
    })
  );

  return scores.filter((s): s is NonNullable<typeof s> => s !== null).sort((a, b) => a.accountabilityScore - b.accountabilityScore);
}
