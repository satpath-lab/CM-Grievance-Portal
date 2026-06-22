import { Router } from "express";
import { z } from "zod";
import { User, SYSTEM_ROLES } from "../models/User";
import { Role } from "../models/Role";
import { requireAuth, requirePermission } from "../middleware/auth";
import { asyncHandler, AppError } from "../middleware/errorHandler";

/**
 * User management — the missing piece that makes role assignment usable.
 * Without this, a super_admin could create a custom role through
 * role.routes.ts but had no way to actually put anyone in it.
 */

const router = Router();

router.use(requireAuth, requirePermission("manage_users"));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = z.object({ role: z.string().optional() }).parse(req.query);
    const filter = q.role ? { role: q.role } : {};
    const users = await User.find(filter)
      .select("-passwordHash")
      .populate("department", "name code")
      .sort({ createdAt: -1 });
    res.json(users);
  })
);

const reassignSchema = z.object({ role: z.string() });

router.patch(
  "/:id/role",
  asyncHandler(async (req, res) => {
    const body = reassignSchema.parse(req.body);

    const isSystemRole = (SYSTEM_ROLES as readonly string[]).includes(body.role);
    if (!isSystemRole) {
      const customRole = await Role.findOne({ code: body.role });
      if (!customRole) throw new AppError(`Unknown role "${body.role}"`, 400);
    }
    // Deliberately do NOT allow reassigning into/out of citizen or
    // field_officer here — those carry structural requirements (a
    // citizen has no password-based account at all in the normal flow;
    // a field_officer needs a department) that this generic endpoint
    // isn't equipped to validate. This endpoint is for moving someone
    // between admin-tier roles (cmo_team, dept_admin, cm, or any custom
    // role), which is the actual "different dashboard types" use case.
    if (body.role === "citizen" || body.role === "field_officer") {
      throw new AppError(
        "Use /api/auth/register for citizen/field_officer accounts — this endpoint is for admin-tier role reassignment only",
        400
      );
    }

    const user = await User.findById(req.params.id);
    if (!user) throw new AppError("User not found", 404);
    if (user.role === "citizen" || user.role === "field_officer") {
      throw new AppError("Cannot reassign a citizen or field_officer account through this endpoint", 400);
    }

    // Safeguard: never allow the last active super_admin to be demoted.
    // Without this, a super_admin could accidentally lock the entire
    // system out of role/user/permission management with no way back in
    // short of direct database access.
    if (user.role === "super_admin" && body.role !== "super_admin") {
      const otherSuperAdmins = await User.countDocuments({
        role: "super_admin",
        isActive: true,
        _id: { $ne: user._id },
      });
      if (otherSuperAdmins === 0) {
        throw new AppError(
          "Cannot demote the last active super_admin — promote another user first",
          400
        );
      }
    }

    user.role = body.role;
    await user.save();
    res.json({ id: user._id, name: user.name, role: user.role });
  })
);

router.patch(
  "/:id/active",
  asyncHandler(async (req, res) => {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);

    if (!isActive) {
      const target = await User.findById(req.params.id);
      if (target?.role === "super_admin") {
        const otherActiveSuperAdmins = await User.countDocuments({
          role: "super_admin",
          isActive: true,
          _id: { $ne: target._id },
        });
        if (otherActiveSuperAdmins === 0) {
          throw new AppError("Cannot deactivate the last active super_admin", 400);
        }
      }
    }

    const user = await User.findByIdAndUpdate(req.params.id, { isActive }, { new: true }).select("-passwordHash");
    if (!user) throw new AppError("User not found", 404);
    res.json(user);
  })
);

export default router;
