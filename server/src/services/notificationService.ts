/**
 * Notification service — SMS, WhatsApp, and Email, abstracted behind one
 * interface so the rest of the system never needs to know which channels
 * are actually live.
 *
 * Honest state of each channel as of this build:
 *
 *   SMS       — NOT live. Indian SMS gateways (e.g. Twilio, MSG91,
 *               Fast2SMS) do not have a meaningful free tier at production
 *               volume; Twilio's trial credit is one-time and tiny. This
 *               function is fully wired into every place a real product
 *               would send an SMS — it just no-ops with a logged reason
 *               until TWILIO_* (or another provider's) env vars are set.
 *
 *   WhatsApp  — NOT live, for the same reason, PLUS an extra wrinkle: the
 *               only genuinely free way to send WhatsApp messages is an
 *               UNOFFICIAL library (whatsapp-web.js) that automates a
 *               real, logged-in WhatsApp Web session via a headless
 *               browser. That needs a persistent Chromium process and a
 *               one-time QR-code login — both awkward on Render's free
 *               tier (limited RAM, and the instance sleeps/restarts,
 *               which would log the session out repeatedly). Documented
 *               here rather than implemented, because a broken
 *               integration that silently fails some of the time is worse
 *               than an honest no-op.
 *
 *   Email     — CAN be live for free right now. Resend's free tier is
 *               3,000 emails/month with no card required. This is wired
 *               to actually send if RESEND_API_KEY is set, and used for
 *               STAFF notifications (officers, cmo_team, cm) since User
 *               accounts already have an optional email field — citizens
 *               are tracked by phone only, so email isn't applicable to
 *               citizen-facing notifications in this build.
 *
 * Every call returns a NotificationResult so callers (and the in-app
 * fallback below) can tell whether something actually went out.
 */

export type NotificationChannel = "sms" | "whatsapp" | "email";

export interface NotificationResult {
  channel: NotificationChannel;
  sent: boolean;
  reason: string;
}

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM_EMAIL || "noreply@delhi-grievance.example";

export async function sendSMS(toPhone: string, message: string): Promise<NotificationResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    console.log(`[SMS not configured] Would send to ${toPhone}: ${message}`);
    return { channel: "sms", sent: false, reason: "TWILIO_* env vars not set — see notificationService.ts header" };
  }

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: toPhone, From: from, Body: message }).toString(),
    });
    if (!res.ok) throw new Error(`Twilio returned ${res.status}`);
    return { channel: "sms", sent: true, reason: "Sent via Twilio" };
  } catch (err) {
    console.warn("[SMS] send failed:", (err as Error).message);
    return { channel: "sms", sent: false, reason: (err as Error).message };
  }
}

export async function sendWhatsApp(toPhone: string, message: string): Promise<NotificationResult> {
  // No live integration — see header. Logged so the call site's intent
  // is visible in server logs even though nothing actually sends yet.
  console.log(`[WhatsApp not configured] Would send to ${toPhone}: ${message}`);
  return {
    channel: "whatsapp",
    sent: false,
    reason: "No WhatsApp integration configured — requires either the paid Business API or an unofficial whatsapp-web.js session, neither wired up. See notificationService.ts header.",
  };
}

export async function sendEmail(toEmail: string, subject: string, body: string): Promise<NotificationResult> {
  if (!RESEND_API_KEY) {
    console.log(`[Email not configured] Would send to ${toEmail}: ${subject}`);
    return { channel: "email", sent: false, reason: "RESEND_API_KEY not set" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: RESEND_FROM, to: [toEmail], subject, text: body }),
    });
    if (!res.ok) throw new Error(`Resend returned ${res.status}`);
    return { channel: "email", sent: true, reason: "Sent via Resend" };
  } catch (err) {
    console.warn("[Email] send failed:", (err as Error).message);
    return { channel: "email", sent: false, reason: (err as Error).message };
  }
}

/**
 * High-level event hook — call this on status transitions rather than
 * the raw send functions directly, so the message copy lives in one
 * place. Never throws — notification failures must never block the
 * actual workflow (a citizen's resolution confirmation mattering more
 * than whether an SMS about it went out).
 */
export async function notifyGrievanceEvent(opts: {
  citizenPhone: string;
  grvId: string;
  event: "dispatched" | "resolved_pending_confirmation" | "confirmed" | "reopened" | "escalated" | "forwarded";
  language: "en" | "hi";
}): Promise<void> {
  const messages: Record<typeof opts.event, Record<"en" | "hi", string>> = {
    dispatched: {
      en: `Your complaint ${opts.grvId} has been dispatched to the responsible department.`,
      hi: `आपकी शिकायत ${opts.grvId} संबंधित विभाग को भेज दी गई है।`,
    },
    resolved_pending_confirmation: {
      en: `Your complaint ${opts.grvId} has been marked resolved. Please confirm at the tracking page.`,
      hi: `आपकी शिकायत ${opts.grvId} हल कर दी गई है। कृपया ट्रैकिंग पेज पर पुष्टि करें।`,
    },
    confirmed: {
      en: `Thank you for confirming complaint ${opts.grvId} is resolved.`,
      hi: `शिकायत ${opts.grvId} के समाधान की पुष्टि के लिए धन्यवाद।`,
    },
    reopened: {
      en: `Complaint ${opts.grvId} has been reopened per your feedback and sent back to the department.`,
      hi: `आपकी प्रतिक्रिया के आधार पर शिकायत ${opts.grvId} फिर से खोली गई है।`,
    },
    escalated: {
      en: `Complaint ${opts.grvId} has been escalated due to delay. We apologize for the wait.`,
      hi: `देरी के कारण शिकायत ${opts.grvId} को आगे बढ़ाया गया है। देरी के लिए खेद है।`,
    },
    forwarded: {
      en: `Your complaint ${opts.grvId} has been transferred to another officer for further action. You can see the full handover on your tracking page.`,
      hi: `आपकी शिकायत ${opts.grvId} को आगे की कार्रवाई के लिए दूसरे अधिकारी को स्थानांतरित किया गया है। आप पूरी प्रक्रिया अपने ट्रैकिंग पेज पर देख सकते हैं।`,
    },
  };

  const message = messages[opts.event][opts.language];

  try {
    // Try SMS first, fall back to logging via WhatsApp's no-op for visibility.
    // Both currently no-op without configuration — this is the real call
    // site that will start working the moment TWILIO_* env vars are set,
    // with zero other code changes needed anywhere else in the system.
    await sendSMS(opts.citizenPhone, message);
  } catch {
    // notifyGrievanceEvent must never throw into the calling workflow
  }
}

/** Staff notification (officer/admin/cm) — uses email, since User accounts have one. */
export async function notifyStaffEvent(toEmail: string | undefined, subject: string, body: string): Promise<void> {
  if (!toEmail) return;
  try {
    await sendEmail(toEmail, subject, body);
  } catch {
    // best-effort only
  }
}
