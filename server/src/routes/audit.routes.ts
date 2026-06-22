import { Router } from "express";
import { AuditEvent } from "../models/AuditEvent";
import { verifyChain } from "../utils/hashChain";
import { requireAuth, requirePermission } from "../middleware/auth";
import { asyncHandler, AppError } from "../middleware/errorHandler";

const router = Router();

/**
 * Replays a grievance's full hash chain and reports whether it's
 * intact. A CM/CMO-team user investigating a suspicious case (e.g.
 * flagged by the reopen-rate leaderboard) can use this to confirm the
 * audit trail itself hasn't been tampered with.
 */
router.get(
  "/verify/:grvId",
  requireAuth,
  requirePermission("view_audit"),
  asyncHandler(async (req, res) => {
    const events = await AuditEvent.find({ grvId: req.params.grvId }).sort({ timestamp: 1 });
    if (events.length === 0) throw new AppError("No audit events found for this grievance", 404);

    const breakIndex = verifyChain(
      events.map((e) => ({
        grvId: e.grvId,
        status: e.status,
        note: e.note,
        actorId: e.actorId,
        actorRole: e.actorRole,
        timestamp: e.timestamp.toISOString(),
        prevHash: e.prevHash,
        hash: e.hash,
      }))
    );

    res.json({
      grvId: req.params.grvId,
      intact: breakIndex === -1,
      brokenAtIndex: breakIndex === -1 ? null : breakIndex,
      eventCount: events.length,
      timeline: events,
    });
  })
);

export default router;
