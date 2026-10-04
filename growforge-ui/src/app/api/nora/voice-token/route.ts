import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { isPublicPreviewMode } from "@/lib/previewMode";
import { ensureLocalVoice, localVoiceAllowed, LOCAL_VOICE_ROOM } from "@/lib/localVoiceServer";
import crypto from "node:crypto";

export const runtime = "nodejs";

/**
 * Creates a standard LiveKit JWT AccessToken for the local browser participant.
 * Uses local development key/secret (devkey/secret) or environment overrides.
 */
export async function POST(req: NextRequest) {
  if (isPublicPreviewMode() || !await localVoiceAllowed(req)) {
    return NextResponse.json(
      { error: "LiveKit local voice engine is unavailable in preview mode" },
      { status: 503 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    if (body.room && body.room !== LOCAL_VOICE_ROOM) return NextResponse.json({ error: "ROOM_MISMATCH" }, { status: 400 });
    await ensureLocalVoice();
    const roomName = LOCAL_VOICE_ROOM;
    const identity = "browser_user_" + crypto.randomUUID();
    const name = "Browser voice";

    const apiKey = process.env.LIVEKIT_API_KEY || "devkey";
    const apiSecret = process.env.LIVEKIT_API_SECRET || "secret";

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name,
      ttl: "10m",
    });
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();
    return NextResponse.json({ token, room: roomName, identity, url: "ws://127.0.0.1:7880" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Token generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
