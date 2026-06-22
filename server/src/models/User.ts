import { Schema, model, Document, Types } from "mongoose";
import bcrypt from "bcryptjs";

/**
 * Roles (brief requires "at least 2 — CM, team — more based on research"):
 *
 *   citizen        — files and tracks grievances, confirms/disputes closure
 *   field_officer  — assigned grievances, resolves with geotagged photo proof
 *   dept_admin     — oversees officers within one department, reassigns load
 *   cmo_team       — the analysts/operators (the "team" role) — full ops view,
 *                    manages departments/categories, runs audits, sees everything
 *   cm             — Chief Minister — read-mostly aggregate + mobile "visit mode"
 *   super_admin    — system configuration, user management
 *
 * Beyond these six structural roles, a super_admin can create custom
 * admin-tier roles (see models/Role.ts) — e.g. "Read-Only Auditor",
 * "PWD Regional Coordinator" — which are permission bundles, not new
 * structural identities. citizen/field_officer/cm are deliberately NOT
 * customizable this way since their behavior (anonymous filing, geotagged
 * photo resolution, mobile visit mode) is hardcoded around that specific
 * identity, not a checklist of dashboard toggles. UserRole is therefore a
 * plain string at the type level — it holds either one of the six system
 * codes below or a custom Role.code — with SYSTEM_ROLES as the reference
 * list for validation at registration/role-assignment time.
 */
export const SYSTEM_ROLES = [
  "citizen",
  "field_officer",
  "dept_admin",
  "cmo_team",
  "cm",
  "super_admin",
] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];
export type UserRole = string;

export interface IUser extends Document {
  name: string;
  phone: string;
  email?: string;
  passwordHash: string;
  role: UserRole;
  department?: Types.ObjectId; // required for field_officer / dept_admin
  preferredLanguage: "en" | "hi";
  isActive: boolean;
  // Self-service availability toggle for field officers — without this,
  // an officer on leave keeps silently accumulating auto-assigned cases
  // nobody notices are stuck, since findLeastLoadedOfficer has no way to
  // know they're unavailable. Admins also see this on the workload tab.
  onLeave: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, index: true },
    email: { type: String, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    // Not a strict Mongoose enum anymore — custom admin-tier role codes
    // are validated at the application layer (auth.routes.ts / roles
    // CRUD) against the Role collection instead, since the valid set
    // now grows at runtime as super_admin creates new roles.
    role: {
      type: String,
      required: true,
      default: "citizen",
    },
    department: { type: Schema.Types.ObjectId, ref: "Department" },
    preferredLanguage: { type: String, enum: ["en", "hi"], default: "en" },
    onLeave: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

UserSchema.methods.comparePassword = async function (candidate: string) {
  return bcrypt.compare(candidate, this.passwordHash);
};

UserSchema.statics.hashPassword = async function (plain: string) {
  return bcrypt.hash(plain, 10);
};

export const User = model<IUser>("User", UserSchema);
