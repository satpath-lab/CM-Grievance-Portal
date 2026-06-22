"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type Lang = "en" | "hi";

/**
 * Bilingual support is mandatory per the brief (North India / Delhi CM
 * portal) and applies to every role-facing surface: citizen filing and
 * tracking, field officer queue, CMO/admin dashboard, and the CM view.
 * Rather than per-component strings, all UI text lives in this single
 * dictionary so a translation gap is immediately obvious (missing key)
 * and the toggle works identically everywhere.
 */

const dict = {
  en: {
    // Common
    "app.title": "CM Grievance Dashboard",
    "app.subtitle": "Government of Delhi",
    "lang.toggle": "हिंदी",
    "nav.citizen": "File a Complaint",
    "nav.track": "Track Complaint",
    "nav.login": "Login",
    "nav.logout": "Logout",
    "common.loading": "Loading…",
    "common.submit": "Submit",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.back": "Back",
    "common.search": "Search",
    "common.filter": "Filter",
    "common.refresh": "Refresh",
    "common.name": "Name",
    "common.phone": "Phone number",
    "common.district": "District",
    "common.address": "Address (optional)",
    "common.required": "required",
    "common.yes": "Yes",
    "common.no": "No",
    "common.confirm": "Confirm",
    "common.error": "Something went wrong. Please try again.",

    // Citizen — file complaint
    "citizen.heading": "File a Grievance",
    "citizen.subheading": "Write in English, Hindi, or Hinglish — the system understands all three.",
    "citizen.description.label": "Describe your problem",
    "citizen.description.placeholder": "e.g. पानी नहीं आ रहा तीन दिन से / Water not coming for 3 days / Paani nahi aa raha",
    "citizen.useLocation": "Use my current location",
    "citizen.locationCaptured": "Location captured",
    "citizen.nlp.detecting": "Analyzing…",
    "citizen.nlp.language": "Detected language",
    "citizen.nlp.category": "Category",
    "citizen.nlp.priority": "Priority",
    "citizen.nlp.department": "Will be sent to",
    "citizen.nlp.sla": "Expected response time",
    "citizen.nlp.hours": "hours",
    "citizen.submit": "Submit Grievance",
    "citizen.submitted.heading": "Grievance Filed Successfully",
    "citizen.submitted.refLabel": "Your reference number",
    "citizen.submitted.note": "Save this number — you'll need it with your phone number to track status and confirm resolution.",
    "citizen.submitted.lifeThreatening": "This has been flagged as life-threatening and fast-tracked for immediate attention.",
    "citizen.duplicate.warning": "A similar complaint was already filed nearby recently (Ref: {ref}). Yours has been linked to it.",
    "citizen.fileAnother": "File Another Complaint",

    // Citizen — tracking
    "track.heading": "Track Your Complaint",
    "track.refLabel": "Reference number",
    "track.refPlaceholder": "e.g. GRV-2026-00001",
    "track.phoneLabel": "Phone number used when filing",
    "track.button": "Track Status",
    "track.notFound": "No grievance found with this reference number and phone number.",
    "track.status": "Current status",
    "track.filedOn": "Filed on",
    "track.dueBy": "Expected resolution by",
    "track.officer": "Assigned officer",
    "track.awaitingConfirmation.heading": "Has this been resolved?",
    "track.awaitingConfirmation.body": "The assigned officer has marked this as resolved. Please confirm whether the issue is actually fixed — your confirmation matters and prevents false closures.",
    "track.confirm.satisfied": "Yes, it's fixed",
    "track.confirm.notSatisfied": "No, not fixed — reopen",
    "track.confirm.thanks": "Thank you for confirming.",
    "track.reopened.note": "This complaint has been reopened based on your feedback and sent back to the department.",

    // Login
    "login.heading": "Staff & CM Login",
    "login.phone": "Phone number",
    "login.password": "Password",
    "login.button": "Login",
    "login.error": "Invalid phone number or password",

    // Officer
    "officer.heading": "My Grievance Queue",
    "officer.subheading": "Complaints assigned to you",
    "officer.empty": "No grievances currently assigned to you.",
    "officer.startProgress": "Start Working",
    "officer.markResolved": "Mark Resolved",
    "officer.resolve.heading": "Mark as Resolved",
    "officer.resolve.photoNote": "A photo with your current location is required as proof of resolution. This location is automatically compared against the original complaint site.",
    "officer.resolve.capturePhoto": "Capture / Upload Photo",
    "officer.resolve.captureLocation": "Confirm My Current Location",
    "officer.resolve.submit": "Submit Resolution",
    "officer.resolve.mismatchWarning": "Warning: your current location is far from the complaint site. This will be flagged for review.",
    "officer.contacts.heading": "Officer Directory",

    // Admin / CMO team
    "admin.heading": "Operations Dashboard",
    "admin.tabs.overview": "Overview",
    "admin.tabs.grievances": "All Grievances",
    "admin.tabs.workload": "Officer Workload",
    "admin.tabs.audit": "False-Closure Audit",
    "admin.tabs.departments": "Departments",
    "admin.tabs.social": "Social Media",
    "admin.stat.filedToday": "Filed Today",
    "admin.stat.pending": "Open",
    "admin.stat.resolvedWeek": "Resolved This Week",
    "admin.stat.criticalOpen": "Critical Open",
    "admin.stat.lifeThreatening": "Life-Threatening Open",
    "admin.stat.slaBreached": "Escalated (SLA Breached)",
    "admin.stat.awaitingConfirmation": "Awaiting Citizen Confirmation",
    "admin.dispatch": "Dispatch",
    "admin.assignOfficer": "Assign Officer",
    "admin.viewDetail": "View",
    "admin.mcd311.status": "MCD311 Integration",
    "admin.mcd311.live": "Live",
    "admin.mcd311.mock": "Mock mode (no API configured — running standalone)",
    "admin.workload.officer": "Officer",
    "admin.workload.active": "Active",
    "admin.workload.critical": "Critical",
    "admin.workload.resolved": "Resolved",
    "admin.workload.reopened": "Reopened on them",
    "admin.workload.status": "Load",
    "admin.workload.available": "Available",
    "admin.workload.busy": "Busy",
    "admin.workload.overloaded": "Overloaded",
    "admin.audit.heading": "False-Closure & Corruption Audit",
    "admin.audit.officerReported": "Officer-Reported Resolved",
    "admin.audit.citizenConfirmed": "Citizen-Confirmed Resolved",
    "admin.audit.confirmationRate": "Citizen Confirmation Rate",
    "admin.audit.disputed": "Citizen Disputed",
    "admin.audit.autoClosed": "Auto-Closed (No Response)",
    "admin.audit.photoMismatch": "Photo Location Mismatches Flagged",
    "admin.audit.reopenLeaderboard": "Reopen Rate by Officer",
    "admin.audit.flagged": "Flagged for review",
    "admin.social.heading": "Social Media Mentions",
    "admin.social.note": "Mock feed — treated as an equal-priority intake channel. Follower counts are shown for transparency only and never affect priority.",
    "admin.social.ingest": "Convert to Grievance",
    "admin.dept.heading": "Departments",
    "admin.dept.addNew": "Add Department",

    // CM view
    "cm.heading": "Chief Minister — City Overview",
    "cm.greeting": "Namaste, CM",
    "cm.visitMode": "Visit Mode",
    "cm.visitMode.checkin": "Check In Here",
    "cm.visitMode.nearby": "Nearby Open Complaints",
    "cm.visitMode.radius": "Search radius",
    "cm.visitMode.empty": "No open complaints found nearby.",
    "cm.districts.heading": "By District",
    "cm.categories.heading": "By Category",
    "cm.hotspots.heading": "Recurring Hotspots (Last 30 Days)",

    // Status labels
    "status.Pending": "Pending",
    "status.Assigned": "Assigned",
    "status.In Progress": "In Progress",
    "status.Resolved Pending Confirmation": "Resolved — Awaiting Confirmation",
    "status.Confirmed Resolved": "Confirmed Resolved",
    "status.Reopened": "Reopened",
    "status.Auto Closed": "Auto-Closed",
    "status.Escalated": "Escalated",

    // Priority labels
    "priority.Critical": "Critical",
    "priority.High": "High",
    "priority.Normal": "Normal",
  },
  hi: {
    "app.title": "मुख्यमंत्री शिकायत डैशबोर्ड",
    "app.subtitle": "दिल्ली सरकार",
    "lang.toggle": "English",
    "nav.citizen": "शिकायत दर्ज करें",
    "nav.track": "शिकायत ट्रैक करें",
    "nav.login": "लॉगिन",
    "nav.logout": "लॉगआउट",
    "common.loading": "लोड हो रहा है…",
    "common.submit": "जमा करें",
    "common.cancel": "रद्द करें",
    "common.save": "सहेजें",
    "common.back": "वापस",
    "common.search": "खोजें",
    "common.filter": "फ़िल्टर",
    "common.refresh": "रीफ्रेश करें",
    "common.name": "नाम",
    "common.phone": "फ़ोन नंबर",
    "common.district": "ज़िला",
    "common.address": "पता (वैकल्पिक)",
    "common.required": "आवश्यक",
    "common.yes": "हाँ",
    "common.no": "नहीं",
    "common.confirm": "पुष्टि करें",
    "common.error": "कुछ गड़बड़ हो गई। कृपया पुनः प्रयास करें।",

    "citizen.heading": "शिकायत दर्ज करें",
    "citizen.subheading": "अंग्रेज़ी, हिंदी या हिंग्लिश में लिखें — सिस्टम तीनों समझता है।",
    "citizen.description.label": "अपनी समस्या बताएं",
    "citizen.description.placeholder": "जैसे पानी नहीं आ रहा तीन दिन से / Water not coming for 3 days",
    "citizen.useLocation": "मेरी वर्तमान स्थिति का उपयोग करें",
    "citizen.locationCaptured": "स्थिति प्राप्त की गई",
    "citizen.nlp.detecting": "विश्लेषण हो रहा है…",
    "citizen.nlp.language": "पहचानी गई भाषा",
    "citizen.nlp.category": "श्रेणी",
    "citizen.nlp.priority": "प्राथमिकता",
    "citizen.nlp.department": "भेजा जाएगा",
    "citizen.nlp.sla": "अनुमानित प्रतिक्रिया समय",
    "citizen.nlp.hours": "घंटे",
    "citizen.submit": "शिकायत जमा करें",
    "citizen.submitted.heading": "शिकायत सफलतापूर्वक दर्ज हुई",
    "citizen.submitted.refLabel": "आपका संदर्भ क्रमांक",
    "citizen.submitted.note": "इस नंबर को सहेजें — स्थिति ट्रैक करने और समाधान की पुष्टि के लिए आपको अपने फ़ोन नंबर के साथ इसकी आवश्यकता होगी।",
    "citizen.submitted.lifeThreatening": "इसे जीवन-घातक के रूप में चिह्नित किया गया है और तत्काल ध्यान के लिए तेज़ी से आगे बढ़ाया गया है।",
    "citizen.duplicate.warning": "इस क्षेत्र में हाल ही में इसी तरह की शिकायत दर्ज की गई थी (संदर्भ: {ref})। आपकी शिकायत उससे जोड़ दी गई है।",
    "citizen.fileAnother": "एक और शिकायत दर्ज करें",

    "track.heading": "अपनी शिकायत ट्रैक करें",
    "track.refLabel": "संदर्भ क्रमांक",
    "track.refPlaceholder": "जैसे GRV-2026-00001",
    "track.phoneLabel": "दर्ज करते समय इस्तेमाल किया गया फ़ोन नंबर",
    "track.button": "स्थिति देखें",
    "track.notFound": "इस संदर्भ क्रमांक और फ़ोन नंबर से कोई शिकायत नहीं मिली।",
    "track.status": "वर्तमान स्थिति",
    "track.filedOn": "दर्ज की गई",
    "track.dueBy": "समाधान की अनुमानित तिथि",
    "track.officer": "नियुक्त अधिकारी",
    "track.awaitingConfirmation.heading": "क्या यह हल हो गया है?",
    "track.awaitingConfirmation.body": "नियुक्त अधिकारी ने इसे हल किया हुआ चिह्नित किया है। कृपया पुष्टि करें कि समस्या वास्तव में ठीक हुई है या नहीं — आपकी पुष्टि महत्वपूर्ण है और झूठे समाधान को रोकती है।",
    "track.confirm.satisfied": "हाँ, ठीक हो गया",
    "track.confirm.notSatisfied": "नहीं, ठीक नहीं हुआ — फिर से खोलें",
    "track.confirm.thanks": "पुष्टि करने के लिए धन्यवाद।",
    "track.reopened.note": "आपकी प्रतिक्रिया के आधार पर इस शिकायत को फिर से खोला गया है और विभाग को वापस भेजा गया है।",

    "login.heading": "कर्मचारी और मुख्यमंत्री लॉगिन",
    "login.phone": "फ़ोन नंबर",
    "login.password": "पासवर्ड",
    "login.button": "लॉगिन करें",
    "login.error": "अमान्य फ़ोन नंबर या पासवर्ड",

    "officer.heading": "मेरी शिकायत सूची",
    "officer.subheading": "आपको सौंपी गई शिकायतें",
    "officer.empty": "आपको वर्तमान में कोई शिकायत नहीं सौंपी गई है।",
    "officer.startProgress": "काम शुरू करें",
    "officer.markResolved": "हल किया गया चिह्नित करें",
    "officer.resolve.heading": "हल किया गया चिह्नित करें",
    "officer.resolve.photoNote": "समाधान के प्रमाण के रूप में आपकी वर्तमान स्थिति के साथ एक फ़ोटो आवश्यक है। यह स्थिति स्वचालित रूप से मूल शिकायत स्थल से जांची जाती है।",
    "officer.resolve.capturePhoto": "फ़ोटो लें / अपलोड करें",
    "officer.resolve.captureLocation": "मेरी वर्तमान स्थिति की पुष्टि करें",
    "officer.resolve.submit": "समाधान जमा करें",
    "officer.resolve.mismatchWarning": "चेतावनी: आपकी वर्तमान स्थिति शिकायत स्थल से बहुत दूर है। इसे समीक्षा के लिए चिह्नित किया जाएगा।",
    "officer.contacts.heading": "अधिकारी निर्देशिका",

    "admin.heading": "संचालन डैशबोर्ड",
    "admin.tabs.overview": "अवलोकन",
    "admin.tabs.grievances": "सभी शिकायतें",
    "admin.tabs.workload": "अधिकारी कार्यभार",
    "admin.tabs.audit": "झूठे समाधान की जांच",
    "admin.tabs.departments": "विभाग",
    "admin.tabs.social": "सोशल मीडिया",
    "admin.stat.filedToday": "आज दर्ज",
    "admin.stat.pending": "खुली",
    "admin.stat.resolvedWeek": "इस सप्ताह हल",
    "admin.stat.criticalOpen": "गंभीर खुली",
    "admin.stat.lifeThreatening": "जीवन-घातक खुली",
    "admin.stat.slaBreached": "एस्केलेटेड (SLA उल्लंघन)",
    "admin.stat.awaitingConfirmation": "नागरिक पुष्टि की प्रतीक्षा में",
    "admin.dispatch": "भेजें",
    "admin.assignOfficer": "अधिकारी नियुक्त करें",
    "admin.viewDetail": "देखें",
    "admin.mcd311.status": "MCD311 एकीकरण",
    "admin.mcd311.live": "लाइव",
    "admin.mcd311.mock": "मॉक मोड (कोई API कॉन्फ़िगर नहीं — स्वतंत्र रूप से चल रहा है)",
    "admin.workload.officer": "अधिकारी",
    "admin.workload.active": "सक्रिय",
    "admin.workload.critical": "गंभीर",
    "admin.workload.resolved": "हल",
    "admin.workload.reopened": "फिर से खोली गई",
    "admin.workload.status": "भार",
    "admin.workload.available": "उपलब्ध",
    "admin.workload.busy": "व्यस्त",
    "admin.workload.overloaded": "अधिक भारित",
    "admin.audit.heading": "झूठे समाधान और भ्रष्टाचार जांच",
    "admin.audit.officerReported": "अधिकारी द्वारा रिपोर्ट किया हल",
    "admin.audit.citizenConfirmed": "नागरिक द्वारा पुष्टि किया हल",
    "admin.audit.confirmationRate": "नागरिक पुष्टि दर",
    "admin.audit.disputed": "नागरिक ने विवाद किया",
    "admin.audit.autoClosed": "स्वतः बंद (कोई प्रतिक्रिया नहीं)",
    "admin.audit.photoMismatch": "फ़ोटो स्थान बेमेल चिह्नित",
    "admin.audit.reopenLeaderboard": "अधिकारी अनुसार पुनः खोलने की दर",
    "admin.audit.flagged": "समीक्षा के लिए चिह्नित",
    "admin.social.heading": "सोशल मीडिया उल्लेख",
    "admin.social.note": "मॉक फ़ीड — समान प्राथमिकता वाले इनटेक चैनल के रूप में माना जाता है। फॉलोअर संख्या केवल पारदर्शिता के लिए दिखाई जाती है और प्राथमिकता को प्रभावित नहीं करती।",
    "admin.social.ingest": "शिकायत में बदलें",
    "admin.dept.heading": "विभाग",
    "admin.dept.addNew": "नया विभाग जोड़ें",

    "cm.heading": "मुख्यमंत्री — शहर अवलोकन",
    "cm.greeting": "नमस्ते, मुख्यमंत्री जी",
    "cm.visitMode": "विज़िट मोड",
    "cm.visitMode.checkin": "यहाँ चेक इन करें",
    "cm.visitMode.nearby": "आस-पास की खुली शिकायतें",
    "cm.visitMode.radius": "खोज परिधि",
    "cm.visitMode.empty": "आस-पास कोई खुली शिकायत नहीं मिली।",
    "cm.districts.heading": "ज़िले अनुसार",
    "cm.categories.heading": "श्रेणी अनुसार",
    "cm.hotspots.heading": "बार-बार होने वाली समस्याएं (पिछले 30 दिन)",

    "status.Pending": "लंबित",
    "status.Assigned": "नियुक्त",
    "status.In Progress": "कार्य प्रगति पर",
    "status.Resolved Pending Confirmation": "हल — पुष्टि की प्रतीक्षा में",
    "status.Confirmed Resolved": "पुष्टि सहित हल",
    "status.Reopened": "फिर से खोली गई",
    "status.Auto Closed": "स्वतः बंद",
    "status.Escalated": "एस्केलेटेड",

    "priority.Critical": "गंभीर",
    "priority.High": "उच्च",
    "priority.Normal": "सामान्य",
  },
} as const;

export type TranslationKey = keyof typeof dict.en;

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey, vars?: Record<string, string>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("lang") : null;
    if (stored === "en" || stored === "hi") setLangState(stored);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") window.localStorage.setItem("lang", l);
  };

  const t = (key: TranslationKey, vars?: Record<string, string>): string => {
    let str: string = dict[lang][key] ?? dict.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{${k}}`, v);
      }
    }
    return str;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      <div lang={lang} className={lang === "hi" ? "lang-hi" : "lang-en"}>
        {children}
      </div>
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
