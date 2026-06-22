"use client";

// /track — direct URL for citizens to bookmark for tracking complaints.
// Citizens use this page: enter their GRV reference + phone → see status,
// and if the complaint is in "Resolved Pending Confirmation" they can
// confirm resolution or reopen — the core anti-false-closure control point.
// All of this logic lives in the citizen page (which handles both file + track
// as tabs). We simply render it with the track tab pre-selected.

import dynamic from "next/dynamic";

const CitizenPage = dynamic(() => import("../citizen/page"), { ssr: false });

export default function TrackPage() {
  return <CitizenPage initialView="track" />;
}
