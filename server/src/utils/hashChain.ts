/**
 * Tamper-evident audit chain.
 *
 * Every status change on a grievance is hashed together with the hash
 * of the previous event for that grievance, forming a per-grievance
 * hash chain (same principle as a blockchain's block-linking, applied
 * to a single document's history instead of a distributed ledger).
 *
 * Why this matters: a department officer with database access could,
 * in principle, quietly edit a status_log entry after the fact to
 * cover up a false closure or reroute blame. Hash-chaining means any
 * retroactive edit breaks the chain from that point forward, which
 * the integrity-check endpoint (/api/audit/verify/:grvId) detects.
 * This is not cryptographic non-repudiation against a malicious DB
 * admin who controls the whole chain, but it is real protection
 * against casual tampering and gives auditors a clear "chain broken
 * at event N" signal to investigate, which Indian municipal grievance
 * systems currently have no equivalent of.
 */

import crypto from "crypto";

export interface ChainableEvent {
  grvId: string;
  status: string;
  note: string;
  actorId: string;
  actorRole: string;
  timestamp: string; // ISO string
  prevHash: string; // hash of the previous event, or "GENESIS" for the first
}

export function computeEventHash(event: ChainableEvent): string {
  const payload = [
    event.grvId,
    event.status,
    event.note,
    event.actorId,
    event.actorRole,
    event.timestamp,
    event.prevHash,
  ].join("|");

  return crypto.createHash("sha256").update(payload).digest("hex");
}

export const GENESIS_HASH = "GENESIS";

/**
 * Verifies an ordered list of audit events (oldest first) forms a valid
 * unbroken chain. Returns the index of the first break, or -1 if intact.
 */
export function verifyChain(
  events: Array<ChainableEvent & { hash: string }>
): number {
  let expectedPrev = GENESIS_HASH;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.prevHash !== expectedPrev) return i;
    const recomputed = computeEventHash({
      grvId: e.grvId,
      status: e.status,
      note: e.note,
      actorId: e.actorId,
      actorRole: e.actorRole,
      timestamp: e.timestamp,
      prevHash: e.prevHash,
    });
    if (recomputed !== e.hash) return i;
    expectedPrev = e.hash;
  }
  return -1;
}
