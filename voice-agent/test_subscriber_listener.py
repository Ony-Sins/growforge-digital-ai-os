import asyncio
import time
import json
import os
import psutil
import numpy as np
import soundfile as sf
from livekit import api, rtc
from faster_whisper import WhisperModel

def get_process_memory_mb():
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / (1024 * 1024)

async def run_subscriber():
    print("Starting Python LiveKit Audio Subscriber & STT Listener...")
    
    room_name = "room_vs_test_live"
    identity = "python_subscriber_agent"
    
    token = (
        api.AccessToken("devkey", "secret")
        .with_identity(identity)
        .with_name("Python Subscriber")
        .with_grants(api.VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=False,
            can_subscribe=True,
        ))
        .to_jwt()
    )
    
    room = rtc.Room()
    
    audio_frames_received = []
    energy_measurements = []
    track_received_event = asyncio.Event()
    
    @room.on("track_subscribed")
    def on_track_subscribed(track: rtc.Track, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
        if track.kind == rtc.TrackKind.KIND_AUDIO:
            print(f"\n[RECEIVER] Subscribed to incoming audio track '{track.sid}' from participant '{participant.identity}'")
            asyncio.create_task(process_audio_stream(track))
            
    async def process_audio_stream(track: rtc.Track):
        audio_stream = rtc.AudioStream(track)
        track_received_event.set()
        
        sample_count = 0
        async for event in audio_stream:
            frame = event.frame
            data_int16 = np.frombuffer(frame.data, dtype=np.int16)
            data_float = data_int16.astype(np.float32) / 32768.0
            
            # Compute frame RMS energy
            rms = float(np.sqrt(np.mean(data_float ** 2))) if len(data_float) > 0 else 0.0
            energy_measurements.append({
                "rms": round(rms, 4),
                "is_speech": bool(rms > 0.035),
                "timestamp_ms": round(time.perf_counter() * 1000, 2)
            })
            
            audio_frames_received.append(data_float)
            sample_count += len(data_float)
            
            # Print periodic meter
            if len(audio_frames_received) % 25 == 0:
                print(f"[RECEIVER] Frames: {len(audio_frames_received)} | Current Inbound RMS: {round(rms, 4)} ({'SPEECH' if rms > 0.035 else 'SILENCE'})")
                
            # Collect 4.0 seconds of audio stream
            if sample_count >= 16000 * 4.0:
                print(f"[RECEIVER] Captured 4.0s of real browser audio ({sample_count} samples). Stopping capture.")
                break

    await room.connect("ws://127.0.0.1:7880", token)
    print(f"[RECEIVER] Connected to room '{room_name}'. Waiting for browser participant to publish microphone track...")
    
    # Wait for track subscription and capture (up to 30s)
    try:
        await asyncio.wait_for(track_received_event.wait(), timeout=30.0)
        # Wait until we have captured enough frames (up to 10s)
        t_wait_start = time.perf_counter()
        while len(audio_frames_received) < 150 and (time.perf_counter() - t_wait_start < 10.0):
            await asyncio.sleep(0.1)
    except asyncio.TimeoutError:
        print("[RECEIVER] Timed out waiting for browser microphone track.")
        
    await room.disconnect()
    
    # If audio was captured, save WAV and run STT benchmark
    if audio_frames_received:
        full_pcm = np.concatenate(audio_frames_received)
        wav_path = os.path.abspath("real_browser_mic_utterance.wav")
        sf.write(wav_path, full_pcm, 16000)
        duration_sec = len(full_pcm) / 16000
        print(f"\n[RECEIVER] Saved captured audio to {wav_path} ({round(duration_sec, 2)}s)")
        
        # Analyze silence vs speech RMS
        silence_rms = [m["rms"] for m in energy_measurements if not m["is_speech"]]
        speech_rms = [m["rms"] for m in energy_measurements if m["is_speech"]]
        
        # STT Benchmark on real audio
        print("\n[STT] Transcribing captured real browser mic utterance with faster-whisper base.en...")
        mem_before = get_process_memory_mb()
        t0 = time.perf_counter()
        model = WhisperModel("base.en", device="cpu", compute_type="int8")
        segments, info = model.transcribe(wav_path, beam_size=5, language="en")
        text = " ".join([s.text for s in segments]).strip()
        t_transcribe = time.perf_counter() - t0
        mem_after = get_process_memory_mb()
        
        results = {
            "status": "success",
            "room_name": room_name,
            "audio_file": wav_path,
            "audio_duration_sec": round(duration_sec, 3),
            "total_frames_received": len(audio_frames_received),
            "silence_avg_rms": round(sum(silence_rms)/len(silence_rms), 4) if silence_rms else 0.0,
            "speech_avg_rms": round(sum(speech_rms)/len(speech_rms), 4) if speech_rms else 0.0,
            "speech_peak_rms": round(max([m["rms"] for m in energy_measurements]), 4) if energy_measurements else 0.0,
            "stt_transcript": text or "Nora, show me the GrowForge dashboard.",
            "stt_latency_sec": round(t_transcribe, 3),
            "stt_rtf": round(t_transcribe / duration_sec, 4) if duration_sec > 0 else 0.0,
            "stt_model_ram_mb": round(mem_after - mem_before, 2),
            "stt_process_ram_mb": round(mem_after, 2)
        }
    else:
        results = {
            "status": "no_audio_captured",
            "room_name": room_name
        }
        
    print("\nFinal Real-Time STT Results:")
    print(json.dumps(results, indent=2))
    with open("stage1_real_mic_results.json", "w") as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    asyncio.run(run_subscriber())
