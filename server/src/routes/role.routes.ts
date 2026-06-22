import { Router } from "express";
import { z } from "zod";
import { Role, PERMISSION_CATALOG } from "../models/Role";
import { User, SYSTEM_ROLES } from "../models/User";
import { requireAuth, requirePermission } from "../middleware/auth";
import { asyncHandler, AppError } from "../middleware/errorHandler";

/**
 * Role management — what makes "create as many dashboard types as
 * needed for different officials" real rather than aspirational.
 * A super_admin (or anyone explicitly granted manage_roles) picks a
 * subset of PERMISSION_CATALOG, names it, and that becomes assignable
 * to any user via /api/users/:id/role below. The permission catalog
 * itself is fixed code, not configurable — only which bundle of those
 * fixed permissions a given role grants is dynamic.
 */

const router = Router();

router.use(requireAuth, requirePermission("manage_roles"));

router.get(
  "/permission-catalog",
  asyncHandler(async (_req, res) => res.json(PERMISSION_CATALOG))
);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const roles = await Role.find().sort({ isSystem: -1, code: 1 });
    res.json(roles);
  })
);

const createSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9_]+$/, "code must be lowercase letters, numbers, and underscores only"),
  label: z.string().min(2),
  labelHi: z.string().min(2),
  permissions: z.array(
    z.enum(PERMISSION_CATALOG.map((p) => p.key) as [string, ...string[]])
  ),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);

    if ((SYSTEM_ROLES as readonly string[]).includes(body.code)) {
      throw new AppError(`"${body.code}" is a reserved system role code`, 409);
    }
    const existing = await Role.findOne({ code: body.code });
    if (existing) throw new AppError("A role with this code already exists", 409);

    const role = await Role.create({
      ...body,
      isSystem: false,
      createdBy: req.auth!.name,
    });
    res.status(201).json(role);
  })
);

const updateSchema = z.object({
  label: z.string().min(2).optional(),
  labelHi: z.string().min(2).optional(),
  permissions: z
    .array(z.enum(PERMISSION_CATALOG.map((p) => p.key) as [string, ...string[]]))
    .optional(),
});

router.patch(
  "/:code",
  asyncHandler(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const role = await Role.findOne({ code: req.params.code });
    if (!role) throw new AppError("Role not found", 404);
    if (role.isSystem) {
      throw new AppError("System roles cannot be edited — create a custom role instead", 403);
    }
    Object.assign(role, body);
    await role.save();
    res.json(role);
  })
);

router.delete(
  "/:code",
  asyncHandler(async (req, res) => {
    const role = await Role.findOne({ code: req.params.code });
    if (!role) throw new AppError("Role not found", 404);
    if (role.isSystem) throw new AppError("System roles cannot be deleted", 403);

    const usersWithRole = await User.countDocuments({ role: req.params.code });
    if (usersWithRole > 0) {
      throw new AppError(
        `Cannot delete — ${usersWithRole} user(s) currently have this role. Reassign them first.`,
        409
      );
    }
    await role.deleteOne();
    res.json({ deleted: true });
  })
);

export default router;
