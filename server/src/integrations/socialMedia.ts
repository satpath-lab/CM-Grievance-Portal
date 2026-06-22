/**
 * Social-media-tagged complaint ingestion (mock).
 *
 * Research finding: citizens who tag the CM/department on Twitter/X
 * get faster resolution than those using formal channels, purely
 * because public visibility creates reputational pressure on
 * officials. Tamil Nadu and Andhra Pradesh formalized this by treating
 * social media as an official intake channel rather than an informal
 * backchannel — which is the fix for the inequity, AS LONG AS the
 * dashboard then prioritizes strictly by severity (via the same
 * classifier every other channel goes through), not by follower count
 * or virality. This module simulates that ingestion path: no real
 * Twitter/X API integration (paid, rate-limited, and out of scope for
 * an MVP) — a mock feed with the same shape a real integration would
 * produce, clearly labeled, so the equal-priority handling is
 * demonstrable end-to-end without needing live credentials.
 */

export interface SocialMediaMention {
  platform: "Twitter/X" | "Facebook" | "Instagram";
  // Public tag/mention vs a direct message. DM ingestion is NOT
  // implemented — Instagram/Facebook DM access requires Meta Business
  // Verification approval, and X's DM API needs elevated (paid) access;
  // neither is the same permission tier as reading public mentions. This
  // field exists so that whenever DM access is ever granted, it flows
  // through the identical verify-and-auto-file pipeline as everything
  // else, rather than needing a second pipeline built from scratch.
  sourceChannel: "public_tag" | "direct_message";
  handle: string;
  postUrl: string;
  text: string;
  postedAt: string;
  followerCount: number; // intentionally NOT used for prioritization — captured only for transparency
  mediaUrl?: string;
  lat?: number;
  lng?: number;
}

const MOCK_FEED: SocialMediaMention[] = [
  {
    platform: "Twitter/X",
    sourceChannel: "public_tag",
    handle: "@resident_dwarka",
    postUrl: "https://x.com/mock/status/1",
    text: "@CMODelhi sewage flowing on main road Dwarka sector 12 for 4 days, no one is responding #DelhiCivic",
    postedAt: new Date(Date.now() - 3600_000 * 5).toISOString(),
    followerCount: 340,
    lat: 28.5921,
    lng: 77.046,
  },
  {
    platform: "Twitter/X",
    sourceChannel: "public_tag",
    handle: "@verified_journalist",
    postUrl: "https://x.com/mock/status/2",
    text: "@CMODelhi @MCD311 huge pothole on Ring Road causing accidents, video attached",
    postedAt: new Date(Date.now() - 3600_000 * 2).toISOString(),
    followerCount: 89000,
    lat: 28.6304,
    lng: 77.2177,
  },
  {
    platform: "Facebook",
    sourceChannel: "public_tag",
    handle: "Shahdara Residents Welfare Group",
    postUrl: "https://facebook.com/mock/post/3",
    text: "No water supply in our block for 3 days, jal board not picking up calls",
    postedAt: new Date(Date.now() - 3600_000 * 10).toISOString(),
    followerCount: 1200,
    lat: 28.6789,
    lng: 77.2895,
  },
];

export interface SocialIngestResult {
  mode: "mock";
  mentions: SocialMediaMention[];
  note: string;
}

/**
 * Returns mock social media mentions formatted as if they came from a
 * real listening API (Twitter API v2 filtered stream / Meta Graph API).
 * The equity principle is enforced downstream: when these are converted
 * to Grievance documents, they go through classifyGrievance() exactly
 * like every other channel and are prioritized by severity only —
 * followerCount is stored for transparency/audit but never read by the
 * priority or escalation logic.
 */
export function fetchSocialMediaMentions(): SocialIngestResult {
  return {
    mode: "mock",
    mentions: MOCK_FEED,
    note:
      "Mock social listening feed. A production deployment would connect " +
      "Twitter/X API v2 or Meta Graph API here, but priority handling " +
      "downstream never changes — every mention is classified by the " +
      "same severity engine as web/app/helpline complaints, specifically " +
      "to prevent high-follower accounts jumping the queue.",
  };
}
