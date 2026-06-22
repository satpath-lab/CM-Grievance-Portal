import { Schema, model, Document, Types } from "mongoose";

/**
 * Visit logs — addresses the brief's "show nearby problems when CM is on
 * a visit" and "visit logs" suggestions. When the CM or a senior officer
 * checks in at a location, the system finds open grievances within a
 * configurable radius so the visit can directly resolve or inspect them
 * on the spot, and the visit itself becomes an auditable record (where,
 * when, who, what was discussed/decided).
 */

export interface IVisit extends Document {
  visitorUser: Types.ObjectId;
  visitorRole: string;
  lat: number;
  lng: number;
  locationLabel: string;
  district: string;
  checkedInAt: Date;
  notes: string;
  nearbyGrievanceIds: string[]; // snapshot of grvIds found nearby at check-in time
  resolvedOnSiteIds: string[]; // grvIds the visitor marked as addressed during the visit
  photoUrl?: string;
}

const VisitSchema = new Schema<IVisit>(
  {
    visitorUser: { type: Schema.Types.ObjectId, ref: "User", required: true },
    visitorRole: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    locationLabel: { type: String, default: "" },
    district: { type: String, default: "" },
    checkedInAt: { type: Date, required: true, default: Date.now },
    notes: { type: String, default: "" },
    nearbyGrievanceIds: [{ type: String }],
    resolvedOnSiteIds: [{ type: String }],
    photoUrl: { type: String },
  },
  { timestamps: true }
);

VisitSchema.index({ lat: 1, lng: 1 });

export const Visit = model<IVisit>("Visit", VisitSchema);
