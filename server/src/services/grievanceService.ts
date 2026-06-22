import { Grievance, IGrievance, Priority } from "../models/Grievance";
import crypto from "crypto";
import { Department } from "../models/Department";
import { AuditEvent } from "../models/AuditEvent";
import { DispatchEvent } from "../models/DispatchEvent";
import { GrievanceTransfer } from "../models/GrievanceTransfer";
import { User } from "../models/User";
import { classifyWithGroq } from "./groqService";
import { pushLifeThreateningAlert } from "./alertService";
import { computeDueDate, computeCurrentEscalationLevel, isSlaBreached } from "../utils/slaCalculator";
import { verifyResolutionPhotoLocation, isWithinRadius, LatLng } from "../utils/geo";
import { computeEventHash, GENESIS_HASH } from "../utils/hashChain";
import { notifyGrievanceEvent, notifyStaffEvent } from "./notificationService";
import { AppError } from "../middleware/errorHandler";
import { Types } from "mongoose";

const CITIZEN_CONFIRMATION_WINDOW_HOURS = 72;
const DUPLICATE_RADIUS_METERS = 100;
const DUPLICATE_WINDOW_DAYS = 14;

// ---------------------------------------------------------------------------
// Audit logging helper — every status change goes through here so the
// hash chain stays consistent without each route re-implementing it.
// ---------------------------------------------------------------------------

async function logAuditEvent(
  grvId: string,
  status: string,
  note: string,
  actorId: string,
  actorRole: string,
  prevHash: string
): Promise<string> {
  const timestamp = new Date().toISOString();
  const event = { grvId, status, note, actorId, actorRole, timestamp, prevHash };
  const hash = computeEventHash(event);
  await AuditEvent.create({ ...event, timestamp: new Date(timestamp), hash });
  return hash;
}

// ---------------------------------------------------------------------------
// Duplicate detection — same category within a small radius and recent
// window is flagged as a likely duplicate rather than silently creating
// a fresh ticket that resets an officer's "time since first reported" clock.
// ---------------------------------------------------------------------------

/**
 * Enforces dept_admin's department scope. cmo_team and super_admin have
 * no such restriction — they're meant to see/act across all departments.
 * A dept_admin is supposed to be scoped to their own department; without
 * this check (which didn't exist before), a dept_admin had identical
 * reach to cmo_team, just under a different role name, which defeats
 * the entire point of the role distinction.
 */
export function assertDepartmentScope(auth: { role: string; departmentCode?: string }, targetDepartmentCode: string) {
  if (auth.role !== "dept_admin") return;
  if (auth.departmentCode !== targetDepartmentCode) {
    throw new AppError(
      `As a department admin for ${auth.departmentCode || "an unconfigured department"}, you cannot act on grievances belonging to ${targetDepartmentCode}`,
      403
    );
  }
}

export async function findLikelyDuplicate(
  category: string,
  location: LatLng
): Promise<IGrievance | null> {
  const since = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * 86400_000);
  const candidates = await Grievance.find({
    category,
    filedAt: { $gte: since },
    status: { $nin: ["Confirmed Resolved", "Auto Closed"] },
  }).limit(200);

  for (const c of candidates) {
    if (isWithinRadius(location, { lat: c.lat, lng: c.lng }, DUPLICATE_RADIUS_METERS)) {
      return c;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Similar complaints nearby — deliberately NOT a merge/deduplication.
// Every complaint stays its own fully independent record with its own
// status, audit trail, and citizen-confirmation cycle — a citizen who
// reports a pothole nobody else mentioned yet deserves exactly the same
// tracking as one of fifty people reporting the same pothole. What this
// gives an officer is VISIBILITY: "is this one of many reports of the
// same physical problem, and what's the state of the others" — so they
// can act on the physical issue once and then bulk-close the paperwork
// for every report of it, instead of either merging records (which loses
// each citizen's individual right to confirm/dispute) or fixing the same
// pothole five times because nobody could see the other four reports.
// ---------------------------------------------------------------------------

export async function getSimilarComplaints(grvId: string) {
  const g = await Grievance.findOne({ grvId });
  if (!g) throw new AppError(`Grievance ${grvId} not found`, 404);

  const since = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * 86400_000);
  const candidates = await Grievance.find({
    grvId: { $ne: grvId },
    category: g.category,
    filedAt: { $gte: since },
  })
    .populate("assignedOfficer", "name")
    .limit(50);

  return candidates
    .filter((c) => isWithinRadius({ lat: g.lat, lng: g.lng }, { lat: c.lat, lng: c.lng }, DUPLICATE_RADIUS_METERS))
    .map((c) => ({
      grvId: c.grvId,
      status: c.status,
      filedAt: c.filedAt,
      resolvedAt: c.resolvedAt,
      assignedOfficerName: (c.assignedOfficer as any)?.name || null,
      assignedOfficerId: c.assignedOfficer,
    }));
}

/**
 * Bulk-resolve multiple independent complaints of the same physical
 * issue in one action, using one set of proof (photo + officer GPS).
 * Each grvId still gets its OWN resolutionProof, its OWN audit chain
 * entry, its OWN confirmationDeadline, and its OWN citizen-confirm
 * cycle — "bulk" here means the officer's submission action, not the
 * resulting data model. Deliberately restricted to complaints already
 * assigned to the requesting officer — no silent reassignment, to avoid
 * an officer bulk-closing cases that were never actually theirs to act on.
 */
export async function bulkResolveSimilar(opts: {
  grvIds: string[];
  officerId: string;
  officerName: string;
  photoUrl: string;
  officerLat: number;
  officerLng: number;
  note?: string;
}) {
  const results: Array<{ grvId: string; ok: boolean; error?: string }> = [];

  for (const grvId of opts.grvIds) {
    try {
      const g = await Grievance.findOne({ grvId });
      if (!g) throw new Error("Not found");
      if (String(g.assignedOfficer) !== opts.officerId) {
        throw new Error("Not assigned to you");
      }
      await markResolvedByOfficer({
        grvId,
        officerId: opts.officerId,
        officerName: opts.officerName,
        photoUrl: opts.photoUrl,
        officerLat: opts.officerLat,
        officerLng: opts.officerLng,
        note: `${opts.note || ""} (bulk-resolved alongside ${opts.grvIds.length - 1} similar report(s) of the same issue)`.trim(),
      });
      results.push({ grvId, ok: true });
    } catch (err) {
      results.push({ grvId, ok: false, error: (err as Error).message });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// File a new grievance
// ---------------------------------------------------------------------------

export interface FileGrievanceInput {
  citizenName: string;
  citizenPhone: string;
  citizenUserId?: string;
  descriptionRaw: string;
  district: string;
  ward?: string;
  address?: string;
  lat: number;
  lng: number;
  channel?: string;
  sourceSystem?: string;
  sourceRefId?: string;
  // Photo of the PROBLEM, attached by the citizen at filing time — not to
  // be confused with resolutionProof, which is the officer's geotagged
  // "after" photo. Officers were required to provide photo evidence to
  // close a complaint while citizens couldn't provide any to open one —
  // a real asymmetry against how MCD311 itself works (photo required at
  // intake). Optional here since voice/text-only filing must keep working
  // for low-bandwidth or no-camera situations.
  evidencePhotoUrl?: string;
  filedByOfficerId?: string; // set when an officer files on their own observation, not a citizen report
  // Citizen-chosen officer at filing time — e.g. they dealt with this
  // officer before and want continuity. Validated against the
  // auto-classified department below; if it doesn't match, the
  // preference is silently ignored rather than rejecting the filing —
  // a citizen guessing wrong about which officer handles what shouldn't
  // block them from filing at all. NOTE the real trade-off this
  // introduces: letting citizens pick "their" officer is also exactly
  // the kind of channel that could enable collusion (a citizen and a
  // friendly officer arranging to always be paired). The GPS-photo
  // verification, citizen-confirm loop, and accountability scoring all
  // still apply regardless of who resolves it — this doesn't bypass any
  // of those — but it's a real consideration worth knowing this feature
  // carries, not a free option.
  preferredOfficerId?: string;
}

export async function fileGrievance(input: FileGrievanceInput) {
  // Classify with Groq (primary) — auto-falls back to TF-IDF if key absent or call fails
  const classification = await classifyWithGroq(input.descriptionRaw);

  const dept = await Department.findOne({ code: classification.departmentCode });
  if (!dept) {
    throw new AppError(
      `No department configured for code ${classification.departmentCode}. Seed departments first.`,
      500
    );
  }

  // Validate the citizen's preferred officer, if any, against the
  // auto-classified department — a wrong guess is silently dropped
  // (not rejected) rather than blocking the filing. Staff still see the
  // raw preference recorded so a deliberate cross-department request
  // ("I want Officer X even though this seems like a different
  // category") isn't just discarded without a trace, but it doesn't
  // auto-assign — see the field comment on preferredOfficerId for why
  // citizen-driven officer selection stays a request, not a bypass.
  let validatedPreferredOfficerId: string | undefined;
  if (input.preferredOfficerId) {
    const preferred = await User.findById(input.preferredOfficerId);
    if (preferred && preferred.role === "field_officer" && String(preferred.department) === String(dept._id)) {
      validatedPreferredOfficerId = input.preferredOfficerId;
    }
  }

  const duplicate = await findLikelyDuplicate(classification.category, {
    lat: input.lat,
    lng: input.lng,
  });

  const filedAt = new Date();
  const dueAt = computeDueDate(filedAt, classification.priority);

  // Human-readable sequential ID for staff to read/sort/reference verbally —
  // but sequential IDs are guessable, and phone-number-only matching means
  // anyone who learns a citizen's phone number (a neighbor, a local
  // official, simple sequential guessing of the ID itself) could confirm
  // or dispute resolution on their behalf. That directly undermines the
  // citizen-confirm loop, which is this system's core anti-false-closure
  // mechanism — it only works if it's actually the citizen confirming.
  // Fix: a separate unguessable secret, generated here, required alongside
  // the phone number for tracking/confirming. Given to the citizen once,
  // at filing time, the same way a parcel tracking PIN works.
  const count = await Grievance.countDocuments();
  const grvId = `GRV-2026-${String(count + 1).padStart(5, "0")}`;
  const trackingSecret = crypto.randomInt(100000, 999999).toString(); // 6-digit, easy to read aloud over a phone call

  const genesisHash = await logAuditEvent(
    grvId,
    "Pending",
    duplicate
      ? `Filed. Likely duplicate of ${duplicate.grvId} detected within ${DUPLICATE_RADIUS_METERS}m — linked, not merged.`
      : "Filed and auto-classified by NLP engine.",
    input.citizenUserId || "anonymous",
    "citizen",
    GENESIS_HASH
  );

  const grievance = await Grievance.create({
    grvId,
    trackingSecret,
    citizenName: input.citizenName,
    citizenPhone: input.citizenPhone,
    citizenUser: input.citizenUserId,
    descriptionRaw: input.descriptionRaw,
    descriptionNormalized: classification.normalizedText,
    detectedLanguage: classification.detectedLanguage,
    category: classification.category,
    priority: classification.priority,
    confidence: classification.confidence,
    isLifeThreatening: classification.isLifeThreatening,
    district: input.district,
    ward: input.ward || "",
    address: input.address || "",
    lat: input.lat,
    lng: input.lng,
    department: dept._id,
    departmentCode: classification.departmentCode,
    status: "Pending",
    escalationLevel: "L1",
    channel: input.channel || "Web Portal",
    filedAt,
    dueAt,
    duplicateOf: duplicate?._id,
    linkedComplaintIds: duplicate ? [duplicate.grvId] : [],
    sourceSystem: input.sourceSystem,
    sourceRefId: input.sourceRefId,
    evidencePhotoUrl: input.evidencePhotoUrl,
    filedByOfficer: input.filedByOfficerId,
    requestedOfficer: validatedPreferredOfficerId,
    lastEventHash: genesisHash,
  });

  // Push SSE alert immediately for life-threatening complaints
  if (classification.isLifeThreatening) {
    pushLifeThreateningAlert(
      grvId,
      classification.category,
      input.district,
      input.descriptionRaw
    );
  }

  return { grievance, classification, duplicate };
}

// ---------------------------------------------------------------------------
// Dispatch to department / assign to officer
// ---------------------------------------------------------------------------

/**
 * Manual re-classification — for when the AI gets it wrong. Every
 * classifier, including this one, misclassifies some fraction of real
 * input; if there's no way for staff to correct a wrong category/
 * department, a citizen's water complaint that got misfiled as "Other"
 * stays stuck in the wrong department's queue indefinitely with no
 * recourse. Re-running this updates department, departmentCode, and
 * recomputes dueAt against the (possibly different) SLA for the new
 * category — and logs exactly what changed and why, since silently
 * changing routing on an active complaint is exactly the kind of action
 * that needs an audit trail.
 */
/**
 * Officer-requested deadline extension. Mirrors a pattern visible across
 * real Indian government grievance portals: an officer who genuinely
 * needs more time can ask for it with a stated reason, rather than
 * either silently missing the SLA or being stuck with no recourse for
 * complaints that legitimately take longer (e.g. waiting on a part, or
 * needing another department's sign-off first). Critically, the dueAt
 * clock does NOT move until a CMO/admin approves it — a pending request
 * has zero effect on the citizen-visible deadline, so this can't be used
 * to quietly buy slack with no oversight.
 */
export async function requestDeadlineExtension(opts: {
  grvId: string;
  officerId: string;
  officerName: string;
  requestedHours: number;
  reason: string;
}) {
  const g = await Grievance.findOne({ grvId: opts.grvId });
  if (!g) throw new AppError(`Grievance ${opts.grvId} not found`, 404);
  if (String(g.assignedOfficer) !== opts.officerId) {
    throw new AppError("Only the officer currently assigned to this case can request an extension", 403);
  }
  if (g.extensionRequest?.status === "Pending") {
    throw new AppError("An extension request is already pending for this case", 400);
  }

  g.extensionRequest = {
    requestedHours: opts.requestedHours,
    reason: opts.reason,
    requestedBy: new Types.ObjectId(opts.officerId),
    requestedByName: opts.officerName,
    requestedAt: new Date(),
    status: "Pending",
  };

  const newHash = await logAuditEvent(
    opts.grvId,
    g.status,
    `${opts.officerName} requested a ${opts.requestedHours}h extension. Reason: ${opts.reason}`,
    opts.officerId,
    "field_officer",
    g.lastEventHash
  );
  g.lastEventHash = newHash;
  await g.save();
  return g;
}

export async function decideExtensionRequest(opts: {
  grvId: string;
  approve: boolean;
  decidedBy: string;
}) {
  const g = await Grievance.findOne({ grvId: opts.grvId });
  if (!g) throw new AppError(`Grievance ${opts.grvId} not found`, 404);
  if (!g.extensionRequest || g.extensionRequest.status !== "Pending") {
    throw new AppError("No pending extension request for this case", 400);
  }

  g.extensionRequest.status = opts.approve ? "Approved" : "Denied";
  g.extensionRequest.decidedBy = opts.decidedBy;
  g.extensionRequest.decidedAt = new Date();

  if (opts.approve) {
    g.dueAt = new Date(g.dueAt.getTime() + g.extensionRequest.requestedHours * 3600_000);
  }

  const newHash = await logAuditEvent(
    opts.grvId,
    g.status,
    `Extension request ${opts.approve ? "approved" : "denied"} by ${opts.decidedBy}${opts.approve ? `. New due date: ${g.dueAt.toISOString()}` : ""}`,
    opts.decidedBy,
    "system",
    g.lastEventHash
  );
  g.lastEventHash = newHash;
  await g.save();
  return g;
}

export async function reclassifyGrievance(opts: {
  grvId: string;
  newCategory: string;
  newDepartmentCode: string;
  newPriority?: Priority;
  reason: string;
  staffName: string;
}) {
  const g = await Grievance.findOne({ grvId: opts.grvId });
  if (!g) throw new AppError(`Grievance ${opts.grvId} not found`, 404);

  const newDept = await Department.findOne({ code: opts.newDepartmentCode });
  if (!newDept) throw new AppError(`Unknown department code ${opts.newDepartmentCode}`, 400);

  const oldCategory = g.category;
  const oldDeptCode = g.departmentCode;

  g.category = opts.newCategory;
  g.department = newDept._id as any;
  g.departmentCode = opts.newDepartmentCode;
  if (opts.newPriority) {
    g.priority = opts.newPriority;
    g.dueAt = computeDueDate(g.filedAt, opts.newPriority);
  }

  const newHash = await logAuditEvent(
    opts.grvId,
    g.status,
    `Re-classified by staff: ${oldCategory} (${oldDeptCode}) -> ${opts.newCategory} (${opts.newDepartmentCode}). Reason: ${opts.reason}`,
    opts.staffName,
    "system",
    g.lastEventHash
  );
  g.lastEventHash = newHash;
  await g.save();
  return g;
}

export async function dispatchGrievance(
  grvId: string,
  dispatchedBy: string,
  note = ""
) {
  const g = await Grievance.findOne({ grvId });
  if (!g) throw new AppError(`Grievance ${grvId} not found`, 404);

  const dept = await Department.findById(g.department);
  if (!dept) throw new AppError("Department not found for this grievance", 500);

  const refNumber = `DISP-${g.departmentCode}-${Date.now()}-${grvId.split("-").pop()}`;

  await DispatchEvent.create({
    grvId,
    department: dept.name,
    departmentCode: dept.code,
    refNumber,
    dispatchedAt: new Date(),
    dispatchedBy,
    method: "internal",
    note,
  });

  const newHash = await logAuditEvent(
    grvId,
    "Assigned",
    `Dispatched to ${dept.name} — ref ${refNumber}. ${note}`.trim(),
    dispatchedBy,
    "system",
    g.lastEventHash
  );

  g.status = "Assigned";
  g.lastEventHash = newHash;
  await g.save();

  await notifyGrievanceEvent({
    citizenPhone: g.citizenPhone,
    grvId,
    event: "dispatched",
    language: g.detectedLanguage?.startsWith("Hindi") || g.detectedLanguage === "Hinglish" ? "hi" : "en",
  });

  return { refNumber, department: dept.name };
}

/**
 * Auto-assignment — picks the least-loaded active officer in a department
 * and assigns them. The brief asks for an "auto segregation algorithm";
 * what existed before this only auto-picked the CATEGORY, leaving officer
 * selection as a fully manual dropdown click every single time, even
 * though the workload data needed to pick well (active complaint count
 * per officer) was already being computed for the workload dashboard.
 * This closes that gap — dispatch can now assign automatically, with
 * admins still able to manually override via assignOfficer() above.
 */
export async function findLeastLoadedOfficer(departmentId: string): Promise<string | null> {
  const officers = await User.find({
    role: "field_officer",
    isActive: true,
    onLeave: { $ne: true }, // skip officers who've marked themselves unavailable
    department: departmentId,
  });
  if (officers.length === 0) return null;

  const withLoad = await Promise.all(
    officers.map(async (o) => ({
      id: String(o._id),
      activeCount: await Grievance.countDocuments({
        assignedOfficer: o._id,
        status: { $nin: ["Confirmed Resolved", "Auto Closed"] },
      }),
    }))
  );

  withLoad.sort((a, b) => a.activeCount - b.activeCount);
  return withLoad[0].id;
}

export async function autoAssignOfficer(grvId: string, assignedBy: string) {
  const g = await Grievance.findOne({ grvId });
  if (!g) throw new AppError(`Grievance ${grvId} not found`, 404);

  const officerId = await findLeastLoadedOfficer(String(g.department));
  if (!officerId) {
    throw new AppError("No active field officers in this department to auto-assign", 404);
  }
  return assignOfficer(grvId, officerId, `${assignedBy} (auto-assigned to least-loaded officer)`);
}

export async function assignOfficer(grvId: string, officerId: string, assignedBy: string) {
  const g = await Grievance.findOne({ grvId });
  if (!g) throw new AppError(`Grievance ${grvId} not found`, 404);

  const officer = await User.findById(officerId);
  if (!officer || officer.role !== "field_officer") {
    throw new AppError("Target user is not a field officer", 400);
  }
  // An officer can only be assigned within their own department — this
  // was previously unchecked, meaning a DJB officer could be assigned a
  // PWD pothole complaint with nothing stopping it. The department
  // routing the classifier computed at filing time should be the one
  // thing that's never silently overridden by a bad manual assignment.
  if (String(officer.department) !== String(g.department)) {
    throw new AppError("This officer does not belong to the department this grievance is routed to", 400);
  }

  g.assignedOfficer = new Types.ObjectId(officerId);
  const newHash = await logAuditEvent(
    grvId,
    g.status,
    `Assigned to officer ${officer.name}`,
    assignedBy,
    "system",
    g.lastEventHash
  );
  g.lastEventHash = newHash;
  await g.save();
  return g;
}

// ---------------------------------------------------------------------------
// Case forwarding — officer-to-officer, with a citizen-visible chain.
//
// Modeled on UP's Jansunwai portal, which shows citizens a transparent
// ledger of every hand-off a case takes: who forwarded it, the
// instruction given, the responding officer's report, and the resulting
// status. This is a real transfer of case ownership (assignedOfficer
// moves), unlike OfficerTask which is a lightweight peer request that
// leaves ownership unchanged. Both the forward and the eventual response
// are citizen-visible via getTransferHistory() below — the same
// transparency principle as citizen-confirm, extended to "can the
// citizen see what happened to their case while it moved between desks."
// ---------------------------------------------------------------------------

export async function forwardGrievance(opts: {
  grvId: string;
  fromOfficerId: string;
  toOfficerId: string;
  instruction: string;
  expectedResponseHours?: number; // forwarding officer's own timeline, mirrors Jansunwai/CPGRAMS pattern of escalating-officer-sets-deadline
}) {
  const g = await Grievance.findOne({ grvId: opts.grvId });
  if (!g) throw new AppError(`Grievance ${opts.grvId} not found`, 404);

  if (String(g.assignedOfficer) !== opts.fromOfficerId) {
    throw new AppError("Only the officer currently assigned to this case can forward it", 403);
  }

  const [fromOfficer, toOfficer] = await Promise.all([
    User.findById(opts.fromOfficerId),
    User.findById(opts.toOfficerId),
  ]);
  if (!toOfficer || toOfficer.role !== "field_officer") {
    throw new AppError("Target is not a valid field officer", 400);
  }
  if (opts.fromOfficerId === opts.toOfficerId) {
    throw new AppError("Cannot forward a case to yourself", 400);
  }

  const expectedResponseAt = opts.expectedResponseHours
    ? new Date(Date.now() + opts.expectedResponseHours * 3600_000)
    : undefined;

  const transfer = await GrievanceTransfer.create({
    grvId: opts.grvId,
    fromOfficer: opts.fromOfficerId,
    fromOfficerName: fromOfficer?.name || "Unknown",
    toOfficer: opts.toOfficerId,
    toOfficerName: toOfficer.name,
    instruction: opts.instruction,
    expectedResponseAt,
  });

  // Ownership actually moves — this is the structural difference from
  // OfficerTask. The case is now the new officer's to act on.
  g.assignedOfficer = new Types.ObjectId(opts.toOfficerId);
  const newHash = await logAuditEvent(
    opts.grvId,
    g.status,
    `Forwarded from ${fromOfficer?.name} to ${toOfficer.name}. Instruction: ${opts.instruction}`,
    opts.fromOfficerId,
    "field_officer",
    g.lastEventHash
  );
  g.lastEventHash = newHash;
  await g.save();

  await notifyGrievanceEvent({
    citizenPhone: g.citizenPhone,
    grvId: opts.grvId,
    event: "forwarded",
    language: g.detectedLanguage?.startsWith("Hindi") || g.detectedLanguage === "Hinglish" ? "hi" : "en",
  });

  return transfer;
}

export async function respondToTransfer(opts: {
  transferId: string;
  officerId: string;
  response: string;
  responsePhotoUrl?: string;
}) {
  const transfer = await GrievanceTransfer.findById(opts.transferId);
  if (!transfer) throw new AppError("Transfer not found", 404);
  if (String(transfer.toOfficer) !== opts.officerId) {
    throw new AppError("Only the officer this case was forwarded to can respond", 403);
  }
  if (transfer.status === "Responded") {
    throw new AppError("This transfer has already been responded to", 400);
  }

  transfer.response = opts.response;
  transfer.responsePhotoUrl = opts.responsePhotoUrl;
  transfer.respondedAt = new Date();
  transfer.status = "Responded";
  await transfer.save();

  const g = await Grievance.findOne({ grvId: transfer.grvId });
  if (g) {
    const newHash = await logAuditEvent(
      transfer.grvId,
      g.status,
      `${transfer.toOfficerName} responded to forward from ${transfer.fromOfficerName}: ${opts.response}`,
      opts.officerId,
      "field_officer",
      g.lastEventHash
    );
    g.lastEventHash = newHash;
    await g.save();
  }

  return transfer;
}

/**
 * Full forwarding chain for a grievance, oldest first — this is exactly
 * what gets rendered as the citizen-visible table on the tracking page,
 * mirroring Jansunwai's "अधीनस्थ द्वारा प्राप्त आख्या" layout.
 */
export async function getTransferHistory(grvId: string) {
  return GrievanceTransfer.find({ grvId }).sort({ forwardedAt: 1 });
}

// ---------------------------------------------------------------------------
// Officer marks resolved — REQUIRES geotagged photo, which is checked
// against the original complaint location. This does not close the
// grievance; it moves to "Resolved Pending Confirmation" and starts the
// citizen confirmation window. This is the single most important
// anti-false-closure mechanism in the system.
// ---------------------------------------------------------------------------

export interface MarkResolvedInput {
  grvId: string;
  officerId: string;
  officerName: string;
  photoUrl: string;
  officerLat: number;
  officerLng: number;
  note?: string;
}

export async function markResolvedByOfficer(input: MarkResolvedInput) {
  const g = await Grievance.findOne({ grvId: input.grvId });
  if (!g) throw new AppError(`Grievance ${input.grvId} not found`, 404);

  if (!["Assigned", "In Progress", "Escalated", "Reopened"].includes(g.status)) {
    throw new AppError(`Cannot resolve a grievance with status "${g.status}"`, 400);
  }

  const verification = verifyResolutionPhotoLocation(
    { lat: g.lat, lng: g.lng },
    { lat: input.officerLat, lng: input.officerLng }
  );

  const now = new Date();
  g.resolutionProof = {
    photoUrl: input.photoUrl,
    capturedAt: now,
    officerLat: input.officerLat,
    officerLng: input.officerLng,
    distanceFromComplaintMeters: verification.distanceMeters,
    locationMismatchFlag: verification.mismatched,
  };
  g.status = "Resolved Pending Confirmation";
  g.resolvedAt = now;
  g.confirmationDeadline = new Date(now.getTime() + CITIZEN_CONFIRMATION_WINDOW_HOURS * 3600_000);

  const noteText = verification.mismatched
    ? `Officer marked resolved. WARNING: resolution photo location is ${verification.distanceMeters}m from complaint site (threshold ${verification.threshold}m) — flagged for audit. ${input.note || ""}`
    : `Officer marked resolved. Photo location verified (${verification.distanceMeters}m from complaint site). ${input.note || ""}`;

  const newHash = await logAuditEvent(
    input.grvId,
    g.status,
    noteText.trim(),
    input.officerId,
    "field_officer",
    g.lastEventHash
  );
  g.lastEventHash = newHash;
  await g.save();

  await notifyGrievanceEvent({
    citizenPhone: g.citizenPhone,
    grvId: input.grvId,
    event: "resolved_pending_confirmation",
    language: g.detectedLanguage?.startsWith("Hindi") || g.detectedLanguage === "Hinglish" ? "hi" : "en",
  });

  return { grievance: g, photoLocationMismatch: verification.mismatched, distanceMeters: verification.distanceMeters };
}

// ---------------------------------------------------------------------------
// Citizen confirms or disputes resolution
// ---------------------------------------------------------------------------

export async function citizenConfirmResolution(
  grvId: string,
  satisfied: boolean,
  comment: string | undefined,
  actorId: string
) {
  const g = await Grievance.findOne({ grvId });
  if (!g) throw new AppError(`Grievance ${grvId} not found`, 404);
  if (g.status !== "Resolved Pending Confirmation") {
    throw new AppError(`Grievance is not awaiting confirmation (status: ${g.status})`, 400);
  }

  const now = new Date();
  g.citizenFeedback = { respondedAt: now, satisfied, comment };

  if (satisfied) {
    g.status = "Confirmed Resolved";
    g.confirmedAt = now;
  } else {
    g.status = "Reopened";
    g.reopenCount += 1;
    // Reopening resets to Assigned-equivalent urgency: keep officer assigned,
    // but the SLA clock for "time to truly fix" should reflect the reopen.
  }

  const newHash = await logAuditEvent(
    grvId,
    g.status,
    satisfied
      ? `Citizen confirmed resolution. ${comment || ""}`.trim()
      : `Citizen DISPUTED resolution — reopened (reopen #${g.reopenCount}). ${comment || ""}`.trim(),
    actorId,
    "citizen",
    g.lastEventHash
  );
  g.lastEventHash = newHash;
  await g.save();

  const lang = g.detectedLanguage?.startsWith("Hindi") || g.detectedLanguage === "Hinglish" ? "hi" : "en";
  await notifyGrievanceEvent({
    citizenPhone: g.citizenPhone,
    grvId,
    event: satisfied ? "confirmed" : "reopened",
    language: lang,
  });

  if (!satisfied && g.assignedOfficer) {
    const officer = await User.findById(g.assignedOfficer);
    await notifyStaffEvent(
      officer?.email,
      `Grievance ${grvId} reopened by citizen`,
      `The citizen disputed your resolution of ${grvId}. Comment: ${comment || "(none provided)"}. Reopen count: ${g.reopenCount}.`
    );
  }

  return g;
}

// ---------------------------------------------------------------------------
// Auto-close sweep — for grievances whose confirmation window has lapsed
// with no citizen response. IMPORTANT: this status is "Auto Closed", a
// DIFFERENT status from "Confirmed Resolved", precisely so officer
// dashboards and CM reports never conflate silence with genuine
// satisfaction. A high Auto-Closed rate for an officer is itself a
// signal worth auditing (citizens not reachable, or not bothering to
// respond because they've learned the system doesn't listen).
// ---------------------------------------------------------------------------

export async function runAutoCloseSweep(): Promise<number> {
  const now = new Date();
  const stale = await Grievance.find({
    status: "Resolved Pending Confirmation",
    confirmationDeadline: { $lte: now },
  });

  for (const g of stale) {
    g.status = "Auto Closed";
    const newHash = await logAuditEvent(
      g.grvId,
      "Auto Closed",
      "Citizen confirmation window lapsed with no response. Auto-closed (distinct from citizen-confirmed resolution).",
      "system",
      "system",
      g.lastEventHash
    );
    g.lastEventHash = newHash;
    await g.save();
  }
  return stale.length;
}

// ---------------------------------------------------------------------------
// Escalation sweep — promotes grievances through L1->L4 based on elapsed
// time vs. severity-specific SLA tiers (MP CM Helpline model).
// ---------------------------------------------------------------------------

export async function runEscalationSweep(): Promise<number> {
  const now = new Date();
  const active = await Grievance.find({
    status: { $in: ["Pending", "Assigned", "In Progress", "Reopened"] },
  });

  let escalatedCount = 0;
  for (const g of active) {
    const newLevel = computeCurrentEscalationLevel(g.filedAt, g.priority as Priority, now);
    if (newLevel !== g.escalationLevel) {
      const breached = isSlaBreached(g.filedAt, g.priority as Priority, now);
      const newHash = await logAuditEvent(
        g.grvId,
        breached ? "Escalated" : g.status,
        `Auto-escalated from ${g.escalationLevel} to ${newLevel} (SLA ${breached ? "BREACHED" : "approaching"}).`,
        "system",
        "system",
        g.lastEventHash
      );
      g.escalationLevel = newLevel;
      if (breached) {
        g.status = "Escalated";
      }
      g.lastEventHash = newHash;
      await g.save();
      escalatedCount++;

      // Only notify on an actual SLA breach, not every L1->L2 style level
      // promotion — citizens don't need a message every time an internal
      // counter ticks, only when their wait has genuinely exceeded target.
      if (breached) {
        await notifyGrievanceEvent({
          citizenPhone: g.citizenPhone,
          grvId: g.grvId,
          event: "escalated",
          language: g.detectedLanguage?.startsWith("Hindi") || g.detectedLanguage === "Hinglish" ? "hi" : "en",
        });
      }
    }
  }
  return escalatedCount;
}
