const { spawn } = require('child_process');
const http = require('http');

async function getDebuggerUrl(port = 9222) {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find(p => p.url.includes('3000') || p.type === 'page');
        if (page && page.webSocketDebuggerUrl) {
          return page.webSocketDebuggerUrl;
        }
      }
    } catch (e) {
      // retry
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Could not connect to Chrome DevTools Protocol');
}

async function sendCdp(ws, method, params = {}) {
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
  console.log('Testing Chrome SpeechRecognition and Audio pipeline on http://127.0.0.1:3000 ...');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const targetUrl = 'http://127.0.0.1:3000';

  const chromeProcess = spawn(chromePath, [
    '--remote-debugging-port=9222',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=c:\\Ony\\GrowForge-Digital-AI-OS\\voice-agent\\.chrome-test-profile',
    targetUrl
  ], { stdio: 'ignore', detached: true });

  const wsUrl = await getDebuggerUrl(9222);
  console.log('Connected to Chrome DevTools WebSocket:', wsUrl);

  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.onopen = r);

  // Enable Runtime and Console
  await sendCdp(ws, 'Runtime.enable');
  await sendCdp(ws, 'Console.enable');

  ws.addEventListener('message', (evt) => {
    const msg = JSON.parse(evt.data.toString());
    if (msg.method === 'Runtime.consoleAPICalled') {
      const args = (msg.params.args || []).map(a => a.value || a.description).join(' ');
      console.log('[BROWSER CONSOLE]', args);
    }
  });

  // Evaluate audio devices and speech recognition diagnostics in browser context
  const evalResult = await sendCdp(ws, 'Runtime.evaluate', {
    expression: `(async () => {
      const info = {
        speechRecognitionSupported: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
        audioContextSupported: !!(window.AudioContext || window.webkitAudioContext),
        mediaDevicesSupported: !!navigator.mediaDevices,
        navigatorLanguage: navigator.language,
        languages: navigator.languages,
      };
      
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        info.audioInputDevices = devices.filter(d => d.kind === 'audioinput').map(d => ({
          deviceId: d.deviceId,
          label: d.label,
          groupId: d.groupId
        }));
      } catch (e) {
        info.devicesError = e.message;
      }
      return info;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('Browser Environment Diagnostics:', JSON.stringify(evalResult.result.value, null, 2));

  // Keep alive for 5s then exit
  await new Promise(r => setTimeout(r, 5000));
  ws.close();
  try { process.kill(chromeProcess.pid); } catch {}
  process.exit(0);
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
