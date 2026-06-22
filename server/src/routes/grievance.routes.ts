import { Router } from "express";
import { z } from "zod";
import { Grievance } from "../models/Grievance";
import { classifyGrievance } from "../nlp/classifier";
import { optionalAuth, requireAuth, requireRole, requirePermission } from "../middleware/auth";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import {
  fileGrievance,
  dispatchGrievance,
  assignOfficer,
  autoAssignOfficer,
  markResolvedByOfficer,
  citizenConfirmResolution,
  getTransferHistory,
  getSimilarComplaints,
  bulkResolveSimilar,
  reclassifyGrievance,
  requestDeadlineExtension,
  decideExtensionRequest,
  assertDepartmentScope,
} from "../services/grievanceService";

const router = Router();

// ---------------------------------------------------------------------------
// Live NLP preview — citizen sees category/priority/department/language
// BEFORE submitting, so the form feels responsive and builds trust that
// the system actually understood them (works for Hindi/Hinglish/English).
// ---------------------------------------------------------------------------

router.post(
  "/classify-preview",
  asyncHandler(async (req, res) => {
    const { description } = z.object({ description: z.string().min(3) }).parse(req.body);
    const result = classifyGrievance(description);
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// File a new grievance — no login required (citizen can file anonymously
// with just name + phone), but optionalAuth attaches citizenUserId if
// they happen to be logged in, for "my complaints" history.
// ---------------------------------------------------------------------------

const fileSchema = z.object({
  citizenName: z.string().min(2),
  citizenPhone: z.string().min(10).max(15),
  descriptionRaw: z.string().min(5),
  district: z.string().min(2),
  ward: z.string().optional(),
  address: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  channel: z.string().optional(),
  evidencePhotoUrl: z.string().optional(), // citizen's photo of the problem, base64 data URL or hosted URL
  preferredOfficerId: z.string().optional(), // citizen optionally tags a specific officer instead of leaving routing automatic
});

router.post(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const body = fileSchema.parse(req.body);
    const { grievance, classification, duplicate } = await fileGrievance({
      ...body,
      citizenUserId: req.auth?.userId,
      // If a logged-in field officer is filing (their own observation while
      // on a visit, not a citizen-reported complaint), record it distinctly.
      filedByOfficerId: req.auth?.role === "field_officer" ? req.auth.userId : undefined,
    });

    res.status(201).json({
      grvId: grievance.grvId,
      // Returned ONLY here, once, at filing time — the citizen must save
      // it (alongside their phone number) to track or confirm/dispute
      // this complaint later. Never returned by any other endpoint.
      trackingSecret: grievance.trackingSecret,
      category: classification.category,
      priority: classification.priority,
      department: classification.department,
      slaHours: classification.slaHours,
      dueAt: grievance.dueAt,
      detectedLanguage: classification.detectedLanguage,
      isLifeThreatening: classification.isLifeThreatening,
      possibleDuplicateOf: duplicate?.grvId ?? null,
    });
  })
);

// ---------------------------------------------------------------------------
// Track by grvId + phone + trackingSecret. Phone alone is not enough —
// see the comment on Grievance.trackingSecret for why a sequential grvId
// plus a guessable/known phone number isn't sufficient identity proof.
// ---------------------------------------------------------------------------

router.get(
  "/track/:grvId",
  asyncHandler(async (req, res) => {
    const { phone, secret } = z
      .object({ phone: z.string().min(10), secret: z.string().length(6) })
      .parse(req.query);
    const g = await Grievance.findOne({ grvId: req.params.grvId, citizenPhone: phone })
      .select("+trackingSecret")
      .populate("assignedOfficer", "name");
    if (!g || g.trackingSecret !== secret) {
      throw new AppError("No grievance found with this reference number, phone, and code", 404);
    }
    const obj = g.toObject();
    delete (obj as any).trackingSecret; // never serialize it back out

    // The forwarding chain — modeled on Jansunwai's citizen-visible
    // ledger of hand-offs. Every forward/response between officers on
    // this case, oldest first, so the citizen can see exactly what
    // happened to their complaint while it moved between desks.
    const transferHistory = await getTransferHistory(req.params.grvId);
    const similarComplaints = await getSimilarComplaints(req.params.grvId);

    res.json({ ...obj, transferHistory, similarComplaints });
  })
);

// ---------------------------------------------------------------------------
// List / filter (admin, cmo_team, cm, dept_admin, field_officer)
// ---------------------------------------------------------------------------

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        status: z.string().optional(),
        priority: z.string().optional(),
        category: z.string().optional(),
        district: z.string().optional(),
        departmentCode: z.string().optional(),
        assignedOfficer: z.string().optional(),
        search: z.string().optional(),
        page: z.coerce.number().min(1).default(1),
        perPage: z.coerce.number().min(5).max(100).default(20),
      })
      .parse(req.query);

    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.priority) filter.priority = q.priority;
    if (q.category) filter.category = q.category;
    if (q.district) filter.district = q.district;
    if (q.departmentCode) filter.departmentCode = q.departmentCode;
    if (q.assignedOfficer) filter.assignedOfficer = q.assignedOfficer;
    if (q.search) {
      filter.$or = [
        { descriptionRaw: { $regex: q.search, $options: "i" } },
        { grvId: { $regex: q.search, $options: "i" } },
        { citizenName: { $regex: q.search, $options: "i" } },
      ];
    }

    // field_officer can only ever see their own queue regardless of query params
    if (req.auth!.role === "field_officer") {
      filter.assignedOfficer = req.auth!.userId;
    }
    // dept_admin is scoped to their own department — without this, a
    // dept_admin had identical reach to cmo_team under a different name.
    if (req.auth!.role === "dept_admin") {
      filter.departmentCode = req.auth!.departmentCode || "__no_department_configured__";
    }

    const total = await Grievance.countDocuments(filter);
    const items = await Grievance.find(filter)
      .sort({ filedAt: -1 })
      .skip((q.page - 1) * q.perPage)
      .limit(q.perPage);

    res.json({
      total,
      page: q.page,
      perPage: q.perPage,
      pages: Math.max(1, Math.ceil(total / q.perPage)),
      items,
    });
  })
);

router.get(
  "/:grvId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const g = await Grievance.findOne({ grvId: req.params.grvId })
      .populate("department")
      .populate("assignedOfficer", "name phone")
      .populate("requestedOfficer", "name");
    if (!g) throw new AppError("Grievance not found", 404);
    const transferHistory = await getTransferHistory(req.params.grvId);
    res.json({ ...g.toObject(), transferHistory });
  })
);

// ---------------------------------------------------------------------------
// Dispatch / assign (cmo_team, dept_admin, super_admin)
// ---------------------------------------------------------------------------

/**
 * Manual re-classification — for fixing AI mistakes. See
 * grievanceService.ts reclassifyGrievance() for the full rationale.
 */
const reclassifySchema = z.object({
  newCategory: z.string().min(2),
  newDepartmentCode: z.string().min(2),
  newPriority: z.enum(["Critical", "High", "Normal"]).optional(),
  reason: z.string().min(5),
});

router.post(
  "/:grvId/reclassify",
  requireAuth,
  requirePermission("dispatch_grievance"),
  asyncHandler(async (req, res) => {
    const body = reclassifySchema.parse(req.body);
    const existing = await Grievance.findOne({ grvId: req.params.grvId });
    if (!existing) throw new AppError("Grievance not found", 404);
    assertDepartmentScope(req.auth!, existing.departmentCode);
    const g = await reclassifyGrievance({
      grvId: req.params.grvId,
      ...body,
      staffName: req.auth!.name,
    });
    res.json(g);
  })
);

/**
 * Officer requests a deadline extension; CMO/admin approves or denies.
 * See requestDeadlineExtension/decideExtensionRequest in
 * grievanceService.ts — the dueAt clock only moves on approval.
 */
const extensionRequestSchema = z.object({
  requestedHours: z.number().min(1).max(720),
  reason: z.string().min(5),
});

router.post(
  "/:grvId/request-extension",
  requireAuth,
  requireRole("field_officer"),
  asyncHandler(async (req, res) => {
    const body = extensionRequestSchema.parse(req.body);
    const g = await requestDeadlineExtension({
      grvId: req.params.grvId,
      officerId: req.auth!.userId,
      officerName: req.auth!.name,
      ...body,
    });
    res.json(g);
  })
);

router.post(
  "/:grvId/extension/decide",
  requireAuth,
  requirePermission("dispatch_grievance"),
  asyncHandler(async (req, res) => {
    const existing = await Grievance.findOne({ grvId: req.params.grvId });
    if (!existing) throw new AppError("Grievance not found", 404);
    assertDepartmentScope(req.auth!, existing.departmentCode);
    const { approve } = z.object({ approve: z.boolean() }).parse(req.body);
    const g = await decideExtensionRequest({
      grvId: req.params.grvId,
      approve,
      decidedBy: req.auth!.name,
    });
    res.json(g);
  })
);

router.post(
  "/:grvId/dispatch",
  requireAuth,
  requirePermission("dispatch_grievance"),
  asyncHandler(async (req, res) => {
    const existing = await Grievance.findOne({ grvId: req.params.grvId });
    if (!existing) throw new AppError("Grievance not found", 404);
    assertDepartmentScope(req.auth!, existing.departmentCode);
    const { note } = z.object({ note: z.string().optional() }).parse(req.body);
    const result = await dispatchGrievance(req.params.grvId, req.auth!.name, note);
    res.json(result);
  })
);

router.post(
  "/:grvId/assign-officer",
  requireAuth,
  requirePermission("assign_officer"),
  asyncHandler(async (req, res) => {
    const existing = await Grievance.findOne({ grvId: req.params.grvId });
    if (!existing) throw new AppError("Grievance not found", 404);
    assertDepartmentScope(req.auth!, existing.departmentCode);
    const { officerId } = z.object({ officerId: z.string() }).parse(req.body);
    const g = await assignOfficer(req.params.grvId, officerId, req.auth!.name);
    res.json(g);
  })
);

/**
 * Auto-assign to the least-loaded active officer in the grievance's
 * department, instead of requiring a manual dropdown pick every time.
 * See findLeastLoadedOfficer() in grievanceService.ts.
 */
router.post(
  "/:grvId/auto-assign-officer",
  requireAuth,
  requirePermission("assign_officer"),
  asyncHandler(async (req, res) => {
    const existing = await Grievance.findOne({ grvId: req.params.grvId });
    if (!existing) throw new AppError("Grievance not found", 404);
    assertDepartmentScope(req.auth!, existing.departmentCode);
    const g = await autoAssignOfficer(req.params.grvId, req.auth!.name);
    res.json(g);
  })
);

// ---------------------------------------------------------------------------
// Officer marks resolved — geotagged photo required, location-checked
// ---------------------------------------------------------------------------

const resolveSchema = z.object({
  photoUrl: z.string().min(3),
  officerLat: z.number(),
  officerLng: z.number(),
  note: z.string().optional(),
});

router.post(
  "/:grvId/resolve",
  requireAuth,
  requireRole("field_officer"),
  asyncHandler(async (req, res) => {
    const body = resolveSchema.parse(req.body);
    const result = await markResolvedByOfficer({
      grvId: req.params.grvId,
      officerId: req.auth!.userId,
      officerName: req.auth!.name,
      ...body,
    });
    res.json(result);
  })
);

/**
 * Similar complaints nearby — same category, same area, recent. NOT a
 * deduplication/merge: every complaint here is its own fully independent
 * record. This is read-only visibility so an officer (or citizen) can
 * see "is this one of many reports of the same physical issue."
 */
router.get(
  "/:grvId/similar",
  requireAuth,
  asyncHandler(async (req, res) => {
    const similar = await getSimilarComplaints(req.params.grvId);
    res.json(similar);
  })
);

const bulkResolveSchema = z.object({
  grvIds: z.array(z.string()).min(1).max(30),
  photoUrl: z.string().min(3),
  officerLat: z.number(),
  officerLng: z.number(),
  note: z.string().optional(),
});

router.post(
  "/bulk-resolve-similar",
  requireAuth,
  requireRole("field_officer"),
  asyncHandler(async (req, res) => {
    const body = bulkResolveSchema.parse(req.body);
    const results = await bulkResolveSimilar({
      grvIds: body.grvIds,
      officerId: req.auth!.userId,
      officerName: req.auth!.name,
      photoUrl: body.photoUrl,
      officerLat: body.officerLat,
      officerLng: body.officerLng,
      note: body.note,
    });
    res.json(results);
  })
);

/**
 * Bulk admin actions — "bulk priority messages" from the brief. A CMO/
 * dept_admin handling a crisis (e.g. a heatwave driving a spike in water
 * complaints) can select many grievances at once and change their
 * priority, dispatch them all, or assign them all to one officer/
 * department, instead of clicking through each individually.
 */
const bulkPrioritySchema = z.object({
  grvIds: z.array(z.string()).min(1).max(100),
  priority: z.enum(["Critical", "High", "Normal"]),
});

router.post(
  "/bulk-priority",
  requireAuth,
  requirePermission("dispatch_grievance"),
  asyncHandler(async (req, res) => {
    const body = bulkPrioritySchema.parse(req.body);
    const filter: Record<string, unknown> = { grvId: { $in: body.grvIds } };
    // dept_admin can only bulk-edit within their own department — silently
    // excluded from the update rather than erroring the whole batch, so
    // one out-of-scope id in a list of 50 doesn't block the other 49.
    if (req.auth!.role === "dept_admin") {
      filter.departmentCode = req.auth!.departmentCode || "__no_department_configured__";
    }
    const result = await Grievance.updateMany(filter, { $set: { priority: body.priority } });
    res.json({ matched: result.matchedCount, modified: result.modifiedCount });
  })
);

const bulkDispatchSchema = z.object({
  grvIds: z.array(z.string()).min(1).max(100),
});

router.post(
  "/bulk-dispatch",
  requireAuth,
  requirePermission("dispatch_grievance"),
  asyncHandler(async (req, res) => {
    const body = bulkDispatchSchema.parse(req.body);
    const results: Array<{ grvId: string; ok: boolean; error?: string }> = [];
    for (const grvId of body.grvIds) {
      try {
        const existing = await Grievance.findOne({ grvId });
        if (!existing) throw new AppError("Not found", 404);
        assertDepartmentScope(req.auth!, existing.departmentCode);
        await dispatchGrievance(grvId, req.auth!.name, "Bulk dispatch");
        results.push({ grvId, ok: true });
      } catch (err) {
        results.push({ grvId, ok: false, error: (err as Error).message });
      }
    }
    res.json(results);
  })
);

const bulkAssignSchema = z.object({
  grvIds: z.array(z.string()).min(1).max(100),
  officerId: z.string(),
});

router.post(
  "/bulk-assign",
  requireAuth,
  requirePermission("assign_officer"),
  asyncHandler(async (req, res) => {
    const body = bulkAssignSchema.parse(req.body);
    const results: Array<{ grvId: string; ok: boolean; error?: string }> = [];
    for (const grvId of body.grvIds) {
      try {
        const existing = await Grievance.findOne({ grvId });
        if (!existing) throw new AppError("Not found", 404);
        assertDepartmentScope(req.auth!, existing.departmentCode);
        await assignOfficer(grvId, body.officerId, req.auth!.name);
        results.push({ grvId, ok: true });
      } catch (err) {
        results.push({ grvId, ok: false, error: (err as Error).message });
      }
    }
    res.json(results);
  })
);

// ---------------------------------------------------------------------------
// Citizen confirms or disputes — the anti-false-closure control point.
// This is the single most security-sensitive endpoint in the system: a
// false "confirmed" here would cover up a real false closure, which is
// exactly the failure mode the whole platform exists to prevent. Phone
// number alone is not adequate proof — see Grievance.trackingSecret.
// ---------------------------------------------------------------------------

const confirmSchema = z.object({
  satisfied: z.boolean(),
  comment: z.string().optional(),
  phone: z.string().min(10),
  secret: z.string().length(6),
});

router.post(
  "/:grvId/confirm",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const body = confirmSchema.parse(req.body);
    const g = await Grievance.findOne({ grvId: req.params.grvId }).select("+trackingSecret");
    if (!g) throw new AppError("Grievance not found", 404);
    if (g.citizenPhone !== body.phone || g.trackingSecret !== body.secret) {
      throw new AppError("Phone number or code does not match the original complainant", 403);
    }
    const updated = await citizenConfirmResolution(
      req.params.grvId,
      body.satisfied,
      body.comment,
      req.auth?.userId || body.phone
    );
    res.json(updated);
  })
);

export default router;
