# Conversational voice repair after failed physical acceptance

PHYSICAL VOICE ACCEPTANCE GATE: FAILED / RETEST REQUIRED. This overrides earlier synthetic PASS reports. No Stage 2B, unrelated roadmap work, Antigravity dispatch, commit, push or deployment. This session continues the same local repair.

## Confirmed failure and cause

The physical report says the first greeting may work, later speech is misheard/ignored, output does not stop reliably, the assistant spells NORA, and the mic does not clearly remain on. Old agent logs independently show queued utterances with speech-end-to-NORA latency rising from120s to350s, and speech-end-to-PCM reaching372s. These are late answers to old input, not a healthy real-time conversation.

The prior listener kept pending utterance audio until the whole STT/NORA/TTS coroutine completed and held a turn lock during output. Later segments reused the pending audio, stacked behind long output and were cleared by older completions. Cancellation did not consistently cancel the whole prior turn. An additional runtime check found that remote microphone disconnect did not terminate the AudioStream reader; the bridge retained a stale input participant. None of that is proved safe by a one-turn audio test.

Repair: drain pending PCM exactly at commit before inference; cancel superseded predictions and active turns on new speech; do not serialize an unlimited turn queue behind TTS. Keep one active input reader and close it on track unsubscription/participant disconnect before accepting another. Preserve same-session conversation history across turns, reset it for a new participant/session, and retain complete authoritative replies in history.

## Interruption, output and lifecycle

- Source queue limited to100ms. Speech start immediately cancels current TTS task and clears its queue. Native inference cancellation and pending-turn cancellation are separate from microphone publication; mic is never permanently muted to suppress echo.
- Browser reliably receives interruption and mutes residual remote playback. Receipts are deduplicated to avoid a data-channel feedback loop. Next actual agent speech unmutes output. Complete output preserves published microphone/VAD/STT readiness.
- Kokoro generation is serialized within its worker thread; a canceled CPU chunk can finish internally but cannot send more frames from its canceled task. Completed output waits for source drain; activeTtsTask false, agentSpeaking false, speechEnergy0, outputQueueSeconds0, state listening.
- Local confident exact stop phrases bypass canonical NORA/model calls: Stop, Stop talking, Quiet, Cancel, Never mind, No stop, with optional assistant/please prefixes. Confidence uses Whisper segment avgLogprob/noSpeechProbability; it is not a calibrated command classifier. VAD speech start already cancels playback before final STT.
- Telemetry carries session/conversation UUID, input participantSID, micSID, agentSID, outputSID, turnID, timestamps and lifecycle events. Browser start/end receipts are transport/playback-state receipts, not an acoustic speaker measurement.

## Echo evidence and its limit

The old logs do not tag agentSpeaking at each utterance and no physical input audio was saved. Therefore physical self-transcription cannot honestly be confirmed or ruled out. The repetitive old transcripts are explained in part by stale audio reuse and a long queue; they alone do not prove speaker echo.

New overlapTranscript records raw transcription, utterance RMS, VAD state, whether speech began during/recently after output, outgoing-text similarity, suspectedEcho and actualHumanSpeechConfirmed:false. Strong matching overlap (at least4 words and85% contiguous overlap with outgoing speech) is suppressed before NORA and retained in diagnostic receipts. This is a conservative heuristic, not acoustic echo separation: deliberate repetition can be misclassified. It does not mute the input. Physical echo still requires user testing with speakers.

## Actual browser microphone settings

Actual Brio 100 publication getSettings: echoCancellation true; noiseSuppression true; autoGainControl true; channelCount1; sampleRate48000; sampleSize16; latency0.01; default physical device. Agent receives resampled16000Hz mono. getConstraints requests echo cancellation/noise suppression/AGC true and voiceIsolation true, but getSettings.voiceIsolation is FALSE. The extra isolation feature must not be claimed applied. Device IDs/group IDs stay in local development diagnostics and are omitted from this report.

## Identity and spoken presentation

Shared assistantIdentity metadata separates assistantType nora, displayName, spokenName and wakeName. Canonical turn engine is the source of speakableText, not a Kokoro-specific replacement. NORA -> Nora and configurable FRIDAY -> Friday are verified in canonical deterministic identity tests. An explicit spoken-name override is supported; current device configuration uses growforge.assistantSpokenName when supplied. Only matching assistant-name tokens are rewritten; CPU/GPU and other acronyms stay intact.

Full reply remains in screen/history. speakableText removes code/URLs/table/list markup, leads with the available direct prose and normally retains up to2 short sentences plus an offer to continue. Explicit detail/continue requests have a higher bound. It is deterministic presentation selection, not a second reasoning engine or fabricated summary. Full canonical LLM output is no longer truncated to200 tokens for the sake of TTS; it permits800 tokens. Identity/capability deterministic responses remain canonical. If a reply only consists of code/table/list, speech refers the user to the full on-screen answer.

## Human-grounded STT comparison

Development diagnostics now provide Compare my speech locally. User turns voice mode off, edits the exact expected phrases, clicks Record test phrases, speaks once, then Stop and compare. Same WAV stays in memory and is compared against cached local base.en CPU int8 beam1 and beam5, small.en CPU int8 beam5, and small.en CUDA int8_float16 beam5. 30s/4MB bounds, discard/unmount cleanup, no audio-file persistence, no paid provider, no forced post-transcription Dora->NORA replacement. Production/remote endpoints reject access; bridge requires internal key and disallows comparison during an active input session.

Current runtime remains base.en CPU int8 beam1. Terminology is supplied as a natural-language initial prompt: Conversation with Nora about GrowForge, CORE, BRAIN, missions and Systems. The previous uppercase keyword list was removed; names are not forcibly corrected after transcription. Recognition now exposes language probability, segment log probability/no-speech probability and utterance timestamps.

No same-audio HUMAN benchmark is possible from the prior test because recording was not saved. Do not infer accent accuracy from the synthetic results below.

| Candidate | Synthetic 2.55s phrase STT time | Word error rate | Peak process RAM |
|---|---:|---:|---:|
| base.en CPU int8 beam1 |831ms|0|329MiB|
| base.en CPU int8 beam5 |548ms|0|334MiB|
| small.en CPU int8 beam5 |1624ms|0|614MiB|
| small.en CUDA int8_float16 beam5 |failed|not measured|827MiB before error|

These single-run numbers include different cold/warm effects; they are not a model ranking. Model load reported separately. CPU process peaks were459%,502%,645% respectively (multicore scale); memory is whole benchmark-process RSS, not isolated model memory. GPU detected RTX5050/8151MiB, but actual CUDA inference fails with missing cublas64_12.dll. No GPU accuracy/latency/VRAM inference result is claimed; no CUDA packages were installed. Defaults unchanged pending human comparison.

## Turn segmentation and interface

Silero prefix pre-roll0.5s, end silence0.65s retained explicitly. Minimum utterance guard reduced from350ms to120ms to avoid dropping short stop commands. v1-mini still predicts end-of-turn; low probability allows a bounded continuation window with preserved uncommitted PCM. Speech-duration/captured-duration, RMS and Whisper segment start/end are recorded. No further physical threshold tuning was invented. Synthetic greeting and short Stop both recognized across the same track; physical beginnings/endings, hesitations and accent remain unverified.

Mic button uses session runtime rather than listening-only activity: neutral off, restrained pending, persistent cyan on through silence/thinking/output, restrained error, aria-pressed and data-voice-state. No rainbow or fake audio. Composer waveform still samples real browser track and appears for inbound listening/user speech; outbound state shows speaking instead. CORE inbound samples no longer overwrite outbound Kokoro energy during NORA speech; interruption/finish clears the speaking signal. Static browser active-state screenshot is proof of that button presentation only, not three-turn physical CORE acceptance.

## Tests and evidence

AUTOMATED/SYNTHETIC same-room/same-track test: Hi Nora -> active missions -> assistant identity, then interrupt another identity answer with actual synthetic Stop audio, then identity recovery. Each ordinary turn drains and returns listening; Stop bypasses NORA; microphone remains feeding; one conversation UUID and trackSID throughout. Canonical identity reply preserves NORA on-screen and sends Nora to Kokoro. Synthetic receiver tail after interruption58ms in completed run, sender clear below1ms. No physical audible-cancellation time measured.

UNIT/INJECTED stop-phrase and matching-overlap tests pass; they do not prove actual echo. Canonical NORA/FRIDAY speech-presentation tests pass without model calls. Overview/CORE/surface-context checks pass. TypeScript, scoped ESLint and Python compile pass. Isolated production build succeeds with10 filesystem-tracing warnings; it is not deployment or release/privacy certification. Build-generated tsconfig edits were removed, development type imports restored, build artifacts ignored.

Local ignored evidence: voice-agent/voice_conversation_evidence.json, stt_synthetic_benchmark.json, logs/voice_agent.log. Browser screenshot: .impeccable/review/voice-runtime/voice-on.png. No human audio recorded by this agent for comparison.

## Files changed in this follow-up

voice-agent/agent.py, desktop_bridge.py; new stt_evaluation.py, test_voice_conversation.py, test_voice_logic.py.
growforge-ui/src/lib/assistantIdentity.ts (new), noraTurnEngine.ts, livekitVoiceClient.ts; CoreCommandCenter.tsx, VoiceDiagnosticsPanel.tsx, VoiceSTTEvaluation.tsx (new); api/nora/voice-evaluate/route.ts (new); scripts/test-voice-presentation.ts (new); .gitignore; state.md; docs/ROADMAP.md; this report and earlier audit checkpoint.

## Exact human acceptance stop

Open localhost:3000/?voiceDiag=1; Dive In -> Overview; LIVEKIT Local Primary. Enable mic, confirm persistent cyan and increasing input frames. In the SAME session:
1. Hi Nora. Short verbal greeting, clean listening afterward.
2. What are my active missions? Accurate transcript and concise real mission answer; clean listening again.
3. What should I work on first? Correct context from turn2; full text on-screen with shorter speech.
4. While NORA speaks, say Stop. Audible output should stop promptly; mic stays on and receives frames.
5. What's your name? Screen says NORA; speech naturally says Nora.

Confirm identity/room/track/session continuity and clean states; report the first incorrect transcript, whether output stopped and whether mic stayed on. Human speech, natural pronunciation, physical echo, audible cancellation, conversational feel and physical CORE/waveform UX are all STILL UNVERIFIED. Stage2B stays blocked. If recognition is inaccurate, the next bounded step is the explicit one-recording comparison; do not choose small.en/GPU blindly.

Reference APIs consulted: [LiveKit Silero](https://docs.livekit.io/reference/python/livekit/plugins/silero/index.html), [LiveKit RTC AudioSource](https://docs.livekit.io/reference/python/livekit/rtc/index.html), [faster-whisper primary implementation](https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/transcribe.py). Local installed SDK was inspected before changes.
Final disconnect verification: inputParticipant empty, audioFrameCount0, state connected after the synthetic participant leaves. The real same-origin comparison endpoint then completed all CPU candidates (533/627/1844ms, WER0 on the synthetic clip), returned recordingPersisted:false, and rejected external Origin403. Final room RM_fyBoZavmSufR, agent PA_bmtsXfRRsUdu, input participant PA_8kqDpawfmxgp, mic TR_AMad5HPgA2irj5, output TR_AMuWAT9YkGp8Ev, conversation7785b6d6-46df-4b9c-b2b4-e65dea9a3a61. The3 ordinary turns and interruption/recovery used these same IDs. Telemetry history now retains12 receipts and uses compact JSON because the40-receipt version approached the RTC packet limit; full lifecycle remains in local logs.
