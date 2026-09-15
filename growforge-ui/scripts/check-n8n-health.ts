import http from "node:http";

/**
 * n8n Health Check Helper (scripts/check-n8n-health.ts)
 * Probes the n8n health endpoint and reports connection status, latency, and setup instructions.
 */

async function checkN8nHealth(): Promise<{ ok: boolean; status?: number; latencyMs?: number; error?: string }> {
  const n8nHost = (process.env.N8N_HOST || "http://localhost:5678").replace(/\/$/, "");
  const targetUrl = `${n8nHost}/healthz`;
  const startTime = Date.now();

  return new Promise((resolve) => {
    try {
      const url = new URL(targetUrl);
      const req = http.get(
        {
          hostname: url.hostname,
          port: url.port || 5678,
          path: url.pathname,
          timeout: 4000,
        },
        (res) => {
          const latencyMs = Date.now() - startTime;
          resolve({
            ok: res.statusCode === 200,
            status: res.statusCode,
            latencyMs,
          });
        }
      );

      req.on("error", (err) => {
        resolve({
          ok: false,
          error: err.message,
          latencyMs: Date.now() - startTime,
        });
      });

      req.on("timeout", () => {
        req.destroy();
        resolve({
          ok: false,
          error: "Connection timed out after 4000ms",
        });
      });
    } catch (err) {
      resolve({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

async function main() {
  console.log("=== GrowForge OS: n8n Self-Hosted Health Check ===");
  const targetHost = process.env.N8N_HOST || "http://localhost:5678";
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
