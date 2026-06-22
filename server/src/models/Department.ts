import { Schema, model, Document } from "mongoose";

/**
 * Departments are config data, not hardcoded — the brief explicitly asks
 * for "super easy to add more departments." A super_admin/cmo_team user
 * can create new departments and categories through the admin UI without
 * touching code; the classifier's static DEPARTMENTS map (nlp/classifier.ts)
 * seeds the initial set but routing for newly created categories can be
 * configured here and looked up at dispatch time.
 */

export interface IDepartment extends Document {
  name: string;
  nameHi: string; // Hindi translation, shown in citizen/admin UI when hi is selected
  code: string; // short code e.g. DJB, PWD — used in dispatch ref numbers
  headName: string;
  headPhone: string;
  categories: string[]; // grievance categories this department owns
  defaultSlaHours: number;
  openApiBaseUrl?: string; // if this department exposes its own Open311-style API
  openApiKey?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentSchema = new Schema<IDepartment>(
  {
    name: { type: String, required: true, unique: true },
    nameHi: { type: String, required: true },
    code: { type: String, required: true, unique: true, uppercase: true },
    headName: { type: String, default: "" },
    headPhone: { type: String, default: "" },
    categories: [{ type: String }],
    defaultSlaHours: { type: Number, default: 48 },
    openApiBaseUrl: { type: String },
    // select: false — excluded from every query by default (this route's
    // explicit .select("-openApiKey") above is now belt-and-suspenders;
    // any future endpoint that does Department.find() without thinking
    // about this field stays safe too, the same pattern used for
    // Grievance.trackingSecret).
    openApiKey: { type: String, select: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Department = model<IDepartment>("Department", DepartmentSchema);
