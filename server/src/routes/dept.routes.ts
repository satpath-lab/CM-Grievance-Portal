import { Router } from "express";
import { z } from "zod";
import { Department } from "../models/Department";
import { requireAuth, requirePermission } from "../middleware/auth";
import { asyncHandler, AppError } from "../middleware/errorHandler";

/**
 * The brief explicitly requires: "super easy to add more complaint
 * types, more departments, responsible officers, etc." Departments are
 * pure config data here — adding one is a single POST, no code change,
 * no redeploy. New categories still need a classifier training-data
 * update to route automatically, but a department can exist and accept
 * manually-routed complaints immediately.
 */

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    // This route is intentionally public — citizens' filing form and the
    // public transparency page both need department names. openApiKey is
    // a real credential (a department's own Open311-style integration
    // key) and must NEVER be in a response anyone can fetch without
    // logging in. Excluded explicitly rather than relying on the
    // schema's default projection, since "select: false" wasn't set on
    // that field and the previous version of this route returned the
    // full document including it.
    const departments = await Department.find().select("-openApiKey");
    res.json(departments);
  })
);

const upsertSchema = z.object({
  name: z.string().min(2),
  nameHi: z.string().min(2),
  code: z.string().min(2).max(8),
  headName: z.string().optional(),
  headPhone: z.string().optional(),
  categories: z.array(z.string()).default([]),
  defaultSlaHours: z.number().min(1).default(48),
  openApiBaseUrl: z.string().url().optional(),
  openApiKey: z.string().optional(),
});

router.post(
  "/",
  requireAuth,
  requirePermission("manage_departments"),
  asyncHandler(async (req, res) => {
    const body = upsertSchema.parse(req.body);
    const existing = await Department.findOne({ code: body.code.toUpperCase() });
    if (existing) throw new AppError("Department code already exists", 409);
    const dept = await Department.create({ ...body, code: body.code.toUpperCase() });
    res.status(201).json(dept);
  })
);

router.patch(
  "/:code",
  requireAuth,
  requirePermission("manage_departments"),
  asyncHandler(async (req, res) => {
    const body = upsertSchema.partial().parse(req.body);
    const dept = await Department.findOneAndUpdate(
      { code: req.params.code.toUpperCase() },
      body,
      { new: true }
    );
    if (!dept) throw new AppError("Department not found", 404);
    res.json(dept);
  })
);

export default router;
