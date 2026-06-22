import { Schema, model, Document, Types } from "mongoose";

export type Priority = "Critical" | "High" | "Normal";
export type Status =
  | "Pending"       // filed, not yet dispatched
  | "Assigned"       // dispatched to a department/officer
  | "In Progress"    // officer acknowledged and is working
  | "Resolved Pending Confirmation" // officer marked resolved, awaiting citizen confirmation
  | "Confirmed Resolved"            // citizen confirmed it's actually fixed — true close
  | "Reopened"       // citizen disputed the resolution
  | "Auto Closed"    // citizen did not respond within the confirmation window
  | "Escalated";     // breached SLA, kicked up the chain

export type Channel =
  | "Web Portal"
  | "Mobile App"
  | "CM Helpline"
  | "WhatsApp"
  | "Walk-in"
  | "Social Media"
  | "MCD311 Import"; // ingested via the Open311 adapter

export interface ResolutionProof {
  photoUrl: string;
  capturedAt: Date;
  officerLat: number;
  officerLng: number;
  distanceFromComplaintMeters: number;
  locationMismatchFlag: boolean;
}

export interface CitizenFeedback {
  respondedAt: Date;
  satisfied: boolean;
  comment?: string;
}

export interface ExtensionRequest {
  requestedHours: number;
  reason: string;
  requestedBy: Types.ObjectId;
  requestedByName: string;
  requestedAt: Date;
  status: "Pending" | "Approved" | "Denied";
  decidedBy?: string;
  decidedAt?: Date;
}

export interface IGrievance extends Document {
  grvId: string; // human-readable e.g. GRV-2026-00001
  trackingSecret: string; // unguessable companion code — see schema comment
  // Complainant
  citizenName: string;
  citizenPhone: string;
  citizenUser?: Types.ObjectId;
  // Content
  descriptionRaw: string; // exactly as typed by citizen (any language)
  descriptionNormalized: string; // English-normalized for search/classification
  detectedLanguage: string;
  // Classification
  category: string;
  priority: Priority;
  confidence: number;
  isLifeThreatening: boolean;
  // Location
  district: string;
  ward: string;
  address: string;
  lat: number;
  lng: number;
  // Routing
  department: Types.ObjectId;
  departmentCode: string;
  assignedOfficer?: Types.ObjectId;
  // Status & SLA
  status: Status;
  escalationLevel: "L1" | "L2" | "L3" | "L4";
  channel: Channel;
  filedAt: Date;
  dueAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  confirmedAt?: Date;
  // False-closure prevention
  resolutionProof?: ResolutionProof;
  citizenFeedback?: CitizenFeedback;
  // Officer-requested deadline extension — mirrors the "Request
  // Extension" pattern in real Indian govt portals: the officer asks
  // for more time with a reason, an admin/CMO approves or denies, and
  // only an approval actually moves dueAt. Citizens still see the
  // original SLA target unless/until an extension is approved, so a
  // pending request can't quietly buy an officer slack with no oversight.
  extensionRequest?: ExtensionRequest;
  reopenCount: number;
  confirmationDeadline?: Date; // citizen must respond by this time or it auto-closes
  // Dedup / linking
  duplicateOf?: Types.ObjectId;
  linkedComplaintIds: string[]; // citizen-reported "this is the same issue as X"
  // External source tracking
  sourceSystem?: string; // e.g. "MCD311", "Twitter"
  sourceRefId?: string;
  evidencePhotoUrl?: string; // citizen's photo of the problem at filing time
  filedByOfficer?: Types.ObjectId; // set if an officer filed this from their own field observation
  requestedOfficer?: Types.ObjectId; // citizen's preferred officer at filing time, validated against department — a request for staff to consider, not an auto-assignment
  // Audit chain head
  lastEventHash: string;

  createdAt: Date;
}

const ResolutionProofSchema = new Schema<ResolutionProof>(
  {
    photoUrl: { type: String, required: true },
    capturedAt: { type: Date, required: true },
    officerLat: { type: Number, required: true },
    officerLng: { type: Number, required: true },
    distanceFromComplaintMeters: { type: Number, required: true },
    locationMismatchFlag: { type: Boolean, required: true },
  },
  { _id: false }
);

const CitizenFeedbackSchema = new Schema<CitizenFeedback>(
  {
    respondedAt: { type: Date, required: true },
    satisfied: { type: Boolean, required: true },
    comment: { type: String },
  },
  { _id: false }
);

const ExtensionRequestSchema = new Schema<ExtensionRequest>(
  {
    requestedHours: { type: Number, required: true },
    reason: { type: String, required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    requestedByName: { type: String, required: true },
    requestedAt: { type: Date, required: true, default: Date.now },
    status: { type: String, enum: ["Pending", "Approved", "Denied"], default: "Pending" },
    decidedBy: { type: String },
    decidedAt: { type: Date },
  },
  { _id: false }
);

const GrievanceSchema = new Schema<IGrievance>(
  {
    grvId: { type: String, required: true, unique: true, index: true },
    // Unguessable companion to grvId. grvId is sequential and human-readable
    // for staff convenience; trackingSecret is a random 6-digit code given
    // to the citizen once, at filing time, required (with phone) to
    // track/confirm/dispute — without it, anyone who learns a citizen's
    // phone number and guesses the sequential grvId could act as them.
    trackingSecret: { type: String, required: true, select: false }, // select: false — never returned by default queries

    citizenName: { type: String, required: true },
    citizenPhone: { type: String, required: true, index: true },
    citizenUser: { type: Schema.Types.ObjectId, ref: "User" },

    descriptionRaw: { type: String, required: true },
    descriptionNormalized: { type: String, required: true },
    detectedLanguage: { type: String, default: "English" },

    category: { type: String, required: true, index: true },
    priority: {
      type: String,
      enum: ["Critical", "High", "Normal"],
      required: true,
      index: true,
    },
    confidence: { type: Number, default: 0 },
    isLifeThreatening: { type: Boolean, default: false, index: true },

    district: { type: String, required: true, index: true },
    ward: { type: String, default: "" },
    address: { type: String, default: "" },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },

    department: { type: Schema.Types.ObjectId, ref: "Department", required: true },
    departmentCode: { type: String, required: true, index: true },
    assignedOfficer: { type: Schema.Types.ObjectId, ref: "User" },

    status: {
      type: String,
      enum: [
        "Pending", "Assigned", "In Progress",
        "Resolved Pending Confirmation", "Confirmed Resolved",
        "Reopened", "Auto Closed", "Escalated",
      ],
      default: "Pending",
      index: true,
    },
    escalationLevel: { type: String, enum: ["L1", "L2", "L3", "L4"], default: "L1" },
    channel: {
      type: String,
      enum: ["Web Portal", "Mobile App", "CM Helpline", "WhatsApp", "Walk-in", "Social Media", "MCD311 Import"],
      default: "Web Portal",
    },

    filedAt: { type: Date, required: true, default: Date.now, index: true },
    dueAt: { type: Date, required: true },
    resolvedAt: { type: Date },
    confirmedAt: { type: Date },

    resolutionProof: { type: ResolutionProofSchema },
    citizenFeedback: { type: CitizenFeedbackSchema },
    extensionRequest: { type: ExtensionRequestSchema },
    reopenCount: { type: Number, default: 0 },
    confirmationDeadline: { type: Date },

    duplicateOf: { type: Schema.Types.ObjectId, ref: "Grievance" },
    linkedComplaintIds: [{ type: String }],

    sourceSystem: { type: String },
    sourceRefId: { type: String },
    evidencePhotoUrl: { type: String },
    filedByOfficer: { type: Schema.Types.ObjectId, ref: "User" },
    requestedOfficer: { type: Schema.Types.ObjectId, ref: "User" },

    lastEventHash: { type: String, default: "GENESIS" },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

// Geo index for "nearby complaints" (CM visit mode) and dedup proximity checks
GrievanceSchema.index({ lat: 1, lng: 1 });
// Compound index for the most common admin query pattern
GrievanceSchema.index({ status: 1, priority: 1, filedAt: -1 });
GrievanceSchema.index({ departmentCode: 1, status: 1 });
GrievanceSchema.index({ assignedOfficer: 1, status: 1 });

export const Grievance = model<IGrievance>("Grievance", GrievanceSchema);
