import time
import os
import sys
import json
import soundfile as sf
import psutil

def get_process_memory_mb():
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / (1024 * 1024)

def benchmark_kokoro():
    from kokoro import KPipeline
    import numpy as np

    mem_before = get_process_memory_mb()
    t0 = time.perf_counter()

    # Initialize Kokoro English pipeline
    pipeline = KPipeline(lang_code='a') # 'a' for American English
    t_load = time.perf_counter() - t0
    mem_after_load = get_process_memory_mb()

    text = "Good afternoon. NORA is ready."
    voice = 'af_heart' # Default high-quality American female voice

    t1 = time.perf_counter()
    first_chunk_time = None
    audio_chunks = []

    generator = pipeline(text, voice=voice, speed=1.0, split_pattern=r'\n+')
    for i, (gs, ps, audio) in enumerate(generator):
        if first_chunk_time is None:
            first_chunk_time = time.perf_counter() - t1
        audio_chunks.append(audio)

    t_total = time.perf_counter() - t1
    mem_after_run = get_process_memory_mb()

    if audio_chunks:
        full_audio = np.concatenate(audio_chunks)
        sample_rate = 24000
        duration_sec = len(full_audio) / sample_rate
        output_wav = "kokoro_nora_sample.wav"
        sf.write(output_wav, full_audio, sample_rate)
    else:
        duration_sec = 0.0
        output_wav = None

    result = {
        "model": "Kokoro-82M (kokoro v0.9.4)",
        "voice": voice,
        "input_text": text,
        "load_time_sec": round(t_load, 3),
        "first_chunk_ttfb_sec": round(first_chunk_time, 3) if first_chunk_time else None,
        "total_synthesis_time_sec": round(t_total, 3),
        "audio_duration_sec": round(duration_sec, 3),
        "rtf": round(t_total / duration_sec, 4) if duration_sec > 0 else None,
        "mem_model_mb": round(mem_after_load - mem_before, 2),
        "mem_total_mb": round(mem_after_run, 2),
        "sample_rate_hz": 24000,
        "output_file": output_wav,
        "status": "success"
    }

    return result

if __name__ == "__main__":
    print("Testing Kokoro-82M TTS synthesis on CPU...")
    try:
        res = benchmark_kokoro()
        print("\nKokoro Benchmark Results:")
        print(json.dumps(res, indent=2))
        with open("kokoro_benchmark_results.json", "w") as f:
            json.dump(res, f, indent=2)
    except Exception as e:
        import traceback
        traceback.print_exc()
        err_res = {"error": str(e)}
        with open("kokoro_benchmark_results.json", "w") as f:
            json.dump(err_res, f, indent=2)
