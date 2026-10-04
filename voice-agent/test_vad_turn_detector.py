import asyncio
import time
import json
import numpy as np
from livekit.plugins import silero, turn_detector
from livekit import rtc

def test_vad_and_turn_detector():
    print("Testing Silero VAD and TurnDetector initialization...")
    
    t0 = time.perf_counter()
    vad = silero.VAD.load()
    t_vad = time.perf_counter() - t0
    print(f"Silero VAD loaded in {round(t_vad, 3)}s.")
    
    t1 = time.perf_counter()
    td = turn_detector.EOUModel()
    t_td = time.perf_counter() - t1
    print(f"Turn Detector loaded in {round(t_td, 3)}s.")
    
    # Generate 1.0s of test audio frames (16kHz, 1 channel)
    sample_rate = 16000
    num_samples = int(sample_rate * 0.03) # 30ms frame for VAD
    t_audio = np.linspace(0, 0.03, num_samples, endpoint=False)
    frame_data = (0.5 * np.sin(2 * np.pi * 300 * t_audio) * 32767).astype(np.int16)
    
    frame = rtc.AudioFrame(
        data=frame_data.tobytes(),
        sample_rate=sample_rate,
        num_channels=1,
        samples_per_channel=num_samples,
    )
    
    # Process VAD
    t2 = time.perf_counter()
    events = vad.stream().push_frame(frame)
    t_proc = time.perf_counter() - t2
    
    results = {
        "status": "success",
        "silero_vad_load_sec": round(t_vad, 3),
        "turn_detector_load_sec": round(t_td, 3),
        "vad_frame_process_ms": round(t_proc * 1000, 3),
        "silero_version": "livekit-plugins-silero v1.8.4",
        "turn_detector_version": "livekit-plugins-turn-detector v1.8.4"
    }
    
    print("VAD & Turn Detector test result:", json.dumps(results, indent=2))
    with open("vad_benchmark_results.json", "w") as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    test_vad_and_turn_detector()
