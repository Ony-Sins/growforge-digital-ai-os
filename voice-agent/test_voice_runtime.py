"""AUTOMATED/SYNTHETIC: real RTC audio -> agent -> STT -> NORA -> PCM.
Never acquires a physical microphone or certifies audible user acceptance.
"""
import asyncio
import json
import os
import time
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from livekit import api, rtc

async def main():
    fixture = Path(__file__).with_name("nora_question_synthetic.wav")
    if not fixture.exists():
        from kokoro import KPipeline
        pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
        chunks = [audio.detach().cpu().numpy() for _, _, audio in pipeline("Nora, what are my active missions?", voice="af_heart")]
        sf.write(fixture, np.concatenate(chunks), 24000)
    room = rtc.Room()
    evidence = {"test": "AUTOMATED/SYNTHETIC", "events": [], "outputFrames": 0, "outputPeak": 0.0}
    tasks = []
    source = None
    async def receive(track):
        stream = rtc.AudioStream(track, sample_rate=24000, num_channels=1)
        try:
            async for event in stream:
                values = np.frombuffer(event.frame.data, dtype=np.int16)
                evidence["outputFrames"] += 1
                evidence["outputPeak"] = max(evidence["outputPeak"], float(np.max(np.abs(values.astype(np.float32)))) / 32768)
        finally:
            await stream.aclose()
    @room.on("track_subscribed")
    def subscribed(track, publication, participant):
        if participant.identity == "nora_voice_agent" and track.kind == rtc.TrackKind.KIND_AUDIO:
            evidence["outputSid"] = publication.sid
            tasks.append(asyncio.create_task(receive(track)))
    @room.on("data_received")
    def received(packet):
        if packet.topic == "nora.voice" and packet.participant.identity == "nora_voice_agent":
            data = json.loads(packet.data)
            evidence["events"].append(data)
    identity = "synthetic_audit_" + str(int(time.time()))
    token = api.AccessToken(os.getenv("LIVEKIT_API_KEY", "devkey"), os.getenv("LIVEKIT_API_SECRET", "secret")).with_identity(identity).with_grants(api.VideoGrants(room_join=True, room="room_vs_headless_default", can_publish=True, can_subscribe=True)).to_jwt()
    try:
        await room.connect("ws://127.0.0.1:7880", token)
        evidence["roomSid"] = await room.sid
        evidence["identity"] = identity
        evidence["participants"] = [p.identity for p in room.remote_participants.values()]
        assert "nora_voice_agent" in evidence["participants"], "AGENT_NOT_PRESENT"
        source = rtc.AudioSource(16000, 1)
        track = rtc.LocalAudioTrack.create_audio_track("synthetic_microphone", source)
        pub = await room.local_participant.publish_track(track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
        evidence["microphoneSid"] = pub.sid
        await asyncio.sleep(1)
        audio, rate = sf.read(fixture, dtype="float32")
        if audio.ndim > 1: audio = audio.mean(axis=1)
        audio = resample_poly(audio, 16000, rate)
        audio = np.concatenate([np.zeros(16000), audio, np.zeros(48000)])
        pcm = np.clip(audio * 32767, -32768, 32767).astype(np.int16)
        for offset in range(0, len(pcm), 320):
            chunk = pcm[offset:offset + 320]
            if len(chunk) < 320: chunk = np.pad(chunk, (0, 320-len(chunk)))
            await source.capture_frame(rtc.AudioFrame(chunk.tobytes(), 16000, 1, 320))
            await asyncio.sleep(.02)
        deadline = time.monotonic() + float(os.getenv("VOICE_TEST_TIMEOUT", "45"))
        while time.monotonic() < deadline:
            if any(e.get("noraReply") for e in evidence["events"]) and evidence["outputPeak"] > .001: break
            await asyncio.sleep(.25)
        assert any(e.get("audioFrameCount", 0) > 0 for e in evidence["events"]), "NO_AUDIO_FRAME_TELEMETRY"
        assert any(e.get("finalTranscript") for e in evidence["events"]), "NO_FINAL_TRANSCRIPT"
        assert any(e.get("dispatchType") == "DETERMINISTIC_QUERY" for e in evidence["events"]), "NORA_QUERY_NOT_CONFIRMED"
        assert evidence["outputPeak"] > .001, "NO_NON_SILENT_RTC_OUTPUT"
        print("PASS AUTOMATED/SYNTHETIC RTC -> VAD/turn -> Whisper -> NORA -> Kokoro -> RTC receiver")
    finally:
        Path(__file__).with_name("voice_runtime_evidence.json").write_text(json.dumps(evidence, indent=2), encoding="utf-8")
        for task in tasks: task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await room.disconnect()
        if source: await source.aclose()

if __name__ == "__main__": asyncio.run(main())
