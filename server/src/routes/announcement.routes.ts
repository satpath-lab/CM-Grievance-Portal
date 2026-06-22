import { Router } from "express";
import { z } from "zod";
import { Announcement } from "../models/Announcement";
import { User } from "../models/User";
import { Department } from "../models/Department";
import { requireAuth, requirePermission, requireRole } from "../middleware/auth";
import { asyncHandler, AppError } from "../middleware/errorHandler";

const router = Router();

const createSchema = z.object({
  targetType: z.enum(["department", "officer", "all_officers"]),
  targetDepartmentCode: z.string().optional(),
  targetOfficerId: z.string().optional(),
  message: z.string().min(5),
  priority: z.enum(["Normal", "Urgent"]).default("Normal"),
});

router.post(
  "/",
  requireAuth,
  requirePermission("broadcast_announcements"),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);

    if (body.targetType === "department" && !body.targetDepartmentCode) {
      throw new AppError("targetDepartmentCode is required when targetType is department", 400);
    }
    if (body.targetType === "officer" && !body.targetOfficerId) {
      throw new AppError("targetOfficerId is required when targetType is officer", 400);
    }
    if (body.targetType === "officer") {
      const officer = await User.findById(body.targetOfficerId);
      if (!officer || officer.role !== "field_officer") {
        throw new AppError("targetOfficerId is not a valid field officer", 400);
      }
      // dept_admin can only message officers within their own department —
      // without this, a dept_admin could broadcast to any officer system-wide.
      if (req.auth!.role === "dept_admin") {
        const officerDept = await Department.findById(officer.department);
        if (officerDept?.code !== req.auth!.departmentCode) {
          throw new AppError("As a department admin, you can only message officers in your own department", 403);
        }
      }
    }
    if (req.auth!.role === "dept_admin") {
      // all_officers crosses every department by definition — not something
      // a single department's admin should be able to trigger.
      if (body.targetType === "all_officers") {
        throw new AppError("Department admins cannot broadcast to all officers system-wide", 403);
      }
      if (body.targetType === "department" && body.targetDepartmentCode !== req.auth!.departmentCode) {
        throw new AppError("As a department admin, you can only broadcast to your own department", 403);
      }
    }

    const announcement = await Announcement.create({
      ...body,
      fromUser: req.auth!.userId,
      fromUserName: req.auth!.name,
    });
    res.status(201).json(announcement);
  })
);

/** Sent announcements — admin-facing history */
router.get(
  "/",
  requireAuth,
  requirePermission("broadcast_announcements"),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    // dept_admin sees only what they sent themselves or what targeted
    // their own department/officers — not the system-wide history
    // cmo_team/super_admin get.
    if (req.auth!.role === "dept_admin") {
      filter.$or = [
        { fromUser: req.auth!.userId },
        { targetType: "department", targetDepartmentCode: req.auth!.departmentCode },
      ];
    }
    const announcements = await Announcement.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json(announcements);
  })
);

/** Announcements relevant to the logged-in officer: all_officers, their department, or specifically them */
router.get(
  "/my",
  requireAuth,
  requireRole("field_officer"),
  asyncHandler(async (req, res) => {
    const me = await User.findById(req.auth!.userId);
    let myDeptCode: string | null = null;
    if (me?.department) {
      const dept = await Department.findById(me.department);
      myDeptCode = dept?.code || null;
    }

    const orConditions: Record<string, unknown>[] = [
      { targetType: "all_officers" },
      { targetType: "officer", targetOfficerId: req.auth!.userId },
    ];
    if (myDeptCode) {
      orConditions.push({ targetType: "department", targetDepartmentCode: myDeptCode });
    }

    const announcements = await Announcement.find({ $or: orConditions })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(announcements);
  })
);

export default router;
