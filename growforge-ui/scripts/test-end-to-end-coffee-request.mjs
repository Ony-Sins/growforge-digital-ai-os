// End-to-end Nora Coffee Request test

async function run() {
  console.log("=================================================");
  console.log(" TESTING END-TO-END NORA COFFEE IMAGE GENERATION ");
  console.log("=================================================\n");

  const prompt = "Generate a photorealistic image of a steaming cup of coffee on a wooden table.";

  console.log(`[Step 1] Sending prompt to http://127.0.0.1:3000/api/router...`);
  console.log(`Prompt: "${prompt}"`);

  const startTime = Date.now();
  const res = await fetch("http://127.0.0.1:3000/api/router", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-authenticated-user": "anjum.ony96@gmail.com",
    },
    body: JSON.stringify({
      message: prompt,
    }),
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nHTTP Response status: ${res.status} (took ${duration}s)`);

  const data = await res.json();
  console.log("\nRouter response payload:");
  console.log("mode:", data.mode);
  console.log("content:", data.content);
  console.log("media:", JSON.stringify(data.media, null, 2));

  if (!res.ok || data.mode !== "image_gen") {
    console.error("❌ FAILED: Unexpected response mode or status.");
    process.exit(1);
  }

  if (!data.media || data.media.length === 0 || !data.media[0].url) {
    console.error("❌ FAILED: No media artifact returned in response.");
    process.exit(1);
  }

  console.log("\n[Step 2] Verifying generated media endpoint and file existence...");
  const mediaUrl = data.media[0].url;
  console.log("Media URL:", mediaUrl);

  const fullMediaUrl = `http://127.0.0.1:3000${mediaUrl}`;
  const mediaRes = await fetch(fullMediaUrl, {
    headers: {
      "x-authenticated-user": "anjum.ony96@gmail.com",
    },
  });

  console.log(`GET ${mediaUrl} -> Status: ${mediaRes.status}, Content-Type: ${mediaRes.headers.get("content-type")}`);
  if (!mediaRes.ok) {
    console.error(`❌ FAILED: Could not fetch image from ${fullMediaUrl}`);
    process.exit(1);
  }

  const imageBytes = Buffer.from(await mediaRes.arrayBuffer());
  console.log(`✓ Fetched genuine image artifact: ${imageBytes.length} bytes.`);

  console.log("\n=================================================");
  console.log(" END-TO-END NORA COFFEE IMAGE TEST PASSED (100%)");
  console.log("=================================================");
}

run().catch((err) => {
  console.error("❌ Test error:", err);
  process.exit(1);
});
