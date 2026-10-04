import fs from "node:fs";

const envPath = "C:/Users/USERAS/.growforge/cf-beta.env";
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => {
      const idx = l.indexOf("=");
      const val = l.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      return [l.slice(0, idx), val];
    })
);

process.env.UPSTASH_REDIS_REST_URL = env.UPSTASH_REDIS_REST_URL;
process.env.UPSTASH_REDIS_REST_TOKEN = env.UPSTASH_REDIS_REST_TOKEN;
process.env.OWNER_EMAILS = env.OWNER_EMAILS;

const store = await import("../src/lib/beta/store");

async function run() {
  console.log("=== UPSTASH BETA REAL AUDIT ===");
  const testers = await store.listTesters();
  console.log(`Total Testers in Store: ${testers.length}`);
  testers.forEach((t) => {
    console.log(` - Email: [masked: ${t.email.slice(0, 3)}***] | Status: ${t.status} | SessionVersion: ${t.sessionVersion} | ActivatedAt: ${t.activatedAt || "never"}`);
  });

  // Query raw redis for all keys
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;

  async function redisCmd(cmd: any[]) {
    const res = await fetch(`${url}/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cmd),
    });
    const data: any = await res.json();
    return data.result;
  }

  const allKeys: string[] = await redisCmd(["KEYS", "growforge:beta:v2:*"]);
  console.log(`\nTotal Redis Keys in Beta Namespace: ${allKeys.length}`);
  for (const k of allKeys.sort()) {
    const type = await redisCmd(["TYPE", k]);
    console.log(` - [${type}] ${k}`);
  }

  const convKeys = allKeys.filter((k) => k.includes(":conv:"));
  const feedbackKeys = allKeys.filter((k) => k.includes(":feedback:"));
  const testerKeys = allKeys.filter((k) => k.startsWith("growforge:beta:v2:tester:"));

  console.log("\n=== VERIFICATION SUMMARY ===");
  console.log(`Tester Records: ${testerKeys.length}`);
  console.log(`Active Conversations: ${convKeys.length}`);
  console.log(`Feedback Records: ${feedbackKeys.length}`);
  console.log("Clean verification complete.");
}

run().catch(console.error);
