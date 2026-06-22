import { Schema, model, Document } from "mongoose";

/**
 * Dynamic role/permission system — scoped deliberately.
 *
 * This covers the ADMIN-TIER dashboard surface: dashboard viewing,
 * dispatching, officer assignment, audit access, department management,
 * social media moderation, Open311 config, executive reports, and role/
 * user management itself. A super_admin can create as many custom roles
 * as needed here — e.g. "Read-Only Auditor" (view_dashboard + view_audit,
 * nothing else), "PWD Regional Coordinator" (dispatch_grievance +
 * assign_officer only), etc. — by picking permissions from PERMISSION_CATALOG.
 *
 * What this deliberately does NOT touch: citizen, field_officer, and cm
 * are not "permission bundles" — they're structurally different
 * workflows (anonymous filing, geotagged photo resolution, mobile visit
 * mode) hardcoded around those specific identities, not a checklist of
 * dashboard feature toggles. Folding them into this same system would
 * make those special flows fragile for no real benefit — "different
 * dashboard types for different officials" means CMO-tier staff, which
 * is exactly what this targets.
 */

export const PERMISSION_CATALOG = [
  { key: "view_dashboard", label: "View operations dashboard", labelHi: "संचालन डैशबोर्ड देखें" },
  { key: "view_audit", label: "View integrity audit & accountability scores", labelHi: "अखंडता जांच और जवाबदेही स्कोर देखें" },
  { key: "dispatch_grievance", label: "Dispatch grievances to departments", labelHi: "शिकायतें विभागों को भेजें" },
  { key: "assign_officer", label: "Assign/auto-assign field officers", labelHi: "फील्ड अधिकारी नियुक्त करें" },
  { key: "manage_departments", label: "Create/edit departments", labelHi: "विभाग बनाएं/संपादित करें" },
  { key: "manage_social_media", label: "Moderate social media auto-extraction", labelHi: "सोशल मीडिया मॉडरेशन" },
  { key: "manage_open311", label: "View/configure MCD311 integration", labelHi: "MCD311 एकीकरण प्रबंधन" },
  { key: "generate_executive_report", label: "Generate executive reports", labelHi: "कार्यकारी रिपोर्ट जनरेट करें" },
  { key: "broadcast_announcements", label: "Send bulk priority announcements to officers/departments", labelHi: "अधिकारियों/विभागों को सामूहिक संदेश भेजें" },
  { key: "receive_alerts", label: "Receive real-time life-threatening alerts", labelHi: "रीयल-टाइम अलर्ट प्राप्त करें" },
  { key: "manage_roles", label: "Create/edit custom roles (super admin only in practice)", labelHi: "कस्टम भूमिकाएं बनाएं" },
  { key: "manage_users", label: "View/reassign user roles", labelHi: "उपयोगकर्ता भूमिकाएं प्रबंधित करें" },
] as const;

export type PermissionKey = (typeof PERMISSION_CATALOG)[number]["key"];

export interface IRole extends Document {
  code: string; // unique, used as User.role value for admin-tier accounts
  label: string;
  labelHi: string;
  permissions: PermissionKey[];
  isSystem: boolean; // true for the original built-in roles — not deletable, not editable, to protect core functionality
  createdBy?: string;
  createdAt: Date;
}

const RoleSchema = new Schema<IRole>(
  {
    code: { type: String, required: true, unique: true, index: true },
    label: { type: String, required: true },
    labelHi: { type: String, required: true },
    permissions: [{ type: String }],
    isSystem: { type: Boolean, default: false },
    createdBy: { type: String },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false } }
);

export const Role = model<IRole>("Role", RoleSchema);
