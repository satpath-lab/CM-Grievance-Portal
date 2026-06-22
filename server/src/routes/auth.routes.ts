import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { User, SYSTEM_ROLES } from "../models/User";
import { Department } from "../models/Department";
import { Role } from "../models/Role";
import { signToken, requireAuth } from "../middleware/auth";
import { asyncHandler, AppError } from "../middleware/errorHandler";

const router = Router();

/**
 * Resolves the permission set for a role code at register/login time, so
 * the JWT carries permissions without a DB hit on every later request.
 * citizen/field_officer/cm have no Role document (they use requireRole's
 * structural check, not permissions) and correctly resolve to an empty
 * array here — that's expected, not a bug.
 */
async function resolvePermissions(roleCode: string): Promise<string[]> {
  const role = await Role.findOne({ code: roleCode });
  return (role?.permissions as string[]) || [];
}

const registerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10).max(15),
  password: z.string().min(6),
  // Any system role, or any custom admin-tier role code a super_admin has
  // created — validated against the Role collection below, not a fixed
  // enum, since the valid set now grows at runtime.
  role: z.string().default("citizen"),
  departmentCode: z.string().optional(),
  preferredLanguage: z.enum(["en", "hi"]).default("en"),
});

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);

    const isSystemRole = (SYSTEM_ROLES as readonly string[]).includes(body.role);
    if (!isSystemRole) {
      const customRole = await Role.findOne({ code: body.role });
      if (!customRole) throw new AppError(`Unknown role "${body.role}"`, 400);
    }

    const existing = await User.findOne({ phone: body.phone });
    if (existing) throw new AppError("Phone number already registered", 409);

    let departmentId: string | undefined;
    if (body.departmentCode) {
      const dept = await Department.findOne({ code: body.departmentCode.toUpperCase() });
      if (!dept) throw new AppError("Unknown department code", 400);
      departmentId = String(dept._id);
    }

    if (["field_officer", "dept_admin"].includes(body.role) && !departmentId) {
      throw new AppError("departmentCode is required for officer/admin roles", 400);
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await User.create({
      name: body.name,
      phone: body.phone,
      passwordHash,
      role: body.role,
      department: departmentId,
      preferredLanguage: body.preferredLanguage,
    });

    const token = signToken({
      userId: String(user._id),
      role: user.role,
      name: user.name,
      department: departmentId,
      departmentCode: body.departmentCode?.toUpperCase(),
      permissions: await resolvePermissions(user.role) as any,
    });

    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, role: user.role, preferredLanguage: user.preferredLanguage },
    });
  })
);

const loginSchema = z.object({
  phone: z.string().min(10),
  password: z.string().min(1),
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const user = await User.findOne({ phone: body.phone });
    if (!user) throw new AppError("Invalid phone number or password", 401);

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) throw new AppError("Invalid phone number or password", 401);
    if (!user.isActive) throw new AppError("This account has been deactivated", 403);

    let loginDepartmentCode: string | undefined;
    if (user.department) {
      const dept = await Department.findById(user.department);
      loginDepartmentCode = dept?.code;
    }

    const token = signToken({
      userId: String(user._id),
      role: user.role,
      name: user.name,
      department: user.department ? String(user.department) : undefined,
      departmentCode: loginDepartmentCode,
      permissions: await resolvePermissions(user.role) as any,
    });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        preferredLanguage: user.preferredLanguage,
        department: user.department,
      },
    });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.auth!.userId).populate("department");
    if (!user) throw new AppError("User not found", 404);
    res.json({
      id: user._id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      preferredLanguage: user.preferredLanguage,
      department: user.department,
      onLeave: user.onLeave,
    });
  })
);

router.patch(
  "/me/language",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { preferredLanguage } = z.object({ preferredLanguage: z.enum(["en", "hi"]) }).parse(req.body);
    await User.findByIdAndUpdate(req.auth!.userId, { preferredLanguage });
    res.json({ preferredLanguage });
  })
);

export default router;
