<template><div style='padding:16px;display:flex;flex-direction:column;gap:12px;'><h2>Patch View (Single-User Mode)</h2><div style='display:flex;gap:8px;'><button @click='addOsc'>Add Osc</button><button @click='addFilter'>Add Filter</button><button @click='addGain'>Add Gain</button>
<button @click='startAudio' style='background-color: #28a745; color: white;'>Start Audio</button>
<button @click='retryAudioCreation' style='background-color: #6f42c1; color: white;'>Retry Audio</button>
<button @click='debugAudio' style='background-color: #fd7e14; color: white;'>Debug Audio</button>
<button @click='testSimpleOsc' style='background-color: #20c997; color: white;'>Test Osc</button>
<button @click='testDirectAudio' style='background-color: #e83e8c; color: white;'>Direct Audio</button>
<button @click='testOscillatorLifecycle' style='background-color: #6f42c1; color: white;'>Lifecycle</button>
<button @click='testOscillatorPersistence' style='background-color: #fd7e14; color: white;'>Persistence</button>
<button @click='testOscillatorWithoutYjs' style='background-color: #dc3545; color: white;'>No Y.js</button>
<button @click='testMinimalAudio' style='background-color: #6c757d; color: white;'>Minimal</button>
<button @click='testAudioContextPersistence' style='background-color: #17a2b8; color: white;'>Context</button>
<button @click='testTone' style='background-color: #ffc107; color: black;'>Test Tone</button>
<button @click='createBasicChain' style='background-color: #17a2b8; color: white;'>Quick Start</button><button @click='clearAll' style='background-color: #ff6b6b; color: white;'>Clear All</button><button @click='recordToTrack' :disabled='recording'>{{ recording ? 'Recording...' : 'Record to Track' }}</button></div><div style='position:relative;border:1px solid #ddd;height:360px;border-radius:8px;'><canvas ref='canvas' width='900' height='340' style='width:100%;height:100%;'></canvas></div><small>Drag modules. Click two modules to connect. Backspace to delete module; Delete to remove its connections. Ctrl+Shift+C to clear all. Select a module and use Arrow keys to adjust parameters, 'w' to cycle waves, 't' to cycle filter types.</small></div></template><script setup lang='ts'>import { onMounted, onUnmounted, ref } from 'vue'; import { usePatch } from '../patch/engine'; import PresenceCursors from '../realtime/PresenceCursors.vue'; import { useProjectStore } from '../stores/project'; const { state, addModule, connectModules, removeModule, setModulePos, toggleSelect, selectedId, getAudioOut, disconnectSelected, clearAll, updateModuleParams, startAudio, ensureAudioOutput, retryAudioCreation } = usePatch(); const canvas = ref<HTMLCanvasElement|null>(null); let ctx: CanvasRenderingContext2D|null = null; function draw() {
  if (!canvas.value || !ctx) return;
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);
  
  // Draw cables
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2;
  for (const c of state.cables) {
    const a = state.modules[c[0]];
    const b = state.modules[c[1]];
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x + 60, a.y + 20);
    ctx.lineTo(b.x, b.y + 20);
    ctx.stroke();
  }
  
  // Draw modules
  for (const [id, m] of Object.entries(state.modules)) {
    // Determine fill color based on state
    if (selectedId.value === id) {
      ctx.fillStyle = '#eef7ff'; // Selected - light blue
    } else if (hoveredModule === id) {
      ctx.fillStyle = '#fff3cd'; // Hovered - light yellow
    } else {
      ctx.fillStyle = '#f6f6f6'; // Normal - light gray
    }
    
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    
    // Draw main module rectangle
    ctx.fillRect(m.x, m.y, 120, 40);
    ctx.strokeRect(m.x, m.y, 120, 40);
    
    // Draw grab area indicator when hovering
    if (hoveredModule === id) {
      ctx.strokeStyle = '#007bff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(m.x - 8, m.y - 8, 136, 56);
      ctx.setLineDash([]); // Reset line dash
    }
    
    // Draw module text
    ctx.fillStyle = '#111';
    ctx.fillText(`${m.type}`, m.x + 8, m.y + 24);
    
    // Draw parameter values
    ctx.fillStyle = '#666';
    ctx.font = '10px Arial';
    if (m.type === 'osc') {
      const freq = m.params?.freq || 220;
      const wave = m.params?.wave || 'saw';
      ctx.fillText(`${wave} ${freq}Hz`, m.x + 8, m.y + 36);
    } else if (m.type === 'filter') {
      const cutoff = m.params?.cutoff || 1200;
      const q = m.params?.q || 0.8;
      ctx.fillText(`${cutoff}Hz Q:${q}`, m.x + 8, m.y + 36);
    } else if (m.type === 'gain') {
      const gain = m.params?.gain || 0.7;
      ctx.fillText(`${Math.round(gain * 100)}%`, m.x + 8, m.y + 36);
    }
  }
  
  requestAnimationFrame(draw);
} let dragging:string|null=null; let offsetX=0, offsetY=0; let lastClick: string | null = null;
let hoveredModule: string | null = null; function hit(x: number, y: number) { 
  const GRAB_PADDING = 8; // Extra pixels around each module for easier grabbing
  
  for (const [id, m] of Object.entries(state.modules)) {
    // Check if click is within the expanded grab area
    if (x >= m.x - GRAB_PADDING && 
        x <= m.x + 120 + GRAB_PADDING && 
        y >= m.y - GRAB_PADDING && 
        y <= m.y + 40 + GRAB_PADDING) {
      return id;
    }
  }
  return null;
} function onDown(e:MouseEvent){ const r=canvas.value!.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top; const id=hit(x,y); if(id){ dragging=id; offsetX=x-state.modules[id].x; offsetY=y-state.modules[id].y; toggleSelect(id); if(lastClick && lastClick!==id){ connectModules(lastClick,id); lastClick=null; } else { lastClick=id; } } else { toggleSelect(null); } } function onMove(e: MouseEvent) { 
  const r = canvas.value!.getBoundingClientRect(); 
  const x = e.clientX - r.left, y = e.clientY - r.top; 
  
  // Update cursor position (single-user mode - no presence)
  // No need to update cursor position in single-user mode 
  
  // Handle dragging
  if (dragging) {
    setModulePos(dragging, x - offsetX, y - offsetY); 
  }
  
  // Update hover state for visual feedback
  const newHovered = hit(x, y);
  if (newHovered !== hoveredModule) {
    hoveredModule = newHovered;
    // Force redraw to show hover effects
    draw();
  }
} function onUp(){ dragging=null; } function onKey(e: KeyboardEvent) { 
  if ((e.key === 'Backspace' || e.key === 'Delete') && selectedId.value) { 
    if (e.key === 'Backspace') removeModule(selectedId.value); 
    else disconnectSelected(); 
  }
  // Add Ctrl+Shift+C or Cmd+Shift+C to clear all
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
    clearAll();
  }
  
  // Parameter control shortcuts for selected module
  if (selectedId.value) {
    const module = state.modules[selectedId.value];
    if (module) {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (module.type === 'osc') {
            const currentFreq = module.params?.freq || 220;
            updateOscParams(selectedId.value, Math.min(2000, currentFreq + 50), module.params?.wave || 'saw');
          } else if (module.type === 'filter') {
            const currentCutoff = module.params?.cutoff || 1200;
            updateFilterParams(selectedId.value, Math.min(8000, currentCutoff + 100), module.params?.q || 0.8, module.params?.type || 'lowpass');
          } else if (module.type === 'gain') {
            const currentGain = module.params?.gain || 0.7;
            updateGainParams(selectedId.value, Math.min(1, currentGain + 0.1));
          }
          break;
          
        case 'ArrowDown':
          e.preventDefault();
          if (module.type === 'osc') {
            const currentFreq = module.params?.freq || 220;
            updateOscParams(selectedId.value, Math.max(20, currentFreq - 50), module.params?.wave || 'saw');
          } else if (module.type === 'filter') {
            const currentCutoff = module.params?.cutoff || 1200;
            updateFilterParams(selectedId.value, Math.max(20, currentCutoff - 100), module.params?.q || 0.8, module.params?.type || 'lowpass');
          } else if (module.type === 'gain') {
            const currentGain = module.params?.gain || 0.7;
            updateGainParams(selectedId.value, Math.max(0, currentGain - 0.1));
          }
          break;
          
        case 'w':
          if (module.type === 'osc') {
            const waves = ['saw', 'sine', 'square', 'triangle'];
            const currentWave = module.params?.wave || 'saw';
            const currentIndex = waves.indexOf(currentWave);
            const nextWave = waves[(currentIndex + 1) % waves.length];
            updateOscParams(selectedId.value, module.params?.freq || 220, nextWave);
          }
          break;
          
        case 't':
          if (module.type === 'filter') {
            const types = ['lowpass', 'highpass', 'bandpass', 'notch'];
            const currentType = module.params?.type || 'lowpass';
            const currentIndex = types.indexOf(currentType);
            const nextType = types[(currentIndex + 1) % types.length];
            updateFilterParams(selectedId.value, module.params?.cutoff || 1200, module.params?.q || 0.8, nextType);
          }
          break;
      }
    }
  }
}

// Parameter control functions using the engine
function updateOscParams(id: string, freq: number, wave: string) {
  updateModuleParams(id, { freq, wave });
}

function updateFilterParams(id: string, cutoff: number, q: number, type: string) {
  updateModuleParams(id, { cutoff, q, type });
}

function updateGainParams(id: string, gain: number) {
  updateModuleParams(id, { gain });
} onMounted(() => {
  ctx = canvas.value!.getContext('2d');
  canvas.value!.addEventListener('mousedown', onDown);
  canvas.value!.addEventListener('mousemove', onMove);
  canvas.value!.addEventListener('mouseleave', () => {
    hoveredModule = null;
    draw();
  });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('keydown', onKey);
  draw();
}); onUnmounted(()=>{ canvas.value?.removeEventListener('mousedown',onDown); canvas.value?.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp); window.removeEventListener('keydown',onKey); }); const addOsc=()=>addModule('osc'); const addFilter=()=>addModule('filter'); const addGain = () => addModule('gain');

const createBasicChain = () => {
  console.log('🎵 createBasicChain: Starting...');
  
  // Clear existing modules
  clearAll();
  
  // Add a basic audio chain: Osc -> Filter -> Gain -> Out
  console.log('🎵 createBasicChain: Adding oscillator...');
  const oscId = addModule('osc');
  console.log('🎵 createBasicChain: Oscillator ID:', oscId);
  
  console.log('🎵 createBasicChain: Adding filter...');
  const filterId = addModule('filter');
  console.log('🎵 createBasicChain: Filter ID:', filterId);
  
  console.log('🎵 createBasicChain: Adding gain...');
  const gainId = addModule('gain');
  console.log('🎵 createBasicChain: Gain ID:', gainId);
  
  // Set default parameters
  console.log('🎵 createBasicChain: Setting parameters...');
  updateModuleParams(oscId, { freq: 220, wave: 'saw' });
  updateModuleParams(filterId, { cutoff: 1200, q: 0.8, type: 'lowpass' });
  updateModuleParams(gainId, { gain: 0.5 });
  
  // Connect the chain
  console.log('🎵 createBasicChain: Connecting modules...');
  connectModules(oscId, filterId);
  connectModules(filterId, gainId);
  
  // Start audio context
  console.log('🎵 createBasicChain: Starting audio...');
  startAudio();
  
  // Force a rebuild to ensure connections
  console.log('🎵 createBasicChain: Forcing rebuild...');
  setTimeout(() => {
    console.log('🎵 createBasicChain: Final state check');
    console.log('🎵 createBasicChain: Modules:', Object.keys(state.modules));
    console.log('🎵 createBasicChain: Cables:', state.cables);
    console.log('🎵 createBasicChain: Should hear a tone now!');
  }, 100);
  
  console.log('🎵 Basic audio chain created!');
};

const testTone = () => {
  // Create a simple test tone to verify audio is working
  const project = useProjectStore();
  console.log('🔊 testTone: Project store:', !!project);
  console.log('🔊 testTone: Audio context:', !!project?.audioCtx);
  console.log('🔊 testTone: Audio context state:', project?.audioCtx?.state);
  
  try {
    const osc = project.audioCtx.createOscillator();
    const gain = project.audioCtx.createGain();
    
    osc.frequency.value = 440;
    osc.type = 'sine';
    gain.gain.value = 0.3;
    
    osc.connect(gain);
    gain.connect(project.audioCtx.destination);
    
    osc.start();
    console.log('✅ testTone: Test tone started');
    
    setTimeout(() => {
      osc.stop();
      osc.disconnect();
      gain.disconnect();
      console.log('✅ testTone: Test tone completed');
    }, 1000);
    
    console.log('🔊 Test tone played!');
  } catch (error) {
    console.error('❌ testTone: Failed to play test tone:', error);
  }
};

const debugAudio = () => {
  console.log('🔍 === AUDIO DEBUG INFO ===');
  console.log('🔍 Project store available:', !!useProjectStore());
  console.log('🔍 Audio context state:', useProjectStore()?.audioCtx?.state);
  console.log('🔍 Sample rate:', useProjectStore()?.audioCtx?.sampleRate);
  console.log('🔍 Current modules:', Object.keys(state.modules));
  console.log('🔍 Cables:', state.cables);
  console.log('🔍 Output gain node:', !!getAudioOut());
  console.log('🔍 === END DEBUG INFO ===');
};

const testSimpleOsc = () => {
  console.log('🎵 testSimpleOsc: Testing simple oscillator (FIXED VERSION - REFRESHED)...');
  
  // Don't clear everything - just start fresh
  console.log('🎵 testSimpleOsc: Starting fresh test (no clearAll)...');

  // Add just an oscillator
  const oscId = addModule('osc');
  console.log('🎵 testSimpleOsc: Oscillator created with ID:', oscId);

  // Set parameters
  updateModuleParams(oscId, { freq: 440, wave: 'sine' });
  
  // Connect directly to output
  connectModules(oscId, 'out');
  
  // Start audio
  startAudio();
  
  console.log('🎵 testSimpleOsc: Should hear 440Hz tone now!');

  // Test parameter updates (simplified)
  setTimeout(() => {
    console.log('🎵 testSimpleOsc: Testing frequency change...');
    updateModuleParams(oscId, { freq: 880 }); // Should change to 880Hz
  }, 1000);
  
  setTimeout(() => {
    console.log('🎵 testSimpleOsc: Testing wave change...');
    updateModuleParams(oscId, { wave: 'square' }); // Should change to square wave
  }, 2000);
  
  // Simple completion message
  setTimeout(() => {
    console.log('🎵 testSimpleOsc: Test complete - did you hear audio?');
  }, 3000);
};

const testDirectAudio = () => {
  console.log('🎵 testDirectAudio: Testing direct Web Audio API (bypassing patch system)...');
  
  const project = useProjectStore();
  if (!project?.audioCtx) {
    console.error('❌ No audio context available');
    return;
  }
  
  // Create oscillator directly
  const osc = project.audioCtx.createOscillator();
  const gain = project.audioCtx.createGain();
  
  osc.type = 'sine';
  osc.frequency.value = 440;
  gain.gain.value = 0.5;
  
  osc.connect(gain);
  gain.connect(project.audioCtx.destination);
  
  osc.start();
  console.log('🎵 testDirectAudio: Direct oscillator started - should hear 440Hz tone');
  
  // Test frequency changes
  setTimeout(() => {
    osc.frequency.setValueAtTime(880, project.audioCtx.currentTime);
    console.log('🎵 testDirectAudio: Frequency changed to 880Hz');
  }, 1000);
  
  setTimeout(() => {
    osc.frequency.setValueAtTime(220, project.audioCtx.currentTime);
    console.log('🎵 testDirectAudio: Frequency changed to 220Hz');
  }, 2000);
  
  // Keep running for 5 seconds
  setTimeout(() => {
    osc.stop();
    console.log('🎵 testDirectAudio: Test complete');
  }, 5000);
};

const testOscillatorLifecycle = () => {
  console.log('🎵 testOscillatorLifecycle: Testing oscillator creation and lifecycle...');
  
  const project = useProjectStore();
  if (!project?.audioCtx) {
    console.error('❌ No audio context available');
    return;
  }
  
  // Create oscillator through the patch system
  const oscId = addModule('osc');
  console.log('🎵 testOscillatorLifecycle: Oscillator created with ID:', oscId);
  
  // Set parameters
  updateModuleParams(oscId, { freq: 440, wave: 'sine' });
  
  // Connect to output
  connectModules(oscId, 'out');
  
  // Start audio
  startAudio();
  
  // Monitor the oscillator every 200ms
  const monitorInterval = setInterval(() => {
    const { runtime } = usePatch();
    if (runtime && runtime.has(oscId)) {
      const rt = runtime.get(oscId);
      if (rt && rt.node) {
        console.log('🔍 testOscillatorLifecycle: Oscillator running, node exists');
      } else {
        console.log('⚠️ testOscillatorLifecycle: Runtime exists but no node!');
      }
    } else {
      console.log('⚠️ testOscillatorLifecycle: No runtime found!');
    }
  }, 200);
  
  // Stop monitoring after 3 seconds
  setTimeout(() => {
    clearInterval(monitorInterval);
    console.log('🔍 testOscillatorLifecycle: Monitoring stopped');
  }, 3000);
  
  console.log('🎵 testOscillatorLifecycle: Should hear 440Hz tone for 3 seconds');
};

const testOscillatorPersistence = () => {
  console.log('🎵 testOscillatorPersistence: Testing if oscillator persists in runtime...');
  
  // Clear everything first
  clearAll();
  
  // Create oscillator
  const oscId = addModule('osc');
  console.log('🎵 testOscillatorPersistence: Oscillator created with ID:', oscId);
  
  // Check if it's in runtime immediately
  const { runtime } = usePatch();
  console.log('🎵 testOscillatorPersistence: Runtime size after creation:', runtime.size);
  console.log('🎵 testOscillatorPersistence: Has our oscillator?', runtime.has(oscId));
  
  if (runtime.has(oscId)) {
    const rt = runtime.get(oscId);
    console.log('🎵 testOscillatorPersistence: Runtime module:', rt?.id, 'node:', !!rt?.node);
  }
  
  // Wait 1 second and check again
  setTimeout(() => {
    console.log('🎵 testOscillatorPersistence: After 1 second...');
    console.log('🎵 testOscillatorPersistence: Runtime size:', runtime.size);
    console.log('🎵 testOscillatorPersistence: Has our oscillator?', runtime.has(oscId));
    
    if (runtime.has(oscId)) {
      const rt = runtime.get(oscId);
      console.log('🎵 testOscillatorPersistence: Runtime module still exists:', rt?.id, 'node:', !!rt?.node);
    } else {
      console.log('⚠️ testOscillatorPersistence: Oscillator disappeared from runtime!');
    }
  }, 1000);
  
  // Wait 2 seconds and check again
  setTimeout(() => {
    console.log('🎵 testOscillatorPersistence: After 2 seconds...');
    console.log('🎵 testOscillatorPersistence: Runtime size:', runtime.size);
    console.log('🎵 testOscillatorPersistence: Has our oscillator?', runtime.has(oscId));
    
    if (runtime.has(oscId)) {
      const rt = runtime.get(oscId);
      console.log('🎵 testOscillatorPersistence: Runtime module still exists:', rt?.id, 'node:', !!rt?.node);
    } else {
      console.log('⚠️ testOscillatorPersistence: Oscillator disappeared from runtime!');
    }
  }, 2000);
  
  console.log('🎵 testOscillatorPersistence: Test started - watch console for persistence checks');
};

const testOscillatorWithoutYjs = () => {
  console.log('🎵 testOscillatorWithoutYjs: Testing oscillator without Y.js synchronization...');
  
  // Clear everything first
  clearAll();
  
  // Create oscillator directly in runtime without Y.js
  const { runtime } = usePatch();
  const project = useProjectStore();
  
  if (!project?.audioCtx) {
    console.error('❌ No audio context available');
    return;
  }
  
  // Create oscillator manually
  const osc = project.audioCtx.createOscillator();
  const gain = project.audioCtx.createGain();
  
  osc.type = 'sine';
  osc.frequency.value = 440;
  gain.gain.value = 0.5;
  
  osc.connect(gain);
  gain.connect(project.audioCtx.destination);
  
  // Store in runtime manually
  const manualRT = {
    id: 'manual_osc',
    type: 'osc' as const,
    node: gain,
    update: (params: any) => {
      if (params.freq) osc.frequency.setValueAtTime(params.freq, project.audioCtx.currentTime);
      if (params.wave) {
        if (params.wave === 'saw') osc.type = 'sawtooth';
        else if (params.wave === 'square') osc.type = 'square';
        else osc.type = 'sine';
      }
    }
  };
  
  runtime.set('manual_osc', manualRT);
  
  // Start the oscillator
  osc.start();
  
  console.log('🎵 testOscillatorWithoutYjs: Manual oscillator started, runtime size:', runtime.size);
  
  // Test parameter changes
  setTimeout(() => {
    console.log('🎵 testOscillatorWithoutYjs: Changing frequency to 880Hz...');
    manualRT.update({ freq: 880 });
  }, 1000);
  
  setTimeout(() => {
    console.log('🎵 testOscillatorWithoutYjs: Changing to square wave...');
    manualRT.update({ wave: 'square' });
  }, 2000);
  
  // Check persistence every 500ms
  const checkInterval = setInterval(() => {
    console.log('🔍 testOscillatorWithoutYjs: Runtime size:', runtime.size, 'Has manual_osc:', runtime.has('manual_osc'));
  }, 500);
  
  // Stop after 5 seconds
  setTimeout(() => {
    clearInterval(checkInterval);
    osc.stop();
    console.log('🎵 testOscillatorWithoutYjs: Test complete');
  }, 5000);
  
  console.log('🎵 testOscillatorWithoutYjs: Should hear 440Hz tone for 5 seconds');
};

const testMinimalAudio = () => {
  console.log('🎵 testMinimalAudio: Testing minimal audio setup...');
  
  // Don't clear everything - just start fresh
  console.log('🎵 testMinimalAudio: Starting minimal test...');
  
  // Create oscillator through the patch system
  const oscId = addModule('osc');
  console.log('🎵 testMinimalAudio: Oscillator created with ID:', oscId);
  
  // Set parameters
  updateModuleParams(oscId, { freq: 440, wave: 'sine' });
  
  // Connect to output
  connectModules(oscId, 'out');
  
  // Start audio
  startAudio();
  
  console.log('🎵 testMinimalAudio: Should hear 440Hz tone now!');
  
  // Monitor audio context state every 500ms
  const monitorInterval = setInterval(() => {
    const project = useProjectStore();
    if (project?.audioCtx) {
      console.log('🔍 testMinimalAudio: Audio context state:', project.audioCtx.state);
      console.log('🔍 testMinimalAudio: Audio context sample rate:', project.audioCtx.sampleRate);
    }
  }, 500);
  
  // Simple test - just check if it's working after 2 seconds
  setTimeout(() => {
    clearInterval(monitorInterval);
    console.log('🎵 testMinimalAudio: Test complete - did you hear audio?');
  }, 2000);
};

const testAudioContextPersistence = () => {
  console.log('🎵 testAudioContextPersistence: Testing if audio context stays active...');
  
  const project = useProjectStore();
  if (!project?.audioCtx) {
    console.error('❌ No audio context available');
    return;
  }
  
  // Create a simple oscillator that should keep running
  const osc = project.audioCtx.createOscillator();
  const gain = project.audioCtx.createGain();
  
  osc.type = 'sine';
  osc.frequency.value = 440;
  gain.gain.value = 0.5;
  
  osc.connect(gain);
  gain.connect(project.audioCtx.destination);
  
  // Start the oscillator
  osc.start();
  
  console.log('🎵 testAudioContextPersistence: Oscillator started - should hear 440Hz tone');

  // 🎯 CRITICAL: Resume audio context if suspended
  if (project.audioCtx.state === 'suspended') {
    console.log('⚠️ testAudioContextPersistence: Audio context suspended - resuming...');
    try {
      project.audioCtx.resume();
      console.log('✅ testAudioContextPersistence: Audio context resumed');
    } catch (error) {
      console.error('❌ testAudioContextPersistence: Failed to resume audio context:', error);
    }
  }
  
  // 🎯 CRITICAL: Keep-alive interval to prevent audio context suspension
  const keepAliveInterval = setInterval(() => {
    if (project.audioCtx.state === 'suspended') {
      console.log('⚠️ testAudioContextPersistence: Audio context suspended - resuming...');
      try {
        project.audioCtx.resume();
        console.log('✅ testAudioContextPersistence: Audio context resumed');
      } catch (error) {
        console.log('⚠️ testAudioContextPersistence: Could not resume audio context');
      }
    }
    console.log('🔍 testAudioContextPersistence: Audio context state:', project.audioCtx.state);
    console.log('🔍 testAudioContextPersistence: Oscillator state:', osc.constructor.name);
  }, 200);
  
  // Keep running for 5 seconds
  setTimeout(() => {
    clearInterval(keepAliveInterval);
    osc.stop();
    console.log('🎵 testAudioContextPersistence: Test complete');
  }, 5000);
  
  console.log('🎵 testAudioContextPersistence: Should hear 440Hz tone for 5 seconds');
};

const recording = ref(false);
const project = useProjectStore();

async function recordToTrack() {
  if (recording.value) return;
  
  const out = getAudioOut();
  if (!out) return;
  const dest = project.audioCtx.createMediaStreamDestination();
  out.connect(dest);
  
  const rec = new MediaRecorder(dest.stream);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = e => chunks.push(e.data);
  
  rec.onstop = () => {
    const blob = new Blob(chunks, { type: 'audio/webm' });
    project.addTakeFromBlob(blob, 'Patch Take');
    try {
      out.disconnect(dest);
    } catch {}
    recording.value = false;
  };
  
  recording.value = true;
  rec.start();
  
  setTimeout(() => {
    if (rec.state !== 'inactive') rec.stop();
  }, 10000);
}
</script>