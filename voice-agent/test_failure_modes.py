import asyncio
import time
import json
import socket
from livekit import api, rtc

async def test_livekit_down():
    print("Testing connection to unreachable LiveKit port...")
    room = rtc.Room()
    token = api.AccessToken("devkey", "secret").with_identity("fail_test").with_grants(api.VideoGrants(room_join=True, room="test")).to_jwt()
    try:
        await asyncio.wait_for(room.connect("ws://127.0.0.1:7999", token), timeout=2.0)
        return {"result": "unexpected_success"}
    except Exception as e:
        return {"result": "gracefully_handled", "error_type": type(e).__name__, "message": str(e)}

def test_stt_missing_model():
    print("Testing faster-whisper invalid model name...")
    from faster_whisper import WhisperModel
    try:
        WhisperModel("nonexistent_model_xyz", device="cpu")
        return {"result": "unexpected_success"}
    except Exception as e:
        return {"result": "gracefully_handled", "error_type": type(e).__name__, "message": str(e)}

def test_port_occupied():
    print("Testing port collision behavior...")
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", 7880))
        s.close()
        return {"result": "port_was_free"}
    except Exception as e:
        return {"result": "gracefully_handled", "error_type": type(e).__name__, "message": str(e)}

async def main():
    results = {
        "livekit_down": await test_livekit_down(),
        "stt_missing_model": test_stt_missing_model(),
        "port_occupied": test_port_occupied(),
    }
    print("\nFailure Mode Results:")
    print(json.dumps(results, indent=2))
    with open("failure_mode_results.json", "w") as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    asyncio.run(main())
