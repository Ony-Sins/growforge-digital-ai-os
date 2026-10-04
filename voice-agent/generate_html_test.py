from livekit import api

def generate_test_page():
    token = (
        api.AccessToken('devkey', 'secret')
        .with_identity('browser_tester_01')
        .with_name('Browser Tester')
        .with_grants(api.VideoGrants(room_join=True, room='room_vs_test_live', can_publish=True, can_subscribe=True))
        .to_jwt()
    )

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>LiveKit Browser Stage 1 Verification</title>
  <style>
    body {{ background: #030a10; color: #d0e5ef; font-family: sans-serif; padding: 30px; line-height: 1.6; }}
    .card {{ background: #061923; border: 1px solid #1c3b4a; padding: 20px; border-radius: 12px; max-width: 600px; margin-bottom: 20px; }}
    button {{ background: #136783; color: white; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; margin-right: 10px; margin-bottom: 10px; }}
    button:disabled {{ background: #263d47; color: #6a828e; cursor: not-allowed; }}
    .status {{ font-weight: bold; margin-top: 10px; }}
    .metric {{ font-family: monospace; font-size: 14px; margin-top: 5px; }}
  </style>
</head>
<body>
  <h2>LiveKit Realtime Voice — Stage 1 Browser Test Surface</h2>
  <div class="card">
    <h3>1. Server & Room Connection</h3>
    <button id="btn-connect" onclick="LiveKitTester.connect('ws://127.0.0.1:7880', '{token}')">Connect to LiveKit</button>
    <button id="btn-disconnect" disabled onclick="LiveKitTester.disconnect()">Disconnect</button>
    <div id="status" class="status">Not connected</div>
    <div id="room-info" class="metric">—</div>
  </div>

  <div class="card">
    <h3>2. Real Browser Microphone Publication</h3>
    <button id="btn-mic" disabled onclick="LiveKitTester.publishMicrophone()">Publish Microphone</button>
    <div id="mic-status" class="status">Microphone idle</div>
    <div id="energy-meter" class="metric">Live Mic Audio Energy: 0.0000 (IDLE)</div>
  </div>

  <script src="test_client_bundle.js"></script>
</body>
</html>"""

    with open('c:/Ony/GrowForge-Digital-AI-OS/voice-agent/test_browser_livekit.html', 'w', encoding='utf-8') as f:
        f.write(html_content)
    print('Generated test_browser_livekit.html with authenticated room_vs_test_live token.')

if __name__ == '__main__':
    generate_test_page()
