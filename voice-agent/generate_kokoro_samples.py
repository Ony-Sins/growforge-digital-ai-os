import time
import os
import json
import soundfile as sf
import numpy as np
from kokoro import KPipeline

def generate_samples():
    print("Loading Kokoro KPipeline for sample generation...")
    t0 = time.perf_counter()
    pipeline = KPipeline(lang_code='a')
    t_load = time.perf_counter() - t0
    
    samples = [
        {"id": "A", "text": "Good morning, Ony. Taking you right to your dashboard.", "file": "kokoro_sample_a.wav"},
        {"id": "B", "text": "I found the issue. Would you like me to fix it?", "file": "kokoro_sample_b.wav"},
        {"id": "C", "text": "Your mission is complete.", "file": "kokoro_sample_c.wav"},
    ]
    
    results = {
        "model": "Kokoro-82M (kokoro v0.9.4)",
        "voice": "af_heart",
        "sample_rate_hz": 24000,
        "load_time_sec": round(t_load, 3),
        "samples": []
    }
    
    for s in samples:
        t_start = time.perf_counter()
        audio_chunks = []
        for gs, ps, audio in pipeline(s["text"], voice="af_heart", speed=1.0):
            audio_chunks.append(audio)
        t_synth = time.perf_counter() - t_start
        
        full_audio = np.concatenate(audio_chunks)
        duration_sec = len(full_audio) / 24000
        output_path = os.path.abspath(s["file"])
        sf.write(output_path, full_audio, 24000)
        
        sample_info = {
            "id": s["id"],
            "text": s["text"],
            "file": output_path,
            "duration_sec": round(duration_sec, 3),
            "synthesis_time_sec": round(t_synth, 3),
            "rtf": round(t_synth / duration_sec, 4)
        }
        results["samples"].append(sample_info)
        print(f"Sample {s['id']} generated: {output_path} ({round(duration_sec, 2)}s audio in {round(t_synth, 2)}s, RTF: {round(t_synth/duration_sec, 3)})")
        
    with open("kokoro_evaluation_samples.json", "w") as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    generate_samples()
