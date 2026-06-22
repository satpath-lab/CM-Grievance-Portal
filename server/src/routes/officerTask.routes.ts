import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { OfficerTask } from "../models/OfficerTask";
import { User } from "../models/User";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler, AppError } from "../middleware/errorHandler";

/**
 * Officer-to-officer task tagging. See models/OfficerTask.ts for the
 * full rationale. All endpoints require field_officer (a dept_admin
 * delegating to officers is a separate, existing flow via grievance
 * assign-officer — this is specifically peer-to-peer).
 */

const router = Router();

router.use(requireAuth, requireRole("field_officer"));

const createSchema = z.object({
  toOfficerId: z.string(),
  title: z.string().min(3),
  instructions: z.string().min(5),
  linkedGrvId: z.string().optional(),
  dueInHours: z.number().min(1).max(720).optional(),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);

    const toOfficer = await User.findById(body.toOfficerId);
    if (!toOfficer || toOfficer.role !== "field_officer") {
      throw new AppError("Target is not a valid field officer", 400);
    }
    if (String(toOfficer._id) === req.auth!.userId) {
      throw new AppError("Cannot tag yourself", 400);
    }

    const count = await OfficerTask.countDocuments();
    const taskId = `TASK-2026-${String(count + 1).padStart(5, "0")}`;

    const task = await OfficerTask.create({
      taskId,
      fromOfficer: req.auth!.userId,
      toOfficer: body.toOfficerId,
      title: body.title,
      instructions: body.instructions,
      linkedGrvId: body.linkedGrvId,
      dueAt: body.dueInHours ? new Date(Date.now() + body.dueInHours * 3600_000) : undefined,
    });

    res.status(201).json(task);
  })
);

/** Tasks assigned TO me by a colleague */
router.get(
  "/assigned-to-me",
  asyncHandler(async (req, res) => {
    const tasks = await OfficerTask.find({ toOfficer: req.auth!.userId })
      .populate("fromOfficer", "name phone")
      .sort({ createdAt: -1 });
    res.json(tasks);
  })
);

/** Tasks I created and tagged to someone else */
router.get(
  "/created-by-me",
  asyncHandler(async (req, res) => {
    const tasks = await OfficerTask.find({ fromOfficer: req.auth!.userId })
      .populate("toOfficer", "name phone")
      .sort({ createdAt: -1 });
    res.json(tasks);
  })
);

router.post(
  "/:taskId/start",
  asyncHandler(async (req, res) => {
    const task = await OfficerTask.findOne({ taskId: req.params.taskId, toOfficer: req.auth!.userId });
    if (!task) throw new AppError("Task not found in your queue", 404);
    task.status = "In Progress";
    await task.save();
    res.json(task);
  })
);

/**
 * Submit completion report — required to move a task forward. An empty
 * "mark done" isn't accepted; the assignee must write what they actually
 * did, mirroring the same principle that protects citizen complaints
 * from being closed with no real account of what happened.
 */
const reportSchema = z.object({
  report: z.string().min(10),
  reportPhotoUrl: z.string().optional(),
});

router.post(
  "/:taskId/report",
  asyncHandler(async (req, res) => {
    const body = reportSchema.parse(req.body);
    const task = await OfficerTask.findOne({ taskId: req.params.taskId, toOfficer: req.auth!.userId });
    if (!task) throw new AppError("Task not found in your queue", 404);
    if (task.status === "Closed") throw new AppError("Task is already closed", 400);

    task.status = "Reported";
    task.report = body.report;
    task.reportPhotoUrl = body.reportPhotoUrl;
    task.reportedAt = new Date();
    await task.save();
    res.json(task);
  })
);

/**
 * The original tagger reviews the report and closes the task — mirrors
 * the citizen-confirm pattern: the person who asked for the work
 * confirms it was actually done, rather than the task self-closing the
 * moment a report is submitted.
 */
router.post(
  "/:taskId/close",
  asyncHandler(async (req, res) => {
    const task = await OfficerTask.findOne({ taskId: req.params.taskId, fromOfficer: req.auth!.userId });
    if (!task) throw new AppError("Task not found — only the officer who created it can close it", 404);
    if (task.status !== "Reported") throw new AppError("Task must have a report submitted before it can be closed", 400);

    task.status = "Closed";
    task.closedAt = new Date();
    task.closedBy = new Types.ObjectId(req.auth!.userId);
    await task.save();
    res.json(task);
  })
);

export default router;
