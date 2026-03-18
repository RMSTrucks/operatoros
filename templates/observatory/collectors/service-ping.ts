/**
 * Service Ping Collector — monitors HTTP services for up/down status.
 *
 * Pings a list of configured URLs and reports response time,
 * up/down status, and optional health data from JSON responses.
 *
 * Configure SERVICES below to match your environment.
 */

import { m } from "../common";
import type { CollectorResult } from "../types";

const SOURCE = "service_ping";

// ---------------------------------------------------------------------------
// Configure your services here
// ---------------------------------------------------------------------------

interface ServiceCheck {
  /** Display name for this service. */
  name: string;
  /** URL to check. */
  url: string;
  /** HTTP method (default: GET). */
  method?: "GET" | "POST";
  /** Request body for POST requests. */
  body?: Record<string, unknown>;
  /** Timeout in ms (default: 5000). */
  timeout?: number;
  /** Headers to include. */
  headers?: Record<string, string>;
}

const SERVICES: ServiceCheck[] = [
  // Add your services here. Examples:
  // { name: "api", url: "http://localhost:3000/health" },
  // { name: "frontend", url: "http://localhost:8080" },
  // { name: "database-proxy", url: "http://localhost:5432", timeout: 2000 },
];

// ---------------------------------------------------------------------------
// Service checker
// ---------------------------------------------------------------------------

async function checkService(
  svc: ServiceCheck,
): Promise<{ up: boolean; response_ms: number; status_code: number; data: unknown }> {
  const start = Date.now();
  const timeout = svc.timeout || 5000;

  try {
    const headers: Record<string, string> = { ...svc.headers };
    if (svc.body) {
      headers["Content-Type"] = "application/json";
    }

    const resp = await fetch(svc.url, {
      method: svc.method || "GET",
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: svc.body ? JSON.stringify(svc.body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });

    const elapsed = Date.now() - start;
    let data: unknown = null;

    // Try to parse JSON response for health details
    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("json")) {
      try {
        data = await resp.json();
      } catch {}
    }

    return {
      up: resp.ok,
      response_ms: elapsed,
      status_code: resp.status,
      data,
    };
  } catch {
    return {
      up: false,
      response_ms: Date.now() - start,
      status_code: 0,
      data: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Collector
// ---------------------------------------------------------------------------

export async function collect(): Promise<CollectorResult> {
  const metrics: CollectorResult["metrics"] = [];
  const snapshot: Record<string, unknown> = {
    collected_at: new Date().toISOString(),
  };

  if (SERVICES.length === 0) {
    return {
      source: SOURCE,
      metrics: [m(SOURCE, "services_configured", 0)],
      snapshot: {
        collected_at: new Date().toISOString(),
        summary: "No services configured. Edit collectors/service-ping.ts to add services.",
      },
    };
  }

  // Check all services in parallel
  const results = await Promise.all(
    SERVICES.map(async (svc) => {
      const result = await checkService(svc);
      return { svc, ...result };
    }),
  );

  let upCount = 0;
  let downCount = 0;
  let maxResponseMs = 0;

  for (const { svc, up, response_ms, status_code, data } of results) {
    metrics.push(m(SOURCE, `service_up_${svc.name}`, up ? 1 : 0));
    metrics.push(m(SOURCE, `response_ms_${svc.name}`, response_ms));

    if (up) {
      upCount++;
    } else {
      downCount++;
    }

    if (response_ms > maxResponseMs) maxResponseMs = response_ms;

    snapshot[svc.name] = {
      up,
      response_ms,
      status_code,
      data: data || undefined,
    };
  }

  metrics.push(m(SOURCE, "services_up", upCount));
  metrics.push(m(SOURCE, "services_down", downCount));
  metrics.push(m(SOURCE, "services_configured", SERVICES.length));
  metrics.push(m(SOURCE, "max_response_ms", maxResponseMs));

  const downServices = results.filter((r) => !r.up).map((r) => r.svc.name);
  snapshot.summary =
    downCount === 0
      ? `All ${SERVICES.length} services up.`
      : `${upCount}/${SERVICES.length} up. DOWN: ${downServices.join(", ")}`;

  return { source: SOURCE, metrics, snapshot };
}
