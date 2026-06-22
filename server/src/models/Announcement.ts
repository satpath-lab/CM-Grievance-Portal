import { Schema, model, Document, Types } from "mongoose";

/**
 * Broadcast announcements — "bulk priority messages" and "tag a whole
 * department, not just one officer" from the brief. A CMO/dept_admin
 * can push a message to every officer in a department ("prioritize
 * garbage complaints in Dwarka this week") or to one specific officer,
 * without it being tied to any single grievance — unlike OfficerTask
 * (peer-to-peer, one task) or GrievanceTransfer (case ownership transfer),
 * this is a one-to-many or one-to-one NOTICE, not a work item with a
 * required report-back.
 */

export type AnnouncementTarget = "department" | "officer" | "all_officers";
export type AnnouncementPriority = "Normal" | "Urgent";

export interface IAnnouncement extends Document {
  fromUser: Types.ObjectId;
  fromUserName: string;
  targetType: AnnouncementTarget;
  targetDepartmentCode?: string;
  targetOfficerId?: Types.ObjectId;
  message: string;
  priority: AnnouncementPriority;
  createdAt: Date;
}

const AnnouncementSchema = new Schema<IAnnouncement>(
  {
    fromUser: { type: Schema.Types.ObjectId, ref: "User", required: true },
    fromUserName: { type: String, required: true },
    targetType: { type: String, enum: ["department", "officer", "all_officers"], required: true },
    targetDepartmentCode: { type: String, index: true },
    targetOfficerId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    message: { type: String, required: true },
    priority: { type: String, enum: ["Normal", "Urgent"], default: "Normal" },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false } }
);

export const Announcement = model<IAnnouncement>("Announcement", AnnouncementSchema);
