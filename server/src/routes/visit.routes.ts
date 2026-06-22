import { Router } from "express";
import { z } from "zod";
import { Visit } from "../models/Visit";
import { requireAuth } from "../middleware/auth";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { getNearbyOpenGrievances } from "../services/dashboardService";

/**
 * "Show nearby problems when the CM is on a visit in some area" +
 * "Visit logs" — from the brief's idea list. When the CM (or any
 * senior officer) checks in at a location, the system immediately
 * surfaces open grievances nearby so the visit can be used to inspect
 * or resolve them on the spot, and the check-in itself becomes a
 * permanent, auditable visit log.
 */

const router = Router();

const checkinSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  locationLabel: z.string().optional(),
  district: z.string().optional(),
  notes: z.string().optional(),
  radiusMeters: z.number().min(50).max(5000).default(1000),
});

router.post(
  "/check-in",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = checkinSchema.parse(req.body);
    const nearby = await getNearbyOpenGrievances({ lat: body.lat, lng: body.lng }, body.radiusMeters);

    const visit = await Visit.create({
      visitorUser: req.auth!.userId,
      visitorRole: req.auth!.role,
      lat: body.lat,
      lng: body.lng,
      locationLabel: body.locationLabel || "",
      district: body.district || "",
      notes: body.notes || "",
      nearbyGrievanceIds: nearby.map((g) => g.grvId),
    });

    res.status(201).json({ visit, nearbyGrievances: nearby });
  })
);

router.post(
  "/:visitId/mark-resolved-onsite",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { grvId } = z.object({ grvId: z.string() }).parse(req.body);
    const visit = await Visit.findById(req.params.visitId);
    if (!visit) throw new AppError("Visit not found", 404);
    if (!visit.nearbyGrievanceIds.includes(grvId)) {
      throw new AppError("Grievance was not part of this visit's nearby list", 400);
    }
    visit.resolvedOnSiteIds.push(grvId);
    await visit.save();
    res.json(visit);
  })
);

router.get(
  "/history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const visits = await Visit.find({ visitorUser: req.auth!.userId })
      .sort({ checkedInAt: -1 })
      .limit(50);
    res.json(visits);
  })
);

router.get(
  "/nearby",
  requireAuth,
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        lat: z.coerce.number(),
        lng: z.coerce.number(),
        radiusMeters: z.coerce.number().min(50).max(5000).default(1000),
      })
      .parse(req.query);
    const nearby = await getNearbyOpenGrievances({ lat: q.lat, lng: q.lng }, q.radiusMeters);
    res.json(nearby);
  })
);

export default router;
