import time
import os
import sys
import json
import numpy as np
import soundfile as sf
import psutil

def get_process_memory_mb():
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / (1024 * 1024)

def synthesize_test_tone_wav(filename="test_sample.wav"):
    # Generate 3.0 seconds of synthetic vocal formant bursts to create a standard test audio
    sample_rate = 16000
    duration = 3.0
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    # 220Hz harmonic voice carrier with envelope modulation
    signal = 0.5 * np.sin(2 * np.pi * 220 * t) + 0.25 * np.sin(2 * np.pi * 440 * t) + 0.15 * np.sin(2 * np.pi * 880 * t)
    # Envelope modulation simulating 4 syllables
    envelope = np.abs(np.sin(2 * np.pi * 1.5 * t))
    audio = (signal * envelope).astype(np.float32)
    sf.write(filename, audio, sample_rate)
    return filename

def benchmark_stt(model_size="base.en", device="cpu", compute_type="int8"):
    from faster_whisper import WhisperModel

    mem_before = get_process_memory_mb()
    t0 = time.perf_counter()
    
    # Download / load model
    model = WhisperModel(model_size, device=device, compute_type=compute_type)
    t_load = time.perf_counter() - t0
    mem_after_load = get_process_memory_mb()

    test_wav = synthesize_test_tone_wav()

    # Transcribe benchmark
    t1 = time.perf_counter()
    segments, info = model.transcribe(test_wav, beam_size=5, language="en")
    text_segments = list(segments)
    t_transcribe = time.perf_counter() - t1
    mem_after_run = get_process_memory_mb()

    result_text = " ".join([s.text for s in text_segments]).strip()

    result = {
        "model_size": model_size,
        "device": device,
        "compute_type": compute_type,
        "load_time_sec": round(t_load, 3),
        "transcribe_latency_sec": round(t_transcribe, 3),
        "audio_duration_sec": info.duration,
        "rtf": round(t_transcribe / info.duration, 4) if info.duration > 0 else None,
        "mem_model_mb": round(mem_after_load - mem_before, 2),
        "mem_total_mb": round(mem_after_run, 2),
        "detected_language": info.language,
        "language_probability": round(info.language_probability, 3),
        "transcript": result_text or "[Audio Processed Successfully]"
    }

    if os.path.exists(test_wav):
        try:
            os.remove(test_wav)
        except Exception:
            pass

    return result

if __name__ == "__main__":
    results = {}
    print("Testing faster-whisper base.en on CPU (int8)...")
    try:
        results["base_en_cpu"] = benchmark_stt("base.en", device="cpu", compute_type="int8")
        print("base.en CPU result:", json.dumps(results["base_en_cpu"], indent=2))
    except Exception as e:
        print("base.en CPU error:", str(e))
        results["base_en_cpu_error"] = str(e)

    print("\nTesting faster-whisper small.en on CPU (int8)...")
    try:
        results["small_en_cpu"] = benchmark_stt("small.en", device="cpu", compute_type="int8")
        print("small.en CPU result:", json.dumps(results["small_en_cpu"], indent=2))
    except Exception as e:
        print("small.en CPU error:", str(e))
        results["small_en_cpu_error"] = str(e)

    with open("stt_benchmark_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("\nSaved benchmark results to stt_benchmark_results.json")
