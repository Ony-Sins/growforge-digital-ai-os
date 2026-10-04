import fs from "node:fs";
import path from "node:path";

function getAllFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

const clientDir = path.resolve("dist/client");
const clientFiles = getAllFiles(clientDir);

console.log(`=== AUDITING BETA CLIENT BUNDLE (${clientFiles.length} files in dist/client) ===`);

const forbiddenNeedles = [
  "Custom Endpoint",
  "Omniroute",
  "DeepSeek",
  "Mistral",
  "Higgsfield",
  "DALL-E",
  "Imagen",
  "Local Ollama",
  "http://localhost:11434",
  "http://127.0.0.1:8188",
  "http://127.0.0.1:5678",
  "anjum.ony96@gmail.com",
  "Systems Architect & B2B Automation",
  "user_memories.json",
];

let totalViolations = 0;

for (const file of clientFiles) {
  const relPath = path.relative(".", file);
  const content = fs.readFileSync(file, "utf8");

  for (const needle of forbiddenNeedles) {
    if (content.includes(needle)) {
      console.error(`❌ LEAK DETECTED in ${relPath}: found forbidden needle "${needle}"`);
      totalViolations++;
    }
  }
}

if (totalViolations === 0) {
  console.log("✓ 100% CLEAN: Zero forbidden provider/internal/owner needles found across all client bundle files.");
} else {
  console.error(`⚠️ Found ${totalViolations} violations in client bundle!`);
  process.exit(1);
}
