/**
 * Minimal Prometheus-format metrics. Avoids adding a dep — we only need
 * a few counters and a histogram. Endpoints register via `inc`/`observe`.
 */

interface Counter {
  type: "counter";
  help: string;
  values: Map<string, number>;
}

interface Histogram {
  type: "histogram";
  help: string;
  buckets: number[];
  values: Map<string, { counts: number[]; sum: number; count: number }>;
}

const counters = new Map<string, Counter>();
const histograms = new Map<string, Histogram>();

function labelKey(labels: Record<string, string>): string {
  const parts: string[] = [];
  for (const k of Object.keys(labels).sort()) parts.push(`${k}="${labels[k].replace(/"/g, "\\\"")}"`);
  return parts.join(",");
}

function ensureCounter(name: string, help: string): Counter {
  let c = counters.get(name);
  if (!c) {
    c = { type: "counter", help, values: new Map() };
    counters.set(name, c);
  }
  return c;
}

function ensureHist(name: string, help: string, buckets: number[]): Histogram {
  let h = histograms.get(name);
  if (!h) {
    h = { type: "histogram", help, buckets, values: new Map() };
    histograms.set(name, h);
  }
  return h;
}

export function inc(name: string, labels: Record<string, string> = {}, by = 1, help = ""): void {
  const c = ensureCounter(name, help || name);
  const k = labelKey(labels);
  c.values.set(k, (c.values.get(k) || 0) + by);
}

const DEFAULT_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120];

export function observe(name: string, value: number, labels: Record<string, string> = {}, help = ""): void {
  const h = ensureHist(name, help || name, DEFAULT_BUCKETS);
  const k = labelKey(labels);
  let entry = h.values.get(k);
  if (!entry) {
    entry = { counts: new Array(h.buckets.length).fill(0), sum: 0, count: 0 };
    h.values.set(k, entry);
  }
  for (let i = 0; i < h.buckets.length; i++) {
    if (value <= h.buckets[i]) entry.counts[i]++;
  }
  entry.sum += value;
  entry.count++;
}

/** Render Prometheus 0.0.4 text format. */
export function render(): string {
  const lines: string[] = [];
  for (const [name, c] of counters) {
    lines.push(`# HELP ${name} ${c.help}`);
    lines.push(`# TYPE ${name} counter`);
    for (const [k, v] of c.values) {
      lines.push(`${name}${k ? `{${k}}` : ""} ${v}`);
    }
  }
  for (const [name, h] of histograms) {
    lines.push(`# HELP ${name} ${h.help}`);
    lines.push(`# TYPE ${name} histogram`);
    for (const [k, entry] of h.values) {
      const baseLabels = k ? k : "";
      for (let i = 0; i < h.buckets.length; i++) {
        const labels = baseLabels ? `${baseLabels},le="${h.buckets[i]}"` : `le="${h.buckets[i]}"`;
        lines.push(`${name}_bucket{${labels}} ${entry.counts[i]}`);
      }
      const infLabels = baseLabels ? `${baseLabels},le="+Inf"` : `le="+Inf"`;
      lines.push(`${name}_bucket{${infLabels}} ${entry.count}`);
      lines.push(`${name}_sum${baseLabels ? `{${baseLabels}}` : ""} ${entry.sum}`);
      lines.push(`${name}_count${baseLabels ? `{${baseLabels}}` : ""} ${entry.count}`);
    }
  }
  return lines.join("\n") + "\n";
}

export function reset(): void {
  counters.clear();
  histograms.clear();
}

/** Express middleware: request count + latency by route/method/status. */
export function metricsMiddleware() {
  return (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const durSec = Number(process.hrtime.bigint() - start) / 1e9;
      const route = (req.route?.path as string) || req.path.replace(/\/[a-f0-9-]{36}/gi, "/:id");
      const labels = { method: req.method, route, status: String(res.statusCode) };
      inc("http_requests_total", labels, 1, "Total HTTP requests");
      observe("http_request_duration_seconds", durSec, labels, "HTTP request duration in seconds");
    });
    next();
  };
}
