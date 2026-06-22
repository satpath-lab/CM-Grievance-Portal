import { Router } from "express";
import { z } from "zod";
import { Grievance } from "../models/Grievance";
import { User } from "../models/User";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { forwardGrievance, respondToTransfer } from "../services/grievanceService";
import { GrievanceTransfer } from "../models/GrievanceTransfer";

/**
 * The officer-facing fallback dashboard required by the brief:
 * "simple yet powerful employee dashboard as a fallback if we don't
 * get APIs, where employees can see its assigned complaints by CM."
 *
 * This works standalone with zero external dependencies — it is the
 * one screen that MUST function even if every other integration
 * (MCD311, social media, etc.) is unavailable, since it's how a field
 * officer with no other system access still gets their work queue.
 */

const router = Router();

router.get(
  "/my-queue",
  requireAuth,
  requireRole("field_officer"),
  asyncHandler(async (req, res) => {
    const items = await Grievance.find({
      assignedOfficer: req.auth!.userId,
      status: { $nin: ["Confirmed Resolved", "Auto Closed"] },
    }).sort({ filedAt: 1 }); // oldest first — work the backlog down

    const counts = {
      total: items.length,
      critical: items.filter((g) => g.priority === "Critical").length,
      lifeThreatening: items.filter((g) => g.isLifeThreatening).length,
      awaitingMyAction: items.filter((g) =>
        ["Assigned", "In Progress", "Reopened", "Escalated"].includes(g.status)
      ).length,
    };

    res.json({ counts, items });
  })
);

router.post(
  "/:grvId/start-progress",
  requireAuth,
  requireRole("field_officer"),
  asyncHandler(async (req, res) => {
    const g = await Grievance.findOne({ grvId: req.params.grvId, assignedOfficer: req.auth!.userId });
    if (!g) throw new AppError("Grievance not found in your queue", 404);
    g.status = "In Progress";
    await g.save();
    res.json(g);
  })
);

router.get(
  "/contacts",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const officers = await User.find({ role: "field_officer", isActive: true })
      .select("name phone department")
      .populate("department", "name code");
    res.json(officers);
  })
);

/**
 * Public officer directory — NO AUTH, deliberately privacy-limited.
 * Used by the citizen filing form so they can optionally tag a specific
 * officer (e.g. one they dealt with before) instead of leaving routing
 * fully automatic. Name and department only — phone numbers are never
 * exposed to citizens at this stage, unlike the authenticated /contacts
 * endpoint above which staff use internally.
 */
/**
 * Self-service leave/availability toggle. Excluded from auto-assignment
 * (findLeastLoadedOfficer) while true, so cases don't keep silently
 * piling onto someone who's out — admins also see this reflected on
 * the workload dashboard.
 */
router.patch(
  "/availability",
  requireAuth,
  requireRole("field_officer"),
  asyncHandler(async (req, res) => {
    const { onLeave } = z.object({ onLeave: z.boolean() }).parse(req.body);
    const user = await User.findByIdAndUpdate(req.auth!.userId, { onLeave }, { new: true }).select("name onLeave");
    res.json(user);
  })
);

router.get(
  "/public-directory",
  asyncHandler(async (req, res) => {
    const { departmentCode } = z.object({ departmentCode: z.string().optional() }).parse(req.query);
    const filter: Record<string, unknown> = { role: "field_officer", isActive: true };
    const officers = await User.find(filter)
      .select("name department")
      .populate("department", "name code");

    const filtered = departmentCode
      ? officers.filter((o: any) => o.department?.code === departmentCode)
      : officers;

    res.json(filtered.map((o: any) => ({ id: o._id, name: o.name, department: o.department?.name, departmentCode: o.department?.code })));
  })
);

/**
 * Forward a case to another officer — see models/GrievanceTransfer.ts
 * for the full rationale (modeled on Jansunwai's transparent hand-off
 * ledger). Only the officer currently assigned can forward; ownership
 * actually moves to the receiving officer.
 */
const forwardSchema = z.object({
  toOfficerId: z.string(),
  instruction: z.string().min(5),
  expectedResponseHours: z.number().min(1).max(720).optional(),
});

router.post(
  "/:grvId/forward",
  requireAuth,
  requireRole("field_officer"),
  asyncHandler(async (req, res) => {
    const body = forwardSchema.parse(req.body);
    const transfer = await forwardGrievance({
      grvId: req.params.grvId,
      fromOfficerId: req.auth!.userId,
      toOfficerId: body.toOfficerId,
      instruction: body.instruction,
      expectedResponseHours: body.expectedResponseHours,
    });
    res.status(201).json(transfer);
  })
);

/** Cases forwarded TO me, awaiting my response */
router.get(
  "/forwarded-to-me",
  requireAuth,
  requireRole("field_officer"),
  asyncHandler(async (req, res) => {
    const transfers = await GrievanceTransfer.find({ toOfficer: req.auth!.userId }).sort({ forwardedAt: -1 });
    res.json(transfers);
  })
);

const respondSchema = z.object({
  response: z.string().min(5),
  responsePhotoUrl: z.string().optional(),
});

router.post(
  "/transfers/:transferId/respond",
  requireAuth,
  requireRole("field_officer"),
  asyncHandler(async (req, res) => {
    const body = respondSchema.parse(req.body);
    const transfer = await respondToTransfer({
      transferId: req.params.transferId,
      officerId: req.auth!.userId,
      response: body.response,
      responsePhotoUrl: body.responsePhotoUrl,
    });
    res.json(transfer);
  })
);

export default router;
