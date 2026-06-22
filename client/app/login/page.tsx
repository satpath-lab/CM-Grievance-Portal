"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, setToken, setStoredUser } from "@/lib/api";
import { LanguageProvider, useLanguage } from "@/lib/i18n";

function LoginApp() {
  const router = useRouter();
  const { t, lang, setLang } = useLanguage();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const r = await api.post<any>("/auth/login", { phone, password });
      setToken(r.token);
      setStoredUser(r.user);
      const role = r.user.role;
      if (role === "cm") router.replace("/cm");
      else if (role === "field_officer") router.replace("/officer");
      else router.replace("/admin");
    } catch (err: any) {
      setError(err.message || t("login.error"));
    }
    setLoading(false);
  };

  return (
    <div className={`lang-${lang}`}>
      <nav className="topnav">
        <a className="topnav-brand" href="/citizen">{t("app.title")}<span className="topnav-sub">{t("app.subtitle")}</span></a>
        <button className="topnav-btn lang" onClick={() => setLang(lang === "en" ? "hi" : "en")}>{t("lang.toggle")}</button>
      </nav>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", minHeight: "calc(100vh - 52px)", padding: "40px 16px" }}>
        <div className="card" style={{ width: "100%", maxWidth: 400 }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ width: 52, height: 52, background: "#1a237e", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", color: "#fff", fontSize: 22 }}>🏛</div>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: "#1a237e", margin: "0 0 4px" }}>{t("login.heading")}</h1>
            <p style={{ fontSize: 12, color: "#9e9e9e", margin: 0 }}>{t("app.subtitle")}</p>
          </div>
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">{t("login.phone")}</label>
              <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} placeholder={lang === "hi" ? "10 अंकों का मोबाइल नंबर" : "10-digit mobile number"} autoComplete="tel" />
            </div>
            <div className="form-group">
              <label className="form-label">{t("login.password")}</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </div>
            {error && <div style={{ background: "#ffebee", color: "#b71c1c", padding: "8px 12px", borderRadius: 6, fontSize: 13, marginBottom: 12 }}>{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
              {loading ? (lang === "hi" ? "लॉगिन हो रहा है…" : "Logging in…") : t("login.button")}
            </button>
          </form>
          <div style={{ marginTop: 20, borderTop: "1px solid #e0e0e0", paddingTop: 16 }}>
            <div className="card-title">Demo credentials (password: password123)</div>
            <div style={{ fontSize: 12, color: "#616161", lineHeight: 1.8 }}>
              CM: 9999900001 · CMO Team: 9999900002<br />
              Officer: 9800000010 · Dept Admin: 9999900004
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <a href="/citizen" style={{ fontSize: 12, color: "#3949ab", textDecoration: "none" }}>{t("nav.citizen")} →</a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <LanguageProvider><LoginApp /></LanguageProvider>;
}
