"use client";

import { useRef, useState } from "react";

/**
 * Real camera/file capture, converted to a base64 data URL client-side.
 *
 * This replaces what was previously a bare text input where the user
 * pasted a photo URL — that only worked if they'd already uploaded the
 * photo somewhere else first, which defeats the point. This actually
 * captures a photo from the device camera (or gallery) and produces a
 * data URL the server can store directly.
 *
 * Honest limitation, not hidden: storing photos as base64 in MongoDB
 * works for an MVP/demo at low volume but is NOT the right call at real
 * production scale — every photo bloats document size and there's a 16MB
 * per-document Mongo limit. The express body limit is already capped at
 * 5MB (see server/src/index.ts) specifically to keep this bounded for now.
 * The clean swap-in for production is Cloudinary's free tier (10GB
 * storage/25GB bandwidth, no card) or S3 — replace handleFile's data-URL
 * branch with an upload call to either, return the hosted URL instead.
 * Nothing else in the system needs to change; everywhere this component
 * is used just stores whatever URL string it receives.
 */

const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // 4MB - leaves headroom under the 5MB body limit

interface PhotoCaptureProps {
  value: string;
  onChange: (dataUrlOrEmpty: string) => void;
  label: string;
  hint?: string;
  required?: boolean;
}

export function PhotoCapture({ value, onChange, label, hint, required }: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  const handleFile = (file: File | undefined) => {
    setError("");
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      setError("Photo too large — please use a smaller image (under 4MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.onerror = () => setError("Could not read photo — please try again.");
    reader.readAsDataURL(file);
  };

  return (
    <div className="form-group">
      <label className="form-label">{label} {required && <span className="req">*</span>}</label>
      {hint && <div style={{ fontSize: 11, color: "#9e9e9e", marginBottom: 6 }}>{hint}</div>}

      {value ? (
        <div style={{ position: "relative", display: "inline-block" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" style={{ maxWidth: 220, maxHeight: 220, borderRadius: 8, border: "1px solid #e0e0e0" }} />
          <button
            type="button"
            onClick={() => { onChange(""); if (inputRef.current) inputRef.current.value = ""; }}
            style={{
              position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: "50%",
              border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer", fontSize: 14,
            }}
          >
            ×
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={() => inputRef.current?.click()}
        >
          📷 {label}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment" // hints mobile browsers to open the camera directly, not just the gallery picker
        style={{ display: "none" }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {error && <div style={{ fontSize: 11, color: "#b71c1c", marginTop: 4 }}>{error}</div>}
    </div>
  );
}
