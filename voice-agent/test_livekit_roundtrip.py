import asyncio
import time
import json
import numpy as np
from livekit import api, rtc

async def main():
    print("Testing LiveKit Server local connection & audio track publication...")
    
    # 1. Create opaque room token
    room_name = "room_vs_test_01"
    participant_name = "test_voice_agent"
    
    token = (
        api.AccessToken("devkey", "secret")
        .with_identity(participant_name)
        .with_name(participant_name)
        .with_grants(api.VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=True,
            can_subscribe=True,
        ))
        .to_jwt()
    )
    
    # 2. Connect to local LiveKit Server
    url = "ws://127.0.0.1:7880"
    room = rtc.Room()
    
    t0 = time.perf_counter()
    await room.connect(url, token)
    connect_time = time.perf_counter() - t0
    
    print(f"Connected to {room_name} in {round(connect_time, 3)}s. Room state: {room.connection_state}")
    
    # 3. Create and publish an audio track
    sample_rate = 48000
    num_channels = 1
    audio_source = rtc.AudioSource(sample_rate, num_channels)
    track = rtc.LocalAudioTrack.create_audio_track("agent_mic", audio_source)
    
    options = rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
    publication = await room.local_participant.publish_track(track, options)
    print(f"Published audio track: {publication.sid} (Source: {publication.source})")
    
    # 4. Push 1.0 second of 440Hz test audio frames
    duration_sec = 1.0
    num_samples = int(sample_rate * 0.02) # 20ms audio frame
    t_audio = np.linspace(0, 0.02, num_samples, endpoint=False)
    frame_data = (0.5 * np.sin(2 * np.pi * 440 * t_audio) * 32767).astype(np.int16)
    
    frames_sent = 0
    for _ in range(50): # 50 frames * 20ms = 1.0 second
        frame = rtc.AudioFrame(
            data=frame_data.tobytes(),
            sample_rate=sample_rate,
            num_channels=num_channels,
            samples_per_channel=num_samples,
        )
        await audio_source.capture_frame(frame)
        frames_sent += 1
        await asyncio.sleep(0.02)
        
    print(f"Successfully captured and streamed {frames_sent} audio frames ({duration_sec}s of audio) over WebRTC.")
    
    # 5. Clean disconnect
    await room.disconnect()
    print("Cleanly disconnected from LiveKit room.")
    
    results = {
        "status": "success",
        "livekit_url": url,
        "room_name": room_name,
        "participant_name": participant_name,
        "connect_latency_sec": round(connect_time, 3),
        "track_sid": publication.sid,
        "frames_streamed": frames_sent,
        "audio_streamed_sec": duration_sec
    }
    
    with open("livekit_roundtrip_results.json", "w") as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    asyncio.run(main())
