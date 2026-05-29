import { Router } from "express";
import { render } from "../lib/metrics.ts";
import { jobs } from "../lib/jobs.ts";
import { resultCache } from "../lib/cache.ts";
import { browserPoolStats } from "../lib/browser.ts";

export const metricsRouter: Router = Router();

metricsRouter.get("/metrics", (_req, res) => {
  // Inject some live gauges before rendering the registry.
  const cacheStats = resultCache.stats();
  const pool = browserPoolStats();
  const jobCounts = {
    queued: 0,
    running: 0,
    complete: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const j of jobs.list()) jobCounts[j.status]++;
  const live = [
    `# HELP convert_api_jobs_state Jobs by current state`,
    `# TYPE convert_api_jobs_state gauge`,
    ...Object.entries(jobCounts).map(([k, v]) => `convert_api_jobs_state{state="${k}"} ${v}`),
    `# HELP convert_api_cache_bytes Cache memory usage in bytes`,
    `# TYPE convert_api_cache_bytes gauge`,
    `convert_api_cache_bytes ${cacheStats.memBytes}`,
    `# HELP convert_api_cache_entries Cache entries in memory`,
    `# TYPE convert_api_cache_entries gauge`,
    `convert_api_cache_entries ${cacheStats.entries}`,
    `# HELP convert_api_browser_active Active browser pages`,
    `# TYPE convert_api_browser_active gauge`,
    `convert_api_browser_active ${pool.active}`,
    `# HELP convert_api_browser_queued Browser-slot queue depth`,
    `# TYPE convert_api_browser_queued gauge`,
    `convert_api_browser_queued ${pool.queued}`,
  ].join("\n");
  res.setHeader("content-type", "text/plain; version=0.0.4");
  res.send(live + "\n" + render());
});
