import { Router } from "express";
import * as open311 from "../integrations/open311";
import { requireAuth, requirePermission } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

// Public status check — lets the admin UI show "MCD311: Live" or
// "MCD311: Mock mode (no API key configured)" without auth, since it's
// informational, not data.
router.get("/status", asyncHandler(async (_req, res) => res.json(open311.getIntegrationStatus())));

router.get("/services", asyncHandler(async (_req, res) => res.json(await open311.getServiceList())));

router.get(
  "/requests",
  requireAuth,
  requirePermission("manage_open311"),
  asyncHandler(async (req, res) => {
    const { start_date, end_date, status } = req.query as Record<string, string>;
    res.json(await open311.getServiceRequests({ start_date, end_date, status: status as "open" | "closed" }));
  })
);

export default router;
