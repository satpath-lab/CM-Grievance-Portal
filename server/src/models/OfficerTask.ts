import { Schema, model, Document, Types } from "mongoose";

/**
 * Officer-to-officer task delegation.
 *
 * Real workflow gap this closes: an officer in the field finds something
 * outside their own remit (a PWD officer notices a downed power line —
 * not their department, but worth flagging directly to someone) or needs
 * help from a colleague on a complaint already assigned to them (a junior
 * officer tagging a senior for a complex case). Before this, the only way
 * to route work between officers was through a CMO/admin re-dispatching a
 * full Grievance — there was no lightweight "hey, can you handle this,
 * report back when done" mechanism between officers themselves.
 *
 * Distinct from Grievance: a task can exist standalone (officer-to-officer
 * note with no citizen complaint behind it yet) or be linked to an
 * existing grvId. The assignee MUST submit a completion report to close
 * it — an empty "done" click isn't accepted — which is itself a smaller
 * version of the same anti-false-closure principle the rest of the
 * system uses for citizen-facing complaints.
 */

export type TaskStatus = "Open" | "In Progress" | "Reported" | "Closed";

export interface IOfficerTask extends Document {
  taskId: string; // e.g. TASK-2026-00001
  fromOfficer: Types.ObjectId;
  toOfficer: Types.ObjectId;
  title: string;
  instructions: string;
  linkedGrvId?: string; // optional — ties this task to an existing Grievance
  status: TaskStatus;
  dueAt?: Date;
  report?: string; // assignee's completion report — required to move to "Reported"
  reportPhotoUrl?: string;
  reportedAt?: Date;
  closedAt?: Date;
  closedBy?: Types.ObjectId; // the original tagger confirms and closes, mirroring citizen-confirm
  createdAt: Date;
}

const OfficerTaskSchema = new Schema<IOfficerTask>(
  {
    taskId: { type: String, required: true, unique: true, index: true },
    fromOfficer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    toOfficer: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true },
    instructions: { type: String, required: true },
    linkedGrvId: { type: String },
    status: { type: String, enum: ["Open", "In Progress", "Reported", "Closed"], default: "Open", index: true },
    dueAt: { type: Date },
    report: { type: String },
    reportPhotoUrl: { type: String },
    reportedAt: { type: Date },
    closedAt: { type: Date },
    closedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const OfficerTask = model<IOfficerTask>("OfficerTask", OfficerTaskSchema);
