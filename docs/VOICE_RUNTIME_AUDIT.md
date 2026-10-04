> **Physical acceptance failed — 2026-10-04 18:02:03 +06:00, Codex.** Earlier synthetic PASS is not acceptance. Follow-up repair and limitations: [VOICE_CONVERSATION_REPAIR.md](VOICE_CONVERSATION_REPAIR.md). Stage 2B remains blocked.

# Local voice runtime audit and repair

Physical-user acceptance: PENDING. All spoken-question processing evidence below is AUTOMATED/SYNTHETIC. Browser microphone transport and playback-element observations are separate; they do not certify human speech or audible speakers. No commit, push or deployment.

## Root causes and repaired boundaries

1. Browser token/connect/publication never started the missing Desktop Bridge/Voice Agent. LiveKit was running but bridge port7890 was refused and no agent process existed. Mic-click Listening therefore asserted readiness before the consumer existed. Server now starts the existing services, waits for fresh model-ready agent heartbeat in the intended room, and issues the browser token.
2. Browser onTranscript/onSpeechState hooks were declared but never dispatched. Reliable agent receipts now carry actual STT, canonical response and processing state. Displaying a backend transcript does not submit it for a second NORA turn.
3. Silero and native TurnDetector v1-mini were not in the actual audio loop. Raw RMS/silence buffering collected idle audio and overlapping work. Actual Silero start/end events now bound utterances, native audio-based turn prediction runs before commit, and canonical turns serialize. Kokoro iteration runs in a thread so RTC/VAD can continue.
4. Process existence incorrectly meant READY; errors were swallowed and standby text fabricated. Readiness now requires heartbeat/model readiness. Process logs retained locally, failures surfaced, output subscription restricted to nora_voice_agent and browser playback rejection exposed.
5. Final browser audit found previous participant receipts inheriting into new input sessions. Agent clears receipt/history fields when a new input track starts; browser clears display receipts on start and resets transport state on stop. Rechecked after synthetic test: fresh browser transcript/reply empty and turnId0 with live frames.

Room mismatch was investigated and ruled out for the observed connection. Desktop Bridge supervises this room and carries state; browser ownership deliberately does not create a competing DesktopAudioParticipant.

## Boundary evidence

| Boundary | Observed evidence / limits |
|---|---|
| 1-3 mic/device/live track | Actual browser Default - Microphone (Brio 100) (046d:094c), enabled true, muted false, readyState live. Correct intended physical device requires human confirmation. |
| 4-7 RTC/room/publication/agent | Room room_vs_headless_default SID RM_FPo2VZpTdcGC; browser browser_user_42175814-f0df-42da-a78c-c1e4669c3483; mic TR_AMGGSSytZBWoBp source microphone; agent PA_tAvgnUpbMTo8 identity nora_voice_agent; output TR_AMMuRso5rTdFXW. |
| 8-9 subscription/frames | Agent receipt matches the browser identity and exact micSID; 1,475 frames at16,000Hz mono; RMS0.003330; browser155,943 bytes/700 packets. Ambient transport only, not spoken acceptance. |
| 10 Silero | Synthetic PCM produces speech-start and speech-end events. Confidence telemetry is instantaneous; silence may show0 after speech ended. |
| 11 native turn detector | Synthetic v1-mini endOfTurnProbability0.7093; turnDetectorState committed. Bounded extra1s continuation window if probability below threshold. |
| 12-13 Whisper | Synthetic accumulated utterance3.06s -> real base.en int8 CPU transcription: NORA, What are my active missions? No injected transcript. Batch final only, no partials; language forced English, confidence not exposed by current provider. |
| 14-15 canonical NORA | Existing voice_headless channel -> /api/nora/turn -> executeHeadlessTurn -> executeNoraTurn. dispatchType DETERMINISTIC_QUERY; actual local-owner context reply no active missions. This query uses no LLM provider/model. Channel retains existing schema name instead of inventing VOICE. Owner-only local loopback, not tenant voice. |
| 16-18 Kokoro/PCM/publication | Real canonical reply enters local Kokoro af_heart; real24kHz PCM published on agent outputSID. Latest synthetic RTC receiver782 frames, peak0.32547 (normalized). |
| 19-20 browser subscription/playback | Actual browser nora_voice_agent output subscribed; playbackStarted true; audio element paused false, muted false, readyState4, currentTime18.483s. Playback of the connected audio stream is observed; audible human answer awaits user test. |

Latest synthetic participant synthetic_audit_1791112997 micTR_AMNg3oknAN7uug; same room and agent. Maximum input receipt759 frames. Evidence file voice-agent/voice_runtime_evidence.json is local ignored data, not a public artifact. Latency from earlier complete synthetic turn: STT~459ms, canonical deterministic turn~30ms, speech-end to first published PCM~2.424s; this is NOT measured speaker audibility.

## Token and privacy boundary

Actual server token room matches client, identity server UUID, publish/subscribe true, validity600s. Correct key verified by successful RTC connection. Wrong room request400; missing internal NORA key401; external Origin503. Browser cannot read bridge/internal secrets. Local voice routes reject production/preview and non-owner sessions by source guard; deployed multi-user voice was not tested or enabled. Existing local LiveKit dev credentials are development-only and weak; production must not reuse them. Logs may contain local transcripts and are ignored with keys/artifacts. No comprehensive repo/history/tenant privacy certification is implied.

## Changed files in this repair

- voice-agent/agent.py, desktop_bridge.py, service_supervisor.py, test_voice_runtime.py
- growforge-ui/src/lib/livekitVoiceClient.ts, localVoiceServer.ts (new), noraVisualSignal.ts
- growforge-ui/src/app/api/nora/voice-token/route.ts, voice-events/route.ts, turn/route.ts
- growforge-ui/src/components/spatial/CoreCommandCenter.tsx, VoiceDiagnosticsPanel.tsx
- growforge-ui/scripts/test-overview-command.ts, test-core-reactivity.ts (old source expectations corrected for real backend speech)
- .gitignore, state.md, docs/ROADMAP.md, this report

Pre-existing dirty changes preserved. No broad reset/cleanup.

## Verification

- Before repair: genuine synthetic RTC path failed NO_AUDIO_FRAME_TELEMETRY, near-silent output peak0.000061; initial missing services independently observed.
- After repair: genuine RTC synthetic audio -> Silero/native turn -> Whisper -> canonical deterministic query -> Kokoro -> non-silent RTC receiver PASS; rerun after final backend receipt fix PASS, clean exit.
- Python compile four changed modules PASS.
- TypeScript noEmit PASS; ESLint scoped changed frontend files PASS.
- Overview command, CORE reactivity, NORA surface context and shell visibility checks PASS. Source/fixture tests are not acoustic proof.
- Actual browser transport, new-session receipt isolation and media playback observations above.

## Remaining limitations and stop point

Physical microphone comprehension, intended device, speaker audibility, echo/interruption quality and multi-turn conversation require user acceptance. Local owner-only single room is not safe tenant voice infrastructure or enterprise certification. English batch STT only; no partial transcript. Cold model startup can take~40s. No forced VAD_NO_SPEECH error on quiet listening: silence is normal; raw frames/confidence make that boundary inspectable. Complex NORA questions may require configured local model; deterministic mission question needs no paid provider. Full multi-user privacy audit is separate.

## Manual acceptance

Open http://localhost:3000/?voiceDiag=1, select Dive In then Overview, keep LIVEKIT (Local Primary), enable mic. Starting -> connected -> listening must accompany matching room/micSID and increasing audioFrameCount/micBytesSent. Confirm the listed device is yours. Say Nora, what are my active missions? Watch user_speaking/Silero start/end -> turn committed/probability -> transcribing/STT duration+final transcript -> thinking/DETERMINISTIC_QUERY+reply -> speaking/ttsFrameCount+speechEnergy/outputSID/playbackStarted -> listening. Hear the reply yourself. Report transcript, whether reply was audible, and any displayed error. Feature remains physically unverified until user confirms.