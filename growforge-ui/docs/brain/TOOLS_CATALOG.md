# GrowForge Digital — Agent Tool Catalog

> **Auto-Generated:** 2026-09-19T23:47:38.884Z  
> **Tool Engine:** `src/lib/tools.ts` & `src/lib/tools/*`  

## 1. Registered Agent Tools

| Tool Name | Category | Owner Approval | Usage Spec | Engine / Backend |
|---|---|---|---|---|
| `web_search` | Intelligence & Research | **No (Read-only)** | `{ "query": "string" }` | Google Gemini Search Grounding |
| `call_connector` | Integrations & REST | **YES (Owner-gated)** | `{ "connectorId": "string", "body": object }` | connectorStore.ts + Server Vault |
| `manage_n8n_workflow` | Autonomous Automation | **Partial — list/get run free; create/patch/activate/execute are owner-gated** | `{ "action": "create"|"get"|"patch"|"activate"|"execute"|"list", "workflowId": "string", "workflow": object, "inputData": object }` | n8n REST API (/api/v1/workflows) |
| `ask_operator` | Human-in-the-Loop | **No (Consultation channel)** | `{ "question": "string", "options": ["choice 1", "choice 2"] }` | consultationStore.ts + ConsultationBanner.tsx |
| `synthesize_voice` | Multimodal Voice | **No (Generation)** | `{ "text": "string" }` | Local Piper Binary (PIPER_BINARY_PATH) |
| `transcribe_audio` | Multimodal Audio | **No (Generation)** | `{ "filename": "string (.wav/.mp3)" }` | Local whisper.cpp Server (WHISPER_SERVER_URL) |
| `generate_image` | Multimodal Visual | **No (Generation)** | `{ "prompt": "string", "negativePrompt": "string" }` | Local ComfyUI Server (COMFYUI_SERVER_URL) |

## 2. Tool-Calling Loop Architecture

- **Provider-Agnostic JSON Decision Protocol:** Enforces single balanced top-level JSON responses across Ollama, Gemini, Groq, OpenAI, and Anthropic.
- **PROPOSE vs. EXECUTE Contract:** Non-side-effect tools execute immediately; external mutations require explicit human approval via `approvalStore.ts`.
- **Self-Healing Automation:** Tools like `manage_n8n_workflow` return schema-level diagnostics so agents can propose a corrected retry — the retry itself still passes through the same owner-approval gate as the original mutating call, never runs unattended.
