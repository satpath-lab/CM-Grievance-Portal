"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, getStoredUser, clearToken, getStoredPermissions } from "@/lib/api";
import { LanguageProvider, useLanguage } from "@/lib/i18n";

const TABS = [
  { id: "overview",    label: "Overview",          labelHi: "अवलोकन" },
  { id: "grievances",  label: "Grievances",        labelHi: "शिकायतें" },
  { id: "fileonbehalf",label: "Phone-In Filing",   labelHi: "फ़ोन से दर्ज करें" },
  { id: "workload",    label: "Officer Workload",  labelHi: "अधिकारी कार्यभार" },
  { id: "audit",       label: "Integrity Audit",   labelHi: "अखंडता जांच" },
  { id: "departments", label: "Departments",       labelHi: "विभाग" },
  { id: "social",      label: "Social Media",      labelHi: "सोशल मीडिया" },
  { id: "announcements", label: "Announcements",   labelHi: "घोषणाएं", requiresPermission: "broadcast_announcements" },
  { id: "roles",       label: "Roles & Access",    labelHi: "भूमिकाएं और एक्सेस", requiresPermission: "manage_roles" },
];

const STATUSES = ["","Pending","Assigned","In Progress","Resolved Pending Confirmation","Confirmed Resolved","Reopened","Auto Closed","Escalated"];
const PRIORITIES = ["","Critical","High","Normal"];

function pill(v: string) {
  const cls: Record<string,string> = {
    "Critical":"pill pill-critical","High":"pill pill-high","Normal":"pill pill-normal",
    "Pending":"pill pill-pending","Assigned":"pill pill-assigned","In Progress":"pill pill-inprogress",
    "Resolved Pending Confirmation":"pill pill-resolved-pending","Confirmed Resolved":"pill pill-confirmed",
    "Reopened":"pill pill-reopened","Auto Closed":"pill pill-autoclosed","Escalated":"pill pill-escalated",
  };
  return <span className={cls[v] || "pill"}>{v}</span>;
}

function StatCard({ val, label, sub, color }: { val: number|string, label: string, sub?: string, color?: string }) {
  return (
    <div className={`stat-card ${color||""}`}>
      <div className="stat-val">{val}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function OverviewTab({ lang }: { lang: string }) {
  const [stats, setStats] = useState<any>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [hotspots, setHotspots] = useState<any[]>([]);
  const [brief, setBrief] = useState<string>("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [mcd311, setMcd311] = useState<any>(null);
  const [groqStatus, setGroqStatus] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      api.get<any>("/dashboard/overview"),
      api.get<any[]>("/dashboard/trend?days=7"),
      api.get<any[]>("/dashboard/hotspots"),
      api.get<any>("/open311/status"),
      api.get<any>("/ai/groq/status"),
    ]).then(([s, t, h, m, g]) => { setStats(s); setTrend(t); setHotspots(h); setMcd311(m); setGroqStatus(g); })
      .catch(() => {});
  }, []);

  const loadBrief = async () => {
    setBriefLoading(true);
    try {
      const r = await api.get<any>(`/ai/groq/cm-brief?lang=${lang}`);
      setBrief(r.brief);
    } catch { setBrief(lang === "hi" ? "AI ब्रीफ उपलब्ध नहीं — Groq API key सेट करें।" : "AI brief unavailable — set GROQ_API_KEY in server/.env"); }
    setBriefLoading(false);
  };

  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");

  const generateAndDownloadReport = async () => {
    setReportLoading(true);
    setReportError("");
    try {
      const r = await api.get<any>(`/ai/groq/executive-report?lang=${lang}`);
      const blob = new Blob([r.report], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `delhi-grievance-report-${r.periodLabel.replace(/\s+/g, "_")}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setReportError(e.message || (lang === "hi" ? "रिपोर्ट जनरेट नहीं हो सकी" : "Could not generate report"));
    }
    setReportLoading(false);
  };

  if (!stats) return <div className="loading">{lang === "hi" ? "लोड हो रहा है…" : "Loading…"}</div>;
  return (
    <div>
      {/* AI brief */}
      <div className="cm-brief" style={{ marginBottom: 16 }}>
        <div className="cm-brief-label">{lang === "hi" ? "AI सारांश — llama-3.3-70b" : "AI Operations Brief — llama-3.3-70b"}</div>
        {brief ? <div className="cm-brief-text">{brief}</div> : (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
              {lang === "hi" ? "AI-संचालित दैनिक सारांश" : "AI-powered daily situation brief"}
            </span>
            <button className="btn btn-sm" style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none" }}
              onClick={loadBrief} disabled={briefLoading}>
              {briefLoading ? (lang === "hi" ? "जनरेट हो रहा है…" : "Generating…") : (lang === "hi" ? "ब्रीफ जनरेट करें" : "Generate Brief")}
            </button>
          </div>
        )}
      </div>

      {/* Status row */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center", fontSize: 12, color: "#616161" }}>
        <span>MCD311:</span>
        <span style={{ color: mcd311?.mode === "live" ? "#2e7d32" : "#e65100", fontWeight: 600 }}>
          {mcd311?.mode === "live" ? (lang === "hi" ? "लाइव" : "Live") : (lang === "hi" ? "मॉक मोड" : "Mock mode")}
        </span>
        <span style={{ margin: "0 6px" }}>·</span>
        <span>Groq:</span>
        <span className={`groq-indicator ${groqStatus?.available ? "active" : "inactive"}`}>
          <span className="groq-dot" />
          {groqStatus?.available ? (lang === "hi" ? "कनेक्टेड" : "Connected") : (lang === "hi" ? "API key नहीं" : "No API key")}
        </span>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        <StatCard val={stats.filedToday} label={lang === "hi" ? "आज दर्ज" : "Filed Today"} />
        <StatCard val={stats.pending} label={lang === "hi" ? "खुली" : "Open"} />
        <StatCard val={stats.resolvedWeek} label={lang === "hi" ? "इस सप्ताह हल" : "Resolved (Week)"} color="green" />
        <StatCard val={stats.criticalOpen} label={lang === "hi" ? "गंभीर खुली" : "Critical Open"} color="red" />
        <StatCard val={stats.lifeThreateningOpen} label={lang === "hi" ? "जीवन-घातक" : "Life-Threatening"} color="red" sub={lang === "hi" ? "तत्काल ध्यान चाहिए" : "Immediate attention"} />
        <StatCard val={stats.slaBreached} label={lang === "hi" ? "SLA उल्लंघन" : "SLA Breached"} color="amber" />
        <StatCard val={stats.awaitingConfirmation} label={lang === "hi" ? "पुष्टि की प्रतीक्षा" : "Awaiting Confirmation"} color="saffron" />
      </div>

      {/* Executive report — fulfills the brief's explicit reporting requirement */}
      <div className="card" style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1a237e" }}>
            {lang === "hi" ? "कार्यकारी रिपोर्ट" : "Executive Report"}
          </div>
          <div style={{ fontSize: 11, color: "#9e9e9e" }}>
            {lang === "hi" ? "वरिष्ठ सरकारी समीक्षा के लिए — सारांश, मुख्य मेट्रिक्स, जवाबदेही फ्लैग, सिफारिशें" : "For senior government review — summary, key metrics, accountability flags, recommendations"}
          </div>
        </div>
        <div>
          <button className="btn btn-sm btn-primary" onClick={generateAndDownloadReport} disabled={reportLoading}>
            {reportLoading ? (lang === "hi" ? "जनरेट हो रहा है…" : "Generating…") : (lang === "hi" ? "रिपोर्ट डाउनलोड करें" : "Generate & Download Report")}
          </button>
          {reportError && <div style={{ fontSize: 11, color: "#b71c1c", marginTop: 4 }}>{reportError}</div>}
        </div>
      </div>

      {/* Trend + Hotspots */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 4 }}>
        <div className="card">
          <div className="card-title">{lang === "hi" ? "7 दिन का ट्रेंड" : "7-Day Trend"}</div>
          <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 60 }}>
            {trend.map((d, i) => {
              const max = Math.max(...trend.map((x:any) => x.count), 1);
              const h = Math.round((d.count / max) * 52) + 4;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <div style={{ width: "100%", height: h, background: "#3949ab", borderRadius: "2px 2px 0 0" }} title={`${d.date}: ${d.count}`} />
                  <span style={{ fontSize: 9, color: "#9e9e9e" }}>{d.date?.slice(8)}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card">
          <div className="card-title">{lang === "hi" ? "बार-बार होने वाली समस्याएं" : "Recurring Hotspots"}</div>
          {hotspots.length === 0 ? <div style={{ fontSize: 12, color: "#9e9e9e" }}>{lang === "hi" ? "पर्याप्त डेटा नहीं" : "Insufficient data yet"}</div> : hotspots.slice(0, 5).map((h: any, i: number) => (
            <div key={i} style={{ fontSize: 12, padding: "5px 0", borderBottom: i < hotspots.length-1 ? "1px solid #f0f0f0" : "none", display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#212121" }}>{h.district} — {h.category}</span>
              <span style={{ color: h.criticalCount > 0 ? "#b71c1c" : "#616161", fontWeight: 600 }}>{h.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GrievancesTab({ lang }: { lang: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: "", priority: "", district: "", search: "" });
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [actionMsg, setActionMsg] = useState("");
  const [officers, setOfficers] = useState<any[]>([]);
  const [assigning, setAssigning] = useState("");
  const [bulkSelected, setBulkSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkOfficerPick, setBulkOfficerPick] = useState("");
  const [showReclassify, setShowReclassify] = useState(false);
  const [reclassifyCat, setReclassifyCat] = useState("");
  const [reclassifyDept, setReclassifyDept] = useState("");
  const [reclassifyReason, setReclassifyReason] = useState("");
  const [reclassifyBusy, setReclassifyBusy] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);

  useEffect(() => {
    api.get<any[]>("/departments").then(setDepartments).catch(() => {});
  }, []);

  const submitReclassify = async () => {
    if (!selected || !reclassifyCat || !reclassifyDept || reclassifyReason.trim().length < 5) return;
    setReclassifyBusy(true);
    try {
      const updated = await api.post<any>(`/grievances/${selected.grvId}/reclassify`, {
        newCategory: reclassifyCat, newDepartmentCode: reclassifyDept, reason: reclassifyReason,
      });
      setSelected(updated);
      setShowReclassify(false);
      setReclassifyCat(""); setReclassifyDept(""); setReclassifyReason("");
      setActionMsg(lang === "hi" ? "पुनः वर्गीकृत किया गया" : "Re-classified");
      load();
    } catch (e: any) { setActionMsg(e.message); }
    setReclassifyBusy(false);
  };

  const decideExtension = async (approve: boolean) => {
    if (!selected) return;
    try {
      const updated = await api.post<any>(`/grievances/${selected.grvId}/extension/decide`, { approve });
      setSelected(updated);
      setActionMsg(approve ? (lang === "hi" ? "विस्तार स्वीकृत" : "Extension approved") : (lang === "hi" ? "विस्तार अस्वीकृत" : "Extension denied"));
      load();
    } catch (e: any) { setActionMsg(e.message); }
  };

  useEffect(() => {
    api.get<any[]>("/officer/contacts").then(setOfficers).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), perPage: "15", ...Object.fromEntries(Object.entries(filters).filter(([,v]) => v)) }).toString();
      const r = await api.get<any>(`/grievances?${qs}`);
      setItems(r.items); setTotal(r.total);
    } catch {}
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  const toggleBulk = (grvId: string) => {
    setBulkSelected(s => s.includes(grvId) ? s.filter(x => x !== grvId) : [...s, grvId]);
  };

  const bulkSetPriority = async (priority: string) => {
    if (bulkSelected.length === 0) return;
    setBulkBusy(true);
    try {
      const r = await api.post<any>("/grievances/bulk-priority", { grvIds: bulkSelected, priority });
      setActionMsg(lang === "hi" ? `${r.modified} शिकायतों की प्राथमिकता बदली गई` : `${r.modified} grievances updated to ${priority}`);
      setBulkSelected([]);
      load();
    } catch (e: any) { setActionMsg(e.message); }
    setBulkBusy(false);
  };

  const bulkDispatchAll = async () => {
    if (bulkSelected.length === 0) return;
    setBulkBusy(true);
    try {
      const r = await api.post<any[]>("/grievances/bulk-dispatch", { grvIds: bulkSelected });
      const ok = r.filter(x => x.ok).length;
      setActionMsg(lang === "hi" ? `${ok} शिकायतें भेजी गईं` : `${ok} grievances dispatched`);
      setBulkSelected([]);
      load();
    } catch (e: any) { setActionMsg(e.message); }
    setBulkBusy(false);
  };

  const bulkAssignAll = async () => {
    if (bulkSelected.length === 0 || !bulkOfficerPick) return;
    setBulkBusy(true);
    try {
      const r = await api.post<any[]>("/grievances/bulk-assign", { grvIds: bulkSelected, officerId: bulkOfficerPick });
      const ok = r.filter(x => x.ok).length;
      setActionMsg(lang === "hi" ? `${ok} शिकायतें नियुक्त की गईं` : `${ok} grievances assigned`);
      setBulkSelected([]); setBulkOfficerPick("");
      load();
    } catch (e: any) { setActionMsg(e.message); }
    setBulkBusy(false);
  };

  const dispatch = async (grvId: string) => {
    try {
      const r = await api.post<any>(`/grievances/${grvId}/dispatch`, {});
      setActionMsg(`${lang === "hi" ? "भेजा गया" : "Dispatched"}: ${r.refNumber}`);
      load();
    } catch (e: any) { setActionMsg(e.message); }
  };

  const assignOfficer = async (grvId: string, officerId: string) => {
    if (!officerId) return;
    setAssigning(grvId);
    try {
      const updated = await api.post<any>(`/grievances/${grvId}/assign-officer`, { officerId });
      setSelected(updated);
      setActionMsg(lang === "hi" ? "अधिकारी नियुक्त किया गया" : "Officer assigned");
      load();
    } catch (e: any) { setActionMsg(e.message); }
    setAssigning("");
  };

  const autoAssignOfficer = async (grvId: string) => {
    setAssigning(grvId);
    try {
      const updated = await api.post<any>(`/grievances/${grvId}/auto-assign-officer`, {});
      setSelected(updated);
      setActionMsg(
        lang === "hi"
          ? `सबसे कम कार्यभार वाले अधिकारी को स्वतः नियुक्त किया गया: ${updated.assignedOfficer?.name || ""}`
          : `Auto-assigned to least-loaded officer: ${updated.assignedOfficer?.name || ""}`
      );
      load();
    } catch (e: any) { setActionMsg(e.message); }
    setAssigning("");
  };

  return (
    <div>
      <div className="filter-row">
        <select value={filters.status} onChange={e => { setFilters(f => ({...f, status: e.target.value})); setPage(1); }}>
          {STATUSES.map(s => <option key={s} value={s}>{s || (lang === "hi" ? "सभी स्थिति" : "All Statuses")}</option>)}
        </select>
        <select value={filters.priority} onChange={e => { setFilters(f => ({...f, priority: e.target.value})); setPage(1); }}>
          {PRIORITIES.map(p => <option key={p} value={p}>{p || (lang === "hi" ? "सभी प्राथमिकता" : "All Priorities")}</option>)}
        </select>
        <input type="search" placeholder={lang === "hi" ? "खोजें…" : "Search…"} value={filters.search}
          onChange={e => { setFilters(f => ({...f, search: e.target.value})); setPage(1); }} />
        <button className="btn btn-sm btn-outline" onClick={load}>{lang === "hi" ? "रीफ्रेश" : "Refresh"}</button>
        {actionMsg && <span style={{ fontSize: 12, color: "#2e7d32", fontWeight: 500 }}>{actionMsg}</span>}
      </div>

      {bulkSelected.length > 0 && (
        <div className="card" style={{ marginBottom: 12, background: "#e8eaf6", padding: "10px 14px" }}>
          <div className="row" style={{ alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#1a237e" }}>
              {bulkSelected.length} {lang === "hi" ? "चुनी गईं" : "selected"}
            </span>
            <button className="btn btn-sm btn-outline" disabled={bulkBusy} onClick={() => bulkSetPriority("Critical")}>{lang === "hi" ? "गंभीर सेट करें" : "Set Critical"}</button>
            <button className="btn btn-sm btn-outline" disabled={bulkBusy} onClick={() => bulkSetPriority("High")}>{lang === "hi" ? "उच्च सेट करें" : "Set High"}</button>
            <button className="btn btn-sm btn-outline" disabled={bulkBusy} onClick={() => bulkSetPriority("Normal")}>{lang === "hi" ? "सामान्य सेट करें" : "Set Normal"}</button>
            <button className="btn btn-sm btn-primary" disabled={bulkBusy} onClick={bulkDispatchAll}>{lang === "hi" ? "सभी भेजें" : "Dispatch All"}</button>
            <select value={bulkOfficerPick} onChange={e => setBulkOfficerPick(e.target.value)} style={{ fontSize: 11 }}>
              <option value="">{lang === "hi" ? "अधिकारी चुनें…" : "Pick officer…"}</option>
              {officers.map((o: any) => <option key={o._id} value={o._id}>{o.name} — {o.department?.name}</option>)}
            </select>
            <button className="btn btn-sm btn-outline" disabled={bulkBusy || !bulkOfficerPick} onClick={bulkAssignAll}>{lang === "hi" ? "सभी नियुक्त करें" : "Assign All"}</button>
            <button className="btn btn-sm btn-outline" onClick={() => setBulkSelected([])}>{lang === "hi" ? "साफ़ करें" : "Clear"}</button>
          </div>
        </div>
      )}

      {loading && <div className="loading">{lang === "hi" ? "लोड हो रहा है…" : "Loading…"}</div>}
      {!loading && (
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th style={{ width: 28 }}>
                <input type="checkbox"
                  checked={items.length > 0 && bulkSelected.length === items.length}
                  onChange={e => setBulkSelected(e.target.checked ? items.map((i: any) => i.grvId) : [])}
                />
              </th>
              <th>ID</th>
              <th>{lang === "hi" ? "शिकायत" : "Complaint"}</th>
              <th>{lang === "hi" ? "ज़िला" : "District"}</th>
              <th>{lang === "hi" ? "श्रेणी" : "Category"}</th>
              <th>{lang === "hi" ? "प्राथमिकता" : "Priority"}</th>
              <th>{lang === "hi" ? "स्थिति" : "Status"}</th>
              <th>{lang === "hi" ? "दिनांक" : "Filed"}</th>
              <th>{lang === "hi" ? "कार्रवाई" : "Action"}</th>
            </tr></thead>
            <tbody>
              {items.map((g: any) => (
                <tr key={g.grvId} style={{ cursor: "pointer" }}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={bulkSelected.includes(g.grvId)} onChange={() => toggleBulk(g.grvId)} />
                  </td>
                  <td onClick={() => setSelected(g)} style={{ fontFamily: "monospace", fontSize: 11, whiteSpace: "nowrap" }}>{g.grvId}</td>
                  <td onClick={() => setSelected(g)} style={{ maxWidth: 260 }}>
                    <div className="grv-desc">{g.descriptionRaw}</div>
                    {g.isLifeThreatening && <span className="pill pill-life" style={{ marginTop: 3 }}>LIFE</span>}
                    {g.detectedLanguage && g.detectedLanguage !== "English" && (
                      <span style={{ fontSize: 10, color: "#9e9e9e", marginLeft: 6 }}>{g.detectedLanguage}</span>
                    )}
                  </td>
                  <td onClick={() => setSelected(g)} style={{ fontSize: 12, whiteSpace: "nowrap" }}>{g.district}</td>
                  <td onClick={() => setSelected(g)} style={{ fontSize: 12, maxWidth: 140 }}>{g.category}</td>
                  <td onClick={() => setSelected(g)}>{pill(g.priority)}</td>
                  <td onClick={() => setSelected(g)}>{pill(g.status)}</td>
                  <td onClick={() => setSelected(g)} style={{ fontSize: 11, whiteSpace: "nowrap" }}>{g.filedAt?.slice(0,10)}</td>
                  <td>
                    {g.status === "Pending" && (
                      <button className="btn btn-sm btn-primary" onClick={e => { e.stopPropagation(); dispatch(g.grvId); }}>
                        {lang === "hi" ? "भेजें" : "Dispatch"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={9} className="empty">{lang === "hi" ? "कोई शिकायत नहीं मिली" : "No grievances found"}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <div className="pager">
        <span>{lang === "hi" ? `कुल ${total}` : `${total} total`}</span>
        <div className="pager-btns">
          <button className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => setPage(p => p-1)}>←</button>
          <span style={{ padding: "5px 8px", fontSize: 12 }}>{page}</span>
          <button className="btn btn-sm btn-outline" disabled={items.length < 15} onClick={() => setPage(p => p+1)}>→</button>
        </div>
      </div>

      {/* Side detail panel */}
      {selected && (
        <div style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 360, background: "#fff", boxShadow: "-4px 0 20px rgba(0,0,0,0.12)", zIndex: 200, overflow: "auto", padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15, color: "#1a237e" }}>{selected.grvId}</h3>
            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#616161" }}>×</button>
          </div>
          <div style={{ marginBottom: 12 }}>
            {pill(selected.priority)} {pill(selected.status)}
            {selected.isLifeThreatening && <> <span className="pill pill-life" style={{ marginLeft: 4 }}>LIFE-THREATENING</span></>}
          </div>
          <div style={{ fontSize: 13, marginBottom: 12 }}>
            <strong>{lang === "hi" ? "शिकायत:" : "Complaint:"}</strong><br />
            <span style={{ color: "#212121" }}>{selected.descriptionRaw}</span>
            {selected.detectedLanguage && selected.detectedLanguage !== "English" && (
              <div style={{ fontSize: 11, color: "#9e9e9e", marginTop: 4 }}>Detected: {selected.detectedLanguage} — Auto-normalized for classification</div>
            )}
          </div>
          {selected.descriptionNormalized && selected.detectedLanguage !== "English" && (
            <details style={{ marginBottom: 12 }}>
              <summary style={{ fontSize: 12, color: "#9e9e9e", cursor: "pointer" }}>Normalized text (English)</summary>
              <div style={{ fontSize: 11, color: "#616161", marginTop: 6, fontFamily: "monospace" }}>{selected.descriptionNormalized}</div>
            </details>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 12, marginBottom: 12 }}>
            <span style={{ color: "#9e9e9e" }}>{lang === "hi" ? "ज़िला" : "District"}</span><span>{selected.district}</span>
            <span style={{ color: "#9e9e9e" }}>{lang === "hi" ? "श्रेणी" : "Category"}</span><span>{selected.category}</span>
            <span style={{ color: "#9e9e9e" }}>{lang === "hi" ? "विभाग" : "Department"}</span><span>{selected.departmentCode}</span>
            <span style={{ color: "#9e9e9e" }}>{lang === "hi" ? "चैनल" : "Channel"}</span><span>{selected.channel}</span>
            <span style={{ color: "#9e9e9e" }}>{lang === "hi" ? "दर्ज" : "Filed"}</span><span>{selected.filedAt?.slice(0,10)}</span>
            <span style={{ color: "#9e9e9e" }}>{lang === "hi" ? "SLA तक" : "Due by"}</span><span style={{ color: new Date(selected.dueAt) < new Date() && selected.status !== "Confirmed Resolved" ? "#b71c1c" : undefined }}>{selected.dueAt?.slice(0,10)}</span>
            <span style={{ color: "#9e9e9e" }}>{lang === "hi" ? "नागरिक" : "Citizen"}</span><span>{selected.citizenName}</span>
            {selected.reopenCount > 0 && <><span style={{ color: "#9e9e9e" }}>Reopens</span><span style={{ color: "#b71c1c", fontWeight: 600 }}>{selected.reopenCount}</span></>}
          </div>
          {selected.resolutionProof && (
            <div className={selected.resolutionProof.locationMismatchFlag ? "mismatch-warn" : "mismatch-ok"} style={{ marginBottom: 12 }}>
              {selected.resolutionProof.locationMismatchFlag
                ? `Photo location mismatch: ${selected.resolutionProof.distanceFromComplaintMeters}m from complaint site — flagged for audit`
                : `Photo location verified: ${selected.resolutionProof.distanceFromComplaintMeters}m from complaint site`}
            </div>
          )}
          {selected.citizenFeedback && (
            <div style={{ background: selected.citizenFeedback.satisfied ? "#e8f5e9" : "#fce4ec", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>
              <strong>{lang === "hi" ? "नागरिक प्रतिक्रिया:" : "Citizen feedback:"}</strong>{" "}
              {selected.citizenFeedback.satisfied ? (lang === "hi" ? "संतुष्ट" : "Satisfied") : (lang === "hi" ? "असंतुष्ट" : "Disputed")}
              {selected.citizenFeedback.comment && <div style={{ marginTop: 4, color: "#616161" }}>{selected.citizenFeedback.comment}</div>}
            </div>
          )}

          {/* Pending extension request from the assigned officer */}
          {selected.extensionRequest?.status === "Pending" && (
            <div style={{ background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 6, padding: "10px 12px", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#e65100", marginBottom: 4 }}>
                {lang === "hi" ? "समयसीमा विस्तार अनुरोध" : "Deadline Extension Request"}
              </div>
              <div style={{ fontSize: 12, color: "#424242" }}>
                {selected.extensionRequest.requestedByName} {lang === "hi" ? "ने मांगे" : "requested"} {selected.extensionRequest.requestedHours}h — {selected.extensionRequest.reason}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn btn-sm btn-primary" onClick={() => decideExtension(true)}>{lang === "hi" ? "स्वीकृत करें" : "Approve"}</button>
                <button className="btn btn-sm btn-outline" onClick={() => decideExtension(false)}>{lang === "hi" ? "अस्वीकार करें" : "Deny"}</button>
              </div>
            </div>
          )}

          {/* Manual re-classification — fixes AI misclassification */}
          {!showReclassify ? (
            <button className="btn btn-outline btn-sm" style={{ marginBottom: 10 }} onClick={() => setShowReclassify(true)}>
              {lang === "hi" ? "श्रेणी/विभाग ठीक करें" : "Fix Category/Department"}
            </button>
          ) : (
            <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#9e9e9e", marginBottom: 8 }}>
                {lang === "hi" ? "यदि AI ने गलत श्रेणी/विभाग चुना है तो ठीक करें" : "Correct the category/department if the AI got it wrong"}
              </div>
              <div className="form-group">
                <label className="form-label">{lang === "hi" ? "नई श्रेणी" : "New category"}</label>
                <input value={reclassifyCat} onChange={e => setReclassifyCat(e.target.value)} placeholder={selected.category} />
              </div>
              <div className="form-group">
                <label className="form-label">{lang === "hi" ? "नया विभाग" : "New department"}</label>
                <select value={reclassifyDept} onChange={e => setReclassifyDept(e.target.value)}>
                  <option value="">{lang === "hi" ? "चुनें…" : "Select…"}</option>
                  {departments.map((d: any) => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{lang === "hi" ? "कारण" : "Reason"}</label>
                <textarea rows={2} value={reclassifyReason} onChange={e => setReclassifyReason(e.target.value)} />
              </div>
              <div className="row">
                <button className="btn btn-sm btn-primary" disabled={reclassifyBusy} onClick={submitReclassify}>{lang === "hi" ? "सहेजें" : "Save"}</button>
                <button className="btn btn-sm btn-outline" onClick={() => setShowReclassify(false)}>{lang === "hi" ? "रद्द करें" : "Cancel"}</button>
              </div>
            </div>
          )}

          {selected.status === "Pending" && (
            <button className="btn btn-primary btn-sm" onClick={() => dispatch(selected.grvId).then(() => setSelected(null))}>
              {lang === "hi" ? "विभाग को भेजें" : "Dispatch to Department"}
            </button>
          )}

          {["Assigned", "In Progress", "Reopened", "Escalated"].includes(selected.status) && (
            <div style={{ marginTop: 12 }}>
              <div className="card-title" style={{ marginBottom: 6 }}>
                {lang === "hi" ? "अधिकारी नियुक्त करें" : "Assign Field Officer"}
              </div>
              {selected.assignedOfficer?.name && (
                <div style={{ fontSize: 12, color: "#2e7d32", marginBottom: 6 }}>
                  {lang === "hi" ? "वर्तमान में नियुक्त" : "Currently assigned"}: {selected.assignedOfficer.name} ({selected.assignedOfficer.phone})
                </div>
              )}
              <button
                className="btn btn-sm btn-saffron"
                style={{ marginBottom: 8, width: "100%" }}
                disabled={assigning === selected.grvId}
                onClick={() => autoAssignOfficer(selected.grvId)}
              >
                {assigning === selected.grvId
                  ? (lang === "hi" ? "नियुक्त हो रहा है…" : "Assigning…")
                  : (lang === "hi" ? "⚡ सबसे कम कार्यभार वाले को स्वतः नियुक्त करें" : "⚡ Auto-Assign Least-Loaded Officer")}
              </button>
              <div style={{ fontSize: 10, color: "#9e9e9e", textAlign: "center", margin: "0 0 8px" }}>
                {lang === "hi" ? "या मैन्युअल रूप से चुनें:" : "or pick manually:"}
              </div>
              <select
                style={{ width: "100%", padding: "6px 10px", border: "1px solid #e0e0e0", borderRadius: 6, fontSize: 12 }}
                disabled={assigning === selected.grvId}
                defaultValue=""
                onChange={(e) => assignOfficer(selected.grvId, e.target.value)}
              >
                <option value="" disabled>
                  {assigning === selected.grvId
                    ? (lang === "hi" ? "नियुक्त हो रहा है…" : "Assigning…")
                    : (lang === "hi" ? "अधिकारी चुनें…" : "Select an officer…")}
                </option>
                {officers
                  .filter((o: any) => o.department?.code === selected.departmentCode)
                  .map((o: any) => (
                    <option key={String(o._id)} value={String(o._id)}>
                      {o.name} — {o.department?.name}
                    </option>
                  ))}
                {officers.filter((o: any) => o.department?.code === selected.departmentCode).length === 0 && (
                  <option value="" disabled>
                    {lang === "hi" ? "इस विभाग में कोई अधिकारी नहीं" : "No officers in this department yet"}
                  </option>
                )}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WorkloadTab({ lang }: { lang: string }) {
  const [officers, setOfficers] = useState<any[]>([]);
  useEffect(() => { api.get<any[]>("/dashboard/officer-workload").then(setOfficers).catch(() => {}); }, []);

  if (!officers.length) return <div className="loading">{lang === "hi" ? "लोड हो रहा है…" : "Loading…"}</div>;

  return (
    <div>
      <div style={{ fontSize: 13, color: "#616161", marginBottom: 12 }}>
        {lang === "hi" ? "प्रत्येक अधिकारी का वर्तमान कार्यभार — असमान वितरण और अधिभारित अधिकारियों की पहचान करें।" :
          "Live workload per officer — identify overloaded officers and redistribute assignments."}
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>{lang === "hi" ? "अधिकारी" : "Officer"}</th>
              <th>{lang === "hi" ? "विभाग" : "Dept."}</th>
              <th>{lang === "hi" ? "सक्रिय" : "Active"}</th>
              <th>{lang === "hi" ? "गंभीर" : "Critical"}</th>
              <th>{lang === "hi" ? "पुष्टि प्रतीक्षा" : "Pending Confirm"}</th>
              <th>{lang === "hi" ? "पुनः खोली" : "Reopened"}</th>
              <th>{lang === "hi" ? "भार स्थिति" : "Load"}</th>
            </tr></thead>
            <tbody>
              {officers.map((o: any) => (
                <tr key={String(o.officerId)}>
                  <td>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{o.name}</div>
                    <div style={{ fontSize: 11, color: "#9e9e9e" }}>{o.phone}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>{o.department}</td>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{o.activeCount}</div>
                    <div className="workload-bar" style={{ width: 60 }}>
                      <div className={`workload-fill ${o.loadStatus === "Overloaded" ? "overloaded" : o.loadStatus === "Busy" ? "busy" : ""}`}
                        style={{ width: `${Math.min(100, (o.activeCount / 20) * 100)}%` }} />
                    </div>
                  </td>
                  <td style={{ color: o.criticalCount > 0 ? "#b71c1c" : undefined, fontWeight: o.criticalCount > 0 ? 700 : 400 }}>{o.criticalCount}</td>
                  <td>{o.awaitingConfirm}</td>
                  <td style={{ color: o.reopenedOnThem > 0 ? "#e65100" : undefined }}>{o.reopenedOnThem}</td>
                  <td>
                    {o.onLeave ? (
                      <span className="badge" style={{ background: "#eceff1", color: "#455a64" }}>
                        {lang === "hi" ? "छुट्टी पर" : "On Leave"}
                      </span>
                    ) : (
                      <span className={`badge ${o.loadStatus === "Overloaded" ? "badge-red" : o.loadStatus === "Busy" ? "badge-amber" : "badge-green"}`}>
                        {lang === "hi" ? (o.loadStatus === "Overloaded" ? "अधिक भारित" : o.loadStatus === "Busy" ? "व्यस्त" : "उपलब्ध") : o.loadStatus}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AuditTab({ lang }: { lang: string }) {
  const [metrics, setMetrics] = useState<any>(null);
  const [accountability, setAccountability] = useState<any[]>([]);
  const [verifying, setVerifying] = useState("");
  const [verifyResult, setVerifyResult] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      api.get<any>("/dashboard/false-closure"),
      api.get<any[]>("/dashboard/officer-accountability"),
    ]).then(([m, a]) => { setMetrics(m); setAccountability(a); }).catch(() => {});
  }, []);

  const verify = async () => {
    if (!verifying.trim()) return;
    try {
      const r = await api.get<any>(`/audit/verify/${verifying.trim()}`);
      setVerifyResult(r);
    } catch (e: any) { setVerifyResult({ error: e.message }); }
  };

  if (!metrics) return <div className="loading">{lang === "hi" ? "लोड हो रहा है…" : "Loading…"}</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {/* False-closure metrics */}
      <div className="card">
        <div className="card-title">{lang === "hi" ? "झूठे समाधान — असली बनाम रिपोर्ट किए गए" : "False-Closure Gap — Reported vs Actual"}</div>
        <div style={{ fontSize: 12, color: "#616161", marginBottom: 12 }}>
          {lang === "hi" ? "यह वही गैप है जो आंध्र प्रदेश में 90% vs 22% निकला। यहां हर शिकायत के लिए नागरिक की पुष्टि अनिवार्य है।" :
            "This is the gap Andhra Pradesh found to be 90% vs 22%. Here every resolution requires citizen confirmation."}
        </div>
        <div className="audit-metric">
          <span className="label">{lang === "hi" ? "अधिकारी द्वारा हल रिपोर्ट" : "Officer-Reported Resolved"}</span>
          <span className="value">{metrics.officerReportedResolved}</span>
        </div>
        <div className="audit-metric">
          <span className="label">{lang === "hi" ? "नागरिक द्वारा पुष्टि" : "Citizen-Confirmed"}</span>
          <span className={`value ${metrics.citizenConfirmed < metrics.officerReportedResolved * 0.7 ? "red" : "green"}`}>{metrics.citizenConfirmed}</span>
        </div>
        <div className="audit-metric" style={{ borderTop: "2px solid #e0e0e0", marginTop: 4, paddingTop: 12 }}>
          <span className="label" style={{ fontWeight: 600 }}>{lang === "hi" ? "पुष्टि दर" : "Confirmation Rate"}</span>
          <span className={`value ${metrics.citizenConfirmationRate < 70 ? "red" : "green"}`} style={{ fontSize: 20 }}>
            {metrics.citizenConfirmationRate}%
          </span>
        </div>
        <div className="audit-metric">
          <span className="label">{lang === "hi" ? "नागरिक ने विवाद किया" : "Citizen Disputed"}</span>
          <span className="value red">{metrics.citizenDisputed}</span>
        </div>
        <div className="audit-metric">
          <span className="label">{lang === "hi" ? "स्वतः बंद (कोई प्रतिक्रिया नहीं)" : "Auto-Closed (No Response)"}</span>
          <span className="value">{metrics.autoClosedNoResponse}</span>
        </div>
        <div className="audit-metric">
          <span className="label">{lang === "hi" ? "फ़ोटो स्थान बेमेल" : "Photo Location Mismatches"}</span>
          <span className={`value ${metrics.photoMismatchFlags > 0 ? "red" : "green"}`}>{metrics.photoMismatchFlags}</span>
        </div>
        <div className="audit-metric">
          <span className="label">{lang === "hi" ? "कुल पुनः खुली" : "Total Reopens"}</span>
          <span className="value">{metrics.totalReopens}</span>
        </div>
      </div>

      <div>
        {/* Officer Accountability Score — composite, not reopen rate alone */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">{lang === "hi" ? "अधिकारी जवाबदेही स्कोर" : "Officer Accountability Score"}</div>
          <div style={{ fontSize: 11, color: "#9e9e9e", marginBottom: 8 }}>
            {lang === "hi" ? "45% पुष्टि दर + 25% समय पर + 20% पुनः न खोलना + 10% फ़ोटो सटीकता — कोई एक संख्या पूरा स्कोर तय नहीं करती" :
              "45% confirmation rate + 25% on-time + 20% non-reopened + 10% photo accuracy — no single number drives the score"}
          </div>
          {accountability.length === 0 ? <div className="empty" style={{ padding: "12px 0" }}>{lang === "hi" ? "डेटा नहीं" : "No data yet"}</div> : (
            <div className="tbl-wrap">
              <table>
                <thead><tr>
                  <th>{lang === "hi" ? "अधिकारी" : "Officer"}</th>
                  <th>{lang === "hi" ? "संभाले" : "Handled"}</th>
                  <th>{lang === "hi" ? "स्कोर" : "Score"}</th>
                  <th>{lang === "hi" ? "पुनः खुली" : "Reopen %"}</th>
                  <th />
                </tr></thead>
                <tbody>
                  {accountability.map((r: any) => (
                    <tr key={String(r.officerId)}>
                      <td style={{ fontSize: 13 }}>{r.name}</td>
                      <td style={{ fontSize: 12 }}>{r.totalHandled}</td>
                      <td style={{ fontWeight: 700, fontSize: 15, color: r.accountabilityScore >= 75 ? "#2e7d32" : r.accountabilityScore >= 50 ? "#e65100" : "#b71c1c" }}>{r.accountabilityScore}</td>
                      <td style={{ fontSize: 12, color: r.reopenRate > 25 ? "#b71c1c" : "#616161" }}>{r.reopenRate}%</td>
                      <td>{r.reviewRequired && <span className="badge badge-flag">{lang === "hi" ? "जांच करें" : "Review"}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Hash-chain integrity check */}
        <div className="card">
          <div className="card-title">{lang === "hi" ? "ऑडिट लॉग अखंडता जांच" : "Audit Log Integrity Check"}</div>
          <div style={{ fontSize: 12, color: "#616161", marginBottom: 10 }}>
            {lang === "hi" ? "हर स्थिति परिवर्तन SHA-256 hash chain से जुड़ा है। यहां किसी भी शिकायत का ऑडिट ट्रेल सत्यापित करें।" :
              "Every status change is SHA-256 hash-chained. Verify any grievance's audit trail for tampering."}
          </div>
          <div className="row">
            <input type="text" placeholder="GRV-2026-00001" value={verifying} onChange={e => setVerifying(e.target.value)}
              style={{ flex: 1, padding: "6px 10px", border: "1px solid #e0e0e0", borderRadius: 6, fontSize: 12, fontFamily: "monospace" }} />
            <button className="btn btn-sm btn-outline" onClick={verify}>{lang === "hi" ? "सत्यापित करें" : "Verify"}</button>
          </div>
          {verifyResult && (
            <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, fontSize: 12,
              background: verifyResult.intact ? "#e8f5e9" : "#ffebee",
              color: verifyResult.intact ? "#1b5e20" : "#b71c1c" }}>
              {verifyResult.error ? verifyResult.error :
                verifyResult.intact
                  ? `${lang === "hi" ? "अखंड — " : "Intact — "}${verifyResult.eventCount} events verified`
                  : `${lang === "hi" ? "छेड़छाड़ का संदेह — " : "Tampering detected at event "} #${verifyResult.brokenAtIndex}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DepartmentsTab({ lang }: { lang: string }) {
  const [depts, setDepts] = useState<any[]>([]);
  const [slaReport, setSlaReport] = useState<any[]>([]);
  useEffect(() => {
    Promise.all([api.get<any[]>("/departments"), api.get<any[]>("/dashboard/department-sla")])
      .then(([d, s]) => { setDepts(d); setSlaReport(s); }).catch(() => {});
  }, []);

  const slaMap = new Map(slaReport.map(r => [r.code, r]));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="section-title">{lang === "hi" ? "विभाग और SLA प्रदर्शन" : "Departments & SLA Performance"}</div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>{lang === "hi" ? "कोड" : "Code"}</th>
              <th>{lang === "hi" ? "विभाग" : "Department"}</th>
              <th>{lang === "hi" ? "हिंदी नाम" : "Hindi Name"}</th>
              <th>{lang === "hi" ? "प्रमुख" : "Head"}</th>
              <th>{lang === "hi" ? "SLA (घंटे)" : "SLA (hrs)"}</th>
              <th>{lang === "hi" ? "कुल शिकायतें" : "Total"}</th>
              <th>{lang === "hi" ? "समय पर %" : "On-time %"}</th>
            </tr></thead>
            <tbody>
              {depts.map((d: any) => {
                const sla = slaMap.get(d.code);
                return (
                  <tr key={d.code}>
                    <td style={{ fontFamily: "monospace", fontWeight: 600, color: "#1a237e" }}>{d.code}</td>
                    <td style={{ fontWeight: 500 }}>{d.name}</td>
                    <td style={{ color: "#616161" }}>{d.nameHi}</td>
                    <td style={{ fontSize: 12 }}>{d.headName || "—"}</td>
                    <td>{d.defaultSlaHours}h</td>
                    <td>{sla?.total ?? "—"}</td>
                    <td>
                      {sla ? (
                        <span style={{ fontWeight: 700, color: sla.slaPct >= 80 ? "#2e7d32" : sla.slaPct >= 60 ? "#e65100" : "#b71c1c" }}>
                          {sla.slaPct}%
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SocialTab({ lang }: { lang: string }) {
  const [feed, setFeed] = useState<any>(null);
  const [sweeping, setSweeping] = useState(false);
  const [sweepResult, setSweepResult] = useState<string>("");
  const [approving, setApproving] = useState<string | null>(null);
  const [approveForm, setApproveForm] = useState({ district: "", lat: "", lng: "", note: "" });
  const [reportForm, setReportForm] = useState({ handle: "", text: "", postUrl: "" });
  const [reportResult, setReportResult] = useState("");

  const loadFeed = () => { api.get<any>("/social/feed").then(setFeed).catch(() => {}); };
  useEffect(loadFeed, []);

  const runSweep = async () => {
    setSweeping(true);
    try {
      const r = await api.post<any>("/social/sweep", {});
      setSweepResult(
        lang === "hi"
          ? `${r.processed} पोस्ट जांची गईं — ${r.autoFiled} स्वतः दर्ज, ${r.needsReview} समीक्षा हेतु, ${r.rejected} अस्वीकृत`
          : `${r.processed} posts checked — ${r.autoFiled} auto-filed, ${r.needsReview} need review, ${r.rejected} rejected`
      );
      loadFeed();
    } catch (e: any) { setSweepResult(e.message); }
    setSweeping(false);
  };

  const approve = async (postUrl: string) => {
    if (!approveForm.district || !approveForm.lat || !approveForm.lng) return;
    setApproving(postUrl);
    try {
      await api.post<any>(`/social/${encodeURIComponent(postUrl)}/approve`, {
        lat: Number(approveForm.lat), lng: Number(approveForm.lng),
        district: approveForm.district, note: approveForm.note,
      });
      setApproveForm({ district: "", lat: "", lng: "", note: "" });
      loadFeed();
    } catch {}
    setApproving(null);
  };

  const reject = async (postUrl: string) => {
    try {
      await api.post<any>(`/social/${encodeURIComponent(postUrl)}/reject`, { reason: "Reviewed by staff — not actionable" });
      loadFeed();
    } catch {}
  };

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await api.post<any>("/social/report", reportForm);
      setReportResult(
        r.decision === "auto_filed"
          ? (lang === "hi" ? `स्वतः दर्ज हुई: ${r.grvId}` : `Auto-filed as ${r.grvId}`)
          : (lang === "hi" ? `सहेजा गया — स्थिति: ${r.decision}` : `Saved — status: ${r.decision}`)
      );
      setReportForm({ handle: "", text: "", postUrl: "" });
      loadFeed();
    } catch (e: any) { setReportResult(e.message); }
  };

  const statusBadge = (status: string) => {
    if (status === "auto_filed") return <span className="badge badge-green">{lang === "hi" ? "स्वतः दर्ज" : "Auto-filed"}</span>;
    if (status === "needs_review") return <span className="badge badge-amber">{lang === "hi" ? "समीक्षा आवश्यक" : "Needs review"}</span>;
    if (status === "rejected") return <span className="badge badge-red">{lang === "hi" ? "अस्वीकृत" : "Rejected"}</span>;
    return <span className="badge" style={{ background: "#eee", color: "#616161" }}>{lang === "hi" ? "असंसाधित" : "Unprocessed"}</span>;
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, background: "#fff8e1", border: "1px solid #ffe082" }}>
        <div style={{ fontSize: 13, color: "#e65100", marginBottom: 8 }}>
          {lang === "hi"
            ? "हर पोस्ट AI सत्यापन से गुज़रती है — असली, actionable शिकायतें स्वतः दर्ज होती हैं; अस्पष्ट पोस्ट समीक्षा के लिए जाती हैं; स्पैम/मज़ाक अस्वीकृत होते हैं। फॉलोअर संख्या कभी प्राथमिकता तय नहीं करती।"
            : "Every post goes through AI verification — genuine, actionable complaints are auto-filed; ambiguous ones go to human review; spam/jokes are rejected. Follower count never determines priority."}
        </div>
        <div style={{ fontSize: 11, color: "#9e9e9e" }}>
          {lang === "hi"
            ? "नोट: 2026 में X/Twitter का कोई वास्तविक मुफ़्त रीड API नहीं है — यह पाइपलाइन किसी भी स्रोत से काम करती है (मॉक फ़ीड, मुफ़्त automation webhook, या मैन्युअल रिपोर्ट)।"
            : "Note: there is no genuinely free X/Twitter read API in 2026 — this pipeline works with any source (mock feed, a free automation webhook, or manual staff reporting)."}
        </div>
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn btn-sm btn-primary" onClick={runSweep} disabled={sweeping}>
          {sweeping ? "…" : (lang === "hi" ? "अभी जांचें" : "Run Sweep Now")}
        </button>
        {sweepResult && <span style={{ fontSize: 12, color: "#2e7d32" }}>{sweepResult}</span>}
      </div>

      {!feed ? <div className="loading">{lang === "hi" ? "लोड हो रहा है…" : "Loading…"}</div> : feed.mentions.map((m: any) => (
        <div key={m.postUrl} className="card" style={{ marginBottom: 10 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: "#1a237e", marginBottom: 3, display: "flex", gap: 8, alignItems: "center" }}>
                {m.platform} · {m.handle} {statusBadge(m.status)}
              </div>
              <div style={{ fontSize: 13, color: "#212121", marginBottom: 6 }}>{m.text}</div>
              <div style={{ fontSize: 11, color: "#9e9e9e", display: "flex", gap: 12, marginBottom: 6 }}>
                <span>{lang === "hi" ? "फॉलोअर" : "Followers"}: {m.followerCount.toLocaleString()} ({lang === "hi" ? "प्राथमिकता पर असर नहीं" : "no effect on priority"})</span>
                <span>{m.postedAt?.slice(0,16)}</span>
              </div>
              {m.statusReason && <div style={{ fontSize: 11, color: "#757575", fontStyle: "italic", marginBottom: 6 }}>{m.statusReason}</div>}
              {m.grvId && <div style={{ fontSize: 11, color: "#2e7d32", fontWeight: 600 }}>→ {m.grvId}</div>}

              {m.status === "needs_review" && (
                <div style={{ marginTop: 8, padding: 10, background: "#fafafa", borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: "#616161", marginBottom: 6 }}>
                    {lang === "hi" ? "स्थान दें और स्वीकृत करें, या अस्वीकार करें:" : "Supply a location to approve, or reject:"}
                  </div>
                  <div className="row" style={{ marginBottom: 6 }}>
                    <input placeholder={lang === "hi" ? "ज़िला" : "District"} value={approveForm.district}
                      onChange={e => setApproveForm(f => ({...f, district: e.target.value}))}
                      style={{ width: 90, padding: "4px 6px", fontSize: 11, border: "1px solid #e0e0e0", borderRadius: 4 }} />
                    <input placeholder="Lat" value={approveForm.lat}
                      onChange={e => setApproveForm(f => ({...f, lat: e.target.value}))}
                      style={{ width: 70, padding: "4px 6px", fontSize: 11, border: "1px solid #e0e0e0", borderRadius: 4 }} />
                    <input placeholder="Lng" value={approveForm.lng}
                      onChange={e => setApproveForm(f => ({...f, lng: e.target.value}))}
                      style={{ width: 70, padding: "4px 6px", fontSize: 11, border: "1px solid #e0e0e0", borderRadius: 4 }} />
                  </div>
                  <div className="row">
                    <button className="btn btn-sm btn-primary" disabled={approving === m.postUrl} onClick={() => approve(m.postUrl)}>
                      {lang === "hi" ? "स्वीकृत करें" : "Approve & File"}
                    </button>
                    <button className="btn btn-sm btn-outline" onClick={() => reject(m.postUrl)}>
                      {lang === "hi" ? "अस्वीकार करें" : "Reject"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Manual report-a-post form */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">{lang === "hi" ? "देखी गई पोस्ट रिपोर्ट करें" : "Report a Post You Saw"}</div>
        <div style={{ fontSize: 11, color: "#9e9e9e", marginBottom: 10 }}>
          {lang === "hi" ? "वही सत्यापन पाइपलाइन से गुज़रती है" : "Goes through the identical verification pipeline"}
        </div>
        <form onSubmit={submitReport} className="row" style={{ flexWrap: "wrap" }}>
          <input required placeholder={lang === "hi" ? "हैंडल/नाम" : "Handle/name"} value={reportForm.handle}
            onChange={e => setReportForm(f => ({...f, handle: e.target.value}))}
            style={{ flex: "1 1 140px", padding: "6px 10px", fontSize: 12, border: "1px solid #e0e0e0", borderRadius: 6 }} />
          <input placeholder={lang === "hi" ? "पोस्ट URL (वैकल्पिक)" : "Post URL (optional)"} value={reportForm.postUrl}
            onChange={e => setReportForm(f => ({...f, postUrl: e.target.value}))}
            style={{ flex: "1 1 140px", padding: "6px 10px", fontSize: 12, border: "1px solid #e0e0e0", borderRadius: 6 }} />
          <input required placeholder={lang === "hi" ? "पोस्ट का टेक्स्ट" : "Post text"} value={reportForm.text}
            onChange={e => setReportForm(f => ({...f, text: e.target.value}))}
            style={{ flex: "2 1 240px", padding: "6px 10px", fontSize: 12, border: "1px solid #e0e0e0", borderRadius: 6 }} />
          <button className="btn btn-sm btn-primary" type="submit">{lang === "hi" ? "जमा करें" : "Submit"}</button>
        </form>
        {reportResult && <div style={{ fontSize: 12, color: "#2e7d32", marginTop: 8 }}>{reportResult}</div>}
      </div>
    </div>
  );
}

function FileOnBehalfTab({ lang }: { lang: string }) {
  // Direct answer to "elderly/uneducated citizens" — a CMO/admin staff
  // member fields a phone call (CM Helpline 1902-style) and files the
  // complaint on the citizen's behalf. Goes through the exact same NLP
  // classifier and routing as a self-filed complaint — no second-class
  // path, no missing features — and uses channel "CM Helpline" so it's
  // distinguishable in reporting from self-service web filings.
  const [form, setForm] = useState({ citizenName: "", citizenPhone: "", descriptionRaw: "", district: "", address: "" });
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [filing, setFiling] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const DISTRICTS = ["New Delhi","South Delhi","North Delhi","East Delhi","West Delhi","Shahdara","Dwarka","Rohini","Karol Bagh","Najafgarh"];

  const useMyLocation = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); setLocating(false); },
      () => setLocating(false),
      { timeout: 8000 }
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lat === null || lng === null) { setError(lang === "hi" ? "स्थान आवश्यक है — मानचित्र पर बताए गए स्थान का उपयोग करें" : "Location required — use the caller's described location"); return; }
    setFiling(true); setError("");
    try {
      const r = await api.post<any>("/grievances", { ...form, lat, lng, channel: "CM Helpline" });
      setResult(r);
      setForm({ citizenName: "", citizenPhone: "", descriptionRaw: "", district: "", address: "" });
      setLat(null); setLng(null);
    } catch (e: any) { setError(e.message); }
    setFiling(false);
  };

  return (
    <div style={{ maxWidth: 520 }}>
      <div className="card" style={{ marginBottom: 14, background: "#e8eaf6" }}>
        <div style={{ fontSize: 13, color: "#1a237e" }}>
          {lang === "hi"
            ? "फ़ोन पर शिकायत लेने वाले स्टाफ के लिए — उन नागरिकों के लिए जिनके पास स्मार्टफोन नहीं है या जो टाइप नहीं कर सकते। यह वेब फॉर्म जैसी ही प्रक्रिया से गुज़रती है।"
            : "For staff taking phone calls — for citizens without a smartphone, who can't type, or who simply prefer calling. Goes through the identical classification and routing as self-service web filing."}
        </div>
      </div>

      {result ? (
        <div className="card" style={{ background: "#e8f5e9" }}>
          <div style={{ fontWeight: 600, color: "#1b5e20", marginBottom: 8 }}>
            {lang === "hi" ? "दर्ज हो गई" : "Filed successfully"} — {result.grvId}
          </div>
          <div style={{ fontSize: 12, color: "#2e7d32" }}>
            {result.category} · {result.priority} · {lang === "hi" ? "भेजी जाएगी" : "routed to"} {result.department}
          </div>
          <div style={{ fontSize: 12, color: "#616161", marginTop: 8 }}>
            {lang === "hi" ? "कॉल करने वाले को यह संदर्भ क्रमांक बताएं:" : "Read this reference number to the caller:"}{" "}
            <strong style={{ fontFamily: "monospace" }}>{result.grvId}</strong>
          </div>
          <div style={{ fontSize: 12, color: "#e65100", marginTop: 6, background: "#fff3e0", padding: "8px 10px", borderRadius: 6 }}>
            {lang === "hi" ? "और यह 6-अंकीय गुप्त कोड (बाद में ट्रैकिंग/पुष्टि के लिए आवश्यक):" : "And this 6-digit secret code (required later to track/confirm):"}{" "}
            <strong style={{ fontFamily: "monospace", fontSize: 14, letterSpacing: 2 }}>{result.trackingSecret}</strong>
          </div>
          <button className="btn btn-sm btn-outline" style={{ marginTop: 10 }} onClick={() => setResult(null)}>
            {lang === "hi" ? "एक और शिकायत दर्ज करें" : "File another complaint"}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="card">
          <div className="form-group">
            <label className="form-label">{lang === "hi" ? "कॉल करने वाले का नाम" : "Caller's name"} <span className="req">*</span></label>
            <input required value={form.citizenName} onChange={e => setForm(f => ({...f, citizenName: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">{lang === "hi" ? "फ़ोन नंबर" : "Phone number"} <span className="req">*</span></label>
            <input required type="tel" value={form.citizenPhone} onChange={e => setForm(f => ({...f, citizenPhone: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">{lang === "hi" ? "ज़िला" : "District"} <span className="req">*</span></label>
            <select required value={form.district} onChange={e => setForm(f => ({...f, district: e.target.value}))}>
              <option value="">{lang === "hi" ? "चुनें…" : "Select…"}</option>
              {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{lang === "hi" ? "स्थान विवरण" : "Location description"}</label>
            <input value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} placeholder={lang === "hi" ? "गली, मोहल्ला, पास का लैंडमार्क" : "Street, colony, nearby landmark"} />
          </div>
          <div className="form-group">
            <button type="button" className="btn btn-sm btn-outline" onClick={useMyLocation} disabled={locating}>
              {locating ? "…" : lat !== null ? (lang === "hi" ? "✓ स्थान सेट" : "✓ Location set") : (lang === "hi" ? "स्टाफ का वर्तमान स्थान उपयोग करें (अनुमानित)" : "Use staff's current location (approximate)")}
            </button>
            <div style={{ fontSize: 11, color: "#9e9e9e", marginTop: 4 }}>
              {lang === "hi" ? "नोट: यह कॉल करने वाले का सटीक स्थान नहीं है — केवल ज़िला-स्तरीय अनुमान" : "Note: this is not the caller's exact location — only a district-level approximation for routing"}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{lang === "hi" ? "शिकायत (कॉल करने वाले के शब्दों में)" : "Complaint (in the caller's own words)"} <span className="req">*</span></label>
            <textarea required rows={4} value={form.descriptionRaw} onChange={e => setForm(f => ({...f, descriptionRaw: e.target.value}))} />
          </div>
          {error && <div style={{ background: "#ffebee", color: "#b71c1c", padding: "8px 12px", borderRadius: 6, fontSize: 12, marginBottom: 12 }}>{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={filing}>
            {filing ? "…" : (lang === "hi" ? "शिकायत दर्ज करें" : "File Complaint")}
          </button>
        </form>
      )}
    </div>
  );
}

function RolesTab({ lang }: { lang: string }) {
  const [roles, setRoles] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [subTab, setSubTab] = useState<"roles"|"users"|"new">("roles");
  const [newRole, setNewRole] = useState({ code: "", label: "", labelHi: "", permissions: [] as string[] });
  const [createMsg, setCreateMsg] = useState("");
  const [reassigning, setReassigning] = useState<string | null>(null);

  const load = async () => {
    try {
      const [r, c, u] = await Promise.all([
        api.get<any[]>("/roles"),
        api.get<any[]>("/roles/permission-catalog"),
        api.get<any[]>("/users"),
      ]);
      setRoles(r); setCatalog(c); setUsers(u);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const togglePerm = (key: string) => {
    setNewRole(r => ({
      ...r,
      permissions: r.permissions.includes(key) ? r.permissions.filter(p => p !== key) : [...r.permissions, key],
    }));
  };

  const createRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateMsg("");
    try {
      await api.post("/roles", newRole);
      setCreateMsg(lang === "hi" ? "भूमिका बनाई गई" : "Role created");
      setNewRole({ code: "", label: "", labelHi: "", permissions: [] });
      setSubTab("roles");
      load();
    } catch (e: any) { setCreateMsg(e.message); }
  };

  const deleteRole = async (code: string) => {
    try { await api.delete(`/roles/${code}`); load(); } catch (e: any) { alert(e.message); }
  };

  const reassignRole = async (userId: string, role: string) => {
    setReassigning(userId);
    try { await api.patch(`/users/${userId}/role`, { role }); load(); } catch (e: any) { alert(e.message); }
    setReassigning(null);
  };

  const toggleActive = async (userId: string, isActive: boolean) => {
    try { await api.patch(`/users/${userId}/active`, { isActive }); load(); } catch {}
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, background: "#e8eaf6" }}>
        <div style={{ fontSize: 13, color: "#1a237e" }}>
          {lang === "hi"
            ? "जितनी ज़रूरत हो उतनी कस्टम भूमिकाएं बनाएं — हर एक एक विशिष्ट अनुमति सेट के साथ। नागरिक/फील्ड अधिकारी यहां प्रबंधित नहीं होते (उनकी संरचना अलग है)।"
            : "Create as many custom roles as needed — each a specific bundle of permissions. Citizens/field officers aren't managed here (their workflows are structurally different, not permission toggles)."}
        </div>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <button className={`tab ${subTab==="roles"?"active":""}`} onClick={() => setSubTab("roles")}>{lang === "hi" ? "भूमिकाएं" : "Roles"}</button>
        <button className={`tab ${subTab==="users"?"active":""}`} onClick={() => setSubTab("users")}>{lang === "hi" ? "उपयोगकर्ता" : "Users"}</button>
        <button className={`tab ${subTab==="new"?"active":""}`} onClick={() => setSubTab("new")}>+ {lang === "hi" ? "नई भूमिका" : "New Role"}</button>
      </div>

      {subTab === "roles" && (
        <div className="card" style={{ padding: 0 }}>
          <div className="tbl-wrap">
            <table>
              <thead><tr>
                <th>{lang === "hi" ? "कोड" : "Code"}</th>
                <th>{lang === "hi" ? "नाम" : "Label"}</th>
                <th>{lang === "hi" ? "अनुमतियां" : "Permissions"}</th>
                <th>{lang === "hi" ? "प्रकार" : "Type"}</th>
                <th />
              </tr></thead>
              <tbody>
                {roles.map((r: any) => (
                  <tr key={r.code}>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.code}</td>
                    <td>{lang === "hi" ? r.labelHi : r.label}</td>
                    <td style={{ fontSize: 11, color: "#616161", maxWidth: 280 }}>{r.permissions.join(", ") || "—"}</td>
                    <td>
                      <span className={`badge ${r.isSystem ? "badge-amber" : "badge-green"}`}>
                        {r.isSystem ? (lang === "hi" ? "सिस्टम" : "System") : (lang === "hi" ? "कस्टम" : "Custom")}
                      </span>
                    </td>
                    <td>
                      {!r.isSystem && (
                        <button className="btn btn-sm btn-outline" onClick={() => deleteRole(r.code)}>
                          {lang === "hi" ? "हटाएं" : "Delete"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === "users" && (
        <div className="card" style={{ padding: 0 }}>
          <div className="tbl-wrap">
            <table>
              <thead><tr>
                <th>{lang === "hi" ? "नाम" : "Name"}</th>
                <th>{lang === "hi" ? "फ़ोन" : "Phone"}</th>
                <th>{lang === "hi" ? "वर्तमान भूमिका" : "Current Role"}</th>
                <th>{lang === "hi" ? "भूमिका बदलें" : "Reassign"}</th>
                <th>{lang === "hi" ? "सक्रिय" : "Active"}</th>
              </tr></thead>
              <tbody>
                {users.filter((u: any) => u.role !== "citizen" && u.role !== "field_officer").map((u: any) => (
                  <tr key={u._id}>
                    <td>{u.name}</td>
                    <td style={{ fontSize: 12 }}>{u.phone}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{u.role}</td>
                    <td>
                      <select
                        defaultValue=""
                        disabled={reassigning === u._id}
                        onChange={(e) => e.target.value && reassignRole(u._id, e.target.value)}
                        style={{ fontSize: 11, padding: "3px 6px" }}
                      >
                        <option value="">{lang === "hi" ? "बदलें…" : "Change…"}</option>
                        {roles.filter((r: any) => r.code !== "citizen" && r.code !== "field_officer").map((r: any) => (
                          <option key={r.code} value={r.code}>{r.code}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input type="checkbox" checked={u.isActive} onChange={(e) => toggleActive(u._id, e.target.checked)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === "new" && (
        <form className="card" onSubmit={createRole}>
          <div className="form-group">
            <label className="form-label">{lang === "hi" ? "कोड (lowercase, अंडरस्कोर)" : "Code (lowercase, underscores)"} <span className="req">*</span></label>
            <input required pattern="[a-z0-9_]+" value={newRole.code} onChange={e => setNewRole(r => ({...r, code: e.target.value.toLowerCase()}))} placeholder="regional_auditor" />
          </div>
          <div className="form-group">
            <label className="form-label">{lang === "hi" ? "अंग्रेज़ी नाम" : "Label (English)"} <span className="req">*</span></label>
            <input required value={newRole.label} onChange={e => setNewRole(r => ({...r, label: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">{lang === "hi" ? "हिंदी नाम" : "Label (Hindi)"} <span className="req">*</span></label>
            <input required value={newRole.labelHi} onChange={e => setNewRole(r => ({...r, labelHi: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">{lang === "hi" ? "अनुमतियां चुनें" : "Select Permissions"}</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {catalog.map((p: any) => (
                <label key={p.key} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={newRole.permissions.includes(p.key)} onChange={() => togglePerm(p.key)} style={{ marginTop: 2 }} />
                  <span>{lang === "hi" ? p.labelHi : p.label}</span>
                </label>
              ))}
            </div>
          </div>
          {createMsg && <div style={{ fontSize: 12, color: createMsg.includes("created") || createMsg.includes("बनाई") ? "#2e7d32" : "#b71c1c", marginBottom: 10 }}>{createMsg}</div>}
          <button className="btn btn-primary" type="submit">{lang === "hi" ? "भूमिका बनाएं" : "Create Role"}</button>
        </form>
      )}
    </div>
  );
}

function AnnouncementsTab({ lang }: { lang: string }) {
  const [history, setHistory] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [officers, setOfficers] = useState<any[]>([]);
  const [form, setForm] = useState({ targetType: "department", targetDepartmentCode: "", targetOfficerId: "", message: "", priority: "Normal" });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");

  const load = async () => {
    try {
      const [h, d, o] = await Promise.all([
        api.get<any[]>("/announcements"),
        api.get<any[]>("/departments"),
        api.get<any[]>("/officer/contacts"),
      ]);
      setHistory(h); setDepartments(d); setOfficers(o);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setResult("");
    try {
      await api.post("/announcements", form);
      setResult(lang === "hi" ? "घोषणा भेजी गई" : "Announcement sent");
      setForm({ targetType: "department", targetDepartmentCode: "", targetOfficerId: "", message: "", priority: "Normal" });
      load();
    } catch (e: any) { setResult(e.message); }
    setSending(false);
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, background: "#e8eaf6" }}>
        <div style={{ fontSize: 13, color: "#1a237e" }}>
          {lang === "hi"
            ? "किसी विशेष अधिकारी, पूरे विभाग, या सभी अधिकारियों को सामूहिक प्राथमिकता संदेश भेजें — जैसे 'इस सप्ताह द्वारका में कचरा शिकायतों को प्राथमिकता दें'।"
            : "Send a bulk priority message to a specific officer, an entire department, or all officers — e.g. 'prioritize garbage complaints in Dwarka this week'."}
        </div>
      </div>

      <form className="card" onSubmit={send} style={{ marginBottom: 16 }}>
        <div className="form-group">
          <label className="form-label">{lang === "hi" ? "किसे भेजें" : "Send to"}</label>
          <select value={form.targetType} onChange={e => setForm(f => ({...f, targetType: e.target.value, targetDepartmentCode: "", targetOfficerId: ""}))}>
            <option value="department">{lang === "hi" ? "पूरा विभाग" : "Whole department"}</option>
            <option value="officer">{lang === "hi" ? "विशेष अधिकारी" : "Specific officer"}</option>
            <option value="all_officers">{lang === "hi" ? "सभी अधिकारी" : "All officers"}</option>
          </select>
        </div>
        {form.targetType === "department" && (
          <div className="form-group">
            <label className="form-label">{lang === "hi" ? "विभाग" : "Department"}</label>
            <select required value={form.targetDepartmentCode} onChange={e => setForm(f => ({...f, targetDepartmentCode: e.target.value}))}>
              <option value="">{lang === "hi" ? "चुनें…" : "Select…"}</option>
              {departments.map((d: any) => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}
            </select>
          </div>
        )}
        {form.targetType === "officer" && (
          <div className="form-group">
            <label className="form-label">{lang === "hi" ? "अधिकारी" : "Officer"}</label>
            <select required value={form.targetOfficerId} onChange={e => setForm(f => ({...f, targetOfficerId: e.target.value}))}>
              <option value="">{lang === "hi" ? "चुनें…" : "Select…"}</option>
              {officers.map((o: any) => <option key={o._id} value={o._id}>{o.name} — {o.department?.name}</option>)}
            </select>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">{lang === "hi" ? "संदेश" : "Message"}</label>
          <textarea required rows={3} value={form.message} onChange={e => setForm(f => ({...f, message: e.target.value}))} />
        </div>
        <div className="form-group">
          <label className="form-label">{lang === "hi" ? "प्राथमिकता" : "Priority"}</label>
          <select value={form.priority} onChange={e => setForm(f => ({...f, priority: e.target.value}))}>
            <option value="Normal">{lang === "hi" ? "सामान्य" : "Normal"}</option>
            <option value="Urgent">{lang === "hi" ? "तत्काल" : "Urgent"}</option>
          </select>
        </div>
        {result && <div style={{ fontSize: 12, color: result.includes("sent") || result.includes("भेजी") ? "#2e7d32" : "#b71c1c", marginBottom: 10 }}>{result}</div>}
        <button className="btn btn-primary" type="submit" disabled={sending}>{lang === "hi" ? "भेजें" : "Send"}</button>
      </form>

      <div className="card-title">{lang === "hi" ? "भेजी गई घोषणाएं" : "Sent Announcements"}</div>
      {history.map((a: any) => (
        <div key={a._id} className="card" style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
            {a.priority === "Urgent" && <span className="badge badge-red">{lang === "hi" ? "तत्काल" : "Urgent"}</span>}
            <span style={{ fontSize: 11, color: "#9e9e9e" }}>
              {a.targetType === "department" ? a.targetDepartmentCode : a.targetType === "all_officers" ? (lang === "hi" ? "सभी अधिकारी" : "All officers") : (lang === "hi" ? "विशेष अधिकारी" : "Specific officer")}
              {" · "}{new Date(a.createdAt).toLocaleDateString()}
            </span>
          </div>
          <div style={{ fontSize: 13 }}>{a.message}</div>
        </div>
      ))}
    </div>
  );
}

function AdminApp() {
  const router = useRouter();
  const { lang, setLang } = useLanguage();
  const [tab, setTab] = useState("overview");
  const [user, setUser] = useState<any>(null);
  const [alertBanner, setAlertBanner] = useState<any>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (!u || (u.role !== "cmo_team" && u.role !== "dept_admin" && u.role !== "super_admin")) {
      router.replace("/login");
      return;
    }
    setUser(u);
    if (u.preferredLanguage) setLang(u.preferredLanguage as "en" | "hi");
  }, [router, setLang]);

  // SSE real-time alerts
  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("token");
    if (!token) return;
    const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api";
    const es = new EventSource(`${API}/ai/alerts/stream?token=${token}`);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "life_threatening") setAlertBanner(data);
    };
    return () => es.close();
  }, []);

  const logout = () => {
    clearToken();
    if (typeof window !== "undefined") localStorage.removeItem("user");
    router.replace("/login");
  };

  if (!user) return null;

  return (
    <div className={`lang-${lang}`}>
      <nav className="topnav">
        <a className="topnav-brand" href="/">{lang === "hi" ? "CMO संचालन डैशबोर्ड" : "CMO Operations Dashboard"}<span className="topnav-sub">{lang === "hi" ? "दिल्ली सरकार" : "Government of Delhi"}</span></a>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{user.name}</span>
          <button className="topnav-btn lang" onClick={() => setLang(lang === "en" ? "hi" : "en")}>{lang === "en" ? "हिंदी" : "English"}</button>
          <button className="topnav-btn" onClick={logout}>{lang === "hi" ? "लॉगआउट" : "Logout"}</button>
        </div>
      </nav>

      <div className="page-wrap">
        {alertBanner && (
          <div className="alert-banner">
            <div className="alert-dot" />
            <div>
              <strong>{lang === "hi" ? "जीवन-घातक शिकायत" : "Life-Threatening Complaint"}</strong> — {alertBanner.grvId} — {alertBanner.district}
              <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{alertBanner.description?.slice(0, 120)}</div>
            </div>
            <button onClick={() => setAlertBanner(null)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 4, padding: "3px 8px", cursor: "pointer", marginLeft: "auto" }}>×</button>
          </div>
        )}

        <div className="tabs" style={{ marginBottom: 16 }}>
          {TABS.filter(tb => !tb.requiresPermission || user.role === "super_admin" || getStoredPermissions().includes(tb.requiresPermission)).map(tb => (
            <button key={tb.id} className={`tab ${tab === tb.id ? "active" : ""}`} onClick={() => setTab(tb.id)}>
              {lang === "hi" ? tb.labelHi : tb.label}
            </button>
          ))}
        </div>

        {tab === "overview"    && <OverviewTab lang={lang} />}
        {tab === "grievances"  && <GrievancesTab lang={lang} />}
        {tab === "fileonbehalf"&& <FileOnBehalfTab lang={lang} />}
        {tab === "workload"    && <WorkloadTab lang={lang} />}
        {tab === "audit"       && <AuditTab lang={lang} />}
        {tab === "departments" && <DepartmentsTab lang={lang} />}
        {tab === "social"      && <SocialTab lang={lang} />}
        {tab === "announcements" && <AnnouncementsTab lang={lang} />}
        {tab === "roles"       && <RolesTab lang={lang} />}
      </div>
    </div>
  );
}

export default function AdminPage() {
  return <LanguageProvider><AdminApp /></LanguageProvider>;
}
