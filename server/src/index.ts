import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

import { connectDB } from "./config/db";
import { errorHandler } from "./middleware/errorHandler";
import { runAutoCloseSweep, runEscalationSweep } from "./services/grievanceService";
import { runSocialIngestionSweep } from "./services/socialIngestionService";

import authRoutes from "./routes/auth.routes";
import grievanceRoutes from "./routes/grievance.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import officerRoutes from "./routes/officer.routes";
import officerTaskRoutes from "./routes/officerTask.routes";
import deptRoutes from "./routes/dept.routes";
import visitRoutes from "./routes/visit.routes";
import open311Routes from "./routes/open311.routes";
import socialRoutes from "./routes/social.routes";
import auditRoutes from "./routes/audit.routes";
import roleRoutes from "./routes/role.routes";
import announcementRoutes from "./routes/announcement.routes";
import userRoutes from "./routes/user.routes";
import aiRoutes from "./routes/ai.routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "5mb" })); // generous limit for base64 photo proof uploads

// Rate limit citizen-facing filing endpoint to deter spam/abuse
const fileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: { error: "Too many submissions from this connection. Please try again later." },
});
app.use("/api/grievances", (req, res, next) => {
  if (req.method === "POST" && req.path === "/") return fileLimiter(req, res, next);
  next();
});

/**
 * Brute-force protection for the trackingSecret-verifying endpoints.
 *
 * trackingSecret is a 6-digit code (100000-999999, ~900,000 possible
 * values) — see Grievance.trackingSecret and the routes below for why
 * it exists: phone number alone isn't enough to prove someone is the
 * original complainant, since grvId is sequential and guessable.
 * But a 6-digit space is only actually secure if attempts are rate
 * limited; without this, an attacker who knows (or guesses) a citizen's
 * phone number could brute-force the remaining ~900,000 possibilities
 * in a feasible number of requests, since neither endpoint requires
 * login. This directly protects the system's core anti-false-closure
 * mechanism — the citizen-confirm action — from being forged.
 */
const trackingSecretLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: "Too many attempts. Please wait 15 minutes before trying again." },
  standardHeaders: true,
});
app.use("/api/grievances", (req, res, next) => {
  const isTrack = req.method === "GET" && req.path.startsWith("/track/");
  const isConfirm = req.method === "POST" && /^\/[^/]+\/confirm$/.test(req.path);
  if (isTrack || isConfirm) return trackingSecretLimiter(req, res, next);
  next();
});

// Login/register — standard brute-force/credential-stuffing protection.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { error: "Too many attempts. Please wait 15 minutes before trying again." },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

// classify-preview is public and (when configured) calls the Groq API
// per request — rate limited so it can't be hammered into running up
// API costs or just pegging the TF-IDF fallback's CPU.
const previewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  message: { error: "Too many requests. Please wait before trying again." },
});
app.use("/api/grievances/classify-preview", previewLimiter);

// The social webhook is already gated by a shared secret, but rate
// limiting it too is cheap defense in depth against both secret-guessing
// and against a misbehaving integration hammering the verify pipeline.
const webhookLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60 });
app.use("/api/social/webhook", webhookLimiter);

app.get("/api/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/grievances", grievanceRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/officer", officerRoutes);
app.use("/api/officer-tasks", officerTaskRoutes);
app.use("/api/departments", deptRoutes);
app.use("/api/visits", visitRoutes);
app.use("/api/open311", open311Routes);
app.use("/api/social", socialRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/users", userRoutes);
app.use("/api/ai", aiRoutes); // /api/ai/alerts/stream, /api/ai/groq/*, /api/ai/alerts/status

app.use(errorHandler);

async function main() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Delhi CM Grievance API listening on port ${PORT}`);
  });

  // Background sweeps — auto-escalation (L1->L4 promotion on SLA breach)
  // and auto-close (lapsed citizen-confirmation windows). Every 5 minutes
  // is fine for a demo; a production deploy would use a proper job queue.
  setInterval(async () => {
    try {
      const escalated = await runEscalationSweep();
      const autoClosed = await runAutoCloseSweep();
      if (escalated || autoClosed) {
        console.log(`Sweep: ${escalated} escalated, ${autoClosed} auto-closed`);
      }
    } catch (err) {
      console.error("Background sweep failed:", err);
    }
  }, 5 * 60 * 1000);

  // Social media auto-extraction sweep — verifies and auto-files genuine
  // complaints from the configured mention source (mock feed by default;
  // see routes/social.routes.ts /webhook for plugging in a real source).
  // Runs less frequently than the SLA sweeps since new mentions arrive
  // at a much lower rate than active grievance status changes.
  setInterval(async () => {
    try {
      const results = await runSocialIngestionSweep();
      const autoFiled = results.filter((r) => r.decision === "auto_filed").length;
      if (autoFiled > 0) {
        console.log(`Social sweep: ${autoFiled} mention(s) auto-filed as grievances`);
      }
    } catch (err) {
      console.error("Social ingestion sweep failed:", err);
    }
  }, 10 * 60 * 1000);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
