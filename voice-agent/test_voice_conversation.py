"""AUTOMATED/SYNTHETIC: same RTC microphone, 3 turns + barge-in + recovery.
Never certifies physical accent accuracy, pronunciation or audible interruption.
"""
import asyncio
import json
import time
import uuid
from pathlib import Path
import numpy as np
from livekit import api, rtc
from scipy.signal import resample_poly

async def main():
    from kokoro import KPipeline
    pipeline = KPipeline(lang_code="a",repo_id="hexgrad/Kokoro-82M")
    phrases = ["Hi Nora.","What are my active missions?","What's your name?","Stop.",
               "Compare Alpha and Beta as hypothetical brand names. Explain your reasoning with several examples."]
    fixtures = {}
    for phrase in phrases:
        parts = [audio.detach().cpu().numpy() for _,_,audio in pipeline(phrase,voice="af_heart")]
        fixtures[phrase] = resample_poly(np.concatenate(parts),16000,24000)
    room = rtc.Room()
    identity = "synthetic_conversation_"+uuid.uuid4().hex[:10]
    evidence = {"kind":"AUTOMATED/SYNTHETIC","events":[],"outputPeak":0,"outputFrames":0,"firstReceivedAudioByTurn":{}}
    tasks = []
    @room.on("data_received")
    def received(packet):
        if packet.topic == "nora.voice" and packet.participant.identity == "nora_voice_agent":
            data = json.loads(packet.data)
            if data.get("inputParticipant") == identity: evidence["events"].append(data)
    async def consume(track):
        stream = rtc.AudioStream(track,sample_rate=24000,num_channels=1)
        try:
            async for event in stream:
                evidence["outputFrames"] += 1
                peak = float(np.max(np.abs(np.frombuffer(event.frame.data,dtype=np.int16).astype(np.float32))))/32768
                evidence["outputPeak"] = max(evidence["outputPeak"],peak)
                if peak>.003:
                    evidence["lastNonSilentFrameAt"] = time.time()
                    turn=evidence["events"][-1].get("turnId") if evidence["events"] else None
                    if turn is not None: evidence["firstReceivedAudioByTurn"].setdefault(str(turn),time.time())
        finally: await stream.aclose()
    @room.on("track_subscribed")
    def subscribed(track,pub,participant):
        if participant.identity == "nora_voice_agent":
            evidence["outputSid"] = pub.sid
            tasks.append(asyncio.create_task(consume(track)))
    token = api.AccessToken("devkey","secret").with_identity(identity).with_grants(api.VideoGrants(room_join=True,room="room_vs_headless_default",can_publish=True,can_subscribe=True)).to_jwt()
    source = None
    feeder = None
    queue = asyncio.Queue()
    async def feed():
        pending = np.zeros(0,dtype=np.float32)
        while True:
            if len(pending)==0 and not queue.empty(): pending=await queue.get()
            chunk = pending[:320] if len(pending) else np.zeros(320)
            pending = pending[320:]
            chunk = np.pad(chunk,(0,320-len(chunk)))
            pcm = np.clip(chunk*32767,-32768,32767).astype(np.int16)
            await source.capture_frame(rtc.AudioFrame(pcm.tobytes(),16000,1,320))
            await asyncio.sleep(.02)
    async def until(predicate,timeout=45):
        started=time.monotonic()
        while time.monotonic()-started<timeout:
            if predicate(): return
            await asyncio.sleep(.05)
        raise AssertionError("Timed out; latest "+str(evidence["events"][-1] if evidence["events"] else "no receipts"))
    try:
        await room.connect("ws://127.0.0.1:7880",token)
        evidence["roomSid"] = await room.sid
        source = rtc.AudioSource(16000,1,queue_size_ms=100)
        track = rtc.LocalAudioTrack.create_audio_track("synthetic_conversation_mic",source)
        pub = await room.local_participant.publish_track(track,rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
        evidence["micSid"] = pub.sid
        feeder = asyncio.create_task(feed())
        await until(lambda:any(e.get("audioFrameCount",0)>0 for e in evidence["events"]))
        for expected,phrase in enumerate(phrases[:3],1):
            begin = len(evidence["events"])
            await queue.put(fixtures[phrase])
            await until(lambda:any(e.get("turnId")==expected and e.get("noraReply") for e in evidence["events"][begin:]))
            await until(lambda:any(e.get("turnId")==expected and e.get("lifecycleEvent")=="return_to_listening" for e in evidence["events"][begin:]))
            last = evidence["events"][-1]
            assert last["agentSpeaking"] is False and last["speechEnergy"]==0
            assert last["outputQueueSeconds"]<.01 and last["activeTtsTask"] is False
            assert last["state"]=="listening", last["state"]
            print(f"PASS synthetic turn {expected}: {last.get('finalTranscript')} -> clean listening")
        begin=len(evidence["events"])
        await queue.put(fixtures["What's your name?"])
        await until(lambda:any(e.get("agentSpeaking") and e.get("turnId")==4 for e in evidence["events"][begin:]))
        await queue.put(fixtures["Stop."])
        await until(lambda:any(e.get("interrupted") for e in evidence["events"][begin:]))
        await until(lambda:any(e.get("stopIntent") for e in evidence["events"][begin:]))
        receipt=next(e for e in evidence["events"][begin:] if e.get("interruptDetectedAt"))
        await asyncio.sleep(.5)
        evidence["interruption"]={"sourceClearMs":receipt["interruptSourceClearMs"],
            "receiverTailMs":max(0,round((evidence.get("lastNonSilentFrameAt",0)-receipt["interruptDetectedAt"])*1000)),
            "scope":"Synthetic RTC receiver tail; not physical speaker latency"}
        assert evidence["interruption"]["receiverTailMs"]<500
        begin=len(evidence["events"])
        await queue.put(fixtures["What's your name?"])
        await until(lambda:any(e.get("turnId")==6 and e.get("lifecycleEvent")=="return_to_listening" for e in evidence["events"][begin:]))
        assert "Nora" in evidence["events"][-1]["speakableText"]
        assert "NORA" in evidence["events"][-1]["noraReply"]
        sessions={e.get("conversationId") for e in evidence["events"] if e.get("conversationId")}
        assert len(sessions)==1
        assert all(e.get("inputTrackSid")==pub.sid for e in evidence["events"])
        print("PASS synthetic interruption + local Stop intent + same-session recovery",evidence["interruption"])
        begin=len(evidence["events"])
        await queue.put(fixtures[phrases[4]])
        await until(lambda:any(e.get("turnId")==7 and e.get("lifecycleEvent")=="return_to_listening" for e in evidence["events"][begin:]),timeout=120)
        result=evidence["events"][-1]
        assert result.get("noraStreaming"), "Real provider did not emit tokens"
        first=evidence["firstReceivedAudioByTurn"].get("7")
        evidence["incrementalAudioProof"]={"firstReceivedAudio":first,"noraFinish":result.get("nora_finish"),
            "audioBeforeFullReply":bool(first and first<result.get("nora_finish",0)),"scope":"synthetic input, real local NORA and RTC output"}
        print("MEASURED AUDIO BEFORE FULL NORA REPLY",evidence["incrementalAudioProof"])
        evidence["latencyWaterfall"]=[]
        for turn in (1,2,3,6,7):
            receipts=[e for e in evidence["events"] if e.get("turnId")==turn and e.get("lifecycleEvent")=="agent_speaking" and e.get("tts_first_chunk")]
            if not receipts: continue
            row=receipts[-1].copy()
            final=next(e for e in reversed(evidence["events"]) if e.get("turnId")==turn and e.get("lifecycleEvent")=="return_to_listening")
            row.update({key: final.get(key) for key in ("speech_end", "final_transcript", "nora_first_token", "nora_finish", "tts_first_chunk", "voicedFramePublishedAt")})
            row["voicedFramePublishedAt"]=final.get("voicedFramePublishedAt")
            first=evidence["firstReceivedAudioByTurn"].get(str(turn))
            assert first is None or first >= row["speech_end"], "Stale turn latency timestamps"
            evidence["latencyWaterfall"].append({"turn":turn,"speech_end":row.get("speech_end"),
                "final_transcript":row.get("final_transcript"),"nora_first_token":row.get("nora_first_token"),
                "nora_finish":row.get("nora_finish"),"tts_first_chunk":row.get("tts_first_chunk"),
                "receivedFirstAudio":first,"speechEndToReceivedAudioMs":round((first-row["speech_end"])*1000) if first else None,
                "voicedFramePublishedAt":row.get("voicedFramePublishedAt"),
                "stages":row.get("latencyMetrics"),"scope":"synthetic RTC receiver; physical audibility unmeasured"})
        print("MEASURED SYNTHETIC WATERFALL",json.dumps(evidence["latencyWaterfall"]))
    finally:
        Path(__file__).with_name("voice_conversation_evidence.json").write_text(json.dumps(evidence,indent=2))
        if feeder: feeder.cancel();await asyncio.gather(feeder,return_exceptions=True)
        for task in tasks: task.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)
        await room.disconnect()
        if source: await source.aclose()

if __name__=="__main__":asyncio.run(main())
