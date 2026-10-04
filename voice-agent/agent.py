"""
NORA LiveKit Realtime Voice Agent.
Handles VAD/TurnDetector (v1-mini), faster-whisper STT with terminology context,
canonical executeNoraTurn dispatch, Kokoro TTS streaming, interruption handling,
and latency telemetry.
"""

import cuda_runtime
import os
import sys
import io
import time
import math
import json
import uuid
import re
import threading
from difflib import SequenceMatcher
import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any, AsyncGenerator
import httpx
import numpy as np
import soundfile as sf
import livekit.rtc as rtc
from livekit import api
from livekit.agents import inference
from livekit.agents import vad as vad_api
from livekit.plugins import silero
from faster_whisper import WhisperModel
import kokoro
from voice_presentation import SpeechBuffer
from tts_routing import select_provider, PROVIDERS

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("NoraVoiceAgent")
logging.getLogger("httpx").setLevel(logging.WARNING)

# ---------------------------------------------------------------------------
# STT Provider Abstraction
# ---------------------------------------------------------------------------

class STTProvider(ABC):
    @abstractmethod
    async def transcribe(self, pcm_bytes: bytes, sample_rate: int = 16000, initial_prompt: Optional[str] = None) -> str:
        """Transcribe raw PCM bytes (int16 mono) into text."""
        pass

class FasterWhisperSTTProvider(STTProvider):
    def __init__(self, model_size: str = "base.en", compute_type: str = "int8", device: str = "cpu"):
        self.model_size = model_size
        self.compute_type = compute_type
        self.device = device
        self.model: Optional[WhisperModel] = None
        self.last_info = {}

    def initialize(self):
        logger.info(f"Loading faster-whisper model ({self.model_size}, {self.compute_type}, {self.device})...")
        self.model = WhisperModel(self.model_size, device=self.device, compute_type=self.compute_type)
        logger.info("faster-whisper model loaded and ready.")

    async def transcribe(self, pcm_bytes: bytes, sample_rate: int = 16000, initial_prompt: Optional[str] = None) -> str:
        if not self.model:
            self.initialize()
        
        audio_int16 = np.frombuffer(pcm_bytes, dtype=np.int16)
        audio_float32 = audio_int16.astype(np.float32) / 32768.0

        prompt = initial_prompt or ("Nora, GrowForge, CORE, BRAIN, missions, Systems." if self.model_size.endswith(".en") else None)

        # Run CPU transcription in thread pool to avoid blocking async loop
        def _sync_transcribe():
            segments, info = self.model.transcribe(
                audio_float32,
                beam_size=1,
                language="en" if self.model_size.endswith(".en") else None,
                initial_prompt=prompt,
                condition_on_previous_text=False,
            )
            parts = list(segments)
            self.last_info = {"language": info.language, "languageProbability": info.language_probability,
                              "avgLogprob": float(np.mean([seg.avg_logprob for seg in parts])) if parts else None,
                              "noSpeechProbability": max((seg.no_speech_prob for seg in parts), default=1),
                              "segments": [{"start": s.start, "end": s.end} for s in parts]}
            return " ".join(seg.text.strip() for seg in parts).strip()

        return await asyncio.to_thread(_sync_transcribe)

# ---------------------------------------------------------------------------
# TTS Provider Abstraction
# ---------------------------------------------------------------------------

class TTSProvider(ABC):
    @abstractmethod
    async def synthesize(self, text: str) -> AsyncGenerator[np.ndarray, None]:
        """Synthesize text into raw float32/int16 audio chunks at 24000Hz."""
        pass

class KokoroTTSProvider(TTSProvider):
    def __init__(self, voice: str = "af_heart", lang_code: str = "a"):
        self.voice = voice
        self.lang_code = lang_code
        self.pipeline: Optional[kokoro.KPipeline] = None

    def initialize(self):
        logger.info(f"Initializing Kokoro TTS (voice='{self.voice}', lang='{self.lang_code}')...")
        self.pipeline = kokoro.KPipeline(lang_code=self.lang_code)
        self.generation_lock = threading.Lock()
        logger.info("Kokoro TTS pipeline loaded and ready.")

    async def synthesize(self, text: str) -> AsyncGenerator[np.ndarray, None]:
        if not self.pipeline:
            self.initialize()

        generator = self.pipeline(text, voice=self.voice, speed=1.0, split_pattern=r"\n+")
        def next_chunk():
            with self.generation_lock:
                return next(generator, None)
        while True:
            item = await asyncio.to_thread(next_chunk)
            if item is None:
                break
            _, _, audio = item
            if audio is None:
                continue
            if hasattr(audio, "detach"):
                audio_np = audio.detach().cpu().numpy()
            else:
                audio_np = np.array(audio)
            yield audio_np

# ---------------------------------------------------------------------------
# Nora Voice Agent Core
# ---------------------------------------------------------------------------

class NoraVoiceAgent:
    def __init__(
        self,
        url: str = "ws://127.0.0.1:7880",
        api_key: str = "devkey",
        api_secret: str = "secret",
        room_name: str = "room_vs_headless_default",
        identity: str = "nora_voice_agent",
        bridge_url: str = "http://127.0.0.1:7890",
        nora_backend_url: str = "http://127.0.0.1:3000",
    ):
        self.url = url
        self.api_key = api_key
        self.api_secret = api_secret
        self.room_name = room_name
        self.identity = identity
        self.bridge_url = bridge_url
        self.nora_backend_url = nora_backend_url

        self.room: Optional[rtc.Room] = None
        # Bound sender buffering to one tenth of a second; microphone stays live.
        self.tts_audio_source = rtc.AudioSource(sample_rate=24000, num_channels=1, queue_size_ms=100)
        self.tts_track: Optional[rtc.LocalAudioTrack] = None

        # Providers
        # Defaults stay the measured baseline until human calibration selects a profile.
        self.stt_provider: STTProvider = FasterWhisperSTTProvider(
            model_size=os.getenv("NORA_STT_MODEL", "base.en"),
            compute_type=os.getenv("NORA_STT_COMPUTE", "int8"), device=os.getenv("NORA_STT_DEVICE", "cpu"))
        self.tts_provider: TTSProvider = KokoroTTSProvider(voice="af_heart")
        self.turn_detector: Optional[inference.TurnDetector] = None
        self.vad = None
        self.turn_lock = asyncio.Lock()
        self.tasks = set()
        self.history = []
        self.turn_count = 0
        self.session_id = str(uuid.uuid4())
        self.turn_generation = 0
        self.active_turn_task = None
        self.input_task = None
        self.assistant_name = "NORA"
        self.assistant_spoken_name = "Nora"
        self.surface_context = ""
        self.response_language = "auto"
        self.input_identity = None
        self.last_spoken_text = ""
        self.last_output_end = 0.0
        self.telemetry = {"agentReady": False, "roomName": room_name, "agentIdentity": identity}

        self.is_running = False
        self.current_state = "idle"  # idle | listening | thinking | speaking
        self.user_speaking = False
        self.agent_speaking = False
        self.active_tts_task: Optional[asyncio.Task] = None
        self.should_interrupt = False

        self.http_client = httpx.AsyncClient(timeout=15.0)

    def _generate_token(self) -> str:
        token = (
            api.AccessToken(self.api_key, self.api_secret)
            .with_identity(self.identity)
            .with_name("NORA Voice Core")
            .with_grants(
                api.VideoGrants(
                    room_join=True,
                    room=self.room_name,
                    can_publish=True,
                    can_subscribe=True,
                    can_publish_data=True,
                )
            )
        )
        return token.to_jwt()

    async def initialize_models(self):
        logger.info("Initializing TurnDetector (version='v1-mini')...")
        self.turn_detector = inference.TurnDetector(version="v1-mini")
        self.vad = await asyncio.to_thread(silero.VAD.load, min_silence_duration=.65, prefix_padding_duration=.5)

        logger.info("Initializing STT & TTS providers...")
        await asyncio.to_thread(self.stt_provider.initialize if hasattr(self.stt_provider, "initialize") else lambda: None)
        await asyncio.to_thread(self.tts_provider.initialize if hasattr(self.tts_provider, "initialize") else lambda: None)
        # Warm the inference kernels before microphone publication; silence is never benchmark evidence.
        await self.stt_provider.transcribe(np.zeros(16000,dtype=np.int16).tobytes())
        async for _ in self.tts_provider.synthesize("Ready."): pass
        logger.info("All NORA voice models and providers loaded successfully.")

    def _get_bridge_key(self) -> str:
        env_key = os.environ.get("GROWFORGE_BRIDGE_KEY") or os.environ.get("GROWFORGE_INTERNAL_KEY")
        if env_key:
            return env_key.strip()
        key_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".bridge_key")
        if os.path.exists(key_file):
            try:
                with open(key_file, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                    if content:
                        return content
            except Exception:
                pass
        return "growforge_local_dev_secret"

    async def update_bridge_state(self, **kwargs):
        self.telemetry.update(kwargs)
        if kwargs.get("lifecycleEvent"):
            record = {"event":kwargs["lifecycleEvent"],"at":time.time(),"turnId":self.turn_count,
                      "conversationId":self.session_id,"state":self.current_state,
                      **{key:self.telemetry.get(key) for key in ("roomSid","inputParticipantSid","agentSid","inputTrackSid","outputTrackSid")}}
            self.telemetry["lifecycleEvents"] = (self.telemetry.get("lifecycleEvents",[])+[record])[-12:]
            logger.info("[VOICE_LIFECYCLE] %s",json.dumps(record))
        payload = {
            **self.telemetry,
            "state": self.current_state,
            "userSpeaking": self.user_speaking,
            "agentSpeaking": self.agent_speaking,
            "timestamp": time.time(),
            **kwargs,
        }
        # The same room carries UI receipts. No second inference or browser brain.
        if self.room and self.is_running:
            try:
                await self.room.local_participant.publish_data(json.dumps(payload, separators=(",",":"), ensure_ascii=False).encode(), reliable=True, topic="nora.voice")
            except Exception as exc:
                logger.warning("[VOICE] telemetry publication failed: %s", type(exc).__name__)
        try:
            response = await self.http_client.post(
                f"{self.bridge_url}/voice/state",
                json=payload,
                headers={"X-GrowForge-Bridge-Key": self._get_bridge_key()},
            )
            response.raise_for_status()
        except Exception:
            pass

    async def interrupt_speech(self):
        """Barge-in / Interruption handler: immediately cancels ongoing TTS playback."""
        if self.agent_speaking or (self.active_tts_task and not self.active_tts_task.done()):
            logger.info("[BARGE-IN] User interrupted NORA speech. Aborting active TTS...")
            self.should_interrupt = True
            detected_at = time.time()
            self.tts_audio_source.clear_queue()
            if self.active_tts_task and not self.active_tts_task.done():
                self.active_tts_task.cancel()
            self.agent_speaking = False
            self.current_state = "listening"
            await self.update_bridge_state(
                speechEnergy=0.0,
                agentSpeaking=False,
                userSpeaking=True,
                interrupted=True,
                interruptDetectedAt=detected_at,
                sourceQueueClearedAt=time.time(), outputQueueSeconds=self.tts_audio_source.queued_duration,
                interruptSourceClearMs=round((time.time()-detected_at)*1000, 2), lifecycleEvent="interrupted",
            )

    async def process_audio_utterance(self, pcm_bytes: bytes, t_speech_end: float, sample_rate: int = 16000, overlap=False):
        if len(pcm_bytes) < sample_rate * 2 * 0.12:
            return

        self.current_state = "transcribing"
        self.user_speaking = False
        t_stt_start = time.time()
        await self.update_bridge_state(
            state="transcribing",
            sttAudioDuration=len(pcm_bytes)/(sample_rate*2),
            finalTranscript="", noraReply="", rawError=None,
            final_transcript=None, nora_first_token=None, nora_finish=None, tts_first_chunk=None,
            noraStart=None, noraFinish=None, ttsFirstPcm=None, firstPublishedPcm=None,
            voicedFramePublishedAt=None,
            playback_start=None, browserPlayback=None, latencyMetrics={},
            userSpeaking=False,
            speech_end=t_speech_end,
            stt_start=t_stt_start,
            lifecycleEvent="transcribing", sttInputOverlappedOutput=overlap,
        )

        logger.info(f"Transcribing audio ({len(pcm_bytes)} bytes) via STTProvider...")
        try:
            transcript = await self.stt_provider.transcribe(pcm_bytes, sample_rate=sample_rate)
        except Exception as e:
            logger.error(f"STT Error: {e}")
            self.current_state = "error"
            await self.update_bridge_state(rawError="STT_FAILED", sttError=type(e).__name__)
            return

        t_final_transcript = time.time()
        info = getattr(self.stt_provider, "last_info", {})
        await self.update_bridge_state(sttQuality=info)

        if not transcript:
            logger.info("No speech recognized.")
            self.current_state = "idle"
            await self.update_bridge_state(state="idle", rawFinalTranscript="")
            return

        logger.info(f"User Spoke: \"{transcript}\" (STT latency: {int((t_final_transcript - t_stt_start) * 1000)}ms)")
        from stt_evaluation import normalize
        words = lambda text: normalize(text).split()
        incoming = words(transcript)
        outgoing = words(self.last_spoken_text)
        match = SequenceMatcher(None, outgoing, incoming).find_longest_match(0, len(outgoing), 0, len(incoming))
        resemblance = match.size / max(1, len(incoming))
        suspected_echo = (overlap or time.time()-self.last_output_end < 2) and len(incoming) >= 4 and resemblance >= .85
        await self.update_bridge_state(overlapTranscript={"rawTranscript": transcript, "utteranceRms": self.telemetry.get("utteranceRms"),
            "vadState": self.telemetry.get("vadState"), "overlappedOutput": overlap,
            "outgoingTextSimilarity": resemblance, "suspectedEcho": suspected_echo,
            "actualHumanSpeechConfirmed": False})
        if suspected_echo:
            self.current_state = "listening"
            await self.update_bridge_state(lifecycleEvent="suspected_echo_suppressed", suppressedTranscript=transcript)
            return
        stop_text = " ".join(incoming)
        confident = info.get("avgLogprob") is not None and info["avgLogprob"] > -1.5 and info.get("noSpeechProbability", 1) < .6
        if confident and re.fullmatch(r"(?:(?:no|nora|please|নোরা) )?(?:stop(?: talking)?|quiet|cancel|never mind|থামো|থামুন|দাঁড়াও|দাঁড়াও)(?: please)?", stop_text):
            await self.interrupt_speech()
            self.current_state = "listening"
            await self.update_bridge_state(finalTranscript=transcript, sttFinish=t_final_transcript,
                stopIntent=True, lifecycleEvent="stop_intent", rawError=None)
            return
        await self.update_bridge_state(
            sttFinish=t_final_transcript,
            finalTranscript=transcript,
            turnCommitted=transcript,
            rawFinalTranscript=transcript,
            lifecycleEvent="final_transcript",
        )

        # 2. Query Canonical NORA Backend
        t_nora_start = time.time()
        self.current_state = "thinking"
        await self.update_bridge_state(noraStart=t_nora_start, lifecycleEvent="nora_thinking")
        await self.update_bridge_state(final_transcript=t_final_transcript, nora_first_token=None, nora_finish=None, tts_first_chunk=None, playback_start=None)
        self.should_interrupt = False
        speech_queue = asyncio.Queue()
        async def phrases():
            while True:
                phrase = await speech_queue.get()
                if phrase is None: break
                yield phrase
        detailed_speech = bool(re.search(r"\b(read|explain) (it |that |the answer )?(fully|in detail)\b|\bcontinue\b", transcript, re.I))
        speech_buffer = SpeechBuffer(self.assistant_name, self.assistant_spoken_name, limit=8 if detailed_speech else 2)
        incremental_language_supported = self.response_language != "bn" and select_provider(transcript)[0] is not None
        streamed = False
        first_token = None
        try:
            async with self.http_client.stream("POST",
                f"{self.nora_backend_url}/api/nora/turn",
                json={
                    "message": transcript,
                    "channel": "voice_headless",
                    "conversationId": self.session_id,
                    "assistantName": self.assistant_name,
                    "assistantSpokenName": self.assistant_spoken_name,
                    "isFirstTurnInSession": len(self.history) == 0,
                    "history": self.history[-12:],
                    "attachmentContext": self.surface_context,
                    "responseLanguage": self.response_language,
                    "runtimeCapabilities": {
                        "voiceInputAvailable": True,
                        "voiceOutputAvailable": True,
                        "activeVoiceBackend": "livekit",
                        "sttAvailable": True,
                        "sttProvider": "faster-whisper",
                        "ttsAvailable": True,
                        "ttsProvider": "kokoro",
                        "livekitAvailable": True,
                        "desktopBridgeAvailable": True,
                    }
                },
                headers={"X-GrowForge-Internal-Key": self._get_internal_key(), "Accept":"application/x-ndjson"},
                timeout=90.0,
            ) as resp:
                resp.raise_for_status()
                data = None
                async for line in resp.aiter_lines():
                    if not line.strip(): continue
                    event = json.loads(line)
                    if event.get("type") == "error": raise RuntimeError("NORA stream failed")
                    if event.get("type") == "delta":
                        if first_token is None:
                            first_token = event.get("at",time.time())
                            await self.update_bridge_state(nora_first_token=first_token,lifecycleEvent="nora_first_token")
                        for phrase in speech_buffer.feed(event.get("text", "")) if incremental_language_supported else []:
                            provider, language = select_provider(phrase)
                            if provider:
                                if not streamed:
                                    self.active_tts_task = asyncio.create_task(self.synthesize_and_stream(phrases(),t_speech_end,t_nora_start,None))
                                    streamed = True
                                await speech_queue.put(phrase)
                    elif event.get("type") == "result": data = event.get("result")
                if data is None: raise RuntimeError("Incomplete NORA stream")
            if data.get("status") != "ok":
                raise RuntimeError("NORA returned an error")
            reply_text = data.get("reply")
            speakable_text = data.get("speakableText") or reply_text
            if not reply_text:
                raise RuntimeError("NORA returned no reply")
            self.history.extend([{"role":"user","content":transcript},{"role":"assistant","content":reply_text}])
            await self.update_bridge_state(noraReply=reply_text, speakableText=speakable_text, dispatchType=data.get("dispatchType"), noraMetadata=data.get("metadata"), noraFinish=time.time(), turnId=self.turn_count, lifecycleEvent="nora_reply")
            action = data.get("action")
            logger.info(f"NORA Replied: \"{reply_text}\" (Action: {action})")
        except asyncio.CancelledError:
            if self.active_tts_task:
                self.active_tts_task.cancel()
                await asyncio.gather(self.active_tts_task,return_exceptions=True)
                self.active_tts_task = None
            raise
        except Exception as e:
            if self.active_tts_task:
                self.active_tts_task.cancel()
                await asyncio.gather(self.active_tts_task,return_exceptions=True)
                self.active_tts_task = None
            logger.error(f"Error querying NORA backend: {e}")
            self.current_state = "error"
            await self.update_bridge_state(rawError="NORA_FAILED", noraError=type(e).__name__)
            return

        t_nora_finish = time.time()
        await self.update_bridge_state(nora_finish=t_nora_finish, nora_first_token=first_token,
                                       noraStreaming=first_token is not None)
        if streamed: await speech_queue.put(None)

        # 3. If action exists, dispatch to Desktop Bridge for OS navigation
        if action:
            logger.info(f"Dispatching action to Desktop Bridge: {action}")
            try:
                await self.http_client.post(
                    f"{self.bridge_url}/navigate",
                    json=action,
                    headers={"X-GrowForge-Bridge-Key": self._get_bridge_key()}
                )
            except Exception as e:
                logger.warning(f"Failed to dispatch action to Desktop Bridge: {e}")

        # 4. Synthesize TTS & Stream to LiveKit Audio Track
        if not streamed:
            provider, language = select_provider(speakable_text)
            if not provider:
                self.current_state = "listening"
                await self.update_bridge_state(ttsUnavailableLanguage=language, ttsRouting=PROVIDERS,
                    agentSpeaking=False, lifecycleEvent="tts_language_unavailable")
                return
            self.active_tts_task = asyncio.create_task(
                self.synthesize_and_stream(speakable_text, t_speech_end, t_nora_start, t_nora_finish))
        try:
            await self.active_tts_task
        except asyncio.CancelledError:
            logger.info("TTS playback cancelled due to interruption.")
        finally:
            self.active_tts_task = None
            self.agent_speaking = False
            if self.current_state != "error":
                self.current_state = "user_speaking" if self.user_speaking else "listening"
            await self.update_bridge_state(agentSpeaking=False, speechEnergy=0.0, outputQueueSeconds=self.tts_audio_source.queued_duration,
                activeTtsTask=False, lifecycleEvent="return_to_listening" if not self.user_speaking else "next_user_speech_start")

    def _get_internal_key(self):
        key_path = os.path.join(os.path.dirname(__file__), "..", "growforge-ui", "data", ".internal_voice_key")
        return open(key_path, encoding="utf-8").read().strip() if os.path.exists(key_path) else ""

    async def synthesize_and_stream(
        self, text, t_speech_end: float, t_nora_start: float, t_nora_finish
    ):
        t_tts_start = time.time()
        self.last_spoken_text = text if isinstance(text,str) else ""
        await self.update_bridge_state(ttsStart=t_tts_start, ttsFrameCount=0, interrupted=False, lifecycleEvent="tts_start")

        logger.info(f"Synthesizing TTS via TTSProvider: \"{text}\"")
        first_audio_sent = False
        t_first_audio = 0.0

        try:
            async def audio_chunks():
                if isinstance(text,str):
                    async for audio in self.tts_provider.synthesize(text): yield audio
                else:
                    async for phrase in text:
                        self.last_spoken_text += " " + phrase
                        async for audio in self.tts_provider.synthesize(phrase): yield audio
            async for audio_np in audio_chunks():
                if self.should_interrupt:
                    break

                if not first_audio_sent:
                    first_audio_sent = True
                    t_first_audio = time.time()
                    latency_metrics = {
                        "speech_end_to_transcript_ms": int((t_nora_start - t_speech_end) * 1000),
                        "speech_end_to_nora_start_ms": int((t_nora_start - t_speech_end) * 1000),
                        "nora_duration_ms": int((t_nora_finish - t_nora_start) * 1000) if t_nora_finish else None,
                        "nora_finish_to_first_tts_audio_ms": int((t_first_audio - t_nora_finish) * 1000) if t_nora_finish else None,
                        "speech_end_to_tts_first_chunk_ms": int((t_first_audio - t_speech_end) * 1000),
                    }
                    logger.info(f"Latency Waterfall: {latency_metrics}")
                    await self.update_bridge_state(latencyMetrics=latency_metrics)
                    self.current_state = "speaking"
                    self.agent_speaking = True
                    await self.update_bridge_state(state="speaking", agentSpeaking=True, ttsFirstPcm=t_first_audio, tts_first_chunk=t_first_audio, lifecycleEvent="agent_speaking")

                audio_int16 = (audio_np * 32767).astype(np.int16)
                if not self.telemetry.get("voicedFramePublishedAt"):
                    voiced=np.flatnonzero(np.abs(audio_np)>.003)
                    await self.update_bridge_state(firstChunkVoicedOffsetMs=int(voiced[0]/24) if len(voiced) else None)
                pcm_bytes = audio_int16.tobytes()

                # Calculate RMS speech energy for CORE visualizer
                rms = float(np.sqrt(np.mean(audio_np.astype(np.float32) ** 2)))
                await self.update_bridge_state(speechEnergy=min(1.0, rms * 4.0))

                chunk_size = 960  # 20ms at 24000Hz (480 samples = 960 bytes)
                for i in range(0, len(pcm_bytes), chunk_size):
                    if self.should_interrupt:
                        break
                    chunk = pcm_bytes[i : i + chunk_size]
                    if len(chunk) < chunk_size:
                        chunk = chunk + b"\x00" * (chunk_size - len(chunk))
                    frame = rtc.AudioFrame(
                        data=chunk,
                        sample_rate=24000,
                        num_channels=1,
                        samples_per_channel=480,
                    )
                    await self.tts_audio_source.capture_frame(frame)
                    if not self.telemetry.get("voicedFramePublishedAt") and np.max(np.abs(np.frombuffer(chunk,dtype=np.int16).astype(np.float32)))>98:
                        await self.update_bridge_state(voicedFramePublishedAt=time.time())
                    if self.telemetry.get("ttsFrameCount",0) == 0:
                        await self.update_bridge_state(firstPublishedPcm=time.time())
                    self.telemetry["ttsFrameCount"] = self.telemetry.get("ttsFrameCount", 0) + 1
                    await asyncio.sleep(0)
            await self.tts_audio_source.wait_for_playout()
            await self.update_bridge_state(ttsFinish=time.time(), ttsFrameCount=self.telemetry.get("ttsFrameCount",0))

        except asyncio.CancelledError:
            self.tts_audio_source.clear_queue()
            raise
        except Exception as exc:
            self.current_state = "error"
            await self.update_bridge_state(rawError="TTS_FAILED", ttsError=type(exc).__name__)
        finally:
            self.last_output_end = time.time()

    async def start(self):
        await self.initialize_models()

        logger.info(f"Connecting NORA Voice Agent to {self.url} (Room: {self.room_name})...")
        self.room = rtc.Room()

        @self.room.on("track_unsubscribed")
        def on_input_unsubscribed(track, publication, participant):
            if publication.sid == self.telemetry.get("inputTrackSid") and self.input_task:
                self.input_task.cancel()

        @self.room.on("participant_disconnected")
        def on_input_disconnected(participant):
            if participant.identity == self.telemetry.get("inputParticipant"):
                if self.input_task and not self.input_task.done():
                    self.input_task.cancel()
                else:
                    # A completed input task must not leave a stale microphone owner in heartbeat telemetry.
                    self.telemetry.update(inputParticipant="", inputTrackSid="", audioFrameCount=0, userAudioEnergy=0)
                    asyncio.create_task(self.update_bridge_state(inputParticipant="", inputTrackSid="", audioFrameCount=0, userAudioEnergy=0))

        @self.room.on("data_received")
        def on_control(packet):
            if packet.topic != "nora.control" or not packet.participant:
                return
            if packet.participant.identity != self.telemetry.get("inputParticipant"):
                return
            try:
                body = json.loads(packet.data)
                if body.get("type") == "session_config":
                    self.assistant_name = str(body.get("displayName") or "NORA")[:60]
                    self.assistant_spoken_name = str(body.get("spokenName") or self.assistant_name)[:60]
                    conversation_id = str(body.get("conversationId") or "")
                    if re.fullmatch(r"[a-zA-Z0-9_-]{8,100}", conversation_id) and self.session_id != conversation_id:
                        self.session_id = conversation_id
                        self.history = []
                        self.turn_count = 0
                        self.telemetry["conversationId"] = self.session_id
                    self.surface_context = str(body.get("surfaceContext") or "")[:10000]
                    preference = body.get("responseLanguage", "auto")
                    self.response_language = preference if preference in ("auto","en","bn") else "auto"
                elif body.get("type") == "playback_receipt":
                    if body.get("event") == "playback_start" and body.get("turnId") == self.turn_count:
                        self.telemetry["playback_start"] = body.get("at")
                        self.telemetry["latencyMetrics"] = {**self.telemetry.get("latencyMetrics",{}),
                            "speech_end_to_received_audio_ms":body.get("speechEndToReceivedAudioMs"),
                            "playbackMeasurementScope":body.get("measurementScope")}
                    task = asyncio.create_task(self.update_bridge_state(browserPlayback=body, lifecycleEvent=body.get("event","playback_receipt")))
                    self.tasks.add(task)
                    task.add_done_callback(self.tasks.discard)
            except Exception:
                logger.warning("Invalid browser control receipt")

        @self.room.on("track_subscribed")
        def on_track_subscribed(track: rtc.Track, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
            if track.kind == rtc.TrackKind.KIND_AUDIO and publication.source == rtc.TrackSource.SOURCE_MICROPHONE:
                logger.info(f"Subscribed to user audio track: {track.sid} from {participant.identity}")
                task = asyncio.create_task(self._listen_user_track(track, participant.identity, publication.sid))
                self.tasks.add(task)
                task.add_done_callback(self.tasks.discard)

        jwt = self._generate_token()
        await self.room.connect(self.url, jwt)
        logger.info(f"NORA Voice Agent connected (SID: {self.room.local_participant.sid}).")

        # Publish outgoing TTS track
        self.tts_track = rtc.LocalAudioTrack.create_audio_track("nora_voice_out", self.tts_audio_source)
        pub = await self.room.local_participant.publish_track(self.tts_track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
        logger.info(f"Published NORA TTS audio track: {pub.sid}")

        self.is_running = True
        await self.update_bridge_state(state="connected", agentReady=True, roomSid=await self.room.sid, agentSid=self.room.local_participant.sid, outputTrackSid=pub.sid)
        async def heartbeat():
            while self.is_running:
                await self.update_bridge_state()
                await asyncio.sleep(1)
        self.heartbeat_task = asyncio.create_task(heartbeat())

    async def _listen_user_track(self, track: rtc.Track, identity: str, track_sid: str):
        if self.input_task and self.input_task is not asyncio.current_task() and not self.input_task.done():
            self.input_task.cancel()
            await asyncio.gather(self.input_task, return_exceptions=True)
        self.input_task = asyncio.current_task()
        audio_stream = rtc.AudioStream(track, sample_rate=16000, num_channels=1)
        vad_stream = self.vad.stream()
        turn_stream = self.turn_detector.stream()
        frame_count = 0
        latest_frame = 0.0
        last_speech_start = 0.0
        last_report = 0.0
        overlap = False
        pending_pcm = bytearray()
        async def commit(ended, generation):
            try:
                prediction = await asyncio.wait_for(turn_stream.predict(), timeout=3)
                probability = prediction.end_of_turn_probability
                threshold = await turn_stream.unlikely_threshold(None) or .5
                await self.update_bridge_state(turnDetectorState="predicted", endOfTurnProbability=probability)
                if probability < threshold:
                    await asyncio.sleep(1.0)
                if last_speech_start != generation:
                    return
                # Consume BEFORE STT/NORA/TTS. Never leave old audio in the next turn.
                pcm = bytes(pending_pcm)
                pending_pcm.clear()
                self.turn_count += 1
                turn_stream.flush("committed")
                await self.update_bridge_state(turnDetectorState="committed", lifecycleEvent="turn_committed")
                self.active_turn_task = asyncio.current_task()
                await self.process_audio_utterance(pcm, ended, overlap=overlap)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self.current_state = "error"
                await self.update_bridge_state(rawError="TURN_NOT_COMMITTED", turnError=type(exc).__name__)
                logger.exception("[VOICE] turn commit failed")
            finally:
                if self.active_turn_task is asyncio.current_task(): self.active_turn_task = None
        commit_tasks = set()
        async def vad_events():
            nonlocal last_speech_start, overlap
            async for event in vad_stream:
                if event.type == vad_api.VADEventType.INFERENCE_DONE:
                    self.telemetry["vadConfidence"] = event.probability
                    continue
                if event.type == vad_api.VADEventType.START_OF_SPEECH:
                    last_speech_start = time.monotonic()
                    overlap = self.agent_speaking or time.time()-self.last_output_end < .5
                    turn_stream.cancel_inference()
                    for task in list(commit_tasks):
                        if not task.done(): task.cancel()
                    await self.interrupt_speech()
                    if self.active_turn_task and not self.active_turn_task.done():
                        self.active_turn_task.cancel()
                    self.user_speaking = True
                    self.current_state = "user_speaking"
                    await self.update_bridge_state(vadState="speech-start",
                        lifecycleEvent="next_user_speech_start" if self.turn_count else "user_speaking",
                        speechStartedDuringOutput=overlap)
                elif event.type == vad_api.VADEventType.END_OF_SPEECH:
                    self.user_speaking = False
                    pcm = b"".join(bytes(frame.data) for frame in event.frames)
                    pending_pcm.extend(pcm)
                    if len(pending_pcm) > 16000*2*60:
                        pending_pcm.clear()
                        await self.update_bridge_state(rawError="TURN_TOO_LONG")
                        continue
                    await self.update_bridge_state(vadState="speech-end", lifecycleEvent="speech_end", vadSpeechDuration=event.speech_duration,
                        vadCapturedSeconds=len(pcm)/32000,
                        utteranceRms=float(np.sqrt(np.mean((np.frombuffer(pcm,dtype=np.int16).astype(np.float32)/32768)**2))) if pcm else 0)
                    generation = last_speech_start
                    # A continued phrase supersedes the earlier prediction and
                    # retains its audio; each committed turn consumes it once.
                    async def run_commit(generation=generation):
                        await commit(time.time(), generation)
                    task = asyncio.create_task(run_commit())
                    commit_tasks.add(task)
                    task.add_done_callback(commit_tasks.discard)
                    self.tasks.add(task)
                    task.add_done_callback(self.tasks.discard)
        consumer = asyncio.create_task(vad_events())
        def vad_failed(task):
            if task.cancelled(): return
            if task.exception():
                self.current_state = "error"
                receipt = asyncio.create_task(self.update_bridge_state(rawError="VAD_FAILED", vadError=type(task.exception()).__name__))
                self.tasks.add(receipt)
                receipt.add_done_callback(self.tasks.discard)
        consumer.add_done_callback(vad_failed)
        # A new input track must never inherit another participant's turn receipts.
        self.telemetry = {key: self.telemetry[key] for key in
                          ("agentReady", "roomName", "agentIdentity", "roomSid", "agentSid", "outputTrackSid")
                          if key in self.telemetry}
        if identity != self.input_identity:
            self.history = []
            self.turn_count = 0
            self.session_id = str(uuid.uuid4())
            self.surface_context = ""
        self.input_identity = identity
        await self.update_bridge_state(state="connected", inputParticipant=identity,
                                       inputTrackSid=track_sid, audioFrameCount=0, rawError=None,
                                       finalTranscript="", noraReply="", turnId=0,
                                       agentSpeaking=False, speechEnergy=0)
        await self.update_bridge_state(conversationId=self.session_id, inputParticipantSid=self.room.remote_participants[identity].sid,
            lifecycleEvent="voice_session_started", vadPreRollSeconds=.5, vadSilenceSeconds=.65)
        try:
            async for frame_event in audio_stream:
                frame = frame_event.frame
                frame_count += 1
                latest_frame = time.monotonic()
                arr = np.frombuffer(frame.data, dtype=np.int16).astype(np.float32)/32768
                rms = float(np.sqrt(np.mean(arr**2)))
                vad_stream.push_frame(frame)
                turn_stream.push_audio(frame)
                if latest_frame-last_report >= .25:
                    last_report = latest_frame
                    if frame_count == 1 or self.current_state in ("connected","idle","listening"):
                        entering = self.current_state != "listening"
                        self.current_state = "listening"
                        if entering: await self.update_bridge_state(lifecycleEvent="listening")
                    await self.update_bridge_state(inputParticipant=identity, inputTrackSid=track_sid,
                        audioFrameCount=frame_count, audioSampleRate=frame.sample_rate,
                        audioChannels=frame.num_channels, inputRms=rms,
                        userAudioEnergy=min(1.0,rms*5), audioFrameAt=time.time())
        except Exception as exc:
            self.current_state = "error"
            await self.update_bridge_state(rawError="NO_AUDIO_FRAMES", inputError=type(exc).__name__)
            logger.exception("[VOICE] audio ingress failed")
        finally:
            for task in list(commit_tasks): task.cancel()
            await asyncio.gather(*commit_tasks, return_exceptions=True)
            consumer.cancel()
            await asyncio.gather(consumer, return_exceptions=True)
            await vad_stream.aclose()
            await turn_stream.aclose()
            await audio_stream.aclose()
            self.current_state = "connected"
            await self.interrupt_speech()
            await self.update_bridge_state(audioFrameCount=0, userAudioEnergy=0, inputParticipant="", inputTrackSid="")

    async def stop(self):
        self.is_running = False
        if hasattr(self, "heartbeat_task"):
            self.heartbeat_task.cancel()
        for task in list(self.tasks): task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        if self.active_tts_task and not self.active_tts_task.done():
            self.active_tts_task.cancel()
        if self.room:
            await self.room.disconnect()
        await self.http_client.aclose()
        logger.info("NORA Voice Agent stopped cleanly.")

async def main():
    agent = NoraVoiceAgent()
    await agent.start()
    try:
        while True:
            await asyncio.sleep(1.0)
    except (KeyboardInterrupt, asyncio.CancelledError):
        await agent.stop()

if __name__ == "__main__":
    asyncio.run(main())
