const { spawn } = require('child_process');
const http = require('http');

async function getDebuggerUrl(port = 9222) {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find(p => p.url.includes('test_browser_livekit.html') || p.type === 'page');
        if (page && page.webSocketDebuggerUrl) {
          return page.webSocketDebuggerUrl;
        }
      }
    } catch (e) {
      // wait for Chrome to start
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Could not connect to Chrome DevTools Protocol');
}

async function sendCdpCommand(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 100000);
    const handler = (evt) => {
      const msg = JSON.parse(evt.data.toString());
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function run() {
  console.log('Launching real Chrome with LiveKit test surface...');
  
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const htmlUrl = 'file:///c:/Ony/GrowForge-Digital-AI-OS/voice-agent/test_browser_livekit.html';
  
  const chromeProcess = spawn(chromePath, [
    '--remote-debugging-port=9222',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=c:\\Ony\\GrowForge-Digital-AI-OS\\voice-agent\\.chrome-test-profile',
    htmlUrl
  ], { stdio: 'ignore', detached: true });
  
  const wsUrl = await getDebuggerUrl(9222);
  console.log('Connected to Chrome DevTools WebSocket:', wsUrl);
  
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.onopen = r);
  
  await sendCdpCommand(ws, 'Runtime.enable');
  
  // Wait 1s for page load
  await new Promise(r => setTimeout(r, 1000));
  
  console.log('Clicking #btn-connect...');
  await sendCdpCommand(ws, 'Runtime.evaluate', {
    expression: `document.getElementById('btn-connect').click()`
  });
  
  // Wait for connection to establish
  await new Promise(r => setTimeout(r, 2000));
  
  const connResult = await sendCdpCommand(ws, 'Runtime.evaluate', {
    expression: `JSON.stringify({ status: document.getElementById('status').textContent, roomInfo: document.getElementById('room-info').textContent, evidence: window.__TEST_EVIDENCE })`,
    returnByValue: true
  });
  console.log('Connection Result:', connResult.result.value);
  
  console.log('Clicking #btn-mic to publish microphone audio track...');
  await sendCdpCommand(ws, 'Runtime.evaluate', {
    expression: `document.getElementById('btn-mic').click()`
  });
  
  // Wait 6 seconds for streaming audio frames
  await new Promise(r => setTimeout(r, 6000));
  
  const micResult = await sendCdpCommand(ws, 'Runtime.evaluate', {
    expression: `JSON.stringify({ micStatus: document.getElementById('mic-status').textContent, energy: document.getElementById('energy-meter').textContent, micEnergy: window.__MIC_ENERGY })`,
    returnByValue: true
  });
  console.log('Microphone Stream Result:', micResult.result.value);
  
  // Disconnect
  await sendCdpCommand(ws, 'Runtime.evaluate', {
    expression: `document.getElementById('btn-disconnect').click()`
  });
  
  ws.close();
  
  // Kill test Chrome
  try {
    process.kill(-chromeProcess.pid);
  } catch (e) {
    // on Windows process.kill may vary
  }
  
  const finalReport = {
    connection: JSON.parse(connResult.result.value),
    microphone: JSON.parse(micResult.result.value)
  };
  
  const fs = require('fs');
  fs.writeFileSync('c:/Ony/GrowForge-Digital-AI-OS/voice-agent/browser_evidence.json', JSON.stringify(finalReport, null, 2));
  console.log('\nSaved browser verification evidence to browser_evidence.json');
}

run().catch(err => {
  console.error('Browser Test Error:', err);
  process.exit(1);
});
