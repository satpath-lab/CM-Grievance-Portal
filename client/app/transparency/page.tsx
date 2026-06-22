"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { LanguageProvider, useLanguage } from "@/lib/i18n";

/**
 * Public transparency page — no login required.
 *
 * Closes a real gap: the brief explicitly lists "Transparency" as an MVP
 * capability, but every other dashboard in this system requires staff
 * login. This is the city-wide view for the public, press, or any auditor
 * who wants to see real performance without needing an account — backed
 * by GET /api/dashboard/public, which is deliberately scoped to never
 * return citizen names, phone numbers, or individual officer data.
 */

function TransparencyApp() {
  const { lang, setLang } = useLanguage();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<any>("/dashboard/public")
      .then(setData)
      .catch(() => setError(lang === "hi" ? "डेटा लोड नहीं हो सका" : "Could not load data"));
  }, [lang]);

  return (
    <div className={`lang-${lang}`} style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      <nav className="topnav">
        <a className="topnav-brand" href="/">
          {lang === "hi" ? "पारदर्शिता पोर्टल" : "Transparency Portal"}
          <span className="topnav-sub">{lang === "hi" ? "दिल्ली सरकार — सार्वजनिक डेटा" : "Government of Delhi — Public Data"}</span>
        </a>
        <button className="topnav-btn lang" onClick={() => setLang(lang === "en" ? "hi" : "en")}>
          {lang === "en" ? "हिंदी" : "English"}
        </button>
      </nav>

      <div className="page-wrap" style={{ maxWidth: 900 }}>
        <div className="card" style={{ marginBottom: 16, background: "#e8eaf6" }}>
          <div style={{ fontSize: 13, color: "#1a237e" }}>
            {lang === "hi"
              ? "यह पृष्ठ किसी भी व्यक्ति के लिए खुला है — लॉगिन की आवश्यकता नहीं। कोई नागरिक नाम, फ़ोन नंबर, या व्यक्तिगत अधिकारी डेटा कभी नहीं दिखाया जाता।"
              : "This page is open to anyone — no login required. No citizen names, phone numbers, or individual officer data are ever shown here."}
          </div>
        </div>

        {error && <div className="empty">{error}</div>}
        {!data && !error && <div className="loading">{lang === "hi" ? "लोड हो रहा है…" : "Loading…"}</div>}

        {data && (
          <>
            {/* Health score */}
            <div className="card" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ position: "relative", width: 88, height: 88, flexShrink: 0 }}>
                <svg viewBox="0 0 36 36" style={{ width: 88, height: 88, transform: "rotate(-90deg)" }}>
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e0e0e0" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.5" fill="none"
                    stroke={data.healthScore >= 75 ? "#2e7d32" : data.healthScore >= 50 ? "#e65100" : "#b71c1c"}
                    strokeWidth="3" strokeDasharray={`${(data.healthScore / 100) * 97.4} 97.4`} strokeLinecap="round" />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "#1a237e" }}>
                  {data.healthScore}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#1a237e", marginBottom: 4 }}>
                  {lang === "hi" ? "दिल्ली शासन स्वास्थ्य स्कोर" : "Delhi Governance Health Score"}
                </div>
                <div style={{ fontSize: 12, color: "#9e9e9e", marginBottom: 6 }}>
                  {lang === "hi"
                    ? "40% नागरिक पुष्टि दर + 25% समय पर समाधान + 20% एस्केलेशन-मुक्त + 15% पुनः न खुलना"
                    : "40% citizen confirmation rate + 25% on-time resolution + 20% escalation-free + 15% non-reopened"}
                </div>
                <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#616161", flexWrap: "wrap" }}>
                  <span>{lang === "hi" ? "नागरिक पुष्टि" : "Citizen confirmation"}: <strong>{data.healthScoreComponents.confirmationRate}%</strong></span>
                  <span>{lang === "hi" ? "समय पर" : "On-time"}: <strong>{data.healthScoreComponents.onTimeRate}%</strong></span>
                </div>
              </div>
            </div>

            {/* Stat row */}
            <div className="stat-grid" style={{ marginBottom: 16 }}>
              <div className="stat-card">
                <div className="stat-val">{data.totalFiled}</div>
                <div className="stat-label">{lang === "hi" ? "आज दर्ज" : "Filed Today"}</div>
              </div>
              <div className="stat-card amber">
                <div className="stat-val">{data.pending}</div>
                <div className="stat-label">{lang === "hi" ? "खुली" : "Open"}</div>
              </div>
              <div className="stat-card green">
                <div className="stat-val">{data.resolvedThisWeek}</div>
                <div className="stat-label">{lang === "hi" ? "इस सप्ताह हल" : "Resolved This Week"}</div>
              </div>
            </div>

            {/* Department performance — public accountability, dept names only */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">{lang === "hi" ? "विभाग प्रदर्शन" : "Department Performance"}</div>
              <div className="tbl-wrap">
                <table>
                  <thead><tr>
                    <th>{lang === "hi" ? "विभाग" : "Department"}</th>
                    <th>{lang === "hi" ? "कुल शिकायतें" : "Total Handled"}</th>
                    <th>{lang === "hi" ? "समय पर %" : "On-time %"}</th>
                  </tr></thead>
                  <tbody>
                    {data.departmentPerformance.map((d: any) => (
                      <tr key={d.code}>
                        <td>{d.department}</td>
                        <td>{d.totalHandled}</td>
                        <td>
                          <span style={{ fontWeight: 700, color: d.onTimePercent >= 80 ? "#2e7d32" : d.onTimePercent >= 60 ? "#e65100" : "#b71c1c" }}>
                            {d.onTimePercent}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Categories + districts */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="card">
                <div className="card-title">{lang === "hi" ? "श्रेणी अनुसार" : "By Category"}</div>
                {data.categories.slice(0, 8).map((c: any) => {
                  const max = data.categories[0]?.total || 1;
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
              <div className="card">
                <div className="card-title">{lang === "hi" ? "ज़िले अनुसार" : "By District"}</div>
                {data.districts.slice(0, 8).map((d: any) => {
                  const max = data.districts[0]?.total || 1;
                  return (
                    <div key={d.district} className="district-row">
                      <span style={{ fontSize: 12, minWidth: 90 }}>{d.district}</span>
                      <div className="district-bar">
                        <div className="district-bar-fill" style={{ width: `${(d.total / max) * 100}%` }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, minWidth: 28, textAlign: "right" }}>{d.total}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ fontSize: 11, color: "#9e9e9e", textAlign: "center", marginTop: 16 }}>
              {lang === "hi" ? "अंतिम अपडेट" : "Last updated"}: {new Date(data.generatedAt).toLocaleString()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function TransparencyPage() {
  return <LanguageProvider><TransparencyApp /></LanguageProvider>;
}
