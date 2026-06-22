# Delhi CM Grievance & Complaint Management System

Live Demo: https://delhi-grievance-client.onrender.com

A full-stack grievance management platform built to handle citizen complaints, department workflows, officer operations, and government-level monitoring.

The system focuses on improving complaint lifecycle transparency by adding:

* citizen verified complaint closure
* complaint classification and routing
* officer workload visibility
* resolution proof verification
* audit history tracking
* operational dashboards

---

# Tech Stack

| Layer            | Technology                           |
| ---------------- | ------------------------------------ |
| Frontend         | Next.js 14 (App Router) + TypeScript |
| Backend          | Express 4 + TypeScript               |
| Database         | MongoDB + Mongoose                   |
| Authentication   | JWT + bcrypt                         |
| AI/NLP           | Groq Llama models                    |
| NLP fallback     | TF-IDF + Naive Bayes                 |
| Real-time alerts | Server-Sent Events                   |
| Languages        | Hindi + English bilingual interface  |

---

# Core Features

## Citizen Complaint Portal

Citizens can:

* submit complaints in Hindi, Hinglish, or English
* receive a unique grievance reference
* track complaint progress
* confirm or dispute resolution
* access a bilingual interface

Complaint text is processed using NLP to identify:

* category
* department
* priority

---

# Complaint Closure Verification

A common issue in grievance systems is complaints being marked resolved without proper verification.

This system uses a confirmation-based workflow:

```
Submitted
    ↓
Assigned
    ↓
Resolved by Officer
    ↓
Waiting for Citizen Confirmation
    ↓
Closed
```

A complaint is not considered successfully resolved until the citizen confirms it.

If there is no response after the defined period, it is handled separately instead of increasing successful resolution statistics.

---

# Resolution Integrity Checks

## Location Verification

When an officer submits resolution proof:

* browser geolocation is captured
* location is compared with complaint location
* large mismatches are flagged for review

The system avoids depending on image EXIF metadata because:

* many upload pipelines remove EXIF information
* mobile compression often strips metadata
* file metadata does not always represent the actual submission location

The verification is tied to the resolution action itself.

---

## Hash-Based Audit Log

Every important complaint event is stored in an integrity chain.

Each event contains:

* previous event hash
* current event data
* generated SHA-256 hash

Example:

```
Event 1
Hash: abc123

Event 2
Previous Hash: abc123
Hash: def456

Event 3
Previous Hash: def456
Hash: xyz789
```

The audit verification endpoint can detect if any previous record has been modified.

Endpoint:

```
GET /api/audit/verify/:grvId
```

---

# AI Integration

AI features are implemented with fallback support.

The system works even without an AI API key.

---

## Complaint Classification

Model:

```
Groq llama-3.3-70b-versatile
```

Used for:

* complaint category detection
* department routing
* Hindi/Hinglish understanding

Fallback:

```
TF-IDF + Naive Bayes
```

This allows classification without external API dependency.

---

## Live NLP Preview

While citizens type complaints:

* language detection
* category prediction
* department suggestion

are generated using a debounced AI request.

Fallback classification is used if AI is unavailable.

---

## CM Situation Brief

The dashboard can generate a summary using live system data:

Includes:

* complaints received today
* critical pending complaints
* hotspots
* SLA breaches
* department performance

The AI only generates the explanation. Numbers come from database aggregation.

---

# Dashboards

## Officer Dashboard

Features:

* assigned complaint queue
* resolution workflow
* location-based verification
* workload visibility

---

## Admin Dashboard

Includes:

* complaint analytics
* department statistics
* false closure metrics
* SLA monitoring
* officer workload
* report generation

---

## CM Dashboard

Provides:

* overall grievance health
* AI generated daily brief
* critical alerts
* district/category trends

---

# Transparency System

Public statistics are available without staff login.

Endpoint:

```
GET /api/dashboard/public
```

Available data:

* complaint counts
* category trends
* resolution statistics

No citizen personal information is exposed.

---

# Social Media Complaint Pipeline

The system supports external social complaint intake.

Supported methods:

```
POST /api/social/webhook
```

For external automation tools.

```
POST /api/social/report
```

For manual staff reporting.

Each social mention is classified as:

```
auto-file
needs-review
rejected
```

The system does not prioritize complaints based on follower count.

A viral post and a normal citizen complaint follow the same verification process.

---

# Open311 / MCD311 Adapter

Government integrations can vary between environments.

The system includes an adapter layer:

```
GET /api/open311/status
```

Supports:

* live integration mode
* mock mode for demonstrations

The application does not depend on external APIs being available.

---

# Security Improvements

## Tracking Protection

Original reference numbers were predictable.

To prevent unauthorized complaint actions:

* a separate tracking secret is generated
* it is shown only once to the citizen
* it is required for tracking and confirmation actions

---

## Officer Assignment

Added automatic assignment:

```
findLeastLoadedOfficer()
```

The system selects officers based on active workload.

Manual assignment is still supported.

---

# API

Base URL:

```
http://localhost:4000/api
```

Important endpoints:

| Endpoint                          | Purpose              |
| --------------------------------- | -------------------- |
| POST /grievances                  | Create complaint     |
| POST /grievances/classify-preview | Live classification  |
| POST /grievances/:id/resolve      | Officer resolution   |
| POST /grievances/:id/confirm      | Citizen confirmation |
| GET /dashboard/false-closure      | Closure gap metrics  |
| GET /dashboard/officer-workload   | Officer workload     |
| GET /audit/verify/:grvId          | Audit verification   |
| GET /ai/groq/cm-brief             | CM brief             |
| GET /ai/alerts/stream             | Live alerts          |

---

# Installation

## Requirements

* Node.js 18+
* MongoDB Atlas or local MongoDB
* Groq API key (optional)

---

# Backend

```bash
cd server

cp .env.example .env
```

Configure:

```
MONGODB_URI=
JWT_SECRET=
GROQ_API_KEY=
```

Install:

```bash
npm install
```

Seed database:

```bash
npm run seed
```

Start:

```bash
npm run dev
```

Runs on:

```
localhost:4000
```

---

# Frontend

```bash
cd client

npm install

npm run dev
```

Runs on:

```
localhost:3000
```

---

# Demo Accounts

Password:

```
password123
```

| Role             | Phone      |
| ---------------- | ---------- |
| CM               | 9999900001 |
| CMO Team         | 9999900002 |
| Super Admin      | 9999900003 |
| Department Admin | 9999900004 |
| Field Officer    | 9800000010 |

---

# Deployment

Recommended deployment:

Frontend:

* Vercel
* Render

Backend:

* Render

Database:

* MongoDB Atlas

Environment variables:

Backend:

```
MONGODB_URI
JWT_SECRET
GROQ_API_KEY
```

Frontend:

```
NEXT_PUBLIC_API_BASE_URL
```

---

# Architecture Decisions

## Why Groq + Local NLP?

External AI services have rate limits.

Using a local fallback provides:

* offline classification capability
* lower latency
* reduced API dependency

Groq is used where advanced language understanding provides value.

---

## Why MongoDB?

The grievance structure can change frequently:

* new categories
* new departments
* additional metadata

MongoDB provides flexibility without frequent schema migrations.

---

## Why SSE instead of WebSockets?

The alert system only requires:

```
Server → Client
```

communication.

SSE provides:

* simpler implementation
* browser support
* easier deployment

---

# Current Limitations

* SMS/WhatsApp notifications require external services
* social media ingestion requires external provider integration

---

Built as a civic technology prototype focused on transparent grievance handling.
