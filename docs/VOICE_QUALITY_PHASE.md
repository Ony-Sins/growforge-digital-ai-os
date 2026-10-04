# NORA human-grounded voice quality phase

2026-10-04, Codex. Local implementation; physical acceptance and human benchmarks pending. No commit, push or deployment.

## Context persistence findings and repair

The previous agent supplied recent history, but backend requests did not own durable session context. Follow-up navigation heuristics could hijack references or questions containing CORE. The local authenticated voice endpoint now retains conversationId, recent 24 messages, selected surface/project/mission context, assistant identity and explicitly approved user notes. Session keys contain the authenticated owner, never a caller-supplied email. State is ephemeral: 30-minute expiry, 32-session bound, lost on server restart; turning voice off and starting a new browser client starts a new session. Reconnected tracks within the same client retain its ID. Interrupted, disconnected and superseded results cannot append stale history. Full server-side LLM computation is not yet cancelled on disconnect; outputs are suppressed.

Injected checks verify Turn 2/3 context delivery, owner separation, first/other references reaching reasoning, selected mission context and approved notes. These checks do not prove a real model resolves every ambiguous reference correctly. Approved memory is read only; no automatic memory learning or preference update occurred.

## Calibration and model comparison

Owner-only development diagnostics offer six clips: normal English, casual/fast English, GrowForge terms, Bangla, mixed English/Bangla and short interruption commands. The user edits exact reference text and explicitly starts recording. WAV audio remains in browser/server memory and is discarded when closed or abandoned; no audio file is saved. Optional results export contains reference text and transcripts, never audio. Comparison runs exactly the same captured bytes against base.en CPU baseline, small multilingual CPU/CUDA, medium CUDA and large-v3-turbo CUDA. Unicode normalization preserves Bengali combining marks. Measurements include WER/CER with denominators/edit counts, term hits, Bengali/Latin diagnostics, transcription time, model load time, RAM/CPU sampling and whole-GPU VRAM baseline/peak. Whole-GPU readings include other processes and are not isolated model allocations. Script-specific scores do not replace whole-transcript mixed-language WER.

**Human results: absent. Browser currently 0/6 recorded. No model promotion is justified.** Each comparison loads and warms the candidate before timed transcription; cold startup is reported separately. Multilingual inference detects language anew, transcribes rather than translates, and disables previous-text conditioning. English terminology hints are category-specific, not carried into Bangla turns.

GPU repair succeeded using official NVIDIA CUDA 12 cuBLAS/cuDNN/NVRTC Windows wheels inside the existing virtual environment, with process-local DLL discovery. No driver or system CUDA replacement. Small, medium and turbo completed CUDA int8_float16 silence compatibility tests. Silence is not accent evidence. Existing PyTorch remains CPU; TTS performance therefore differs from CTranslate2 GPU STT. Candidate model weights are locally cached.

## Voice presentation

Full authoritative reply remains unchanged in the UI. Speakable presentation normally buffers two complete opening sentences within 450 characters; explicit detailed/continue requests permit eight sentences/1200 characters. Markdown tables, code, links and lists are not read aloud. Identity pronunciation is separate from display name; unrelated acronyms retain their spelling. The reasoning prompt asks for a direct useful opening, natural contractions, no service filler or repeated help offers, and language mirroring. No second weaker reasoning model is introduced. These are implemented behavior constraints, not a subjective naturalness certification.

## Language-aware TTS feasibility

Kokoro remains installed English LOCAL_FAST fallback. Unsupported Bengali/mixed output is reported explicitly instead of passed to English Kokoro. Mixed/Bangla input does not begin incremental English synthesis before the full result is language checked. Reply preference auto/en/bn is user controlled and applies at the next voice session. Native browser fallback uses preferred Bengali or browser locale.

| Candidate | Scope | Current evidence / limitation |
| --- | --- | --- |
| Kokoro | English fallback | Installed, CPU, sentence chunks; user reports robotic quality; not accepted |
| Chatterbox Turbo | English quality candidate | Official 350M model, MIT; prepared capability record only; batch generate API, local streaming and Windows dependency compatibility unproven |
| Qwen3-TTS 0.6B | English quality candidate | Official multilingual set excludes Bangla; Apache 2.0; advertised model streaming is not a measured local SDK/audio guarantee |
| AI4Bharat IndicF5 | Bangla quality candidate | Official Bengali support; model access is gated by sharing contact details/accepting conditions, which user must decide; reference audio/text and isolated dependency audit needed |

Primary references: https://github.com/SYSTRAN/faster-whisper ; https://github.com/resemble-ai/chatterbox ; https://github.com/QwenLM/Qwen3-TTS ; https://huggingface.co/ai4bharat/IndicF5 . No candidate subjective bake-off or reference voice upload occurred.

## Latency and streaming

Real provider token deltas now reach the agent via NDJSON. Phrase buffering starts Kokoro before the full NORA response completes. Ollama, Groq and eligible zero-price OpenRouter streaming are supported; existing authorization/provider ordering is retained. Fallback cannot splice a different provider after emitted text. Voice startup prewarms STT, Kokoro and existing loopback Ollama reasoning when eligible. Calibration does not prewarm reasoning.

Markers: speech_end, final_transcript, nora_first_token (null if no real streaming), nora_finish, tts_first_chunk, firstPublishedPcm, voicedFramePublishedAt, playback_start. Browser playback_start is non-silent received PCM while the player is enabled: a receiver proxy, not a microphone measurement of physical speakers. No fabricated first-token or acoustic timestamp.

Earlier real local synthetic run: transcript about 0.82s after speech end, first NORA token 6.42s, first TTS PCM 10.52s, NORA finish 14.05s, receiver audio 14.87s. TTS generation began before NORA finished, but receiver audio was late. Latest measured waterfall is recorded below after the current run. This is not acceptable low latency merely because streaming exists.

## Provisional profiles

LOCAL_FAST candidate: multilingual small CUDA int8_float16 plus English Kokoro fallback, existing approved reasoning. Compare against base.en before changing defaults. LOCAL_QUALITY candidate: turbo CUDA, or medium only if actual human accuracy improves enough to justify delay; English Chatterbox/Qwen and Bengali IndicF5 await isolated physical bake-off. RTX 8GB is shared with reasoning and desktop graphics; all models cannot be assumed to fit concurrently. Model scheduling/VRAM arbitration is not implemented. Current default remains base.en until the calibration decision; this means Bangla STT is not yet accepted in ordinary voice mode.

## Connected audit and release blockers

TypeScript, scoped lint, Python compile and injected context/presentation/surface checks passed. Prior isolated production build passed with ten existing filesystem tracing warnings. Added release exclusions remove user_memories.json and .internal_voice_key from API/page traces; middleware trace still includes private memory and unrelated local files. This is a concrete packaging blocker, not a resolved privacy certification. Owner voice endpoints remain blocked in preview/production. Full two-account isolation, repo history/secrets, uploads and cloud configuration still require their release gate. No public release is authorized here.

## Tracking

- [x] Context reset audit and authenticated session persistence repair.
- [x] Six-category temporary local calibration harness.
- [x] Safe isolated CUDA dependency repair and candidate compatibility checks.
- [x] Voice presentation and language capability boundaries.
- [x] Real streaming, prewarm and honest latency instrumentation.
- [x] Actual user recordings and human WER/CER/resource results completed (2026-10-04); multilingual correctness failed.
- [ ] Acceptable measured speech-end to audible reply.
- [ ] English/Bangla TTS physical bake-off and accepted profiles.
- [ ] Private middleware packaging and broader beta isolation release gate.
- [ ] Final user physical acceptance.

### Measured receiver run (synthetic input, real NORA)

| Turn | Transcript | First token | First TTS PCM | NORA finish | Receiver audio |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 greeting | 551 ms | null | 1597 ms | 1098 ms | 2046 ms |
| 2 missions | 506 ms | null | 2053 ms | 548 ms | 2433 ms |
| 3 identity | 610 ms | null | 2342 ms | 669 ms | 2734 ms |
| 6 recovery | 572 ms | null | 2169 ms | 613 ms | 2554 ms |
| 7 real reasoning | 611 ms | 1095 ms | 4556 ms | 5408 ms | 5413 ms |

All times are relative to speech_end. Actual first voiced frame for Turn7 was 4808ms; initial generated chunk contained 332ms leading quiet audio. Receiver first audio followed source voiced frame by about605ms. Initial three-turn lifecycle and Stop checks passed (receiver tail39ms). The waterfall assertion failed because an earlier lifecycle snapshot carried stale speech_end; the reporting now uses final per-turn markers. Browser receiver receipts now require current published PCM and active speaking, avoiding attributing prior-turn tails to a new turn. The revised fixture is being rerun; no full suite PASS is claimed until that completes.

Final rerun: synthetic lifecycle/interruption/context streaming fixture exit0; receiver Stop tail52ms, source clear1.29ms. Real reasoning markers relative to speech_end (ms): {'final_transcript': 599, 'nora_first_token': 737, 'nora_finish': 5565, 'tts_first_chunk': 4406, 'voicedFramePublishedAt': 4628, 'received_audio': 5578}. Receiver still did not precede full reply; early-audio acceptance remains failed. No actual acoustic or human accent measurements. Diagnostic panel maximum height now reserves header/footer space on mobile instead of overlapping the brand header.

2026-10-04 20:31:17 +0600: browser shows1/6 human clips retained temporarily and a further recording active. No comparison results yet. Leave active calibration untouched; no reload or source edits to the recording component until capture finishes. Browser visual check exposed narrow-screen action-row overflow; wrap controls after recordings are safely complete.


### 2026-10-04 20:56:50 +0600, Codex — HUMAN six-clip STT comparison completed; defaults unchanged
Used all six retained user clips via the browser's existing compare control; exact shared bytes per candidate, uniform existing scoring, no rerecording/synthetic substitution/audio persistence. Completed30rows: base.enCPUint8, smallCPUint8, small/medium/turboCUDAint8_float16 beam1. Corpus WER baseline59.26%, smallCUDA46.30%, medium38.89%, turbo44.44%; English-only12.90%,6.45%,3.23%,3.23%. MedianSTT707.5/266.5/552.5/553.5ms. Bangla/mixed fail across candidates; medium Bangla14.286s. Declared45/20/15/10/10 composite winner smallCUDA53.43/100; medium43.72,baseline43.19,turbo38.98. Provisional LOCAL_FAST smallCUDA; LOCAL_QUALITY accuracy candidate mediumCUDA, neither accepted for Bengali/mixed requirement; no default switch. Six clips/54referencewords and process-wide RAM/whole-GPU metrics limit conclusions. Exact references, raw transcripts, per-row metrics and formulas in local text-only report outside repo at C:/Users/USERAS/.codex/visualizations/2026/10/04/01a10650-2c18-7960-8429-94baf6e6c846/human-stt-comparison.md and human-stt-raw.json.
STOP_VOICE_SESSION_BEFORE_EVALUATION was stale disconnected-owner telemetry despite browsermicsOFF and LiveKitonlyNORA. Stopped/cleared stale agent; evaluationroute no longer starts voice runtime; patched completed-input disconnect cleanup for next restart. Six-clip comparison then succeeded. Scopedtype/lint and PythoncompilePASS. Separate prior synthetic/realreasoner waterfall: transcript599ms; token737ms; token-to-TTS3668ms; TTS-to-receiver1172ms; end-to-receiver5578ms, physicalaudibilityunmeasured. Dominant interval phrasewait+CPUKokoro, notSTT. Private middleware packaging gate remainsOPEN. No commit/push/deploy/durablememoryupdate. STOP for benchmarkreview.
