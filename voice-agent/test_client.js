import { Room, RoomEvent, createLocalAudioTrack } from 'livekit-client';

window.LiveKitTester = {
  room: null,
  localTrack: null,
  energyInterval: null,
  
  async connect(url, token) {
    const statusEl = document.getElementById('status');
    const roomInfoEl = document.getElementById('room-info');
    statusEl.textContent = 'Connecting...';
    
    try {
      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      
      this.room.on(RoomEvent.Connected, () => {
        statusEl.textContent = 'Connected (HTTP 200 / WebSocket Active)';
        statusEl.style.color = '#37c9b1';
        roomInfoEl.textContent = `Room: ${this.room.name} | Participant SID: ${this.room.localParticipant.sid} | State: ${this.room.state}`;
        document.getElementById('btn-mic').disabled = false;
        document.getElementById('btn-disconnect').disabled = false;
        document.getElementById('btn-connect').disabled = true;
        window.__TEST_EVIDENCE = { connected: true, room: this.room.name, sid: this.room.localParticipant.sid, state: this.room.state };
      });
      
      this.room.on(RoomEvent.Disconnected, () => {
        statusEl.textContent = 'Disconnected';
        statusEl.style.color = '#e07a5f';
        document.getElementById('btn-mic').disabled = true;
        document.getElementById('btn-disconnect').disabled = true;
        document.getElementById('btn-connect').disabled = false;
      });
      
      await this.room.connect(url, token);
    } catch (err) {
      statusEl.textContent = 'Connection Failed: ' + err.message;
      statusEl.style.color = '#e63946';
      window.__TEST_EVIDENCE = { connected: false, error: err.message };
    }
  },
  
  async publishMicrophone() {
    const micStatusEl = document.getElementById('mic-status');
    const energyEl = document.getElementById('energy-meter');
    micStatusEl.textContent = 'Requesting mic permission...';
    
    try {
      this.localTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      
      const pub = await this.room.localParticipant.publishTrack(this.localTrack);
      micStatusEl.textContent = `Microphone Published (Track SID: ${pub.trackSid})`;
      micStatusEl.style.color = '#37c9b1';
      
      // Monitor audio energy
      const mediaStream = new MediaStream([this.localTrack.mediaStreamTrack]);
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(mediaStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      let samples = [];
      this.energyInterval = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += (dataArray[i] / 255.0) ** 2;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        energyEl.textContent = `Live Mic Audio Energy: ${rms.toFixed(4)} (${rms > 0.05 ? 'SPEECH DETECTED' : 'SILENCE / AMBIENT'})`;
        energyEl.style.color = rms > 0.05 ? '#4cc9f0' : '#8faeba';
        samples.push(rms);
        if (samples.length > 50) samples.shift();
        window.__MIC_ENERGY = { current: rms, max: Math.max(...samples), avg: samples.reduce((a,b)=>a+b,0)/samples.length };
      }, 100);
      
      document.getElementById('btn-mic').disabled = true;
    } catch (err) {
      micStatusEl.textContent = 'Mic Error: ' + err.message;
      micStatusEl.style.color = '#e63946';
      window.__MIC_ERROR = err.message;
    }
  },
  
  async disconnect() {
    if (this.energyInterval) clearInterval(this.energyInterval);
    if (this.localTrack) {
      this.localTrack.stop();
      this.localTrack = null;
    }
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
  }
};
