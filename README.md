# Delhi CM Grievance & Complaint Management System

A full-stack MERN platform built for the CM of Delhi (Rekha Gupta), addressing documented
failures in Delhi's fragmented grievance ecosystem — false closures, officer workload
invisibility, MCD311 incompatibility, and social-media-driven inequity in resolution.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | Express 4 + TypeScript + MongoDB/Mongoose |
| Frontend | Next.js 14 (App Router) + TypeScript |
| AI / NLP | Groq `llama-3.3-70b-versatile` (primary) + `llama-3.1-8b-instant` (preview) |
| NLP fallback | TF-IDF + Naive Bayes (in-process, zero-cost) |
| Real-time | Server-Sent Events for life-threatening complaint alerts |
| Auth | JWT + bcrypt |
| Languages | English + Hindi (full bilingual UI, every role) |

## What makes this different

**The single biggest failure in Delhi grievance systems is false closure** — officers marking
complaints "resolved" without action, sometimes attaching photos from other locations as fake
proof. This system treats that as a first-class problem:

- **Citizen-confirmed closure**: officer submitting "resolved" moves the ticket to
  *Resolved Pending Confirmation*, not *Resolved*. The citizen must explicitly confirm
  (via their phone+reference number) before the ticket truly closes. No citizen response
  after 72 hours → *Auto Closed* — a distinct status that never inflates resolution rates.
- **GPS photo-location mismatch detection**: when an officer uploads a resolution photo,
  the system checks their device geolocation against the original complaint coordinates.
  Anything more than 150 meters away is flagged in the Integrity Audit tab.
- **Hash-chained audit log**: every status change is SHA-256 hashed against the previous
  event. `/api/audit/verify/:grvId` replays the chain and reports the exact event index
  where tampering occurred if the chain is broken.
- **False-closure gap metric**: the admin dashboard shows officer-reported resolved vs.
  citizen-confirmed resolved side-by-side — the same kind of gap an Andhra Pradesh IVR
  audit found to be 90% vs 22%.

## Groq AI integration

Three use-cases, all with graceful fallback:

1. **Classification** (`llama-3.3-70b-versatile`, JSON mode): classifies Hindi/Hinglish/English
   complaint text into 11 categories with routing to the right department. Fallback: TF-IDF
   Naive Bayes classifier (no API key required).
2. **Live NLP preview** (`llama-3.1-8b-instant`): as a citizen types, fires debounced
   Groq call and shows detected language + category + department in real time.
3. **CM daily brief**: Groq generates a 3-4 sentence situation summary from live MongoDB
   aggregates (complaints filed today, critical open, hotspots, SLA breaches) in Hindi or
   English based on CM's preferred language.

**All Groq calls have 8-second hard timeout + TF-IDF fallback.** The system runs fully
without a Groq key — add one to demonstrate AI features.

## Setup

### Prerequisites
- Node.js 18+
- MongoDB Atlas (free tier at cloud.mongodb.com) OR local MongoDB
- Groq API key (free at console.groq.com, no credit card)

### 1. MongoDB Atlas (2 minutes)
1. Sign up at cloud.mongodb.com → Create free M0 cluster
2. Database Access → Add user (username/password)
3. Network Access → Allow all IPs (0.0.0.0/0) for demo
4. Copy the SRV connection string

### 2. Server
```bash
cd server
cp .env.example .env
# Edit .env: set MONGODB_URI, JWT_SECRET, GROQ_API_KEY
npm install
npm run seed          # Creates departments, users, 20 sample grievances
npm run dev           # Starts on port 4000
```

**Seed credentials** (password: `password123`)
| Role | Phone |
|---|---|
| CM (Rekha Gupta) | 9999900001 |
| CMO Team | 9999900002 |
| Super Admin | 9999900003 |
| Dept Admin (DJB) | 9999900004 |
| Field Officer | 9800000010 |

### 3. Client
```bash
cd client
npm install
# .env.local (optional — defaults to localhost:4000)
# NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api
npm run dev           # Starts on port 3000
```

## Routes

| URL | Who sees it |
|---|---|
| `/citizen` | Citizens — file complaint (Hindi/Hinglish/English), live NLP preview, track by ref+phone, confirm/dispute resolution |
| `/track` | Citizens — direct tracking URL to bookmark |
| `/login` | All staff |
| `/officer` | Field officers — queue of assigned grievances, mark resolved with geo-photo |
| `/admin` | CMO team / Dept Admin — full ops dashboard, all tabs |
| `/cm` | Chief Minister — overview, AI brief, visit mode |

## API

All endpoints at `http://localhost:4000/api/`.

Key endpoints:
- `POST /grievances` — file grievance (no auth, accepts Hindi/Hinglish/English)
- `POST /grievances/classify-preview` — live NLP without saving
- `POST /grievances/:id/resolve` — officer marks resolved with geo-photo
- `POST /grievances/:id/confirm` — citizen confirms or disputes resolution
- `GET /dashboard/false-closure` — the false-closure gap metric
- `GET /dashboard/officer-workload` — per-officer active/critical counts
- `GET /audit/verify/:grvId` — hash-chain integrity check
- `GET /ai/groq/cm-brief?lang=hi` — Groq-generated situation brief
- `GET /ai/alerts/stream` — SSE stream for life-threatening alerts (CM/CMO only)
- `GET /open311/status` — MCD311 integration mode (live/mock)

## Deployment (Render free tier)

Render's free web service tier gives 750 instance-hours/month (enough for one app
running 24/7), 500 build minutes/month, no credit card — but it sleeps after 15
minutes of inactivity and takes 30-60 seconds to wake on the next request. That's
fine for the API (citizens rarely need sub-second responses on a civic complaint
form) but worth knowing about for live demos: the first request after idle time
will be slow.

**Recommended split:**
- **API → Render free Web Service.** Use the included `render.yaml` blueprint —
  push to GitHub, then "New > Blueprint" in the Render dashboard, point it at
  this repo. Set `MONGODB_URI` and `GROQ_API_KEY` manually in the dashboard
  (the blueprint deliberately leaves these as `sync: false` so secrets never
  touch the repo).
- **Keep it awake with a FREE external pinger, not Render's Cron Job
  product.** Render's own Cron Jobs carry a minimum $1/month charge per job —
  not actually free. Instead, use **cron-job.org** (free, no card) or
  **UptimeRobot** (free tier, no card): create a monitor that does a GET to
  `https://<your-api>.onrender.com/api/health` every 10 minutes. This keeps
  the free web service inside its 15-minute sleep window indefinitely, at
  zero cost, using a tool outside Render rather than Render's paid cron product.
- **Client → Vercel free tier** (zero cold start, built for Next.js) or **Render
  free Web Service** (same sleep/cold-start trade-off as the API; the included
  `render.yaml` covers this option too). Set `NEXT_PUBLIC_API_BASE_URL` to your
  deployed API URL either way.
- **Database → MongoDB Atlas free M0 cluster** (not Render's free Postgres,
  which auto-deletes after 30 days — Atlas free tier has no such expiry).

```bash
# 1. Push this repo to GitHub
# 2. Render dashboard → New → Blueprint → select repo → render.yaml is auto-detected
# 3. Set MONGODB_URI and GROQ_API_KEY for delhi-grievance-api
# 4. Set NEXT_PUBLIC_API_BASE_URL for delhi-grievance-client to the API's Render URL
# 5. cron-job.org → create monitor → GET https://<api>.onrender.com/api/health every 10 min
# 6. Run `npm run seed` once via Render's shell tab (or locally against the Atlas URI)
```

## Why this design beats EXIF-based photo verification

Several grievance-system proposals (including ones reviewed during this build)
rely on matching EXIF GPS data embedded in resolution photos as proof an officer
was physically on-site. **This doesn't hold up under verification**: most upload
pipelines — including standard browser-based image compression before upload —
strip EXIF as a side effect of re-encoding. iPhone photos in HEIC format don't
even use the EXIF container that most stripping/reading tools expect. An officer
on a phone with EXIF already stripped by the OS share sheet, or any
client-side image compression step (extremely common for mobile uploads to
keep payloads small), would have *no* location data to match against — not
fraudulent, just unreliable infrastructure to build fraud detection on.

This system instead captures the officer's **live browser Geolocation API
reading at the exact moment they submit the resolution** — independent of
the photo file entirely. It can't be stripped by compression, doesn't depend
on file format, and ties the location explicitly to the action of submitting
resolution proof, not to whenever the photo happened to be taken.

## Differentiating features (research-grounded)

| Feature | Why it's here | Verification |
|---|---|---|
| Citizen-confirmed closure | False closure is the #1 documented Delhi grievance complaint | Andhra Pradesh IVR audit: 90% officer-reported vs 22% citizen-satisfied |
| GPS-at-submission (not EXIF) | EXIF is unreliable infrastructure for fraud detection | Verified: most upload pipelines strip EXIF; HEIC doesn't use it |
| Hash-chained audit log | Detects retroactive tampering with status history | Standard blockchain-style hash-linking, applied per-document |
| Delhi Governance Health Score | Single number for CM mobile view, but formula is published, not a black box | 40% confirm + 25% on-time + 20% escalation-free + 15% non-reopened |
| Officer Accountability Score | Composite of 4 measurable signals, not reopen rate alone | 45% confirm + 25% on-time + 20% non-reopen + 10% photo accuracy |
| Predictive growth alerts | Deterministic week-over-week math, Groq only narrates it | No opaque "AI predicts crisis" claim — the number is auditable |
| Social media equal-priority intake | Documented inequity: viral complaints get faster service than formal channels | Tamil Nadu/AP precedent: treat social as an equal, not privileged, channel |
| MCD311/Open311 adapter | Brief requirement: must not fail without real government API access | Mock-mode fallback with identical response shape |

## Social media auto-extraction — and a real constraint on it

The brief asks for social-media-connected complaints. I verified the actual
cost of doing this live in 2026 before building anything: there is no free
tier for reading X/Twitter data anymore — the official free tier is write-only
with roughly 100 reads/month, and every practical read-access tier starts at
real, ongoing money. So a fully autonomous, zero-cost, live firehose pulling
tagged X posts does not exist as a thing to build.

What's actually built instead is the **verification and auto-filing pipeline**
— the genuinely hard, valuable part — designed to be agnostic about where
mentions come from:

- `POST /api/social/webhook` — a generic inbound endpoint any free automation
  tool (an IFTTT applet, a Zapier free-tier zap, a browser extension) can call
  the moment it sees a tagged post. Authenticated with a shared secret header,
  since external tools can't do an interactive login.
- `POST /api/social/report` — a manual "I saw this post" form for staff.
- The bundled mock feed, for demonstrating the pipeline without any external
  dependency.

Every mention — regardless of source — goes through `verifySocialMention()`
(Groq-powered; a conservative rule-based fallback if no API key is set) which
decides: **auto-file** it as a real grievance (Groq confident it's genuine,
actionable, and has coordinates), **needs_review** (plausible but missing
detail — surfaced to staff with an approve/reject UI), or **rejected**
(spam/joke/ad/too vague, logged with a reason, never becomes a grievance).
A background sweep runs this over the current feed every 10 minutes; staff
can also trigger it on demand. `followerCount` is captured but read by
nothing in the decision logic — a viral tweet and a quiet phone call are
verified and prioritized identically.

## Executive reporting (AI-generated)

The original brief's MVP requirements explicitly list "Generate actionable
reports and accountability metrics for senior government review" — a
different artifact from a live dashboard, which a senior official can't file,
forward, or read in one sitting. `GET /api/ai/groq/executive-report` (restricted
to cmo_team/cm/super_admin) assembles real aggregates — health score,
false-closure gap, top categories/districts, predictive growth alerts,
officers flagged for review — and has Groq write the prose around them in a
fixed structure: Executive Summary, Key Metrics, Top Issues & Hotspots,
Accountability Flags, Recommendations. Every number in the report comes from
the same aggregate functions the dashboards use; Groq never invents figures,
it only writes the narrative connecting them. Falls back to a deterministic
templated report if no Groq key is set. The admin Overview tab has a
"Generate & Download Report" button that produces a downloadable .txt file.

## Genuine gaps found and fixed in this pass

A direct request to find what's genuinely missing surfaced three real
issues, verified against the actual code (not assumed) before fixing:

1. **Security hole in the hero feature.** Reference IDs were sequential
   (`GRV-2026-00001`, `00002`...) and the citizen-confirm endpoint matched
   on phone number alone. Anyone who could guess the next ID and knew —
   or could find out — a citizen's phone number could confirm or dispute
   resolution on their behalf, directly undermining the one mechanism this
   whole platform exists to protect. Fixed with a separate unguessable
   6-digit `trackingSecret`, generated once at filing time and shown to
   the citizen exactly once (never retrievable again, never returned by
   any other endpoint) — required alongside phone number for tracking,
   confirming, or disputing.
2. **Officer assignment was 100% manual** despite workload data already
   being computed for the dashboard. Added `findLeastLoadedOfficer()` +
   an "Auto-Assign Least-Loaded Officer" button that uses the same active-
   complaint counts the workload tab already displays, with manual
   override still available.
3. **No public transparency view** — every dashboard required staff
   login, despite "Transparency" being an explicit brief requirement.
   Added `GET /api/dashboard/public` (no auth) and a `/transparency` page,
   scoped to return only verified-safe aggregates: no citizen names, no
   phone numbers, no individual officer names or scores.

Still open, not fixed this pass (see why under each): citizens can't
attach a photo when filing (officers must attach one to resolve, but
intake is text-only — a real asymmetry); there is no notification
mechanism when status changes (citizens must revisit the tracking page
manually — genuine SMS/WhatsApp costs money, and the free-but-fragile
unofficial-library route for WhatsApp, like `whatsapp-web.js` automating
a logged-in WhatsApp Web session, needs a persistent browser session that
doesn't reliably survive Render's free-tier memory limits); WhatsApp is
currently a decorative channel enum with no real or mocked integration
behind it; and there is no automated test suite checked into the repo —
verification so far has been ad-hoc scripts run and discarded during
development, not regression-protected tests.

## Architecture decisions

**Why TF-IDF + Groq fallback instead of Groq-only?**  
The free Groq tier is 30 RPM / 6K TPM. Under demo load with multiple tabs and live NLP
preview firing every keystroke, rate limits would be hit immediately. TF-IDF runs in-process
with zero network cost and classifies in < 1ms. Groq fires for the final submission
classification where the extra accuracy matters, and for CM briefing.

**Why Mongoose instead of Prisma/Postgres?**  
The brief says MERN. MongoDB's flexible schema means adding a new complaint category or
department is a database operation, not a migration. The research showed Delhi's complaint
taxonomy changes frequently.

**Why SSE instead of WebSocket for alerts?**  
SSE is one-directional (server → client), requires no handshake protocol, works through
most proxies and load balancers, and a life-threatening alert is exactly a one-directional
server push. The client doesn't need to send anything back on the alert channel.
