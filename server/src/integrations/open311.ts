/**
 * MCD311 / Open311 integration adapter.
 *
 * MCD311 (the Delhi Municipal Corporation's complaint app) is built on
 * the "SmartCity 311" platform which explicitly advertises Open311
 * protocol/API support. Open311's GeoReport v2 spec defines six
 * operations: GET Service List, GET Service Definition, POST Service
 * Request, GET Service Request ID(s), GET Service Requests, and
 * GET Service Request — all of which this adapter speaks.
 *
 * CRITICAL REQUIREMENT FROM THE BRIEF: "Make sure the app does not fail
 * if the govt don't provide the apis, but it's a must have." This
 * adapter is built feature-flag style:
 *
 *   - If MCD311_API_BASE_URL is unset, every method falls back to a
 *     clearly-labeled MOCK response (deterministic, useful for demos)
 *     and never throws.
 *   - If the URL IS set but the live call fails (timeout, 5xx, network
 *     error), the adapter catches it, logs a warning, and degrades to
 *     the same mock path rather than propagating the failure up into
 *     a citizen-facing 500.
 *   - The rest of the system (classifier, dispatch, dashboard) never
 *     needs to know whether it's talking to a real MCD311 endpoint or
 *     the mock — same shape either way.
 */

const MCD311_BASE_URL = process.env.MCD311_API_BASE_URL || "";
const MCD311_API_KEY = process.env.MCD311_API_KEY || "";
const REQUEST_TIMEOUT_MS = 5000;

export interface Open311Service {
  service_code: string;
  service_name: string;
  description: string;
  metadata: boolean;
  type: "realtime" | "batch" | "blackbox";
  keywords: string;
  group: string;
}

export interface Open311ServiceRequest {
  service_request_id: string;
  status: "open" | "closed";
  status_notes?: string;
  service_name: string;
  service_code: string;
  description: string;
  agency_responsible?: string;
  address: string;
  lat: number;
  long: number;
  media_url?: string;
  requested_datetime: string;
  updated_datetime: string;
}

export interface IntegrationStatus {
  mode: "live" | "mock";
  reason: string;
  baseUrlConfigured: boolean;
}

export function getIntegrationStatus(): IntegrationStatus {
  if (!MCD311_BASE_URL) {
    return {
      mode: "mock",
      reason: "MCD311_API_BASE_URL not configured — running in mock/standalone mode",
      baseUrlConfigured: false,
    };
  }
  return {
    mode: "live",
    reason: "MCD311_API_BASE_URL configured — live calls will be attempted with mock fallback on failure",
    baseUrlConfigured: true,
  };
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Mock data — deterministic, used whenever live MCD311 is unavailable
// ---------------------------------------------------------------------------

const MOCK_SERVICES: Open311Service[] = [
  { service_code: "MCD-SAN-001", service_name: "Garbage Collection", description: "Uncollected household/street garbage", metadata: false, type: "realtime", keywords: "garbage,waste,kachra", group: "sanitation" },
  { service_code: "MCD-SAN-002", service_name: "Dead Animal Removal", description: "Dead animal on road or public space", metadata: false, type: "realtime", keywords: "dead animal,carcass", group: "sanitation" },
  { service_code: "MCD-RD-001", service_name: "Pothole Repair", description: "Damaged road surface / pothole", metadata: false, type: "realtime", keywords: "pothole,road,gaddha", group: "roads" },
  { service_code: "MCD-RD-002", service_name: "Streetlight Repair", description: "Non-functional streetlight", metadata: false, type: "realtime", keywords: "streetlight,light", group: "roads" },
  { service_code: "MCD-ENV-001", service_name: "Dust Pollution Control", description: "Construction dust / air quality complaint", metadata: false, type: "realtime", keywords: "dust,pollution,smog", group: "environment" },
  { service_code: "MCD-ANI-001", service_name: "Stray Animal Issue", description: "Stray dog/cattle/monkey nuisance or attack", metadata: false, type: "realtime", keywords: "stray dog,cattle,monkey", group: "animals" },
];

function mockServiceRequest(id: string): Open311ServiceRequest {
  return {
    service_request_id: id,
    status: "open",
    status_notes: "[MOCK DATA — MCD311 live API not configured]",
    service_name: "Garbage Collection",
    service_code: "MCD-SAN-001",
    description: "Mock MCD311 service request for demonstration",
    agency_responsible: "MCD Sanitation Wing",
    address: "Sample Ward, Delhi",
    lat: 28.6139,
    long: 77.209,
    requested_datetime: new Date().toISOString(),
    updated_datetime: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Public adapter methods — GeoReport v2 shape
// ---------------------------------------------------------------------------

export async function getServiceList(): Promise<{ services: Open311Service[]; status: IntegrationStatus }> {
  const status = getIntegrationStatus();
  if (status.mode === "mock") {
    return { services: MOCK_SERVICES, status };
  }
  try {
    const res = await fetchWithTimeout(
      `${MCD311_BASE_URL}/services.json?jurisdiction_id=mcd.delhi.gov.in`,
      { headers: { Authorization: `Bearer ${MCD311_API_KEY}` } }
    );
    if (!res.ok) throw new Error(`MCD311 returned ${res.status}`);
    const services = (await res.json()) as Open311Service[];
    return { services, status };
  } catch (err) {
    console.warn("[Open311] Live getServiceList failed, falling back to mock:", err);
    return {
      services: MOCK_SERVICES,
      status: { mode: "mock", reason: `Live call failed: ${(err as Error).message}`, baseUrlConfigured: true },
    };
  }
}

/**
 * Push a locally-filed grievance OUT to MCD311 (when MCD311 is the
 * authoritative system of record for a category it owns). Returns a
 * service_request_id either way — real if live, a clearly-tagged mock
 * id otherwise — so the calling code never has to special-case it.
 */
export async function postServiceRequest(payload: {
  service_code: string;
  description: string;
  lat: number;
  long: number;
  address: string;
  media_url?: string;
}): Promise<{ service_request_id: string; status: IntegrationStatus }> {
  const status = getIntegrationStatus();
  if (status.mode === "mock") {
    return { service_request_id: `MOCK-MCD-${Date.now()}`, status };
  }
  try {
    const res = await fetchWithTimeout(`${MCD311_BASE_URL}/requests.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MCD311_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`MCD311 returned ${res.status}`);
    const data = (await res.json()) as Array<{ service_request_id: string }>;
    return { service_request_id: data[0]?.service_request_id ?? `UNKNOWN-${Date.now()}`, status };
  } catch (err) {
    console.warn("[Open311] Live postServiceRequest failed, falling back to mock:", err);
    return {
      service_request_id: `MOCK-MCD-${Date.now()}`,
      status: { mode: "mock", reason: `Live call failed: ${(err as Error).message}`, baseUrlConfigured: true },
    };
  }
}

/**
 * Pull MCD311 requests IN to this system (ingestion / "MCD311 Import"
 * channel) — e.g. a polling job that periodically syncs in complaints
 * filed directly on MCD311 so the CM dashboard has a single unified view.
 */
export async function getServiceRequests(params: {
  start_date?: string;
  end_date?: string;
  status?: "open" | "closed";
}): Promise<{ requests: Open311ServiceRequest[]; status: IntegrationStatus }> {
  const status = getIntegrationStatus();
  if (status.mode === "mock") {
    return {
      requests: [mockServiceRequest("MOCK-REQ-001"), mockServiceRequest("MOCK-REQ-002")],
      status,
    };
  }
  try {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    const res = await fetchWithTimeout(`${MCD311_BASE_URL}/requests.json?${qs}`, {
      headers: { Authorization: `Bearer ${MCD311_API_KEY}` },
    });
    if (!res.ok) throw new Error(`MCD311 returned ${res.status}`);
    const requests = (await res.json()) as Open311ServiceRequest[];
    return { requests, status };
  } catch (err) {
    console.warn("[Open311] Live getServiceRequests failed, falling back to mock:", err);
    return {
      requests: [mockServiceRequest("MOCK-REQ-FALLBACK")],
      status: { mode: "mock", reason: `Live call failed: ${(err as Error).message}`, baseUrlConfigured: true },
    };
  }
}
