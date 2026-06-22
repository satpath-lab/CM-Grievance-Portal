import { Schema, model, Document } from "mongoose";

/**
 * Hash-chained audit trail. See utils/hashChain.ts for the integrity
 * model. Every status transition on a grievance writes one of these,
 * and /api/audit/verify/:grvId can replay the chain to detect any
 * retroactive tampering.
 */

export interface IAuditEvent extends Document {
  grvId: string;
  status: string;
  note: string;
  actorId: string;
  actorRole: string;
  timestamp: Date;
  prevHash: string;
  hash: string;
}

const AuditEventSchema = new Schema<IAuditEvent>({
  grvId: { type: String, required: true, index: true },
  status: { type: String, required: true },
  note: { type: String, default: "" },
  actorId: { type: String, required: true },
  actorRole: { type: String, required: true },
  timestamp: { type: Date, required: true },
  prevHash: { type: String, required: true },
  hash: { type: String, required: true },
});

AuditEventSchema.index({ grvId: 1, timestamp: 1 });

export const AuditEvent = model<IAuditEvent>("AuditEvent", AuditEventSchema);
