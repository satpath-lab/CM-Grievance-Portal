import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { connectDB, disconnectDB } from "./config/db";
import { Department } from "./models/Department";
import { Role } from "./models/Role";
import { User } from "./models/User";
import { Grievance } from "./models/Grievance";
import { AuditEvent } from "./models/AuditEvent";
import { DispatchEvent } from "./models/DispatchEvent";
import { Visit } from "./models/Visit";
import { OfficerTask } from "./models/OfficerTask";
import { ProcessedMention } from "./models/ProcessedMention";
import { GrievanceTransfer } from "./models/GrievanceTransfer";
import { Announcement } from "./models/Announcement";
import { fileGrievance, dispatchGrievance, assignOfficer, markResolvedByOfficer, citizenConfirmResolution } from "./services/grievanceService";

dotenv.config();

/**
 * Default permission bundles for the system roles. citizen and
 * field_officer intentionally have NO Role document — they use
 * requireRole's structural identity check, not permissions (see
 * models/Role.ts and models/User.ts for why). cmo_team, dept_admin, cm,
 * and super_admin each get one so resolvePermissions() at login has
 * something to look up; super_admin's permissions array is technically
 * redundant since requirePermission() always passes super_admin
 * regardless, but seeding it anyway keeps the Roles list page accurate
 * for whoever's looking at it.
 */
const ROLES = [
  {
    code: "cmo_team",
    label: "CMO Operations Team",
    labelHi: "सीएमओ संचालन टीम",
    isSystem: true,
    permissions: [
      "view_dashboard", "view_audit", "dispatch_grievance", "assign_officer",
      "manage_departments", "manage_social_media", "manage_open311",
      "generate_executive_report", "receive_alerts", "broadcast_announcements",
    ],
  },
  {
    code: "dept_admin",
    label: "Department Administrator",
    labelHi: "विभाग प्रशासक",
    isSystem: true,
    permissions: ["view_dashboard", "dispatch_grievance", "assign_officer", "manage_social_media", "manage_open311", "broadcast_announcements"],
  },
  {
    code: "cm",
    label: "Chief Minister",
    labelHi: "मुख्यमंत्री",
    isSystem: true,
    permissions: ["view_dashboard", "view_audit", "generate_executive_report", "receive_alerts"],
  },
  {
    code: "super_admin",
    label: "Super Administrator",
    labelHi: "सुपर एडमिन",
    isSystem: true,
    permissions: [
      "view_dashboard", "view_audit", "dispatch_grievance", "assign_officer",
      "manage_departments", "manage_social_media", "manage_open311",
      "generate_executive_report", "receive_alerts", "manage_roles", "manage_users",
      "broadcast_announcements",
    ],
  },
];

const DEPARTMENTS = [
  { name: "Delhi Jal Board", nameHi: "दिल्ली जल बोर्ड", code: "DJB", headName: "R. K. Sharma", headPhone: "9810000001", categories: ["Water & Sanitation"], defaultSlaHours: 24 },
  { name: "Public Works Department", nameHi: "लोक निर्माण विभाग", code: "PWD", headName: "Anita Verma", headPhone: "9810000002", categories: ["Roads & Infrastructure"], defaultSlaHours: 48 },
  { name: "BSES / TPDDL", nameHi: "बीएसईएस / टीपीडीडीएल", code: "BSES", headName: "Vikram Singh", headPhone: "9810000003", categories: ["Power & Electricity"], defaultSlaHours: 12 },
  { name: "Delhi Police", nameHi: "दिल्ली पुलिस", code: "DLP", headName: "ACP Meena Kumari", headPhone: "9810000004", categories: ["Public Safety"], defaultSlaHours: 2 },
  { name: "Directorate of Education", nameHi: "शिक्षा निदेशालय", code: "DOE", headName: "Sunil Gupta", headPhone: "9810000005", categories: ["Education"], defaultSlaHours: 72 },
  { name: "Health & Family Welfare Dept.", nameHi: "स्वास्थ्य एवं परिवार कल्याण विभाग", code: "HFW", headName: "Dr. Priya Nair", headPhone: "9810000006", categories: ["Health Services"], defaultSlaHours: 48 },
  { name: "MCD Sanitation Wing", nameHi: "एमसीडी स्वच्छता विंग", code: "MCD", headName: "Rajesh Tomar", headPhone: "9810000007", categories: ["Sanitation & Waste"], defaultSlaHours: 24 },
  { name: "DIMTS / DTC", nameHi: "डीआईएमटीएस / डीटीसी", code: "DTC", headName: "Kavita Rawat", headPhone: "9810000008", categories: ["Transport"], defaultSlaHours: 48 },
  { name: "MCD Veterinary Wing", nameHi: "एमसीडी पशु चिकित्सा विंग", code: "MCDV", headName: "Dr. Arjun Mehta", headPhone: "9810000009", categories: ["Stray Animals"], defaultSlaHours: 24 },
  { name: "MCD Enforcement Wing", nameHi: "एमसीडी प्रवर्तन विंग", code: "MCDE", headName: "Suresh Yadav", headPhone: "9810000010", categories: ["Encroachment & Illegal Construction"], defaultSlaHours: 72 },
  { name: "District Administration", nameHi: "जिला प्रशासन", code: "DA", headName: "DM Office", headPhone: "9810000011", categories: ["Other"], defaultSlaHours: 72 },
];

const DELHI_DISTRICTS = [
  { name: "New Delhi", lat: 28.6139, lng: 77.209 },
  { name: "South Delhi", lat: 28.5355, lng: 77.241 },
  { name: "North Delhi", lat: 28.7041, lng: 77.1025 },
  { name: "East Delhi", lat: 28.6279, lng: 77.2773 },
  { name: "West Delhi", lat: 28.6692, lng: 77.0815 },
  { name: "Shahdara", lat: 28.6789, lng: 77.2895 },
  { name: "Dwarka", lat: 28.5921, lng: 77.046 },
  { name: "Rohini", lat: 28.7041, lng: 77.1025 },
  { name: "Karol Bagh", lat: 28.6517, lng: 77.1909 },
  { name: "Najafgarh", lat: 28.6092, lng: 76.9795 },
];

const SAMPLE_COMPLAINTS: Array<{ text: string; channel?: string }> = [
  { text: "Water supply not coming for three days, residents buying tankers" },
  { text: "पानी नहीं आ रहा तीन दिन से, नाली भी बंद है" },
  { text: "Sadak pe bada gaddha hai, accident ho sakta hai" },
  { text: "Large pothole on main road near market causing accidents daily" },
  { text: "बिजली नहीं है 24 घंटे से, ट्रांसफार्मर खराब हो गया" },
  { text: "Power cut twenty four hours no electricity, transformer failed" },
  { text: "Chain snatching incident near metro station, police not responding" },
  { text: "Stray dogs attacking people on the street, children bitten" },
  { text: "कचरा नहीं उठाया 10 दिन से, बहुत बदबू आ रही है" },
  { text: "Garbage not collected ten days, colony stench and flies" },
  { text: "Hospital doctor absent, ward patients suffering no treatment" },
  { text: "School teacher beating students, parents complained but ignored" },
  { text: "Sewage overflow main road, health hazard entire block flooded" },
  { text: "Illegal construction blocking drainage channel in residential area" },
  { text: "Bus route cancelled without notice, regular commuters stranded" },
  { text: "Live electric wires exposed hanging on street, children playing nearby", channel: "CM Helpline" },
  { text: "Building collapse risk, cracks appearing on school wall" },
  { text: "Dengue fever spreading in area, no fogging done" },
  { text: "Streetlights broken entire stretch, unsafe for pedestrians at night" },
  { text: "Open sewer near park, children playing nearby health risk" },
];

async function seed() {
  await connectDB();
  console.log("Connected. Clearing existing data...");

  await Promise.all([
    Department.deleteMany({}),
    Role.deleteMany({}),
    User.deleteMany({}),
    Grievance.deleteMany({}),
    AuditEvent.deleteMany({}),
    DispatchEvent.deleteMany({}),
    Visit.deleteMany({}),
    OfficerTask.deleteMany({}),
    ProcessedMention.deleteMany({}),
    GrievanceTransfer.deleteMany({}),
    Announcement.deleteMany({}),
  ]);

  console.log("Seeding roles...");
  await Role.insertMany(ROLES);

  console.log("Seeding departments...");
  const deptDocs = await Department.insertMany(DEPARTMENTS);
  const deptByCode = new Map(deptDocs.map((d) => [d.code, d]));

  console.log("Seeding users...");
  const passwordHash = await bcrypt.hash("password123", 10);

  const cm = await User.create({
    name: "Rekha Gupta",
    phone: "9999900001",
    passwordHash,
    role: "cm",
    preferredLanguage: "hi",
  });

  const cmoTeam = await User.create({
    name: "CMO Operations Team",
    phone: "9999900002",
    passwordHash,
    role: "cmo_team",
    preferredLanguage: "en",
  });

  const superAdmin = await User.create({
    name: "System Administrator",
    phone: "9999900003",
    passwordHash,
    role: "super_admin",
    preferredLanguage: "en",
  });

  const officerNames = [
    "Ramesh Kumar", "Sunita Devi", "Vikas Chaudhary", "Pooja Sharma",
    "Anil Yadav", "Kiran Bedi", "Mohit Gupta", "Deepa Singh",
    "Rajeev Malhotra", "Sneha Tiwari",
  ];

  const officers = [];
  for (let i = 0; i < officerNames.length; i++) {
    const deptCode = DEPARTMENTS[i % DEPARTMENTS.length].code;
    const dept = deptByCode.get(deptCode)!;
    const officer = await User.create({
      name: officerNames[i],
      phone: `98000000${10 + i}`,
      passwordHash,
      role: "field_officer",
      department: dept._id,
      preferredLanguage: i % 2 === 0 ? "hi" : "en",
    });
    officers.push(officer);
  }

  const deptAdmin = await User.create({
    name: "DJB Department Head",
    phone: "9999900004",
    passwordHash,
    role: "dept_admin",
    department: deptByCode.get("DJB")!._id,
    preferredLanguage: "en",
  });

  console.log("Filing sample grievances...");
  const citizenNames = [
    "Amit Sharma", "Priya Singh", "Mohammad Aslam", "Geeta Devi", "Rahul Verma",
    "Fatima Khan", "Suresh Chand", "Anjali Gupta", "Vijay Kumar", "Lakshmi Nair",
    "Imran Ali", "Kavita Joshi", "Sandeep Yadav", "Meera Pillai", "Ashok Tiwari",
    "Nazia Begum", "Ravi Shankar", "Pinky Sharma", "Dinesh Rawat", "Shabana Bano",
  ];

  let resolvedCount = 0;
  let confirmedCount = 0;

  for (let i = 0; i < SAMPLE_COMPLAINTS.length; i++) {
    const { text, channel } = SAMPLE_COMPLAINTS[i];
    const district = DELHI_DISTRICTS[i % DELHI_DISTRICTS.length];
    // jitter the coordinates slightly so points aren't perfectly stacked
    const lat = district.lat + (Math.random() - 0.5) * 0.02;
    const lng = district.lng + (Math.random() - 0.5) * 0.02;

    const { grievance } = await fileGrievance({
      citizenName: citizenNames[i % citizenNames.length],
      citizenPhone: `97${String(10000000 + i).padStart(8, "0")}`,
      descriptionRaw: text,
      district: district.name,
      lat,
      lng,
      channel: channel || (i % 5 === 0 ? "CM Helpline" : "Web Portal"),
    });

    // Dispatch most of them
    if (i % 6 !== 0) {
      await dispatchGrievance(grievance.grvId, "CMO Operations Team");

      // Assign an officer in the right department
      const dept = await Department.findById(grievance.department);
      const deptOfficers = officers.filter((o) => String(o.department) === String(dept?._id));
      const officer = deptOfficers[i % Math.max(deptOfficers.length, 1)] || officers[i % officers.length];
      await assignOfficer(grievance.grvId, String(officer._id), "CMO Operations Team");

      // Resolve about half of the assigned ones, with realistic variation:
      // most have matching photo location, a couple are deliberately
      // mismatched to demonstrate the false-closure detector.
      if (i % 2 === 0) {
        const mismatch = i === 12; // one deliberately "fake" resolution for the demo
        const photoLat = mismatch ? lat + 0.15 : lat + (Math.random() - 0.5) * 0.0005;
        const photoLng = mismatch ? lng + 0.15 : lng + (Math.random() - 0.5) * 0.0005;

        await markResolvedByOfficer({
          grvId: grievance.grvId,
          officerId: String(officer._id),
          officerName: officer.name,
          photoUrl: `https://placehold.co/400x300?text=Resolved+${grievance.grvId}`,
          officerLat: photoLat,
          officerLng: photoLng,
        });
        resolvedCount++;

        // Citizen confirms most, disputes one, ignores one (auto-close demo)
        if (i % 4 === 0) {
          await citizenConfirmResolution(grievance.grvId, true, "Thank you, fixed properly", grievance.citizenPhone);
          confirmedCount++;
        } else if (i === 8) {
          await citizenConfirmResolution(grievance.grvId, false, "Not actually fixed, same problem", grievance.citizenPhone);
        }
        // else: leave pending confirmation to demonstrate the auto-close sweep
      }
    }
  }

  console.log(`Seeded ${DEPARTMENTS.length} departments, ${officers.length + 4} users, ${SAMPLE_COMPLAINTS.length} grievances`);
  console.log(`(${resolvedCount} marked resolved by officers, ${confirmedCount} citizen-confirmed)`);
  console.log("\n--- Login credentials (password: password123) ---");
  console.log(`CM:                phone ${cm.phone} (${cm.name})`);
  console.log(`CMO Team:          phone ${cmoTeam.phone} (${cmoTeam.name})`);
  console.log(`Super Admin:       phone ${superAdmin.phone} (${superAdmin.name})`);
  console.log(`Dept Admin (DJB):  phone ${deptAdmin.phone} (${deptAdmin.name})`);
  console.log(`Field Officer:     phone ${officers[0].phone} (${officers[0].name})`);

  await disconnectDB();
  console.log("\nDone.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
