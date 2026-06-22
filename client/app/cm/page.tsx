"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, getStoredUser, clearToken } from "@/lib/api";
import { LanguageProvider, useLanguage } from "@/lib/i18n";

function pill(v: string, compact = false) {
  const cls: Record<string,string> = {
    "Critical":"pill pill-critical","High":"pill pill-high","Normal":"pill pill-normal",
    "Pending":"pill pill-pending","Assigned":"pill pill-assigned","In Progress":"pill pill-inprogress",
    "Confirmed Resolved":"pill pill-confirmed","Reopened":"pill pill-reopened","Escalated":"pill pill-escalated",
    "Resolved Pending Confirmation":"pill pill-resolved-pending",
  };
  return <span className={cls[v]||"pill"} style={compact ? { fontSize: 10 } : undefined}>{v}</span>;
}

function CMApp() {
  const router = useRouter();
  const { lang, setLang } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [tab, setTab] = useState<"overview"|"visit">("overview");
  const [stats, setStats] = useState<any>(null);
  const [districts, setDistricts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [hotspots, setHotspots] = useState<any[]>([]);
  const [healthScore, setHealthScore] = useState<any>(null);
  const [predictive, setPredictive] = useState<any[]>([]);
  const [brief, setBrief] = useState("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [visitLoc, setVisitLoc] = useState<{lat: number; lng: number} | null>(null);
  const [nearby, setNearby] = useState<any[]>([]);
  const [visitDone, setVisitDone] = useState(false);
  const [criticals, setCriticals] = useState<any[]>([]);

  useEffect(() => {
    const u = getStoredUser();
    if (!u || u.role !== "cm") { router.replace("/login"); return; }
    setUser(u);
    if (u.preferredLanguage) setLang(u.preferredLanguage as "en"|"hi");
  }, [router, setLang]);

  const loadData = useCallback(async () => {
    try {
      const [s, d, c, h, hs, pa] = await Promise.all([
        api.get<any>("/dashboard/overview"),
        api.get<any[]>("/dashboard/districts"),
        api.get<any[]>("/dashboard/categories"),
        api.get<any[]>("/dashboard/hotspots"),
        api.get<any>("/dashboard/health-score"),
        api.get<any[]>("/dashboard/predictive-alerts"),
      ]);
      setStats(s); setDistricts(d); setCategories(c); setHotspots(h);
      setHealthScore(hs); setPredictive(pa);

      // load life-threatening/critical open
      const r = await api.get<any>("/grievances?priority=Critical&perPage=6");
      setCriticals(r.items?.filter((g: any) => g.isLifeThreatening || g.status === "Escalated") || []);
    } catch {}
  }, []);

  useEffect(() => { if (user) loadData(); }, [user, loadData]);

  const generateBrief = async () => {
    setBriefLoading(true);
    try {
      const r = await api.get<any>(`/ai/groq/cm-brief?lang=${lang}`);
      setBrief(r.brief);
    } catch {
      setBrief(lang === "hi"
        ? "AI ब्रीफ के लिए GROQ_API_KEY सेट करें।"
        : "Set GROQ_API_KEY to enable AI-generated briefings.");
    }
    setBriefLoading(false);
  };

  const checkin = async () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setVisitLoc(loc);
      try {
        const r = await api.post<any>("/visits/check-in", {
          lat: loc.lat, lng: loc.lng, locationLabel: "Field Visit", radiusMeters: 1000,
        });
        setNearby(r.nearbyGrievances || []);
        setVisitDone(true);
      } catch {}
      setLocating(false);
    }, () => setLocating(false), { timeout: 8000 });
  };

  const logout = () => {
    clearToken();
    if (typeof window !== "undefined") localStorage.removeItem("user");
    router.replace("/login");
  };

  if (!user) return null;

  const totalDistricts = districts.reduce((s: number, d: any) => s + d.total, 0) || 1;

  return (
    <div className={`lang-${lang}`} style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      {/* Nav */}
      <nav className="topnav">
        <a className="topnav-brand" href="/">
          {lang === "hi" ? "मुख्यमंत्री — शहर डैशबोर्ड" : "Chief Minister — City Overview"}
          <span className="topnav-sub">{lang === "hi" ? "दिल्ली सरकार" : "Government of Delhi"}</span>
        </a>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
            {lang === "hi" ? "नमस्ते, मुख्यमंत्री जी" : "Namaste, CM Rekha Gupta"}
          </span>
          <button className="topnav-btn lang" onClick={() => setLang(lang === "en" ? "hi" : "en")}>
            {lang === "en" ? "हिंदी" : "English"}
          </button>
          <button className="topnav-btn" onClick={logout}>
            {lang === "hi" ? "लॉगआउट" : "Logout"}
          </button>
        </div>
      </nav>

      <div className="page-wrap" style={{ maxWidth: 760 }}>
        {/* Life-threatening alert */}
        {criticals.length > 0 && (
          <div className="alert-banner" style={{ marginBottom: 14 }}>
            <div className="alert-dot" />
            <div>
              <strong>{lang === "hi" ? "तत्काल ध्यान आवश्यक" : "Immediate Attention Required"}</strong>
              {" — "}
              {criticals.length} {lang === "hi" ? "जीवन-घातक/एस्केलेटेड शिकायतें खुली हैं" : "life-threatening or escalated complaints open"}
              <div style={{ marginTop: 5, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {criticals.slice(0, 3).map((g: any) => (
                  <span key={g.grvId} style={{ fontSize: 11, background: "rgba(255,255,255,0.15)", borderRadius: 4, padding: "2px 6px" }}>
                    {g.grvId} · {g.district} · {g.category}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* AI brief */}
        <div className="cm-brief">
          <div className="cm-brief-label">
            {lang === "hi" ? "AI सिटुएशन ब्रीफ — Groq llama-3.3-70b" : "AI Situation Brief — Groq llama-3.3-70b"}
          </div>
          {brief ? (
            <div className="cm-brief-text">{brief}</div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
                {lang === "hi" ? "AI-संचालित दैनिक स्थिति सारांश (हिंदी/अंग्रेज़ी)" : "AI-powered daily situation report in your preferred language"}
              </span>
              <button className="btn btn-sm" style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }}
                onClick={generateBrief} disabled={briefLoading}>
                {briefLoading ? "…" : (lang === "hi" ? "ब्रीफ लें" : "Get Brief")}
              </button>
            </div>
          )}
          {brief && (
            <button onClick={() => setBrief("")} style={{ marginTop: 10, background: "rgba(255,255,255,0.15)", border: "none", color: "rgba(255,255,255,0.7)", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontSize: 11 }}>
              {lang === "hi" ? "ताज़ा करें" : "Refresh"}
            </button>
          )}
        </div>

        {/* Delhi Health Score */}
        {healthScore && (
          <div className="card" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
              <svg viewBox="0 0 36 36" style={{ width: 72, height: 72, transform: "rotate(-90deg)" }}>
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e0e0e0" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.5" fill="none"
                  stroke={healthScore.score >= 75 ? "#2e7d32" : healthScore.score >= 50 ? "#e65100" : "#b71c1c"}
                  strokeWidth="3" strokeDasharray={`${(healthScore.score / 100) * 97.4} 97.4`} strokeLinecap="round" />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "#1a237e" }}>
                {healthScore.score}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a237e", marginBottom: 4 }}>
                {lang === "hi" ? "दिल्ली स्वास्थ्य स्कोर" : "Delhi Governance Health Score"}
              </div>
              <div style={{ fontSize: 11, color: "#9e9e9e", marginBottom: 6 }}>
                {lang === "hi"
                  ? "40% नागरिक पुष्टि + 25% समय पर समाधान + 20% एस्केलेशन-मुक्त + 15% पुनः न खुलना"
                  : "40% citizen confirmation + 25% on-time resolution + 20% escalation-free + 15% non-reopened"}
              </div>
              <div style={{ display: "flex", gap: 10, fontSize: 11, color: "#616161" }}>
                <span>{lang === "hi" ? "पुष्टि" : "Confirm"}: {healthScore.components.confirmationRate}%</span>
                <span>{lang === "hi" ? "समय पर" : "On-time"}: {healthScore.components.onTimeRate}%</span>
                <span>{lang === "hi" ? "पुनः खुली" : "Reopen"}: {healthScore.components.reopenRate}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Predictive alerts */}
        {predictive.length > 0 && (
          <div className="card" style={{ marginTop: 14, borderLeft: "3px solid #e65100" }}>
            <div className="card-title" style={{ color: "#e65100" }}>
              {lang === "hi" ? "पूर्वानुमान चेतावनी — तेज़ी से बढ़ती समस्याएं" : "Predictive Alert — Rapidly Growing Issues"}
            </div>
            <div style={{ fontSize: 11, color: "#9e9e9e", marginBottom: 8 }}>
              {lang === "hi" ? "सप्ताह-दर-सप्ताह वृद्धि दर — पारदर्शी गणना, कोई ब्लैक-बॉक्स भविष्यवाणी नहीं" : "Week-over-week growth rate — transparent calculation, no black-box prediction"}
            </div>
            {predictive.slice(0, 3).map((p: any, i: number) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < 2 ? "1px solid #f0f0f0" : "none", fontSize: 12 }}>
                <span>{p.district} — {p.category}</span>
                <span style={{ fontWeight: 700, color: "#e65100" }}>+{p.growthPct}% ({p.lastWeek}→{p.thisWeek})</span>
              </div>
            ))}
          </div>
        )}


        {stats && (
          <div className="stat-grid" style={{ marginTop: 14 }}>
            <div className="stat-card"><div className="stat-val">{stats.filedToday}</div><div className="stat-label">{lang === "hi" ? "आज दर्ज" : "Filed Today"}</div></div>
            <div className="stat-card red"><div className="stat-val">{stats.criticalOpen}</div><div className="stat-label">{lang === "hi" ? "गंभीर खुली" : "Critical Open"}</div></div>
            <div className="stat-card red"><div className="stat-val">{stats.lifeThreateningOpen}</div><div className="stat-label">{lang === "hi" ? "जीवन-घातक" : "Life-Threatening"}</div></div>
            <div className="stat-card green"><div className="stat-val">{stats.resolvedWeek}</div><div className="stat-label">{lang === "hi" ? "इस सप्ताह हल" : "Resolved (Week)"}</div></div>
            <div className="stat-card amber"><div className="stat-val">{stats.slaBreached}</div><div className="stat-label">{lang === "hi" ? "SLA उल्लंघन" : "SLA Breached"}</div></div>
            <div className="stat-card saffron"><div className="stat-val">{stats.awaitingConfirmation}</div><div className="stat-label">{lang === "hi" ? "पुष्टि प्रतीक्षा" : "Awaiting Confirm."}</div></div>
          </div>
        )}

        {/* Tabs */}
        <div className="tabs" style={{ marginTop: 16 }}>
          <button className={`tab ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>
            {lang === "hi" ? "ज़िला अवलोकन" : "District Overview"}
          </button>
          <button className={`tab ${tab === "visit" ? "active" : ""}`} onClick={() => setTab("visit")}>
            {lang === "hi" ? "विज़िट मोड" : "Visit Mode"}
          </button>
        </div>

        {tab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* District breakdown */}
            <div className="card">
              <div className="card-title">{lang === "hi" ? "ज़िले अनुसार" : "By District"}</div>
              {districts.slice(0, 10).map((d: any) => (
                <div key={d.district} className="district-row">
                  <span style={{ fontSize: 12, minWidth: 90 }}>{d.district}</span>
                  <div className="district-bar">
                    <div className="district-bar-fill" style={{ width: `${(d.total / totalDistricts) * 100 * 3}%`, maxWidth: "100%" }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, minWidth: 30, textAlign: "right" }}>{d.total}</span>
                  {d.critical > 0 && <span className="badge badge-red" style={{ marginLeft: 6 }}>{d.critical}</span>}
                </div>
              ))}
            </div>

            {/* Category breakdown */}
            <div className="card">
              <div className="card-title">{lang === "hi" ? "श्रेणी अनुसार" : "By Category"}</div>
              {categories.slice(0, 10).map((c: any) => {
                const max = categories[0]?.total || 1;
                return (
                  <div key={c.category} className="district-row">
                    <span style={{ fontSize: 11, minWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.category}</span>
                    <div className="district-bar">
                      <div className="district-bar-fill" style={{ width: `${(c.total / max) * 100}%`, background: "#e65100" }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, minWidth: 28, textAlign: "right" }}>{c.total}</span>
                  </div>
                );
              })}
            </div>

            {/* Hotspots */}
            <div className="card" style={{ gridColumn: "1/-1" }}>
              <div className="card-title">{lang === "hi" ? "बार-बार होने वाली समस्याएं (पिछले 30 दिन)" : "Recurring Hotspots — Last 30 Days"}</div>
              {hotspots.length === 0 ? (
                <div className="empty" style={{ padding: "12px 0" }}>{lang === "hi" ? "पर्याप्त डेटा नहीं — बाद में देखें" : "Insufficient data — check back after complaints are filed"}</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                  {hotspots.map((h: any, i: number) => (
                    <div key={i} style={{ background: "#f5f5f5", borderRadius: 8, padding: "10px 12px", borderLeft: `3px solid ${h.criticalCount > 0 ? "#b71c1c" : "#3949ab"}` }}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{h.district}</div>
                      <div style={{ fontSize: 11, color: "#616161", margin: "3px 0" }}>{h.category}</div>
                      <div style={{ fontWeight: 700, color: h.criticalCount > 0 ? "#b71c1c" : "#1a237e" }}>
                        {h.count} {lang === "hi" ? "शिकायतें" : "complaints"}
                        {h.criticalCount > 0 && <span style={{ color: "#b71c1c", fontSize: 10, marginLeft: 6 }}>({h.criticalCount} critical)</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "visit" && (
          <div>
            <div className="card visit-mode-card" style={{ marginBottom: 14 }}>
              <div className="card-title" style={{ color: "#e65100" }}>{lang === "hi" ? "फील्ड विज़िट मोड" : "Field Visit Mode"}</div>
              <div style={{ fontSize: 13, color: "#616161", marginBottom: 12 }}>
                {lang === "hi"
                  ? "यहाँ चेक इन करें — सिस्टम 1 किमी के दायरे में सभी खुली शिकायतें दिखाएगा जिन्हें आप इस विज़िट में सीधे देख या हल कर सकते हैं।"
                  : "Check in here and the system finds all open complaints within 1 km so you can inspect or resolve them directly during this visit."}
              </div>
              {!visitDone ? (
                <button className="btn btn-saffron" onClick={checkin} disabled={locating}>
                  {locating ? (lang === "hi" ? "स्थान खोज रहे हैं…" : "Getting location…") : (lang === "hi" ? "यहाँ चेक इन करें" : "Check In Here")}
                </button>
              ) : (
                <div>
                  <div style={{ fontSize: 12, color: "#2e7d32", marginBottom: 12, fontWeight: 500 }}>
                    {lang === "hi" ? `चेक इन हुआ — ${visitLoc?.lat.toFixed(4)}, ${visitLoc?.lng.toFixed(4)}` :
                      `Checked in at ${visitLoc?.lat.toFixed(4)}, ${visitLoc?.lng.toFixed(4)}`}
                  </div>
                  <button className="btn btn-sm btn-outline" onClick={() => { setVisitDone(false); setNearby([]); }}>
                    {lang === "hi" ? "नई विज़िट" : "New Visit"}
                  </button>
                </div>
              )}
            </div>

            {visitDone && (
              <>
                <div className="section-title" style={{ marginBottom: 10 }}>
                  {lang === "hi" ? `आस-पास की खुली शिकायतें (1 किमी) — ${nearby.length} मिलीं` :
                    `Nearby Open Complaints (1 km) — ${nearby.length} found`}
                </div>
                {nearby.length === 0 ? (
                  <div className="empty">{lang === "hi" ? "1 किमी के दायरे में कोई खुली शिकायत नहीं" : "No open complaints within 1 km"}</div>
                ) : nearby.map((g: any) => (
                  <div key={g.grvId} className="nearby-card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div>
                        <div className="nearby-card-title" style={{ marginBottom: 4 }}>
                          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#9e9e9e", marginRight: 8 }}>{g.grvId}</span>
                          {pill(g.priority, true)}
                          {g.isLifeThreatening && <span className="pill pill-life" style={{ fontSize: 10, marginLeft: 4 }}>LIFE</span>}
                        </div>
                        <div style={{ fontSize: 13, color: "#212121" }}>{g.descriptionRaw?.slice(0, 100)}{g.descriptionRaw?.length > 100 ? "…" : ""}</div>
                        <div className="nearby-card-meta">{g.category} · {g.district} · {lang === "hi" ? "दर्ज" : "Filed"} {g.filedAt?.slice(0,10)}</div>
                      </div>
                      <div>{pill(g.status, true)}</div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Visit logs */}
            <VisitHistory lang={lang} />
          </div>
        )}
      </div>
    </div>
  );
}

function VisitHistory({ lang }: { lang: string }) {
  const [visits, setVisits] = useState<any[]>([]);
  useEffect(() => {
    api.get<any[]>("/visits/history").then(setVisits).catch(() => {});
  }, []);

  if (visits.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-title">{lang === "hi" ? "हाल की विज़िट लॉग" : "Recent Visit Logs"}</div>
      {visits.slice(0, 8).map((v: any) => (
        <div key={String(v._id)} style={{ padding: "8px 0", borderBottom: "1px solid #f0f0f0", fontSize: 12 }}>
          <div style={{ fontWeight: 500 }}>{v.locationLabel || (lang === "hi" ? "अज्ञात स्थान" : "Unknown location")} — {v.district}</div>
          <div style={{ color: "#9e9e9e", fontSize: 11, marginTop: 2 }}>
            {v.checkedInAt?.slice(0,16)} · {v.nearbyGrievanceIds?.length || 0} {lang === "hi" ? "शिकायतें मिलीं" : "complaints found"}
            {v.resolvedOnSiteIds?.length > 0 && <span style={{ color: "#2e7d32", marginLeft: 6 }}>· {v.resolvedOnSiteIds.length} resolved on-site</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CMPage() {
  return <LanguageProvider><CMApp /></LanguageProvider>;
}
