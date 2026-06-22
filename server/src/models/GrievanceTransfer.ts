import { Schema, model, Document, Types } from "mongoose";

/**
 * Structured case-forwarding chain — modeled directly on how UP's
 * Jansunwai portal (jansunwai.up.nic.in) shows citizens a transparent
 * ledger of every hand-off: who forwarded the case to whom, the
 * instruction given, the responding officer's report, and the resulting
 * status — e.g. a Divisional Commissioner (मंडलायुक्त) forwarding to a
 * Sub-District Magistrate with an order, and the SDM's आख्या (report)
 * coming back, all visible on the citizen's tracking page.
 *
 * This is deliberately a SEPARATE model from OfficerTask. OfficerTask is
 * a lightweight peer request ("can you help with this") that does not
 * change who officially owns the grievance. GrievanceTransfer is a real
 * transfer of case ownership — it updates Grievance.assignedOfficer,
 * it's chained into the hash-audit trail, and unlike OfficerTask it is
 * citizen-visible by design, because the whole point of this feature is
 * the transparency Jansunwai demonstrates: a citizen should be able to
 * see the full chain their case has traveled, not just the current status.
 */

export type TransferStatus = "Pending" | "Responded";

export interface IGrievanceTransfer extends Document {
  grvId: string;
  fromOfficer: Types.ObjectId;
  fromOfficerName: string; // denormalized for citizen display without a populate join
  toOfficer: Types.ObjectId;
  toOfficerName: string;
  instruction: string; // the "आदेश" — why this is being forwarded, what's being asked
  forwardedAt: Date;
  // The forwarding officer's expected timeline for a response — Indian
  // government grievance portals (Jansunwai, CPGRAMS) consistently show
  // an expected-disposal date set by whoever escalates a case, not just
  // a system-wide fixed SLA. Optional: if the forwarding officer doesn't
  // set one, the case still inherits the grievance's own SLA clock.
  expectedResponseAt?: Date;
  response?: string; // the "आख्या" — the receiving officer's report back
  responsePhotoUrl?: string;
  respondedAt?: Date;
  status: TransferStatus;
}

const GrievanceTransferSchema = new Schema<IGrievanceTransfer>({
  grvId: { type: String, required: true, index: true },
  fromOfficer: { type: Schema.Types.ObjectId, ref: "User", required: true },
  fromOfficerName: { type: String, required: true },
  toOfficer: { type: Schema.Types.ObjectId, ref: "User", required: true },
  toOfficerName: { type: String, required: true },
  instruction: { type: String, required: true },
  forwardedAt: { type: Date, required: true, default: Date.now },
  expectedResponseAt: { type: Date },
  response: { type: String },
  responsePhotoUrl: { type: String },
  respondedAt: { type: Date },
  status: { type: String, enum: ["Pending", "Responded"], default: "Pending", index: true },
});

GrievanceTransferSchema.index({ grvId: 1, forwardedAt: 1 });

export const GrievanceTransfer = model<IGrievanceTransfer>("GrievanceTransfer", GrievanceTransferSchema);
