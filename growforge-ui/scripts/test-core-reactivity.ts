import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { CoreState } from '../src/lib/coreState';
import { IDLE_NORA_SIGNAL as idle, NORA_AUDIO_EVENT, NORA_VISUAL_EVENT, type NoraVisualSignal } from '../src/lib/noraVisualSignal';
import { innerCorePhase, newlyCompleted, overviewCommandSummary } from '../src/components/spatial/dive/overviewCommandModel';
import { createAudioSampler } from '../src/lib/audioSampler';

console.log('--- Testing CORE Reactivity & Lifecycle Precedence ---');

const emptyCore: CoreState = {
  generatedAt: '2026-10-04T00:00:00Z',
  jobs: [],
  job: null,
  systems: {
    probes: [],
    mcp: { count: 0, servers: [] },
    models: { count: 0, list: [] },
    routing: 'local-first',
    pendingApprovals: 0,
    pendingConsultations: 0,
    vault: { reachable: false, noteCount: 0, latestDaily: null }
  }
};

const runningCore: CoreState = {
  ...emptyCore,
  jobs: [{ id: 'job-1', title: 'Running Mission', status: 'running', percent: 20, createdAt: emptyCore.generatedAt, isTest: false }]
};

const awaitingCore: CoreState = {
  ...runningCore,
  systems: { ...runningCore.systems, pendingApprovals: 2 }
};

// 1. Full Precedence Suite
// Priority 1: degraded
assert.equal(innerCorePhase(awaitingCore, { ...idle, error: true, listening: true, processing: true }), 'degraded', 'error takes precedence over all');

// Priority 2: success (transient newly completed)
assert.equal(innerCorePhase(runningCore, { ...idle, listening: true, processing: true }, false, true), 'success', 'success takes precedence over active interaction/jobs');

// Priority 3: listening
assert.equal(innerCorePhase(runningCore, { ...idle, listening: true, processing: true }), 'listening', 'listening takes precedence over processing and executing');

// Priority 4: speaking (hook)
assert.equal(innerCorePhase(runningCore, { ...idle, speaking: true, processing: true }), 'speaking', 'speaking hook precedence holds');

// Priority 5: thinking (processing)
assert.equal(innerCorePhase(runningCore, { ...idle, processing: true, streaming: true }), 'thinking', 'processing takes precedence over response/executing');

// Priority 6: responding (responseVisible or streaming)
assert.equal(innerCorePhase(runningCore, idle, true, false), 'responding', 'responseVisible drives responding phase');
assert.equal(innerCorePhase(runningCore, { ...idle, streaming: true }), 'responding', 'streaming drives responding phase');

// Priority 7: awaiting (pending approvals)
assert.equal(innerCorePhase(awaitingCore, idle), 'awaiting', 'pending approvals drives awaiting state');

// Priority 8: executing (running non-test job)
assert.equal(innerCorePhase(runningCore, idle), 'executing', 'running non-test job drives executing state');

// Priority 9: attentive (focused composer)
assert.equal(innerCorePhase(emptyCore, { ...idle, focused: true }), 'attentive', 'focused composer drives attentive state');

// Priority 10: idle
assert.equal(innerCorePhase(emptyCore, idle), 'idle', 'default baseline is idle');

// 2. Test job exclusion
const testRunningCore: CoreState = {
  ...emptyCore,
  jobs: [{ id: 'test-job', title: 'Test Job', status: 'running', percent: 50, createdAt: emptyCore.generatedAt, isTest: true }]
};
assert.equal(innerCorePhase(testRunningCore, idle), 'idle', 'test jobs must not activate executing state');

// 3. Audio Sampler Factory Safety
const sampler = createAudioSampler();
assert.equal(typeof sampler.start, 'function');
assert.equal(typeof sampler.stop, 'function');
sampler.stop(); // Safe no-op before start

// 4. Source Inspection of InnerCore & CoreCommandCenter
const innerCoreSource = readFileSync('src/components/spatial/dive/InnerCore.tsx', 'utf8');
assert.match(innerCoreSource, /NORA_AUDIO_EVENT/, 'InnerCore subscribes to audio energy events');
assert.match(innerCoreSource, /prefers-reduced-motion/, 'InnerCore respects reduced motion');
assert.match(innerCoreSource, /wakeTimeRef/, 'InnerCore implements wake/click impulse progression');
assert.match(innerCoreSource, /audioEnergyRef\.current/, 'InnerCore uses real audio energy without React re-renders');
assert.match(innerCoreSource, /glowMaterial\.uniforms\.energy\.value/, 'Glow uniform is driven by physical energy composite');

const commandCenterSource = readFileSync('src/components/spatial/CoreCommandCenter.tsx', 'utf8');
assert.match(commandCenterSource, /streaming:false,speaking:agentSpeaking/, 'speech follows real outbound PCM receipts; JSON is not streaming');
assert.match(commandCenterSource, /createAudioSampler/, 'CoreCommandCenter initializes audio sampler on voice start');

console.log('PASS all 10 states, deterministic precedence, audio sampler safety, reduced motion, and unsimulated speaking.');
