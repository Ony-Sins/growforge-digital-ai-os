import { NextResponse } from "next/server";

export const runtime = "nodejs";

const startTime = Date.now();

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "growforge-backend",
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  });
}
