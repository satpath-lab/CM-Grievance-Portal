/**
 * SLA & escalation calculator.
 *
 * Modeled on Madhya Pradesh's CM Helpline 181 — the most-cited success
 * story in Indian grievance redressal — which uses a four-level
 * escalation hierarchy (L1 field officer → L2 supervisor → L3
 * department head → L4 district/CMO) with automatic promotion if a
 * level fails to act in time, rather than a single fixed deadline.
 */

export type SeverityTier = "Critical" | "High" | "Normal";
export type EscalationLevel = "L1" | "L2" | "L3" | "L4";

interface SlaConfig {
  totalHours: number;
  l1Hours: number; // time before L1 -> L2 auto-escalation
  l2Hours: number; // time before L2 -> L3
  l3Hours: number; // time before L3 -> L4 (CMO)
}

const SLA_BY_SEVERITY: Record<SeverityTier, SlaConfig> = {
  // Critical: life-threatening / hazard. Very tight windows.
  Critical: { totalHours: 6, l1Hours: 1, l2Hours: 2, l3Hours: 3 },
  High: { totalHours: 48, l1Hours: 12, l2Hours: 24, l3Hours: 36 },
  Normal: { totalHours: 96, l1Hours: 36, l2Hours: 60, l3Hours: 80 },
};

export function getSlaConfig(severity: SeverityTier): SlaConfig {
  return SLA_BY_SEVERITY[severity];
}

export function computeDueDate(filedAt: Date, severity: SeverityTier): Date {
  const cfg = getSlaConfig(severity);
  return new Date(filedAt.getTime() + cfg.totalHours * 3600 * 1000);
}

/**
 * Given when a grievance was filed and its current severity, determine
 * which escalation level it should currently be at, based on elapsed
 * time — this is what a scheduled job uses to auto-promote stale
 * grievances rather than waiting for a human to notice.
 */
export function computeCurrentEscalationLevel(
  filedAt: Date,
  severity: SeverityTier,
  now: Date = new Date()
): EscalationLevel {
  const cfg = getSlaConfig(severity);
  const elapsedHours = (now.getTime() - filedAt.getTime()) / 3600000;

  if (elapsedHours >= cfg.l3Hours) return "L4";
  if (elapsedHours >= cfg.l2Hours) return "L3";
  if (elapsedHours >= cfg.l1Hours) return "L2";
  return "L1";
}

export function isSlaBreached(
  filedAt: Date,
  severity: SeverityTier,
  now: Date = new Date()
): boolean {
  return now.getTime() > computeDueDate(filedAt, severity).getTime();
}

export function hoursRemaining(
  filedAt: Date,
  severity: SeverityTier,
  now: Date = new Date()
): number {
  const due = computeDueDate(filedAt, severity);
  return Math.round(((due.getTime() - now.getTime()) / 3600000) * 10) / 10;
}
