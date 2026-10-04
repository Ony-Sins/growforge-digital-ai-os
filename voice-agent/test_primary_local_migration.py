"""
AUTOMATED/SYNTHETIC VERIFICATION SUITE
Primary Local NORA Voice Migration (LiveKit + faster-whisper + executeNoraTurn + Kokoro)
"""

import sys
import os
import json
import time
import asyncio
import httpx
import numpy as np
import soundfile as sf

# Add voice agent to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from agent import FasterWhisperSTTProvider, KokoroTTSProvider
from desktop_bridge import DesktopBridge

async def test_assistant_identity_and_capabilities():
    print("\n--- [AUTOMATED/SYNTHETIC] 1. Testing executeNoraTurn Identity & Capabilities ---")
    async with httpx.AsyncClient(timeout=10.0) as client:
        # Test 1: "What's your name?"
        resp1 = await client.post(
            "http://127.0.0.1:3000/api/nora/turn",
            json={"message": "What's your name?", "channel": "voice_headless", "conversationId": "test_ident"},
            headers={"X-GrowForge-Internal-Key": "growforge_local_dev_secret"}
        )
        assert resp1.status_code == 200, f"Status: {resp1.status_code}"
        data1 = resp1.json()
        print(f"User: \"What's your name?\" -> NORA: \"{data1.get('reply')}\"")
        assert "NORA" in data1.get("reply", ""), "NORA identity missing from reply"
        assert data1.get("metadata", {}).get("assistantName") == "NORA"
        assert data1.get("metadata", {}).get("preferredDisplayName") == "Ony"

        # Test 2: "Can you talk?"
        resp2 = await client.post(
            "http://127.0.0.1:3000/api/nora/turn",
            json={"message": "Can you talk?", "channel": "voice_headless", "conversationId": "test_cap"},
            headers={"X-GrowForge-Internal-Key": "growforge_local_dev_secret"}
        )
        assert resp2.status_code == 200
        data2 = resp2.json()
        print(f"User: \"Can you talk?\" -> NORA: \"{data2.get('reply')}\"")
        assert "speak" in data2.get("reply", "").lower() or "voice" in data2.get("reply", "").lower()

        # Test 3: "Nora, what are my active missions?"
        resp3 = await client.post(
            "http://127.0.0.1:3000/api/nora/turn",
            json={"message": "Nora, what are my active missions?", "channel": "voice_headless", "conversationId": "test_missions"},
            headers={"X-GrowForge-Internal-Key": "growforge_local_dev_secret"}
        )
        assert resp3.status_code == 200
        data3 = resp3.json()
        print(f"User: \"Nora, what are my active missions?\" -> NORA: \"{data3.get('reply')}\"")
        assert "mission" in data3.get("reply", "").lower()
    print("[AUTOMATED/SYNTHETIC] executeNoraTurn Identity & Capabilities: PASS")

async def test_stt_and_tts_providers():
    print("\n--- [AUTOMATED/SYNTHETIC] 2. Testing STTProvider (faster-whisper) & TTSProvider (Kokoro) ---")
    stt = FasterWhisperSTTProvider(model_size="base.en", compute_type="int8")
    stt.initialize()

    # Generate synthetic speech audio via Kokoro
    tts = KokoroTTSProvider(voice="af_heart")
    tts.initialize()

    test_phrase = "Nora, what are my active missions?"
    print(f"Synthesizing test phrase: \"{test_phrase}\"...")
    audio_chunks = []
    async for chunk in tts.synthesize(test_phrase):
        audio_chunks.append(chunk)
    
    full_audio = np.concatenate(audio_chunks)
    assert len(full_audio) > 0, "No audio generated"
    print(f"Kokoro synthesis OK: {len(full_audio)} samples generated at 24kHz")

    # Resample float32 24kHz audio to 16kHz int16 PCM for STT testing
    import scipy.signal
    num_samples_16k = int(len(full_audio) * 16000 / 24000)
    audio_16k = scipy.signal.resample(full_audio, num_samples_16k)
    pcm_int16 = (np.clip(audio_16k, -1.0, 1.0) * 32767).astype(np.int16).tobytes()

    print("Transcribing via faster-whisper with authoritative terminology context...")
    transcript = await stt.transcribe(pcm_int16, sample_rate=16000)
    print(f"Recognized STT: \"{transcript}\"")
    assert "nora" in transcript.lower() or "active" in transcript.lower() or "mission" in transcript.lower()
    print("[AUTOMATED/SYNTHETIC] STT & TTS Providers: PASS")

async def test_livekit_token_endpoint():
    print("\n--- [AUTOMATED/SYNTHETIC] 3. Testing Next.js /api/nora/voice-token Endpoint ---")
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            "http://127.0.0.1:3000/api/nora/voice-token",
            json={"room": "room_vs_headless_default", "name": "Ony (Browser)"}
        )
        assert resp.status_code == 200, f"Status: {resp.status_code}"
        data = resp.json()
        assert "token" in data, "No token in response"
        print(f"Generated LiveKit Client Token: {data['token'][:24]}... (Room: {data['room']})")
    print("[AUTOMATED/SYNTHETIC] LiveKit Token Endpoint: PASS")

async def test_mic_owner_coordination():
    print("\n--- [AUTOMATED/SYNTHETIC] 4. Testing Strict Single Mic Ownership Coordination ---")
    # Start Desktop Bridge on test port or check running
    bridge = DesktopBridge(host="127.0.0.1", port=7891)
    await bridge.start()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "http://127.0.0.1:7891/voice/mic-owner",
                json={"owner": "browser_livekit"},
                headers={"X-GrowForge-Bridge-Key": bridge.bridge_key}
            )
            assert resp.status_code == 200
            assert resp.json().get("micOwner") == "browser_livekit"

            h_resp = await client.get("http://127.0.0.1:7891/health")
            assert h_resp.status_code == 200
            assert h_resp.json().get("micOwner") == "browser_livekit"
            print("Desktop Bridge verified micOwner: browser_livekit")
    finally:
        pass
    print("[AUTOMATED/SYNTHETIC] Mic Ownership Coordination: PASS")

async def main():
    print("==================================================================")
    print("STARTING AUTOMATED/SYNTHETIC VERIFICATION FOR LOCAL NORA VOICE")
    print("==================================================================")
    await test_assistant_identity_and_capabilities()
    await test_livekit_token_endpoint()
    await test_mic_owner_coordination()
    await test_stt_and_tts_providers()
    print("==================================================================")
    print("ALL AUTOMATED/SYNTHETIC SUITE TESTS COMPLETED SUCCESSFULLY (0 FAILURES)")
    print("==================================================================")

if __name__ == "__main__":
    asyncio.run(main())

