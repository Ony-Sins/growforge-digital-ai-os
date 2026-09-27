import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outPath = path.resolve("header_calibrated_after.png");

if (fs.existsSync(chromePath)) {
  console.log("Using Chrome binary at:", chromePath);
  try {
    execSync(`"${chromePath}" --headless=new --screenshot="${outPath}" --window-size=1440,900 --virtual-time-budget=3000 http://127.0.0.1:3000`, {
      timeout: 15000,
    });
    console.log("Screenshot successfully saved to:", outPath);
    if (fs.existsSync(outPath)) {
      const stats = fs.statSync(outPath);
      console.log("Screenshot file size:", stats.size, "bytes");
    }
  } catch (err) {
    console.error("Chrome headless screenshot failed:", err.message);
  }
} else {
  console.log("Chrome executable not found at default path.");
}
