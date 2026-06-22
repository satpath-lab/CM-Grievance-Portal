"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, getStoredUser, clearToken } from "@/lib/api";
import { LanguageProvider, useLanguage } from "@/lib/i18n";
import { PhotoCapture } from "@/components/PhotoCapture";

const PRIORITY_CLASS: Record<string,string> = { Critical: "pill pill-critical", High: "pill pill-high", Normal: "pill pill-normal" };
const STATUS_CLASS: Record<string,string> = { "Pending": "pill pill-pending", "Assigned": "pill pill-assigned", "In Progress": "pill pill-inprogress", "Resolved Pending Confirmation": "pill pill-resolved-pending", "Escalated": "pill pill-escalated", "Reopened": "pill pill-reopened" };

function PendingForwards({ lang }: { lang: string }) {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [responding, setResponding] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [responsePhoto, setResponsePhoto] = useState("");

  const load = async () => {
    try {
      const r = await api.get<any[]>("/officer/forwarded-to-me");
      setTransfers(r.filter((t: any) => t.status === "Pending"));
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const submit = async (transferId: string) => {
    if (responseText.trim().length < 5) return;
    try {
      await api.post(`/officer/transfers/${transferId}/respond`, { response: responseText, responsePhotoUrl: responsePhoto || undefined });
      setResponding(null); setResponseText(""); setResponsePhoto("");
      load();
    } catch {}
  };

  if (transfers.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 14, borderLeft: "3px solid #e65100" }}>
      <div className="card-title" style={{ color: "#e65100" }}>
        {lang === "hi" ? `आपको भेजे गए मामले — प्रतिक्रिया बाकी (${transfers.length})` : `Cases Forwarded to You — Response Needed (${transfers.length})`}
      </div>
      {transfers.map((tr: any) => (
        <div key={tr._id} style={{ borderTop: "1px solid #f0f0f0", padding: "10px 0" }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{tr.grvId} — {lang === "hi" ? "से" : "from"} {tr.fromOfficerName}</div>
          <div style={{ fontSize: 13, color: "#424242", margin: "4px 0" }}>{tr.instruction}</div>
          {responding === tr._id ? (
            <div>
              <textarea rows={2} value={responseText} onChange={e => setResponseText(e.target.value)}
                placeholder={lang === "hi" ? "आपकी आख्या / रिपोर्ट…" : "Your report / response…"} />
              <PhotoCapture value={responsePhoto} onChange={setResponsePhoto} label={lang === "hi" ? "फ़ोटो जोड़ें (वैकल्पिक)" : "Add photo (optional)"} />
              <div className="row" style={{ marginTop: 6 }}>
                <button className="btn btn-sm btn-primary" onClick={() => submit(tr._id)}>{lang === "hi" ? "जमा करें" : "Submit"}</button>
                <button className="btn btn-sm btn-outline" onClick={() => setResponding(null)}>{lang === "hi" ? "रद्द करें" : "Cancel"}</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-sm btn-saffron" onClick={() => setResponding(tr._id)}>{lang === "hi" ? "प्रतिक्रिया दें" : "Respond"}</button>
          )}
        </div>
      ))}
    </div>
  );
}

function OfficerApp() {
  const router = useRouter();
  const { t, lang, setLang } = useLanguage();
  const user = getStoredUser();
  const [queue, setQueue] = useState<any[]>([]);
  const [counts, setCounts] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [view, setView] = useState<"queue"|"resolve"|"contacts"|"tasks">("queue");
  const [suggestion, setSuggestion] = useState("");
  const [contacts, setContacts] = useState<any[]>([]);
  // Resolve form state
  const [resolveLat, setResolveLat] = useState<number|null>(null);
  const [resolveLng, setResolveLng] = useState<number|null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [resolveNote, setResolveNote] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveResult, setResolveResult] = useState<any>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  // Forward-case state
  const [showForward, setShowForward] = useState(false);
  const [forwardToId, setForwardToId] = useState("");
  const [forwardInstruction, setForwardInstruction] = useState("");
  const [forwarding, setForwarding] = useState(false);
  const [forwardResult, setForwardResult] = useState("");
  const [forwardHours, setForwardHours] = useState("");
  // Similar complaints / bulk resolve
  const [similar, setSimilar] = useState<any[]>([]);
  const [selectedSimilar, setSelectedSimilar] = useState<string[]>([]);
  const [bulkResolving, setBulkResolving] = useState(false);
  const [bulkResult, setBulkResult] = useState("");
  // Extension request
  const [showExtension, setShowExtension] = useState(false);
  const [extensionHours, setExtensionHours] = useState("");
  const [extensionReason, setExtensionReason] = useState("");
  const [extensionResult, setExtensionResult] = useState("");
  // Availability
  const [onLeave, setOnLeave] = useState(false);
  // Announcements
  const [announcements, setAnnouncements] = useState<any[]>([]);

  useEffect(() => {
    if (!user || user.role !== "field_officer") { router.replace("/login"); return; }
    fetchQueue();
    api.get<any>("/auth/me").then(r => setOnLeave(r.onLeave || false)).catch(() => {});
    fetchAnnouncements();
  }, []);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const r = await api.get<any>("/officer/my-queue");
      setQueue(r.items || []);
      setCounts(r.counts || {});
    } catch { router.replace("/login"); }
    setLoading(false);
  };

  const openGrievance = async (g: any) => {
    setSelected(g);
    setSuggestion("");
    setResolveResult(null);
    setPhotoUrl("");
    setResolveNote("");
    setResolveLat(null);
    setResolveLng(null);
    setShowForward(false);
    setForwardResult("");
    setForwardHours("");
    setSelectedSimilar([]);
    setBulkResult("");
    setShowExtension(false);
    setExtensionResult("");
    setView("resolve");
    if (contacts.length === 0) fetchContacts();
    // Fetch Groq suggestion
    try {
      const r = await api.get<any>(`/ai/groq/suggest/${g.grvId}?lang=${lang}`);
      setSuggestion(r.suggestion);
    } catch {}
    // Fetch similar complaints nearby — NOT a merge, just visibility
    try {
      const sim = await api.get<any[]>(`/grievances/${g.grvId}/similar`);
      setSimilar(sim);
    } catch { setSimilar([]); }
  };

  const startProgress = async (grvId: string) => {
    try {
      await api.post(`/officer/${grvId}/start-progress`, {});
      fetchQueue();
    } catch {}
  };

  const captureResolveLocation = () => {
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setResolveLat(pos.coords.latitude); setResolveLng(pos.coords.longitude); setGeoLoading(false); },
      () => setGeoLoading(false)
    );
  };

  const submitResolve = async () => {
    if (!selected || !resolveLat || !resolveLng || !photoUrl) return;
    setResolving(true);
    try {
      const r = await api.post<any>(`/grievances/${selected.grvId}/resolve`, {
        photoUrl,
        officerLat: resolveLat,
        officerLng: resolveLng,
        note: resolveNote,
      });
      setResolveResult(r);
      fetchQueue();
    } catch (err: any) {
      setResolveResult({ error: err.message });
    }
    setResolving(false);
  };

  const fetchContacts = async () => {
    const r = await api.get<any>("/officer/contacts");
    setContacts(r);
  };

  const submitForward = async () => {
    if (!selected || !forwardToId || forwardInstruction.trim().length < 5) return;
    setForwarding(true);
    setForwardResult("");
    try {
      await api.post(`/officer/${selected.grvId}/forward`, {
        toOfficerId: forwardToId,
        instruction: forwardInstruction,
        expectedResponseHours: forwardHours ? Number(forwardHours) : undefined,
      });
      setForwardResult(lang === "hi" ? "मामला भेज दिया गया" : "Case forwarded");
      setShowForward(false);
      setForwardToId(""); setForwardInstruction(""); setForwardHours("");
      fetchQueue();
      setView("queue");
    } catch (e: any) { setForwardResult(e.message); }
    setForwarding(false);
  };

  const toggleSimilar = (grvId: string) => {
    setSelectedSimilar(s => s.includes(grvId) ? s.filter(x => x !== grvId) : [...s, grvId]);
  };

  const submitBulkResolve = async () => {
    if (!selected || !photoUrl || !resolveLat || selectedSimilar.length === 0) return;
    setBulkResolving(true);
    setBulkResult("");
    try {
      const r = await api.post<any[]>("/grievances/bulk-resolve-similar", {
        grvIds: [selected.grvId, ...selectedSimilar],
        photoUrl, officerLat: resolveLat, officerLng: resolveLng, note: resolveNote,
      });
      const okCount = r.filter(x => x.ok).length;
      setBulkResult(lang === "hi" ? `${okCount} शिकायतें हल की गईं` : `${okCount} complaints resolved`);
      fetchQueue();
      setView("queue");
    } catch (e: any) { setBulkResult(e.message); }
    setBulkResolving(false);
  };

  const submitExtensionRequest = async () => {
    if (!selected || !extensionHours || extensionReason.trim().length < 5) return;
    try {
      await api.post(`/grievances/${selected.grvId}/request-extension`, {
        requestedHours: Number(extensionHours), reason: extensionReason,
      });
      setExtensionResult(lang === "hi" ? "विस्तार का अनुरोध भेजा गया" : "Extension request sent");
      setShowExtension(false);
      setExtensionHours(""); setExtensionReason("");
    } catch (e: any) { setExtensionResult(e.message); }
  };

  const toggleAvailability = async () => {
    try {
      const r = await api.patch<any>("/officer/availability", { onLeave: !onLeave });
      setOnLeave(r.onLeave);
    } catch {}
  };

  const fetchAnnouncements = async () => {
    try { setAnnouncements(await api.get<any[]>("/announcements/my")); } catch {}
  };

  const logout = () => { clearToken(); localStorage.removeItem("user"); router.replace("/login"); };

  if (loading) return <div className="loading">{t("common.loading")}</div>;

  return (
    <div className={`lang-${lang}`}>
      <nav className="topnav">
        <span className="topnav-brand">
          {t("officer.heading")}
          <span className="topnav-sub">{user?.name} · {t("app.subtitle")}</span>
        </span>
        <button
          className="topnav-btn"
          style={{ background: onLeave ? "#e65100" : "rgba(255,255,255,0.15)" }}
          onClick={toggleAvailability}
        >
          {onLeave
            ? (lang === "hi" ? "🔴 छुट्टी पर — टैप करें वापस आने के लिए" : "🔴 On Leave — tap to return")
            : (lang === "hi" ? "🟢 उपलब्ध" : "🟢 Available")}
        </button>
        <button className="topnav-btn lang" onClick={() => setLang(lang==="en"?"hi":"en")}>{t("lang.toggle")}</button>
        <button className="topnav-btn" onClick={logout}>{t("nav.logout")}</button>
      </nav>
      <div className="page-wrap">

        {/* Summary tiles */}
        <div className="stat-grid" style={{marginBottom:16}}>
          <div className="stat-tile critical"><div className="stat-num">{counts.critical||0}</div><div className="stat-label">{lang==="hi"?"गंभीर":"Critical"}</div></div>
          <div className="stat-tile warning"><div className="stat-num">{counts.total||0}</div><div className="stat-label">{lang==="hi"?"कुल असाइन्ड":"Total assigned"}</div></div>
          <div className="stat-tile"><div className="stat-num">{counts.awaitingMyAction||0}</div><div className="stat-label">{lang==="hi"?"कार्रवाई आवश्यक":"Action needed"}</div></div>
          {(counts.lifeThreatening||0) > 0 && <div className="stat-tile critical"><div className="stat-num">{counts.lifeThreatening}</div><div className="stat-label">{lang==="hi"?"जीवन-घातक":"Life-threatening"}</div></div>}
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button className={`tab ${view==="queue"?"active":""}`} onClick={() => setView("queue")}>{lang==="hi"?"मेरी सूची":"My Queue"}</button>
          <button className={`tab ${view==="tasks"?"active":""}`} onClick={() => setView("tasks")}>{lang==="hi"?"सहकर्मी कार्य":"Colleague Tasks"}</button>
          <button className={`tab ${view==="contacts"?"active":""}`} onClick={() => { setView("contacts"); fetchContacts(); }}>{t("officer.contacts.heading")}</button>
        </div>

        {/* QUEUE */}
        {view === "queue" && (
          <>
            {announcements.length > 0 && (
              <div className="card" style={{ marginBottom: 14, background: "#fff3e0", border: "1px solid #ffb74d" }}>
                <div className="card-title" style={{ color: "#e65100" }}>
                  {lang === "hi" ? "घोषणाएं" : "Announcements"}
                </div>
                {announcements.slice(0, 5).map((a: any) => (
                  <div key={a._id} style={{ padding: "6px 0", borderTop: "1px solid #ffe0b2", fontSize: 13 }}>
                    {a.priority === "Urgent" && <span className="badge badge-red" style={{ marginRight: 6 }}>{lang === "hi" ? "तत्काल" : "Urgent"}</span>}
                    {a.message}
                    <div style={{ fontSize: 10, color: "#9e9e9e", marginTop: 2 }}>
                      {a.fromUserName} · {new Date(a.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <PendingForwards lang={lang} />
            {queue.length === 0 ? <div className="empty">{t("officer.empty")}</div> :
            <div>
            {queue.map(g => (
              <div key={g.grvId} className="card" style={{marginBottom:10,borderLeft:`3px solid ${g.isLifeThreatening?"#b71c1c":g.priority==="Critical"?"#c62828":g.priority==="High"?"#e65100":"#3949ab"}`}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:10,flexWrap:"wrap"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                      <span style={{fontSize:12,fontWeight:700,color:"#1a237e"}}>{g.grvId}</span>
                      <span className={PRIORITY_CLASS[g.priority]||"pill"}>{g.priority}</span>
                      <span className={STATUS_CLASS[g.status]||"pill"}>{g.status}</span>
                      {g.isLifeThreatening && <span className="pill pill-life">⚠ Life-threatening</span>}
                    </div>
                    <div style={{fontSize:14,marginBottom:4}}>{g.descriptionRaw.slice(0,100)}{g.descriptionRaw.length>100?"…":""}</div>
                    <div style={{fontSize:11,color:"#9e9e9e"}}>{g.district} · {g.category} · {new Date(g.filedAt).toLocaleDateString()}</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
                    {g.status==="Assigned" && <button className="btn btn-outline btn-sm" onClick={() => startProgress(g.grvId)}>{t("officer.startProgress")}</button>}
                    <button className="btn btn-saffron btn-sm" onClick={() => openGrievance(g)}>{t("officer.markResolved")}</button>
                  </div>
                </div>
              </div>
            ))}
            </div>}
          </>
        )}

        {/* RESOLVE */}
        {view === "resolve" && selected && (
          <div>
            <button className="btn btn-outline btn-sm" style={{marginBottom:12}} onClick={() => setView("queue")}>← {t("common.back")}</button>
            <div className="card" style={{marginBottom:12}}>
              <div style={{fontSize:12,color:"#9e9e9e",marginBottom:4}}>{selected.grvId} · {selected.category}</div>
              <div style={{fontSize:14,marginBottom:8}}>{selected.descriptionRaw}</div>
              <div style={{fontSize:12,color:"#9e9e9e"}}>{selected.district} · {selected.address}</div>
            </div>

            {suggestion && (
              <div style={{background:"#e8eaf6",border:"1px solid #c5cae9",borderRadius:8,padding:"12px 14px",marginBottom:12}}>
                <div style={{fontSize:11,color:"#7986cb",fontWeight:600,marginBottom:4}}>AI Suggestion (Groq)</div>
                <div style={{fontSize:13,color:"#1a237e"}}>{suggestion}</div>
              </div>
            )}

            <div className="card">
              <div className="card-title">{t("officer.resolve.heading")}</div>
              <div style={{fontSize:12,color:"#616161",marginBottom:12}}>{t("officer.resolve.photoNote")}</div>

              {/* Resolution photo — real camera capture, not a pasted URL */}
              <PhotoCapture
                value={photoUrl}
                onChange={setPhotoUrl}
                label={lang === "hi" ? "समाधान की फ़ोटो लें" : "Capture Resolution Photo"}
                hint={lang === "hi" ? "मोबाइल पर कैमरा सीधे खुलता है — स्थान सत्यापन ही असली जांच है, फ़ोटो स्रोत नहीं" : "Opens the camera directly on most mobile browsers — the GPS location check, not the photo source, is the actual fraud check"}
                required
              />

              {/* Officer GPS capture */}
              <div className="form-group">
                <label className="form-label">{t("officer.resolve.captureLocation")}</label>
                <button type="button" className={`btn ${resolveLat?"btn-outline":"btn-primary"} btn-sm`} onClick={captureResolveLocation} disabled={geoLoading}>
                  {geoLoading ? (lang==="hi"?"स्थान मिल रहा है…":"Getting location…") : resolveLat ? `✓ ${resolveLat.toFixed(5)}, ${resolveLng?.toFixed(5)}` : (lang==="hi"?"अभी स्थान लें":"Capture location now")}
                </button>
                {resolveLat && selected.lat && (
                  (() => {
                    const dist = Math.round(Math.sqrt((resolveLat-selected.lat)**2 + (resolveLng!-selected.lng)**2) * 111000);
                    return dist > 150 ?
                      <div className="mismatch-warn">⚠ {t("officer.resolve.mismatchWarning")} ({dist}m {lang==="hi"?"दूर":"away"})</div> :
                      <div className="mismatch-ok">✓ {lang==="hi"?`शिकायत स्थल से ${dist}m — सत्यापित`:`${dist}m from complaint site — verified`}</div>;
                  })()
                )}
              </div>

              <div className="form-group">
                <label className="form-label">{lang==="hi"?"नोट (वैकल्पिक)":"Resolution note (optional)"}</label>
                <textarea rows={2} value={resolveNote} onChange={e => setResolveNote(e.target.value)} placeholder={lang==="hi"?"क्या किया गया...":"What was done..."} />
              </div>

              {/* Similar complaints nearby — NOT a merge. Every report stays
                  its own independent record; this is visibility so the
                  officer can see if this is one of many reports of the
                  same physical problem, and bulk-close the paperwork for
                  all of them once the actual issue is fixed. */}
              {similar.length > 0 && (
                <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 12, marginBottom: 14, background: "#fafafa" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#1a237e", marginBottom: 4 }}>
                    {lang === "hi" ? `इस इलाके में इसी समस्या की ${similar.length} अन्य रिपोर्ट` : `${similar.length} other report(s) of this same issue nearby`}
                  </div>
                  <div style={{ fontSize: 11, color: "#9e9e9e", marginBottom: 8 }}>
                    {lang === "hi"
                      ? "हर रिपोर्ट अलग रहती है — मर्ज नहीं होती। अगर आपको लगता है कि यह वही समस्या है जो आप हल करने जा रहे हैं, तो उन्हें भी एक साथ बंद करने के लिए चुनें (केवल वे जो आपको सौंपी गई हैं)।"
                      : "Each stays a fully separate complaint — nothing is merged. If you believe this is the same physical issue you're about to resolve, select any assigned to you to close them together."}
                  </div>
                  {similar.map((s: any) => (
                    <label key={s.grvId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 12, cursor: s.assignedOfficerId === user?.id ? "pointer" : "default", opacity: s.assignedOfficerId === user?.id ? 1 : 0.6 }}>
                      <input
                        type="checkbox"
                        disabled={s.assignedOfficerId !== user?.id || s.status === "Confirmed Resolved" || s.status === "Auto Closed"}
                        checked={selectedSimilar.includes(s.grvId)}
                        onChange={() => toggleSimilar(s.grvId)}
                      />
                      <span style={{ fontFamily: "monospace" }}>{s.grvId}</span>
                      <span className={STATUS_CLASS[s.status] || "pill"} style={{ fontSize: 10 }}>{s.status}</span>
                      {s.assignedOfficerName && <span style={{ color: "#9e9e9e" }}>· {s.assignedOfficerName}</span>}
                    </label>
                  ))}
                  {selectedSimilar.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {bulkResult && <div style={{ fontSize: 12, color: "#2e7d32", marginBottom: 6 }}>{bulkResult}</div>}
                      <button className="btn btn-sm btn-saffron" onClick={submitBulkResolve} disabled={!photoUrl || !resolveLat || bulkResolving}>
                        {bulkResolving
                          ? "…"
                          : (lang === "hi" ? `इसे + ${selectedSimilar.length} और हल करें` : `Resolve this + ${selectedSimilar.length} more`)}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {resolveResult && !resolveResult.error && (
                <div style={{background:"#e8f5e9",border:"1px solid #a5d6a7",borderRadius:6,padding:"10px 12px",fontSize:13,marginBottom:12}}>
                  ✓ {lang==="hi"?"हल किया गया चिह्नित। नागरिक पुष्टि की प्रतीक्षा में।":"Marked resolved. Awaiting citizen confirmation."}
                  {resolveResult.photoLocationMismatch && <div style={{color:"#e65100",marginTop:4}}>⚠ {lang==="hi"?"फ़ोटो स्थान बेमेल चिह्नित — समीक्षा के लिए भेजा गया।":"Photo location mismatch flagged for audit."}</div>}
                </div>
              )}
              {resolveResult?.error && <div style={{color:"#c62828",fontSize:13,marginBottom:10}}>{resolveResult.error}</div>}

              <button className="btn btn-saffron" onClick={submitResolve} disabled={!photoUrl || !resolveLat || resolving} style={{width:"100%",justifyContent:"center"}}>
                {resolving ? (lang==="hi"?"जमा हो रहा है…":"Submitting…") : t("officer.resolve.submit")}
              </button>

              <div style={{ textAlign: "center", margin: "10px 0", fontSize: 11, color: "#9e9e9e" }}>
                {lang === "hi" ? "— या —" : "— or —"}
              </div>

              {!showForward ? (
                <button className="btn btn-outline" style={{ width: "100%", justifyContent: "center" }} onClick={() => setShowForward(true)}>
                  {lang === "hi" ? "इस मामले को दूसरे अधिकारी को भेजें" : "Forward This Case to Another Officer"}
                </button>
              ) : (
                <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 12, marginTop: 4 }}>
                  <div style={{ fontSize: 12, color: "#616161", marginBottom: 8 }}>
                    {lang === "hi"
                      ? "मामले की ज़िम्मेदारी चुने गए अधिकारी को स्थानांतरित हो जाएगी। नागरिक यह पूरी प्रक्रिया ट्रैकिंग पेज पर देख सकेगा।"
                      : "Case ownership will transfer to the officer you pick. The citizen will be able to see this full hand-off on their tracking page."}
                  </div>
                  <div className="form-group">
                    <label className="form-label">{lang === "hi" ? "किसे भेजें" : "Forward to"}</label>
                    <select value={forwardToId} onChange={e => setForwardToId(e.target.value)}>
                      <option value="">{lang === "hi" ? "चुनें…" : "Select…"}</option>
                      {contacts.filter((c: any) => String(c._id) !== user?.id).map((c: any) => (
                        <option key={c._id} value={c._id}>{c.name} — {c.department?.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{lang === "hi" ? "निर्देश" : "Instruction"}</label>
                    <textarea rows={2} value={forwardInstruction} onChange={e => setForwardInstruction(e.target.value)}
                      placeholder={lang === "hi" ? "क्यों भेज रहे हैं, क्या करना है…" : "Why you're forwarding this, what's needed…"} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{lang === "hi" ? "प्रतिक्रिया के लिए समय (घंटों में, वैकल्पिक)" : "Expected response time (hours, optional)"}</label>
                    <div style={{ fontSize: 11, color: "#9e9e9e", marginBottom: 4 }}>
                      {lang === "hi" ? "जैसे सरकारी पोर्टल पर, आप एक समयसीमा तय कर सकते हैं" : "Like on government portals, you can set a deadline for the response"}
                    </div>
                    <input type="number" min={1} max={720} value={forwardHours} onChange={e => setForwardHours(e.target.value)} placeholder="48" />
                  </div>
                  {forwardResult && <div style={{ fontSize: 12, color: forwardResult.includes("forwarded") || forwardResult.includes("भेज") ? "#2e7d32" : "#c62828", marginBottom: 8 }}>{forwardResult}</div>}
                  <div className="row">
                    <button className="btn btn-primary btn-sm" onClick={submitForward} disabled={!forwardToId || forwardInstruction.trim().length < 5 || forwarding}>
                      {forwarding ? "…" : (lang === "hi" ? "भेजें" : "Forward")}
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => setShowForward(false)}>{lang === "hi" ? "रद्द करें" : "Cancel"}</button>
                  </div>
                </div>
              )}

              {/* Request deadline extension — the dueAt clock only moves
                  if a CMO/admin approves; this just files the request. */}
              {selected.extensionRequest?.status === "Pending" ? (
                <div style={{ fontSize: 12, color: "#e65100", marginTop: 10, background: "#fff3e0", borderRadius: 6, padding: "8px 10px" }}>
                  {lang === "hi" ? "विस्तार अनुरोध समीक्षा के लिए प्रतीक्षित है" : "Extension request awaiting approval"}
                </div>
              ) : !showExtension ? (
                <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={() => setShowExtension(true)}>
                  {lang === "hi" ? "समयसीमा विस्तार का अनुरोध करें" : "Request Deadline Extension"}
                </button>
              ) : (
                <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 12, marginTop: 10 }}>
                  <div className="form-group">
                    <label className="form-label">{lang === "hi" ? "कितने घंटे अतिरिक्त" : "How many extra hours"}</label>
                    <input type="number" min={1} max={720} value={extensionHours} onChange={e => setExtensionHours(e.target.value)} placeholder="24" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{lang === "hi" ? "कारण" : "Reason"}</label>
                    <textarea rows={2} value={extensionReason} onChange={e => setExtensionReason(e.target.value)}
                      placeholder={lang === "hi" ? "अधिक समय क्यों चाहिए…" : "Why more time is needed…"} />
                  </div>
                  {extensionResult && <div style={{ fontSize: 12, color: "#2e7d32", marginBottom: 8 }}>{extensionResult}</div>}
                  <div className="row">
                    <button className="btn btn-sm btn-primary" onClick={submitExtensionRequest} disabled={!extensionHours || extensionReason.trim().length < 5}>
                      {lang === "hi" ? "अनुरोध भेजें" : "Send Request"}
                    </button>
                    <button className="btn btn-sm btn-outline" onClick={() => setShowExtension(false)}>{lang === "hi" ? "रद्द करें" : "Cancel"}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CONTACTS */}
        {view === "contacts" && (
          <div className="card">
            <div className="card-title">{t("officer.contacts.heading")}</div>
            {contacts.length === 0 ? <div className="empty">{t("common.loading")}</div> :
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>{t("common.name")}</th><th>{t("common.phone")}</th><th>{lang==="hi"?"विभाग":"Department"}</th></tr></thead>
                  <tbody>
                    {contacts.map((c: any) => (
                      <tr key={c._id}>
                        <td>{c.name}</td>
                        <td><a href={`tel:${c.phone}`} style={{color:"#1a237e"}}>{c.phone}</a></td>
                        <td style={{fontSize:12,color:"#616161"}}>{c.department?.name || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          </div>
        )}
        {view === "tasks" && <TasksView lang={lang} contacts={contacts} fetchContacts={fetchContacts} />}
      </div>
    </div>
  );
}

function TasksView({ lang, contacts, fetchContacts }: { lang: string; contacts: any[]; fetchContacts: () => void }) {
  const [subTab, setSubTab] = useState<"toMe"|"byMe"|"new">("toMe");
  const [toMe, setToMe] = useState<any[]>([]);
  const [byMe, setByMe] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [reportingTask, setReportingTask] = useState<string | null>(null);
  const [reportText, setReportText] = useState("");
  const [reportPhoto, setReportPhoto] = useState("");
  const [newTask, setNewTask] = useState({ toOfficerId: "", title: "", instructions: "", linkedGrvId: "" });
  const [createMsg, setCreateMsg] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        api.get<any[]>("/officer-tasks/assigned-to-me"),
        api.get<any[]>("/officer-tasks/created-by-me"),
      ]);
      setToMe(a); setByMe(b);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); fetchContacts(); }, []);

  const startTask = async (taskId: string) => {
    try { await api.post(`/officer-tasks/${taskId}/start`, {}); load(); } catch {}
  };

  const submitReport = async (taskId: string) => {
    if (reportText.trim().length < 10) return;
    try {
      await api.post(`/officer-tasks/${taskId}/report`, { report: reportText, reportPhotoUrl: reportPhoto || undefined });
      setReportingTask(null); setReportText(""); setReportPhoto("");
      load();
    } catch {}
  };

  const closeTask = async (taskId: string) => {
    try { await api.post(`/officer-tasks/${taskId}/close`, {}); load(); } catch {}
  };

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateMsg("");
    try {
      await api.post("/officer-tasks", {
        ...newTask,
        linkedGrvId: newTask.linkedGrvId || undefined,
      });
      setCreateMsg(lang === "hi" ? "कार्य भेजा गया" : "Task sent");
      setNewTask({ toOfficerId: "", title: "", instructions: "", linkedGrvId: "" });
      setSubTab("byMe");
      load();
    } catch (e: any) { setCreateMsg(e.message); }
  };

  const taskStatusBadge = (status: string) => {
    const map: Record<string, string> = { Open: "badge-amber", "In Progress": "badge-amber", Reported: "badge-green", Closed: "badge-green" };
    return <span className={`badge ${map[status] || ""}`}>{status}</span>;
  };

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={`tab ${subTab==="toMe"?"active":""}`} onClick={() => setSubTab("toMe")}>
          {lang === "hi" ? "मुझे टैग किया गया" : "Tagged to Me"} ({toMe.filter(t => t.status !== "Closed").length})
        </button>
        <button className={`tab ${subTab==="byMe"?"active":""}`} onClick={() => setSubTab("byMe")}>
          {lang === "hi" ? "मेरे द्वारा बनाए गए" : "Created by Me"}
        </button>
        <button className={`tab ${subTab==="new"?"active":""}`} onClick={() => setSubTab("new")}>
          + {lang === "hi" ? "सहकर्मी को टैग करें" : "Tag a Colleague"}
        </button>
      </div>

      {loading && <div className="loading">{lang === "hi" ? "लोड हो रहा है…" : "Loading…"}</div>}

      {subTab === "toMe" && !loading && (
        toMe.length === 0 ? <div className="empty">{lang === "hi" ? "कोई कार्य नहीं" : "No tasks tagged to you"}</div> :
        toMe.map((task: any) => (
          <div key={task.taskId} className="card" style={{ marginBottom: 10 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{task.title} {taskStatusBadge(task.status)}</div>
                <div style={{ fontSize: 11, color: "#9e9e9e", margin: "3px 0" }}>
                  {lang === "hi" ? "से" : "From"}: {task.fromOfficer?.name} ({task.fromOfficer?.phone})
                  {task.linkedGrvId && <> · {task.linkedGrvId}</>}
                </div>
                <div style={{ fontSize: 13, color: "#212121" }}>{task.instructions}</div>
              </div>
            </div>
            {task.status === "Open" && (
              <button className="btn btn-sm btn-primary" style={{ marginTop: 8 }} onClick={() => startTask(task.taskId)}>
                {lang === "hi" ? "काम शुरू करें" : "Start Working"}
              </button>
            )}
            {task.status === "In Progress" && reportingTask !== task.taskId && (
              <button className="btn btn-sm btn-saffron" style={{ marginTop: 8 }} onClick={() => setReportingTask(task.taskId)}>
                {lang === "hi" ? "रिपोर्ट जमा करें" : "Submit Report"}
              </button>
            )}
            {reportingTask === task.taskId && (
              <div style={{ marginTop: 8 }}>
                <textarea rows={3} value={reportText} onChange={e => setReportText(e.target.value)}
                  placeholder={lang === "hi" ? "आपने क्या किया? (कम से कम 10 अक्षर)" : "What did you do? (min 10 characters)"} />
                <PhotoCapture value={reportPhoto} onChange={setReportPhoto}
                  label={lang === "hi" ? "फ़ोटो जोड़ें (वैकल्पिक)" : "Add photo (optional)"} />
                <div className="row" style={{ marginTop: 6 }}>
                  <button className="btn btn-sm btn-primary" onClick={() => submitReport(task.taskId)}>{lang === "hi" ? "जमा करें" : "Submit"}</button>
                  <button className="btn btn-sm btn-outline" onClick={() => setReportingTask(null)}>{lang === "hi" ? "रद्द करें" : "Cancel"}</button>
                </div>
              </div>
            )}
            {task.status === "Reported" && (
              <div style={{ fontSize: 12, color: "#2e7d32", marginTop: 8 }}>
                {lang === "hi" ? "रिपोर्ट जमा — टैग करने वाले की पुष्टि की प्रतीक्षा में" : "Report submitted — awaiting confirmation from the officer who tagged you"}
              </div>
            )}
          </div>
        ))
      )}

      {subTab === "byMe" && !loading && (
        byMe.length === 0 ? <div className="empty">{lang === "hi" ? "आपने कोई कार्य नहीं बनाया" : "You haven't created any tasks"}</div> :
        byMe.map((task: any) => (
          <div key={task.taskId} className="card" style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{task.title} {taskStatusBadge(task.status)}</div>
            <div style={{ fontSize: 11, color: "#9e9e9e", margin: "3px 0" }}>
              {lang === "hi" ? "को" : "To"}: {task.toOfficer?.name} ({task.toOfficer?.phone})
            </div>
            <div style={{ fontSize: 13, color: "#212121" }}>{task.instructions}</div>
            {task.report && (
              <div style={{ background: "#f5f5f5", borderRadius: 6, padding: "8px 10px", marginTop: 8, fontSize: 12 }}>
                <strong>{lang === "hi" ? "रिपोर्ट:" : "Report:"}</strong> {task.report}
              </div>
            )}
            {task.status === "Reported" && (
              <button className="btn btn-sm btn-primary" style={{ marginTop: 8 }} onClick={() => closeTask(task.taskId)}>
                {lang === "hi" ? "स्वीकृत करें और बंद करें" : "Approve & Close"}
              </button>
            )}
          </div>
        ))
      )}

      {subTab === "new" && (
        <form className="card" onSubmit={createTask}>
          <div className="form-group">
            <label className="form-label">{lang === "hi" ? "किसे टैग करें" : "Tag which officer"} <span className="req">*</span></label>
            <select required value={newTask.toOfficerId} onChange={e => setNewTask(f => ({...f, toOfficerId: e.target.value}))}>
              <option value="">{lang === "hi" ? "चुनें…" : "Select…"}</option>
              {contacts.map((c: any) => <option key={c._id} value={c._id}>{c.name} — {c.department?.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{lang === "hi" ? "शीर्षक" : "Title"} <span className="req">*</span></label>
            <input required value={newTask.title} onChange={e => setNewTask(f => ({...f, title: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">{lang === "hi" ? "निर्देश" : "Instructions"} <span className="req">*</span></label>
            <textarea required rows={3} value={newTask.instructions} onChange={e => setNewTask(f => ({...f, instructions: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">{lang === "hi" ? "संबंधित शिकायत ID (वैकल्पिक)" : "Linked Grievance ID (optional)"}</label>
            <input value={newTask.linkedGrvId} onChange={e => setNewTask(f => ({...f, linkedGrvId: e.target.value}))} placeholder="GRV-2026-00001" />
          </div>
          {createMsg && <div style={{ fontSize: 12, color: "#2e7d32", marginBottom: 10 }}>{createMsg}</div>}
          <button className="btn btn-primary" type="submit">{lang === "hi" ? "टैग करें" : "Tag Colleague"}</button>
        </form>
      )}
    </div>
  );
}

export default function OfficerPage() {
  return <LanguageProvider><OfficerApp /></LanguageProvider>;
}
