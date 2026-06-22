"use client";

import { useState, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { useLanguage, LanguageProvider } from "@/lib/i18n";
import { TranslationKey } from "@/lib/i18n";
import { useVoiceInput, useVoiceOutput } from "@/lib/voice";
import { PhotoCapture } from "@/components/PhotoCapture";

const DELHI_DISTRICTS = [
  "New Delhi", "South Delhi", "North Delhi", "East Delhi", "West Delhi",
  "Shahdara", "Dwarka", "Rohini", "Karol Bagh", "Najafgarh",
  "Chandni Chowk", "Lajpat Nagar", "Saket", "Vasant Kunj",
];

const STATUS_PILL_CLASS: Record<string, string> = {
  "Pending": "pill pill-pending",
  "Assigned": "pill pill-assigned",
  "In Progress": "pill pill-inprogress",
  "Resolved Pending Confirmation": "pill pill-resolved-pending",
  "Confirmed Resolved": "pill pill-confirmed",
  "Reopened": "pill pill-reopened",
  "Auto Closed": "pill pill-autoclosed",
  "Escalated": "pill pill-escalated",
};

function CitizenApp({ initialView }: { initialView?: "file"|"track"|"success" }) {
  const { t, lang, setLang } = useLanguage();
  const [view, setView] = useState<"file" | "track" | "success">(initialView || "file");
  const [form, setForm] = useState({ citizenName: "", citizenPhone: "", descriptionRaw: "", district: "", ward: "", address: "", lat: 0, lng: 0 });
  const [evidencePhoto, setEvidencePhoto] = useState("");
  const [preferredOfficerId, setPreferredOfficerId] = useState("");
  const [availableOfficers, setAvailableOfficers] = useState<any[]>([]);
  const [nlp, setNlp] = useState<any>(null);
  const [nlpLoading, setNlpLoading] = useState(false);
  const [locStatus, setLocStatus] = useState<"idle"|"loading"|"done"|"error">("idle");
  const [filing, setFiling] = useState(false);
  const [filed, setFiled] = useState<any>(null);
  const [fileError, setFileError] = useState("");
  const [trackRef, setTrackRef] = useState("");
  const [trackPhone, setTrackPhone] = useState("");
  const [trackSecret, setTrackSecret] = useState("");
  const [tracking, setTracking] = useState(false);
  const [tracked, setTracked] = useState<any>(null);
  const [trackError, setTrackError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<"confirmed"|"disputed"|null>(null);
  const nlpTimer = useRef<NodeJS.Timeout | null>(null);

  const debounceNlp = useCallback((text: string) => {
    if (nlpTimer.current) clearTimeout(nlpTimer.current);
    if (text.length < 8) { setNlp(null); return; }
    setNlpLoading(true);
    nlpTimer.current = setTimeout(async () => {
      try {
        const r = await api.post<any>("/grievances/classify-preview", { description: text });
        setNlp(r);
        // Once the department is known, offer the citizen a choice of
        // officer in that department instead of only auto-routing —
        // a public, privacy-safe directory (name + department only).
        if (r.departmentCode) {
          try {
            const officers = await api.get<any[]>(`/officer/public-directory?departmentCode=${r.departmentCode}`);
            setAvailableOfficers(officers);
          } catch { setAvailableOfficers([]); }
        }
      } catch { /* silently ignore preview errors */ }
      setNlpLoading(false);
    }, 600);
  }, []);

  // Voice accessibility — speech-to-text for filing, text-to-speech for
  // reading instructions/results aloud. Both browser-native, zero cost.
  // See lib/voice.ts for the rationale (elderly, low-literacy, blind users).
  const voiceOut = useVoiceOutput();
  const voiceIn = useVoiceInput(lang, (transcript) => {
    setForm((f) => {
      const merged = f.descriptionRaw ? `${f.descriptionRaw} ${transcript}` : transcript;
      debounceNlp(merged);
      return { ...f, descriptionRaw: merged };
    });
  });

  const captureLocation = () => {
    setLocStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(f => ({ ...f, lat: pos.coords.latitude, lng: pos.coords.longitude }));
        setLocStatus("done");
      },
      () => setLocStatus("error"),
      { timeout: 8000 }
    );
  };

  const submitGrievance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.lat || !form.lng) { setFileError("Please capture your location before submitting."); return; }
    setFiling(true); setFileError("");
    try {
      const r = await api.post<any>("/grievances", { ...form, evidencePhotoUrl: evidencePhoto || undefined, preferredOfficerId: preferredOfficerId || undefined });
      setFiled(r);
      setView("success");
    } catch (err: any) {
      setFileError(err.message || t("common.error"));
    }
    setFiling(false);
  };

  const trackGrievance = async (e: React.FormEvent) => {
    e.preventDefault();
    setTracking(true); setTrackError(""); setTracked(null); setConfirmResult(null);
    try {
      const r = await api.get<any>(`/grievances/track/${trackRef}?phone=${trackPhone}&secret=${trackSecret}`);
      setTracked(r);
    } catch { setTrackError(t("track.notFound")); }
    setTracking(false);
  };

  const doConfirm = async (satisfied: boolean) => {
    if (!tracked) return;
    setConfirming(true);
    try {
      await api.post(`/grievances/${tracked.grvId}/confirm`, { satisfied, phone: trackPhone, secret: trackSecret, comment: satisfied ? "" : "Citizen reported not resolved." });
      setConfirmResult(satisfied ? "confirmed" : "disputed");
      setTracked((g: any) => ({ ...g, status: satisfied ? "Confirmed Resolved" : "Reopened" }));
    } catch {}
    setConfirming(false);
  };

  const statusKey = (s: string) => `status.${s}` as TranslationKey;

  return (
    <div className={`lang-${lang}`}>
      {/* Navbar */}
      <nav className="topnav">
        <a className="topnav-brand" href="/">
          {t("app.title")}
          <span className="topnav-sub">{t("app.subtitle")}</span>
        </a>
        <button className="topnav-btn" onClick={() => setView("file")} style={view==="file"||view==="success"?{borderBottom:"2px solid #fff"}:{}}>
          {t("nav.citizen")}
        </button>
        <button className="topnav-btn" onClick={() => setView("track")} style={view==="track"?{borderBottom:"2px solid #fff"}:{}}>
          {t("nav.track")}
        </button>
        <button className="topnav-btn lang" onClick={() => setLang(lang === "en" ? "hi" : "en")}>
          {t("lang.toggle")}
        </button>
        <a href="/login" className="topnav-btn">{t("nav.login")}</a>
      </nav>

      <div className="page-wrap" style={{ maxWidth: 680, margin: "0 auto" }}>

        {/* FILE COMPLAINT */}
        {(view === "file" || view === "success") && view !== "success" && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: "20px 0 4px", color: "#1a237e" }}>{t("citizen.heading")}</h2>
            <p style={{ color: "#616161", fontSize: 13, marginBottom: 20 }}>{t("citizen.subheading")}</p>
            <form className="card" onSubmit={submitGrievance}>
              <div className="form-group">
                <label className="form-label">{t("common.name")} <span className="req">*</span></label>
                <input type="text" required value={form.citizenName} onChange={e => setForm(f => ({...f, citizenName: e.target.value}))} placeholder={lang==="hi"?"आपका पूरा नाम":"Your full name"} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("common.phone")} <span className="req">*</span></label>
                <input type="tel" required value={form.citizenPhone} onChange={e => setForm(f => ({...f, citizenPhone: e.target.value}))} placeholder="10-digit mobile number" pattern="[0-9]{10,15}" />
              </div>
              <div className="form-group">
                <label className="form-label">{t("common.district")} <span className="req">*</span></label>
                <select required value={form.district} onChange={e => setForm(f => ({...f, district: e.target.value}))}>
                  <option value="">{lang==="hi"?"ज़िला चुनें":"Select district"}</option>
                  {DELHI_DISTRICTS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t("common.address")}</label>
                <input type="text" value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} placeholder={lang==="hi"?"गली, मोहल्ला, पास का लैंडमार्क":"Street, colony, nearby landmark"} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("citizen.description.label")} <span className="req">*</span></label>
                <div style={{ position: "relative" }}>
                  <textarea
                    required
                    rows={4}
                    value={form.descriptionRaw}
                    placeholder={t("citizen.description.placeholder")}
                    onChange={e => { setForm(f => ({...f, descriptionRaw: e.target.value})); debounceNlp(e.target.value); }}
                  />
                  {voiceIn.isSupported && (
                    <button
                      type="button"
                      title={lang === "hi" ? "बोलकर लिखें" : "Speak instead of typing"}
                      onClick={() => voiceIn.listening ? voiceIn.stop() : voiceIn.start()}
                      style={{
                        position: "absolute", right: 8, bottom: 8, width: 36, height: 36, borderRadius: "50%",
                        border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        background: voiceIn.listening ? "#b71c1c" : "#1a237e", color: "#fff",
                        animation: voiceIn.listening ? "dotPulse 1.2s ease-in-out infinite" : "none",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                      </svg>
                    </button>
                  )}
                </div>
                {voiceIn.isSupported && (
                  <div style={{ fontSize: 11, color: "#9e9e9e", marginTop: 4 }}>
                    {voiceIn.listening
                      ? (lang === "hi" ? "सुन रहे हैं… बोलिए" : "Listening… speak now")
                      : (lang === "hi" ? "टाइप करने के बजाय माइक दबाकर बोलें" : "Tap the mic to speak instead of typing")}
                  </div>
                )}
                {/* Live NLP preview */}
                {nlpLoading && <div style={{fontSize:11,color:"#9e9e9e",marginTop:4}}>{t("citizen.nlp.detecting")}</div>}
                {nlp && !nlpLoading && (
                  <div className="nlp-preview">
                    <div style={{fontSize:11,color:"#3949ab",fontWeight:600,marginBottom:6,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span>{lang==="hi"?"AI विश्लेषण":"AI Analysis"} {nlp.groqUsed ? "· Groq" : "· Offline classifier"}</span>
                      {voiceOut.isSupported && (
                        <button
                          type="button"
                          title={lang === "hi" ? "ऊंची आवाज़ में सुनें" : "Read aloud"}
                          onClick={() => voiceOut.speaking ? voiceOut.stop() : voiceOut.speak(
                            lang === "hi"
                              ? `श्रेणी ${nlp.category}. प्राथमिकता ${nlp.priority}. यह भेजा जाएगा ${nlp.department} को.`
                              : `Category ${nlp.category}. Priority ${nlp.priority}. This will be sent to ${nlp.department}.`,
                            lang as "en" | "hi"
                          )}
                          style={{ background: "none", border: "1px solid #c5cae9", borderRadius: 12, padding: "2px 8px", cursor: "pointer", color: "#3949ab", fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}
                        >
                          🔊 {voiceOut.speaking ? (lang === "hi" ? "रोकें" : "Stop") : (lang === "hi" ? "सुनें" : "Listen")}
                        </button>
                      )}
                    </div>
                    <span className="nlp-chip"><span className="nlp-chip-label">{t("citizen.nlp.language")}</span><span className="nlp-chip-val">{nlp.detectedLanguage}</span></span>
                    <span className="nlp-chip"><span className="nlp-chip-label">{t("citizen.nlp.category")}</span><span className="nlp-chip-val">{nlp.category}</span></span>
                    <span className={`nlp-chip pill-${nlp.priority?.toLowerCase()}`}><span className="nlp-chip-label">{t("citizen.nlp.priority")}</span><span className="nlp-chip-val">{lang==="hi"?{"Critical":"गंभीर","High":"उच्च","Normal":"सामान्य"}[nlp.priority as string]||nlp.priority:nlp.priority}</span></span>
                    <span className="nlp-chip"><span className="nlp-chip-label">{t("citizen.nlp.department")}</span><span className="nlp-chip-val">{nlp.department}</span></span>
                    <span className="nlp-chip"><span className="nlp-chip-label">{t("citizen.nlp.sla")}</span><span className="nlp-chip-val">{nlp.slaHours} {t("citizen.nlp.hours")}</span></span>
                    {nlp.isLifeThreatening && (
                      <div className="nlp-life-warning">
                        ⚠️ {lang==="hi"?"यह जीवन-घातक शिकायत के रूप में पहचानी गई है। तत्काल भेजी जाएगी।":"Identified as life-threatening — will be fast-tracked immediately."}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Officer choice — pick a specific officer, or leave the system to auto-route */}
              {availableOfficers.length > 0 && (
                <div className="form-group">
                  <label className="form-label">
                    {lang === "hi" ? "अधिकारी चुनें (वैकल्पिक)" : "Choose an officer (optional)"}
                  </label>
                  <div style={{ fontSize: 11, color: "#9e9e9e", marginBottom: 6 }}>
                    {lang === "hi"
                      ? "यदि आप किसी विशेष अधिकारी को जानते हैं तो उन्हें चुनें, या सिस्टम को स्वतः निर्णय लेने दें।"
                      : "Pick a specific officer if you know one, or let the system decide automatically."}
                  </div>
                  <select value={preferredOfficerId} onChange={e => setPreferredOfficerId(e.target.value)}>
                    <option value="">{lang === "hi" ? "सिस्टम पर छोड़ें (अनुशंसित)" : "Let the system decide (recommended)"}</option>
                    {availableOfficers.map((o: any) => (
                      <option key={o.id} value={o.id}>{o.name} — {o.department}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Location capture */}
              <div className="form-group">
                <label className="form-label">{lang==="hi"?"स्थान (आवश्यक)":"Location (required)"} <span className="req">*</span></label>
                <button type="button" className={`btn ${locStatus==="done"?"btn-outline":"btn-primary"} btn-sm`} onClick={captureLocation} disabled={locStatus==="loading"}>
                  {locStatus==="idle" && t("citizen.useLocation")}
                  {locStatus==="loading" && (lang==="hi"?"स्थान प्राप्त हो रहा है…":"Getting location…")}
                  {locStatus==="done" && `✓ ${t("citizen.locationCaptured")} (${form.lat.toFixed(4)}, ${form.lng.toFixed(4)})`}
                  {locStatus==="error" && (lang==="hi"?"स्थान नहीं मिला — पुनः प्रयास करें":"Location unavailable — tap to retry")}
                </button>
              </div>
              {/* Photo of the problem — optional, helps officers triage and reduces ambiguity */}
              <PhotoCapture
                value={evidencePhoto}
                onChange={setEvidencePhoto}
                label={lang === "hi" ? "समस्या की फ़ोटो (वैकल्पिक)" : "Photo of the problem (optional)"}
                hint={lang === "hi" ? "फ़ोटो होने से अधिकारी समस्या को तेज़ी से समझ पाते हैं" : "Helps the assigned officer understand the issue faster"}
              />
              {fileError && <div style={{background:"#ffebee",color:"#b71c1c",padding:"8px 12px",borderRadius:6,fontSize:13,marginBottom:12}}>{fileError}</div>}
              <button className="btn btn-saffron" type="submit" disabled={filing || locStatus !== "done"} style={{width:"100%",justifyContent:"center",fontSize:15}}>
                {filing ? (lang==="hi"?"जमा हो रहा है…":"Submitting…") : t("citizen.submit")}
              </button>
            </form>
          </div>
        )}

        {/* SUCCESS */}
        {view === "success" && filed && (
          <div className="card" style={{textAlign:"center",padding:"32px 24px",marginTop:20}}>
            <div style={{fontSize:48,marginBottom:12}}>✅</div>
            <h2 style={{color:"#2e7d32",fontSize:20,margin:"0 0 8px"}}>{t("citizen.submitted.heading")}</h2>
            <div style={{fontSize:13,color:"#616161",marginBottom:16}}>{t("citizen.submitted.note")}</div>
            <div style={{background:"#e8eaf6",borderRadius:10,padding:"16px 24px",display:"inline-block",margin:"0 0 16px"}}>
              <div style={{fontSize:11,color:"#7986cb",marginBottom:4}}>{t("citizen.submitted.refLabel")}</div>
              <div style={{fontSize:22,fontWeight:700,color:"#1a237e",letterSpacing:"0.04em"}}>{filed.grvId}</div>
            </div>
            <div style={{background:"#fff3e0",border:"2px solid #ffb74d",borderRadius:10,padding:"16px 24px",display:"inline-block",margin:"0 0 16px"}}>
              <div style={{fontSize:11,color:"#e65100",marginBottom:4,fontWeight:600}}>
                {lang === "hi" ? "आपका 6-अंकीय गुप्त कोड — इसे सहेजें" : "Your 6-digit secret code — save this"}
              </div>
              <div style={{fontSize:26,fontWeight:700,color:"#e65100",letterSpacing:"0.15em",fontFamily:"monospace"}}>{filed.trackingSecret}</div>
              <div style={{fontSize:11,color:"#bf6000",marginTop:6,maxWidth:280}}>
                {lang === "hi"
                  ? "ट्रैक करने या समाधान की पुष्टि/विवाद करने के लिए संदर्भ क्रमांक और फ़ोन नंबर के साथ यह कोड आवश्यक है। यह सिर्फ़ अभी दिखाया गया है — इसे दोबारा नहीं देखा जा सकता।"
                  : "Required, along with your reference number and phone, to track or confirm/dispute resolution. Shown only once — it cannot be retrieved again."}
              </div>
            </div>
            <div style={{fontSize:12,color:"#616161",marginBottom:8}}>
              {lang==="hi"?"श्रेणी":"Category"}: <strong>{filed.category}</strong> &nbsp;|&nbsp; {lang==="hi"?"विभाग":"Dept"}: <strong>{filed.department}</strong>
            </div>
            {filed.isLifeThreatening && (
              <div className="alert-banner" style={{justifyContent:"center",marginBottom:12}}>
                <span className="alert-dot" />{t("citizen.submitted.lifeThreatening")}
              </div>
            )}
            {filed.possibleDuplicateOf && (
              <div style={{background:"#fff3e0",border:"1px solid #ffe082",borderRadius:6,padding:"8px 12px",fontSize:12,marginBottom:12}}>
                {t("citizen.duplicate.warning", {ref: filed.possibleDuplicateOf})}
              </div>
            )}
            <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
              <button className="btn btn-outline" onClick={() => { setTrackRef(filed.grvId); setView("track"); }}>{t("nav.track")}</button>
              <button className="btn btn-primary" onClick={() => { setForm({citizenName:"",citizenPhone:"",descriptionRaw:"",district:"",ward:"",address:"",lat:0,lng:0}); setFiled(null); setNlp(null); setLocStatus("idle"); setView("file"); }}>{t("citizen.fileAnother")}</button>
            </div>
          </div>
        )}

        {/* TRACK */}
        {view === "track" && (
          <div>
            <h2 style={{fontSize:20,fontWeight:600,margin:"20px 0 4px",color:"#1a237e"}}>{t("track.heading")}</h2>
            <form className="card" onSubmit={trackGrievance} style={{marginBottom:16}}>
              <div className="form-group">
                <label className="form-label">{t("track.refLabel")}</label>
                <input type="text" required value={trackRef} onChange={e => setTrackRef(e.target.value.toUpperCase())} placeholder={t("track.refPlaceholder")} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("track.phoneLabel")}</label>
                <input type="tel" required value={trackPhone} onChange={e => setTrackPhone(e.target.value)} placeholder="10-digit mobile number" />
              </div>
              <div className="form-group">
                <label className="form-label">{lang === "hi" ? "6-अंकीय कोड (दर्ज करते समय दिया गया)" : "6-digit code (given when you filed)"}</label>
                <input type="text" required maxLength={6} pattern="[0-9]{6}" value={trackSecret}
                  onChange={e => setTrackSecret(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456" style={{ fontFamily: "monospace", letterSpacing: 2 }} />
              </div>
              {trackError && <div style={{color:"#c62828",fontSize:13,marginBottom:10}}>{trackError}</div>}
              <button className="btn btn-primary" type="submit" disabled={tracking}>{tracking ? (lang==="hi"?"खोज रहे हैं…":"Searching…") : t("track.button")}</button>
            </form>

            {tracked && (
              <div className="card">
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
                  <span style={{fontWeight:700,fontSize:16,color:"#1a237e"}}>{tracked.grvId}</span>
                  <span className={STATUS_PILL_CLASS[tracked.status] || "pill"}>{t(statusKey(tracked.status))}</span>
                  {tracked.priority && <span className={`pill pill-${tracked.priority?.toLowerCase()}`}>{tracked.priority}</span>}
                  {tracked.isLifeThreatening && <span className="pill pill-life">⚠ Life-threatening</span>}
                </div>
                <div style={{fontSize:13,color:"#616161",marginBottom:12}}>{tracked.descriptionRaw}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:13,marginBottom:12}}>
                  <div><span style={{color:"#9e9e9e"}}>{t("track.filedOn")}:</span> {new Date(tracked.filedAt).toLocaleDateString(lang==="hi"?"hi-IN":"en-IN",{day:"numeric",month:"short",year:"numeric"})}</div>
                  <div><span style={{color:"#9e9e9e"}}>{t("track.dueBy")}:</span> {new Date(tracked.dueAt).toLocaleDateString(lang==="hi"?"hi-IN":"en-IN",{day:"numeric",month:"short"})}</div>
                  <div><span style={{color:"#9e9e9e"}}>{lang==="hi"?"ज़िला":"District"}:</span> {tracked.district}</div>
                  <div><span style={{color:"#9e9e9e"}}>{lang==="hi"?"विभाग":"Department"}:</span> {tracked.departmentCode}</div>
                </div>

                {/* Citizen confirmation UI */}
                {tracked.status === "Resolved Pending Confirmation" && !confirmResult && (
                  <div style={{background:"#e8f5e9",border:"1px solid #a5d6a7",borderRadius:8,padding:"14px 16px",marginTop:12}}>
                    <div style={{fontWeight:600,fontSize:14,color:"#1b5e20",marginBottom:6}}>{t("track.awaitingConfirmation.heading")}</div>
                    <div style={{fontSize:13,color:"#2e7d32",marginBottom:12}}>{t("track.awaitingConfirmation.body")}</div>
                    <div style={{display:"flex",gap:10}}>
                      <button className="btn btn-primary btn-sm" onClick={() => doConfirm(true)} disabled={confirming}>{t("track.confirm.satisfied")}</button>
                      <button className="btn btn-danger btn-sm" onClick={() => doConfirm(false)} disabled={confirming}>{t("track.confirm.notSatisfied")}</button>
                    </div>
                  </div>
                )}
                {confirmResult === "confirmed" && <div style={{color:"#2e7d32",fontSize:13,marginTop:8}}>✓ {t("track.confirm.thanks")}</div>}
                {confirmResult === "disputed" && <div style={{color:"#e65100",fontSize:13,marginTop:8}}>{t("track.reopened.note")}</div>}

                {/* Similar complaints nearby — reassurance, not a merge.
                    Each complaint, including this one, stays fully
                    independent with its own right to confirm/dispute. */}
                {tracked.similarComplaints && tracked.similarComplaints.length > 0 && (
                  <div style={{ marginTop: 16, background: "#f5f5f5", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ fontSize: 12, color: "#424242" }}>
                      {lang === "hi"
                        ? `इस इलाके में इसी समस्या की ${tracked.similarComplaints.length} अन्य रिपोर्ट दर्ज हैं — ${tracked.similarComplaints.filter((s: any) => s.status === "Confirmed Resolved").length} हल हो चुकी हैं।`
                        : `${tracked.similarComplaints.length} other report(s) of this same issue nearby — ${tracked.similarComplaints.filter((s: any) => s.status === "Confirmed Resolved").length} already resolved.`}
                    </div>
                    <div style={{ fontSize: 11, color: "#9e9e9e", marginTop: 4 }}>
                      {lang === "hi" ? "आपकी शिकायत अलग रहती है — किसी अन्य के साथ मर्ज नहीं होती।" : "Your complaint stays independent — it isn't merged with anyone else's."}
                    </div>
                  </div>
                )}

                {/* Forwarding chain — every hand-off between officers on this
                    case, oldest first. Mirrors the transparency model of
                    UP's Jansunwai portal: a citizen can see exactly who
                    forwarded their case, what instruction was given, and
                    what the receiving officer reported back. */}
                {tracked.transferHistory && tracked.transferHistory.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#1a237e", marginBottom: 8 }}>
                      {lang === "hi" ? "मामले की प्रक्रिया — पूरा रिकॉर्ड" : "Case Progress — Full Record"}
                    </div>
                    <div style={{ fontSize: 11, color: "#9e9e9e", marginBottom: 10 }}>
                      {lang === "hi"
                        ? "यह दिखाता है कि आपकी शिकायत अधिकारियों के बीच कैसे आगे बढ़ी।"
                        : "Shows how your complaint moved between officers."}
                    </div>
                    {tracked.transferHistory.map((tr: any, i: number) => (
                      <div key={i} style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: "12px 14px", marginBottom: 10, background: "#fafafa" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                          <span style={{ fontWeight: 600, color: "#1a237e" }}>
                            {tr.fromOfficerName} → {tr.toOfficerName}
                          </span>
                          <span style={{ color: "#9e9e9e" }}>{new Date(tr.forwardedAt).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#424242", marginBottom: tr.response ? 8 : 0 }}>
                          <span style={{ color: "#9e9e9e" }}>{lang === "hi" ? "निर्देश: " : "Instruction: "}</span>{tr.instruction}
                        </div>
                        {tr.response ? (
                          <div style={{ fontSize: 12, color: "#1b5e20", background: "#e8f5e9", borderRadius: 6, padding: "8px 10px" }}>
                            <span style={{ fontWeight: 600 }}>{lang === "hi" ? "आख्या / प्रतिक्रिया: " : "Officer's Report: "}</span>{tr.response}
                            <div style={{ fontSize: 10, color: "#558b2f", marginTop: 4 }}>
                              {new Date(tr.respondedAt).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: "#e65100" }}>
                            {lang === "hi" ? "प्रतिक्रिया की प्रतीक्षा में" : "Awaiting response"}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

export default function CitizenPage({ initialView }: { initialView?: "file"|"track"|"success" } = {}) {
  return <LanguageProvider><CitizenApp initialView={initialView} /></LanguageProvider>;
}
