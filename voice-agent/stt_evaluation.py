"""Explicit local diagnostic: one in-memory WAV, identical audio for each candidate.
No recording/transcript is written to disk. Cached models only; no paid APIs.
"""
import cuda_runtime
import gc
import io
import re
import time
import threading
import subprocess
import numpy as np
import soundfile as sf
import psutil
import unicodedata
from scipy.signal import resample_poly
from faster_whisper import WhisperModel

CATEGORIES = ("normal_english", "casual_english", "terminology", "bangla", "mixed", "interruption")

def normalize(value):
    # Retain Bengali combining vowel signs: Python \w alone drops them.
    value = unicodedata.normalize("NFC", value).casefold()
    return " ".join("".join(c if unicodedata.category(c)[0] in "LMN" or c.isspace() else " " for c in value).split())

def edit_distance(left, right):
    row = list(range(len(right)+1))
    for i, token in enumerate(left, 1):
        nxt = [i]
        for j, received in enumerate(right, 1):
            nxt.append(min(nxt[-1]+1, row[j]+1, row[j-1]+(token != received)))
        row = nxt
    return row[-1]

def word_error(reference, actual):
    left, right = normalize(reference).split(), normalize(actual).split()
    return edit_distance(left,right)/max(1,len(left))

def accuracy(reference, actual):
    a, b = normalize(reference), normalize(actual)
    left, right = a.split(), b.split()
    chars_a, chars_b = a.replace(" ",""), b.replace(" ","")
    result = {"wordErrorRate":word_error(reference,actual), "characterErrorRate":edit_distance(chars_a,chars_b)/max(1,len(chars_a)),
              "referenceWords":len(left), "wordEdits":edit_distance(left,right),
              "referenceCharacters":len(chars_a), "characterEdits":edit_distance(chars_a,chars_b)}
    for label, bangla in (("bangla",True),("latin",False)):
        x = [w for w in left if bool(re.search(r"[\u0980-\u09ff]",w)) == bangla]
        y = [w for w in right if bool(re.search(r"[\u0980-\u09ff]",w)) == bangla]
        result[label+"WordErrorRate"] = edit_distance(x,y)/len(x) if x else None
    return result

def gpu_used():
    try:
        return float(subprocess.check_output(["nvidia-smi","--query-gpu=memory.used","--format=csv,noheader,nounits"],creationflags=0x08000000).decode().splitlines()[0])
    except Exception: return None

def compare(wav_bytes, expected, category="normal_english"):
    if category not in CATEGORIES: raise ValueError("Unknown calibration category")
    audio, rate = sf.read(io.BytesIO(wav_bytes), dtype="float32")
    if audio.ndim > 1: audio = audio.mean(axis=1)
    if not 0 < len(audio)/rate <= 30: raise ValueError("Record between 0 and 30 seconds")
    if rate != 16000: audio = resample_poly(audio, 16000, rate)
    results = []
    configs = [("base.en", "cpu", "int8", 1), ("small", "cpu", "int8", 1),
               ("small", "cuda", "int8_float16", 1), ("medium", "cuda", "int8_float16", 1),
               ("large-v3-turbo", "cuda", "int8_float16", 1)]
    for size, device, compute, beam in configs:
        result = {"model":size,"device":device,"computeType":compute,"beamSize":beam}
        proc = psutil.Process()
        metrics = {"peakProcessRamMiB":proc.memory_info().rss/1048576,"peakProcessCpuPercent":0}
        metrics["wholeGpuBaselineMiB"] = gpu_used() if device == "cuda" else None
        metrics["peakWholeGpuUsedMiB"] = metrics["wholeGpuBaselineMiB"]
        done = threading.Event()
        def sample():
            proc.cpu_percent()
            while not done.wait(.25):
                metrics["peakProcessRamMiB"] = max(metrics["peakProcessRamMiB"],proc.memory_info().rss/1048576)
                metrics["peakProcessCpuPercent"] = max(metrics["peakProcessCpuPercent"],proc.cpu_percent())
                if device == "cuda":
                    used = gpu_used()
                    if used is not None: metrics["peakWholeGpuUsedMiB"] = max(metrics["peakWholeGpuUsedMiB"] or 0,used)
        sampler = threading.Thread(target=sample,daemon=True)
        sampler.start()
        model = None
        try:
            started = time.perf_counter()
            model = WhisperModel(size,device=device,compute_type=compute,local_files_only=True)
            result["modelLoadMs"] = round((time.perf_counter()-started)*1000)
            warmup, _ = model.transcribe(np.zeros(16000,dtype=np.float32),language="en",beam_size=beam,condition_on_previous_text=False)
            list(warmup)
            started = time.perf_counter()
            segments, info = model.transcribe(audio,language="en" if size.endswith(".en") else None,task="transcribe",beam_size=beam,condition_on_previous_text=False,
                initial_prompt="Nora, GrowForge, CORE, BRAIN, missions, Systems." if category == "terminology" else None)
            segments = list(segments)
            transcript = " ".join(s.text.strip() for s in segments)
            result.update(transcript=transcript,sttMs=round((time.perf_counter()-started)*1000),
                **accuracy(expected,transcript),language=info.language, languageProbability=info.language_probability,
                terminology={term: bool(re.search(r"\b"+re.escape(term)+r"\b",transcript,re.I)) for term in ("Nora","GrowForge","CORE","BRAIN","missions","Systems") if re.search(r"\b"+term+r"\b",expected,re.I)})
            if device == "cuda":
                try:
                    result["gpuSnapshot"] = subprocess.check_output(["nvidia-smi","--query-gpu=memory.used,utilization.gpu","--format=csv,noheader,nounits"],creationflags=0x08000000).decode().strip()
                    result["gpuMetricScope"] = "whole GPU sampled every 250ms; includes desktop and other models; not isolated model VRAM"
                except Exception: result["gpuSnapshot"] = "unavailable"
        except Exception as error:
            result["error"] = str(error)[:250]
        finally:
            done.set()
            sampler.join()
            result.update(metrics)
            del model
            gc.collect()
        results.append(result)
    return {"audioDurationSeconds":len(audio)/16000,"sampleRate":16000,"expected":expected,"category":category,
            "recordingPersisted":False,"results":results,"accuracyScope":"Human ground truth required. Overall WER retains order; script WER is diagnostic. CER counts Unicode code points. Each clip auto-detects afresh, previous-text conditioning disabled."}
