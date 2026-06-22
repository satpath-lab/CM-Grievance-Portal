/**
 * Server-Sent Events (SSE) alert manager.
 *
 * When a life-threatening grievance is filed, this module pushes
 * an instant notification to all connected CM and CMO team clients.
 * No WebSocket library needed — SSE is built into Node/Express
 * and supported in every browser. One-directional (server → client)
 * is all we need for alerts.
 *
 * Clients connect via GET /api/alerts/stream and keep the connection
 * open. Reconnect with exponential backoff is handled automatically
 * by the browser's EventSource API.
 */

import { Response } from "express";

interface AlertClient {
  id: string;
  res: Response;
  role: string;
}

const clients = new Map<string, AlertClient>();

export function addAlertClient(id: string, res: Response, role: string): void {
  clients.set(id, { id, res, role });
  res.on("close", () => clients.delete(id));
}

export interface AlertPayload {
  type: "life_threatening" | "critical_batch" | "sla_breach" | "system";
  grvId?: string;
  category?: string;
  district?: string;
  priority?: string;
  message: string;
  messageHi?: string; // Hindi version of the message
  timestamp: string;
}

/** Push an alert to all CM and CMO team clients. */
export function pushAlert(payload: AlertPayload): void {
  const data = JSON.stringify(payload);
  for (const client of clients.values()) {
    if (["cm", "cmo_team", "super_admin"].includes(client.role)) {
      try {
        client.res.write(`data: ${data}\n\n`);
      } catch {
        clients.delete(client.id);
      }
    }
  }
}

/** Push a life-threatening alert immediately when a Critical + isLifeThreatening grievance is filed. */
export function pushLifeThreateningAlert(
  grvId: string,
  category: string,
  district: string,
  descriptionSnippet: string
): void {
  pushAlert({
    type: "life_threatening",
    grvId,
    category,
    district,
    priority: "Critical",
    message: `Life-threatening complaint filed — ${grvId}: ${category} in ${district}. "${descriptionSnippet.slice(0, 80)}..."`,
    messageHi: `जीवन-घातक शिकायत दर्ज — ${grvId}: ${district} में ${category}। तत्काल कार्रवाई आवश्यक।`,
    timestamp: new Date().toISOString(),
  });
}

export function getConnectedClientCount(): number {
  return clients.size;
}
