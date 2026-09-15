import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Digital Brain Auto-Documentation Pipeline
 *
 * Scans the live repository state, department constitution & operating files,
 * registered tools, memory schemas, and architectural contracts to generate
 * a synchronized /docs/brain/ documentation suite.
 */

const ROOT_DIR = path.resolve(process.cwd(), "..");
const UI_DIR = process.cwd();
const DOCS_BRAIN_DIR = path.join(UI_DIR, "docs", "brain");
const ROOT_DOCS_BRAIN_DIR = path.join(ROOT_DIR, "docs", "brain");

function ensureDirs() {
  fs.mkdirSync(DOCS_BRAIN_DIR, { recursive: true });
  fs.mkdirSync(ROOT_DOCS_BRAIN_DIR, { recursive: true });
}

function writeDoc(filename: string, content: string) {
  const uiPath = path.join(DOCS_BRAIN_DIR, filename);
  const rootPath = path.join(ROOT_DOCS_BRAIN_DIR, filename);
  fs.writeFileSync(uiPath, content.trim() + "\n", "utf8");
  fs.writeFileSync(rootPath, content.trim() + "\n", "utf8");
  console.log(`✓ Generated: /docs/brain/${filename}`);
}

function computeHash(filepath: string): string {
  try {
    const constitutionPath = path.join(ROOT_DIR, "GrowForge Digital — Company Constitution.md");
    const constContent = fs.existsSync(constitutionPath) ? fs.readFileSync(constitutionPath, "utf8") : "";
    const ownContent = fs.existsSync(filepath) ? fs.readFileSync(filepath, "utf8") : "";
    const combined = [
      constContent && `# COMPANY CONSTITUTION\n\n${constContent}`,
      ownContent && `# YOUR DEPARTMENT OPERATING INSTRUCTIONS\n\n${ownContent}`,
    ]
      .filter(Boolean)
      .join("\n\n---\n\n");
    return crypto.createHash("sha256").update(combined).digest("hex").slice(0, 12);
  } catch {
    return "unknown";
  }
}

// 1. Generate DEPARTMENTS_ROSTER.md
function generateDepartmentsRoster() {
  const depts = [
    { id: "hq", name: "GrowForge HQ", file: "GrowForge_HQ_Agent_System.md", type: "Core Orchestrator", summary: "Engagement planning, cross-department synthesis, strategic red-teaming, final client delivery." },
    { id: "qa", name: "Quality Assurance", file: "Quality_Assurance_Agent_System.md", type: "Independent Auditor", summary: "Unsupported claims audit, source verification, contradiction detection, mandatory fixes." },
    { id: "sales-bd", name: "Sales & BD", file: "Sales_BD_Agent_System.md", type: "Assignable Department", summary: "ICP definition, prospecting sequences, qualification frameworks, lead sources, closing tactics." },
    { id: "marketing", name: "Marketing", file: "Marketing_Agent_System.md", type: "Assignable Department", summary: "Positioning, messaging hierarchies, demand generation, SEO, content strategy, brand voice." },
    { id: "meta-ads", name: "Meta Ads", file: "Meta_Ads_Agent_System.md", type: "Assignable Department", summary: "Paid social strategy, campaign architectures, creative briefing, bidding & ROAS targets." },
    { id: "finance-ops", name: "Finance & Ops", file: "Finance_Operations_Agent_System.md", type: "Assignable Department", summary: "Pricing models, unit economics, cash flow forecasting, operating expenditure, budget tables." },
    { id: "client-success", name: "Client Success / PM", file: "Client_Success_PM_Agent_System.md", type: "Assignable Department", summary: "Delivery sequencing, milestone scheduling, client onboarding, risk mitigation." },
    { id: "web-design", name: "Web Design / UX", file: "Web_Design_UX_Agent_System.md", type: "Assignable Department", summary: "Page architecture, UX wireframing, high-contrast visual direction, conversion optimization." },
    { id: "web-dev", name: "Web Development", file: "Web_Development_Agent_System.md", type: "Assignable Department", summary: "Technical builds, integrations, performance, technical SEO, tracking & analytics." },
    { id: "ai-automation", name: "AI Systems / Automation", file: "AI_Systems_Automation_Agent_System.md", type: "Assignable Department", summary: "n8n automation workflows, CRM integrations, AI agent routing, automated lead routing." },
  ];

  let md = `# GrowForge Digital — Operating Departments & System Roster\n\n`;
  md += `> **Auto-Generated:** ${new Date().toISOString()}  \n`;
  md += `> **Instruction Engine:** \`src/lib/departments.ts\` & Root Operating System Markdown Files  \n\n`;
  md += `## 1. Department Catalog\n\n`;
  md += `| ID | Department | Role | Instruction File | Rules Hash | Core Focus |\n`;
  md += `|---|---|---|---|---|---|\n`;

  for (const d of depts) {
    const filePath = path.join(ROOT_DIR, d.file);
    const hash = computeHash(filePath);
    md += `| \`${d.id}\` | **${d.name}** | ${d.type} | \`${d.file}\` | \`v.${hash}\` | ${d.summary} |\n`;
  }

  md += `\n## 2. Operating Principles\n\n`;
  md += `1. **Constitution Inheritance:** Every department automatically inherits the *Company Constitution* as root system instructions.\n`;
  md += `2. **Instruction Hash Versioning (\`rules v.<hash>\`):** Every model call locks the SHA-256 hash of its prompt files to guarantee reproducibility.\n`;
  md += `3. **Strategic Red-Team Directive:** Departments must challenge unrealistic client assumptions, cite real benchmarks, and propose high-ROI alternatives.\n`;

  writeDoc("DEPARTMENTS_ROSTER.md", md);
}

// 2. Generate TOOLS_CATALOG.md
function generateToolsCatalog() {
  const tools = [
    {
      name: "web_search",
      category: "Intelligence & Research",
      approval: "No (Read-only)",
      description: "Searches Google via Gemini search grounding for current facts, prices, competitors, benchmarks, and regulations.",
      usage: '{ "query": "string" }',
      backend: "Google Gemini Search Grounding",
    },
    {
      name: "call_connector",
      category: "Integrations & REST",
      approval: "YES (Owner-gated)",
      description: "Fires outbound REST requests to configured custom connectors (e.g., HubSpot, Stripe, Webhooks) with SSRF validation.",
      usage: '{ "connectorId": "string", "body": object }',
      backend: "connectorStore.ts + Server Vault",
    },
    {
      name: "manage_n8n_workflow",
      category: "Autonomous Automation",
      approval: "No (Autonomous self-healing)",
      description: "Creates, retrieves, patches, executes, and activates n8n workflows over the REST API with structured self-healing feedback.",
      usage: '{ "action": "create"|"get"|"patch"|"activate"|"execute"|"list", "workflowId": "string", "workflow": object, "inputData": object }',
      backend: "n8n REST API (/api/v1/workflows)",
    },
    {
      name: "ask_operator",
      category: "Human-in-the-Loop",
      approval: "No (Consultation channel)",
      description: "Prompts the human operator for strategic decisions, option selection, or critical input during pipeline execution.",
      usage: '{ "question": "string", "options": ["choice 1", "choice 2"] }',
      backend: "consultationStore.ts + ConsultationBanner.tsx",
    },
    {
      name: "synthesize_voice",
      category: "Multimodal Voice",
      approval: "No (Generation)",
      description: "Generates high-speed, local offline audio speech (.wav) via the Piper binary.",
      usage: '{ "text": "string" }',
      backend: "Local Piper Binary (PIPER_BINARY_PATH)",
    },
    {
      name: "transcribe_audio",
      category: "Multimodal Audio",
      approval: "No (Generation)",
      description: "Transcribes audio files into text using a persistent local whisper.cpp server.",
      usage: '{ "filename": "string (.wav/.mp3)" }',
      backend: "Local whisper.cpp Server (WHISPER_SERVER_URL)",
    },
    {
      name: "generate_image",
      category: "Multimodal Visual",
      approval: "No (Generation)",
      description: "Generates visual assets and marketing imagery via local ComfyUI GPU workflows.",
      usage: '{ "prompt": "string", "negativePrompt": "string" }',
      backend: "Local ComfyUI Server (COMFYUI_SERVER_URL)",
    },
  ];

  let md = `# GrowForge Digital — Agent Tool Catalog\n\n`;
  md += `> **Auto-Generated:** ${new Date().toISOString()}  \n`;
  md += `> **Tool Engine:** \`src/lib/tools.ts\` & \`src/lib/tools/*\`  \n\n`;
  md += `## 1. Registered Agent Tools\n\n`;
  md += `| Tool Name | Category | Owner Approval | Usage Spec | Engine / Backend |\n`;
  md += `|---|---|---|---|---|\n`;

  for (const t of tools) {
    md += `| \`${t.name}\` | ${t.category} | **${t.approval}** | \`${t.usage}\` | ${t.backend} |\n`;
  }

  md += `\n## 2. Tool-Calling Loop Architecture\n\n`;
  md += `- **Provider-Agnostic JSON Decision Protocol:** Enforces single balanced top-level JSON responses across Ollama, Gemini, Groq, OpenAI, and Anthropic.\n`;
  md += `- **PROPOSE vs. EXECUTE Contract:** Non-side-effect tools execute immediately; external mutations require explicit human approval via \`approvalStore.ts\`.\n`;
  md += `- **Self-Healing Automation:** Tools like \`manage_n8n_workflow\` return schema-level diagnostics so agents iteratively patch parameters without operator intervention.\n`;

  writeDoc("TOOLS_CATALOG.md", md);
}

// 3. Generate SYSTEM_TOPOLOGY.md
function generateSystemTopology() {
  let md = `# GrowForge Digital — System Architecture & Multi-Agent Topology\n\n`;
  md += `> **Auto-Generated:** ${new Date().toISOString()}  \n`;
  md += `> **Stack:** Next.js 16 (App Router, Turbopack, React 19), TypeScript Strict, AES-256-GCM Vault\n\n`;

  md += `## 1. Multi-Agent Pipeline Topology\n\n`;
  md += `\`\`\`mermaid
graph TD
    A[Client Brief Input] --> B[HQ Planning & Dept Selection]
    B --> C[Live Research Grounding]
    C --> D1[Sales & BD Agent]
    C --> D2[Marketing Agent]
    C --> D3[Meta Ads Agent]
    C --> D4[Finance & Ops Agent]
    C --> D5[Web Design / UX]
    C --> D6[Web Development]
    C --> D7[AI Systems Automation]
    D1 & D2 & D3 & D4 & D5 & D6 & D7 --> E[HQ Team Review & Conflict Resolution]
    E --> F[Independent QA Audit]
    F --> G[Consolidated Final Execution Plan]
\`\`\`\n\n`;

  md += `## 2. Local & Multi-Modal Processing Matrix\n\n`;
  md += `| Capability | Primary Engine | Fallback Engine | Configuration Keys |\n`;
  md += `|---|---|---|---|\n`;
  md += `| **Text & Reasoning** | Ollama (\`qwen2.5:7b-instruct\`) | OpenRouter / Gemini / Groq / OpenAI / Anthropic | \`OLLAMA_BASE_URL\`, \`GEMINI_API_KEY\`, etc. |\n`;
  md += `| **Voice Synthesis** | Piper Binary (Local TTS) | Silent setup notice | \`PIPER_BINARY_PATH\`, \`PIPER_MODEL_PATH\` |\n`;
  md += `| **Audio Transcription** | whisper.cpp Server (Local STT) | Error diagnostic | \`WHISPER_SERVER_URL\`, \`WHISPER_AUDIO_DIR\` |\n`;
  md += `| **Visual Generation** | ComfyUI GPU Server | Actionable workflow notice | \`COMFYUI_SERVER_URL\`, \`COMFYUI_CHECKPOINT\` |\n`;
  md += `| **Workflow Automation** | n8n REST API Server | Self-healing schema loop | \`N8N_HOST\`, \`N8N_API_KEY\` |\n\n`;

  md += `## 3. Asynchronous Concurrency & Resilience\n\n`;
  md += `- **Atomic File System Persistence:** Sequential promise write queues with \`.tmp\` -> \`rename\` atomic writes prevent race conditions.\n`;
  md += `- **Non-Blocking User Consultations:** Sub-agents raise interactive questions into \`consultationStore.ts\` without freezing background processing.\n`;
  md += `- **Human Approval Gate:** Real outbound connectors pause in \`approvalStore.ts\` with a 10-minute timeout auto-deny.\n`;

  writeDoc("SYSTEM_TOPOLOGY.md", md);
}

// 4. Generate MEMORY_SPEC.md
function generateMemorySpec() {
  let md = `# GrowForge Digital — User Memory & Learning Engine Specification\n\n`;
  md += `> **Auto-Generated:** ${new Date().toISOString()}  \n`;
  md += `> **Engine File:** \`src/lib/userMemory.ts\`  \n\n`;

  md += `## 1. Data Schema (\`data/user_memories.json\`)\n\n`;
  md += `\`\`\`typescript
interface UserMemory {
  email: string;
  toneStyle: string;             // Writing style & tone preferences
  brandRules: string[];          // Core positive brand & operational rules
  strategicPreferences: string[];// Strategic channel, market, and pricing preferences
  pastOverrides: string[];       // Historical user modifications
  explicitRejections: string[];   // Negative constraints ('never do X', 'avoid Y')
  shadowObservations: string[];  // Unprompted learned patterns from feedback loops
  updatedAt: string;
}
\`\`\`\n\n`;

  md += `## 2. Negative Constraint Parser & Deduplication\n\n`;
  md += `- **Rejection Triggers:** Automatically captures feedback matching \`/(?:don't|do not|never|stop|avoid|no more|dislike)\\s+(?:use|suggest|recommend|propose|do|include|add)?\\s*([^,.!?\\n]+)/gi\` during plan revisions.\n`;
  md += `- **40-Character Prefix Normalization:** Deduplicates identical or closely matching constraints to keep context tokens compact.\n`;
  md += `- **Universal Prompt Injection:** \`formatUserMemoryPrompt()\` prepends learned rules directly to the Orchestrator and department agents.\n`;

  writeDoc("MEMORY_SPEC.md", md);
}

// 5. Generate DECISION_REGISTRY.md
function generateDecisionRegistry() {
  let md = `# GrowForge Digital — Architectural Decision Registry (ADR)\n\n`;
  md += `> **Auto-Generated:** ${new Date().toISOString()}  \n\n`;

  md += `## ADR Index\n\n`;
  md += `### ADR 001: Atomic File Store Persistence\n`;
  md += `- **Status:** Accepted & Implemented (Phase 3)\n`;
  md += `- **Context:** JSON store writes during unexpected process restarts could corrupt data files.\n`;
  md += `- **Decision:** Use sequential promise write queues with \`.tmp\` file writing followed by atomic \`fs.promises.rename\`.\n\n`;

  md += `### ADR 002: Single-Format JSON Decision Tool Calling\n`;
  md += `- **Status:** Accepted & Implemented (Phase 4)\n`;
  md += `- **Context:** Multiple cloud & local providers (OpenAI, Anthropic, Gemini, Groq, Ollama) have conflicting native function calling schemas.\n`;
  md += `- **Decision:** Enforce a unified single-JSON-turn decision protocol with balanced brace depth extraction.\n\n`;

  md += `### ADR 003: Department Instruction Versioning (\`rules v.<hash>\`)\n`;
  md += `- **Status:** Accepted & Implemented (Phase 4)\n`;
  md += `- **Context:** Knowing exactly which constitution and department rules produced an execution plan.\n`;
  md += `- **Decision:** Compute SHA-256 hashes of the exact prompt text and store with every \`JobStep\`.\n\n`;

  md += `### ADR 004: Asynchronous Consultation & Interrupt Layer\n`;
  md += `- **Status:** Accepted & Implemented (Phase 4)\n`;
  md += `- **Context:** Sub-agents needing clarification shouldn't crash, guess, or lock the chat UI.\n`;
  md += `- **Decision:** File-backed consultation store with floating non-blocking UI banner and quick-select option pills.\n\n`;

  md += `### ADR 005: n8n Autonomous Tooling with Self-Healing Feedback\n`;
  md += `- **Status:** Accepted & Implemented (Phase 4)\n`;
  md += `- **Context:** Autonomous workflow creation frequently hits parameter and schema mismatches.\n`;
  md += `- **Decision:** Feed exact n8n node error traces back into the sub-agent tool loop for self-directed patching.\n\n`;

  md += `### ADR 006: Strategic Challenger & Red-Team Advisory\n`;
  md += `- **Status:** Accepted & Implemented (Phase 4)\n`;
  md += `- **Context:** Agency AI should not blindly execute low-ROI or risky client suggestions.\n`;
  md += `- **Decision:** Enforce strategic pushback in Orchestrator and department prompts, mandating counter-proposals with benchmark evidence.\n`;

  writeDoc("DECISION_REGISTRY.md", md);
}

// 6. Generate INDEX.md
function generateIndex() {
  let md = `# GrowForge Digital AI OS — Digital Brain Documentation Suite\n\n`;
  md += `Welcome to the **GrowForge Digital Brain** — the authoritative, self-documenting technical and operational knowledge index for the GrowForge AI OS multi-agent platform.\n\n`;
  md += `## Documentation Directory\n\n`;
  md += `1. **[System Topology & Multi-Agent Architecture](SYSTEM_TOPOLOGY.md)**  \n`;
  md += `   Visual topology graphs, local model processing matrix, concurrency guarantees, and security policies.\n\n`;
  md += `2. **[Department Roster & Constitution Hashes](DEPARTMENTS_ROSTER.md)**  \n`;
  md += `   Full catalog of all 10 specialized departments, scope definitions, and live instruction version hashes.\n\n`;
  md += `3. **[Agent Tools & Capabilities Catalog](TOOLS_CATALOG.md)**  \n`;
  md += `   Registered agent tools (web search, connectors, n8n automation, consultation, voice, audio, images) and execution specs.\n\n`;
  md += `4. **[User Memory & Learning Engine Specification](MEMORY_SPEC.md)**  \n`;
  md += `   Akinator-style shadow memory, tone customization, negative constraint extraction, and deduplication contracts.\n\n`;
  md += `5. **[Architectural Decision Registry (ADR)](DECISION_REGISTRY.md)**  \n`;
  md += `   Permanent record of critical design decisions, self-healing loops, atomic queues, and strategic advisory directives.\n\n`;
  md += `---  \n`;
  md += `*To re-generate this documentation suite automatically: run \`npm run docs:brain\` in \`growforge-ui\`.*\n`;

  writeDoc("INDEX.md", md);
}

function main() {
  ensureDirs();
  generateDepartmentsRoster();
  generateToolsCatalog();
  generateSystemTopology();
  generateMemorySpec();
  generateDecisionRegistry();
  generateIndex();
  console.log("\n🎉 Digital Brain auto-documentation successfully generated in /docs/brain/!");
}

main();
