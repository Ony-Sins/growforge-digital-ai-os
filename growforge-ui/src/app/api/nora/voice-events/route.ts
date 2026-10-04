import { NextRequest } from "next/server";
import { isPublicPreviewMode } from "@/lib/previewMode";
import fs from "fs";
import path from "path";
import { localVoiceAllowed } from "@/lib/localVoiceServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getLocalBridgeKey(): string {
  if (process.env.GROWFORGE_BRIDGE_KEY) {
    return process.env.GROWFORGE_BRIDGE_KEY.trim();
  }
  if (process.env.GROWFORGE_INTERNAL_KEY) {
    return process.env.GROWFORGE_INTERNAL_KEY.trim();
  }
  try {
    const keyPath = path.resolve(process.cwd(), "..", "voice-agent", ".bridge_key");
    if (fs.existsSync(keyPath)) {
      return fs.readFileSync(keyPath, "utf-8").trim();
    }
  } catch {
    // Ignore filesystem read errors in non-local environments
  }
  return "growforge_local_dev_secret";
}

/**
 * Same-Origin SSE stream proxy for Desktop Bridge voice state events.
 * Relays read-only voice state (listening/thinking/speaking/energy) from local Desktop Bridge
 * using server-side loopback authentication (X-GrowForge-Bridge-Key).
 * Zero credentials in client URLs, query params, or browser history.
 * Strictly disabled in Public Preview, Beta Web, and Remote SaaS deployments.
 */
export async function GET(req: NextRequest) {
  // 1. Strict Environment Guard: Local Desktop only
  if (isPublicPreviewMode() || !await localVoiceAllowed(req)) {
    return new Response(
      JSON.stringify({ error: "Desktop bridge event streaming is unavailable in preview/remote environments" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const bridgeKey = getLocalBridgeKey();

  try {
    const upstreamRes = await fetch("http://127.0.0.1:7890/voice/events", {
      headers: {
        "X-GrowForge-Bridge-Key": bridgeKey,
        "Accept": "text/event-stream",
      },
      cache: "no-store",
      signal: req.signal,
    });

    if (!upstreamRes.ok || !upstreamRes.body) {
      return new Response(
        JSON.stringify({ error: `Desktop bridge offline or unauthorized (Status: ${upstreamRes.status})` }),
        { status: upstreamRes.status || 503, headers: { "Content-Type": "application/json" } }
      );
    }

    // Stream read-only SSE events directly to client
    const transformStream = new TransformStream();
    upstreamRes.body.pipeTo(transformStream.writable).catch(() => {
      // Upstream closed cleanly
    });

    return new Response(transformStream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Desktop bridge connection failed" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}
