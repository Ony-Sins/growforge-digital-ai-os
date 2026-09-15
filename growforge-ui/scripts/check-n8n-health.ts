/**
 * n8n Health Check Helper (scripts/check-n8n-health.ts)
 * Probes the n8n health endpoint and reports connection status, latency, and setup instructions.
 */

async function checkN8nHealth(): Promise<{ ok: boolean; status?: number; latencyMs?: number; error?: string }> {
  const n8nHost = (process.env.N8N_HOST || "http://127.0.0.1:5678").replace(/\/$/, "");
  const targetUrl = `${n8nHost}/healthz`;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    const latencyMs = Date.now() - startTime;
    return {
      ok: res.ok,
      status: res.status,
      latencyMs,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      error: isTimeout ? "Connection timed out after 4000ms" : err instanceof Error ? err.message : String(err),
      latencyMs,
    };
  }
}

async function main() {
  console.log("=== GrowForge OS: n8n Self-Hosted Health Check ===");
  const targetHost = process.env.N8N_HOST || "http://127.0.0.1:5678";
  console.log(`Probing n8n instance at: ${targetHost}/healthz ...\n`);

  const result = await checkN8nHealth();

  if (result.ok) {
    console.log(`✅ n8n is ONLINE & HEALTHY!`);
    console.log(`   - HTTP Status: ${result.status}`);
    console.log(`   - Latency: ${result.latencyMs}ms`);
    console.log(`   - Webhook Base: ${targetHost}`);
  } else {
    console.log(`⚠️ n8n is currently OFFLINE or UNREACHABLE.`);
    console.log(`   - Error: ${result.error ?? `HTTP Status ${result.status}`}`);
    console.log(`\n📋 Setup & Startup Instructions:`);
    console.log(`   1. If using Docker:`);
    console.log(`      docker compose -f docker/n8n/docker-compose.yml up -d`);
    console.log(`   2. If using npm/standalone:`);
    console.log(`      npx n8n`);
    console.log(`   3. After starting, visit ${targetHost} to create your admin account and generate an API key in Settings → n8n API.`);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { checkN8nHealth };
