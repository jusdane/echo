import { reactive, ref } from 'vue';
import { createYDoc } from '../realtime/yDoc';
import { useProjectStore } from '../stores/project';

type ModuleType = 'osc' | 'filter' | 'gain' | 'out';
type ModuleState = {
  id: string;
  type: ModuleType;
  x: number;
  y: number;
  params: any;
};
type Cable = [string, string];

export type PatchState = {
  modules: Record<string, ModuleState>;
  cables: Cable[];
};

type RuntimeModule = {
  id: string;
  type: ModuleType;
  node: AudioNode | null;
  update: (p: any) => void;
};

// Initialize Y.js document
const { doc, awareness } = createYDoc('figma-for-music-patch-demo');
(window as any).__awareness = awareness;

// 🚫 Y.js completely removed - using direct state management
// const yModules = doc.getMap<any>('modules');
// const yCables = doc.getArray<any>('cables');

// Defer store initialization
let projectStore: ReturnType<typeof useProjectStore> | null = null;

function getProjectStore() {
  if (!projectStore) {
    try {
      projectStore = useProjectStore();
    } catch (error) {
      // Store not ready yet, return null
      console.log('⚠️ Pinia store not ready yet, deferring audio creation');
      return null;
    }
  }
  return projectStore;
}

const state = reactive<PatchState>({
  modules: {},
  cables: []
});

const selectedId = ref<string | null>(null);
const runtime = new Map<string, RuntimeModule>();

// Defer audio context creation
let outGain: GainNode | null = null;

function getOutGain() {
  if (!outGain) {
    const project = getProjectStore();
    if (!project) {
      console.log('❌ getOutGain: No project store available');
      return null;
    }
    
    console.log('🔍 getOutGain: Creating output gain node');
    console.log('🔍 getOutGain: Audio context state:', project.audioCtx.state);
    
    try {
      outGain = project.audioCtx.createGain();
      outGain.gain.value = 1;
      outGain.connect(project.audioCtx.destination);
      console.log('✅ getOutGain: Output gain node created and connected');
    } catch (error) {
      console.error('❌ getOutGain: Failed to create output gain:', error);
      return null;
    }
  } else {
    console.log('🔍 getOutGain: Using existing output gain node');
  }
  return outGain;
}

function startAudio() {
  const project = getProjectStore();
  if (!project) {
    console.log('❌ startAudio: No project store available');
    return;
  }
  
  console.log('🔍 startAudio: Audio context state:', project.audioCtx.state);
  console.log('🔍 startAudio: Audio context sample rate:', project.audioCtx.sampleRate);
  console.log('🔍 startAudio: Audio context destination:', project.audioCtx.destination);
  
  if (project.audioCtx.state === 'suspended') {
    project.audioCtx.resume();
    console.log('🎵 Audio context resumed!');
  } else {
    console.log('ℹ️ Audio context already running');
  }
  
  // Check if we can actually create audio
  try {
    const testOsc = project.audioCtx.createOscillator();
    const testGain = project.audioCtx.createGain();
    testOsc.frequency.value = 440;
    testGain.gain.value = 0.5; // Increased from 0.1 to 0.5
    testOsc.connect(testGain);
    testGain.connect(project.audioCtx.destination);
    testOsc.start();
    setTimeout(() => {
      testOsc.stop();
      testOsc.disconnect();
      testGain.disconnect();
      console.log('✅ Audio test completed successfully');
    }, 500); // Increased from 100ms to 500ms
  } catch (error) {
    console.error('❌ Audio test failed:', error);
  }
}

function ensureAudioOutput() {
  console.log('🔊 ensureAudioOutput: Checking audio output setup');
  
  // Always ensure we have an output module and it's connected
  const hasOut = Object.values(state.modules).some(m => m.type === 'out');
  console.log('🔊 ensureAudioOutput: Has output module:', hasOut);
  
  if (!hasOut) {
    console.log('🔊 ensureAudioOutput: Creating output module');
    (state as any).modules['out'] = { id: 'out', type: 'out', x: 720, y: 160, params: {} };
  }
  
  // Make sure the output module is connected to speakers
  const outModule = Object.values(state.modules).find(m => m.type === 'out');
  console.log('🔊 ensureAudioOutput: Output module:', outModule?.id, outModule?.type);
  
  if (outModule && outModule.id && outModule.type) {
    const rt = ensureRT(outModule);
    console.log('🔊 ensureAudioOutput: Runtime for output:', rt?.id, 'node:', !!rt?.node);
    
    if (rt && rt.node) {
      console.log('🔊 ensureAudioOutput: Connecting output directly to speakers');
      // Disconnect old connections
      try { rt.node.disconnect(); } catch {}
      // 🎯 CRITICAL: Connect output module directly to speakers, not through intermediate gain
      const project = getProjectStore();
      if (project?.audioCtx) {
        rt.node.connect(project.audioCtx.destination);
        console.log('✅ ensureAudioOutput: Output connected directly to speakers');
      } else {
        console.log('❌ ensureAudioOutput: No audio context available');
      }
    } else {
      console.log('🔊 ensureAudioOutput: No runtime for output module');
    }
  } else {
    console.log('⚠️ ensureAudioOutput: No valid output module found');
  }
}

function mkOsc(_id: string, p: any) {
  const project = getProjectStore();
  if (!project) {
    console.log('❌ mkOsc: No project store available');
    return { node: null, update: (_: any) => {} };
  }
  
  console.log('🔍 mkOsc: Creating oscillator with params:', p);
  console.log('🔍 mkOsc: Audio context state:', project.audioCtx.state);
  
  // 🎯 CRITICAL: Resume suspended audio context before creating oscillator
  if (project.audioCtx.state === 'suspended') {
    console.log('⚠️ mkOsc: Audio context suspended - resuming...');
    try {
      project.audioCtx.resume();
      console.log('✅ mkOsc: Audio context resumed from suspended state');
    } catch (error) {
      console.error('❌ mkOsc: Failed to resume audio context:', error);
    }
  }
  
  try {
    const osc = project.audioCtx.createOscillator();
    // Fix wave type validation
    const wave = p?.wave || 'sine';
    if (wave === 'saw') {
      osc.type = 'sawtooth';
    } else if (wave === 'square') {
      osc.type = 'square';
    } else {
      osc.type = 'sine';
    }
    osc.frequency.value = p?.freq ?? 220;
    osc.start();
    
    const g = project.audioCtx.createGain();
    g.gain.value = 0.8; // Increased from 0.3 to 0.8 for better audibility
    osc.connect(g);
    
          console.log('✅ mkOsc: Oscillator created and STARTED successfully, type:', osc.type, 'freq:', osc.frequency.value);
      console.log('🎵 mkOsc: Gain set to:', g.gain.value, '- should be audible now!');
      console.log('🔄 mkOsc: Oscillator will keep running until stopped');
      console.log('🔍 mkOsc: Oscillator node:', osc.constructor.name, 'Gain node:', g.constructor.name);
      
      // 🎯 CRITICAL: Store references to prevent garbage collection
      (g as any)._oscillator = osc;

      // 🎯 CRITICAL: Ensure audio context stays active
      const keepAliveInterval = setInterval(() => {
        if (project.audioCtx.state === 'suspended') {
          console.log('⚠️ mkOsc: Audio context suspended during playback - resuming...');
          try {
            project.audioCtx.resume();
            console.log('✅ mkOsc: Audio context resumed during playback');
          } catch (error) {
            console.log('⚠️ mkOsc: Could not resume audio context during playback');
          }
        }
      }, 1000); // Check every second

      // Store the interval so we can clear it later if needed
      (g as any)._keepAliveInterval = keepAliveInterval;
    
    return {
      node: g,
      update: (np: any) => {
        console.log('🔄 mkOsc: Updating oscillator params:', np);
        // Fix wave type validation in update
        const wave = np.wave || 'sine';
        if (wave === 'saw') {
          osc.type = 'sawtooth';
          console.log('🔄 mkOsc: Wave type changed to sawtooth');
        } else if (wave === 'square') {
          osc.type = 'square';
          console.log('🔄 mkOsc: Wave type changed to square');
        } else {
          osc.type = 'sine';
          console.log('🔄 mkOsc: Wave type changed to sine');
        }
        osc.frequency.setValueAtTime(np.freq ?? 220, project.audioCtx.currentTime);
        console.log('🔄 mkOsc: Frequency updated to:', np.freq ?? 220);
      }
    };
  } catch (error) {
    console.error('❌ mkOsc: Failed to create oscillator:', error);
    return { node: null, update: (_: any) => {} };
  }
}

function mkFilter(_id: string, p: any) {
  const project = getProjectStore();
  if (!project) return { node: null, update: (_: any) => {} };
  const biq = project.audioCtx.createBiquadFilter();
  biq.type = (p?.type || 'lowpass');
  biq.frequency.value = p?.cutoff ?? 1200;
  biq.Q.value = p?.q ?? 0.8;
  
  return {
    node: biq,
    update: (np: any) => {
      biq.type = np.type || 'lowpass';
      biq.frequency.setValueAtTime(np.cutoff ?? 1200, project.audioCtx.currentTime);
      biq.Q.setValueAtTime(np.q ?? 0.8, project.audioCtx.currentTime);
    }
  };
}

function mkGain(_id: string, p: any) {
  const project = getProjectStore();
  if (!project) return { node: null, update: (_: any) => {} };
  const g = project.audioCtx.createGain();
  g.gain.value = p?.gain ?? 0.7;
  
  return {
    node: g,
    update: (np: any) => {
      g.gain.setValueAtTime(np.gain ?? 0.7, project.audioCtx.currentTime);
    }
  };
}

function ensureRT(m: ModuleState) {
  // Safety check - ensure module exists
  if (!m || !m.id) {
    console.warn('⚠️ ensureRT called with invalid module:', m);
    return null;
  }
  
  if (runtime.has(m.id)) {
    const existing = runtime.get(m.id)!;
    console.log('🔧 ensureRT: Found existing runtime for module:', m.id, 'node:', !!existing.node);
    // If we have a module but no audio node, try to create it now
    if (!existing.node && getProjectStore()) {
      console.log('🔧 ensureRT: Existing runtime has no node, recreating...');
      runtime.delete(m.id);
    } else {
      console.log('🔧 ensureRT: Reusing existing runtime for module:', m.id);
      return existing;
    }
  }
  
  console.log('🔧 ensureRT: Creating new runtime for module:', m.id, 'type:', m.type);
  
  // 🎯 CRITICAL: Add reference counting to prevent garbage collection
  console.log('🔧 ensureRT: Runtime map size before:', runtime.size);
  
  let rt: RuntimeModule;
  if (m.type === 'osc') rt = { id: m.id, type: m.type, ...mkOsc(m.id, m.params) };
  else if (m.type === 'filter') rt = { id: m.id, type: m.type, ...mkFilter(m.id, m.params) };
  else if (m.type === 'gain') rt = { id: m.id, type: m.type, ...mkGain(m.id, m.params) };
  else {
    const outGainNode = getOutGain();
    rt = { id: m.id, type: m.type, node: outGainNode, update: (_: any) => {} };
  }
  
  runtime.set(m.id, rt);
  console.log('🔧 ensureRT: Runtime map size after:', runtime.size, 'Added module:', m.id);
  console.log('🔧 ensureRT: Runtime created successfully for:', m.id, 'node:', !!rt.node);
  return rt;
}

function rebuild() {
  console.log('🔧 rebuild: Starting audio graph rebuild');
  console.log('🔧 rebuild: Runtime modules:', runtime.size);
  console.log('🔧 rebuild: State modules:', Object.keys(state.modules).length);
  console.log('🔧 rebuild: Cables:', state.cables.length);
  console.log('🔧 rebuild: Call stack:', new Error().stack?.split('\n').slice(1, 4).join(' -> '));
  
        // Disconnect all existing connections
      for (const rt of runtime.values()) {
        if (rt.node) {
          try {
            rt.node.disconnect();
            console.log('🔧 rebuild: Disconnected runtime module:', rt.id);
          } catch (error) {
            console.warn('⚠️ rebuild: Failed to disconnect module:', rt.id, error);
          }
        }
      }
      
      // 🎯 IMPORTANT: Don't stop oscillators during rebuild - they need to keep running!
      console.log('🔧 rebuild: All modules disconnected, ready to reconnect');
  
  const get = (id: string) => {
    const module = state.modules[id];
    if (!module) {
      console.log('⚠️ rebuild: Module not found for ID:', id);
      return null;
    }
    
    // 🎯 CRITICAL: Don't recreate runtime during rebuild - reuse existing one!
    const existingRT = runtime.get(id);
    if (existingRT && existingRT.node) {
      console.log('🔧 rebuild: Reusing existing runtime for module:', id, 'type:', module.type);
      return existingRT;
    }
    
    // Only create new runtime if none exists
    console.log('🔧 rebuild: Creating new runtime for module:', id, 'type:', module.type);
    return ensureRT(module);
  };
  
      // Connect modules according to cables
    for (const c of state.cables) {
      const a = get(c[0]);
      const b = get(c[1]);
      if (a && b && a.node && b.node) {
        try {
          a.node.connect(b.node);
          console.log('🔧 rebuild: Connected', a.id, '->', b.id);
          
          // 🎯 Check if this is an oscillator connection
          if (a.type === 'osc') {
            console.log('🎵 rebuild: Oscillator', a.id, 'connected - should be playing now!');
            console.log('🎵 rebuild: Oscillator node type:', a.node.constructor.name);
            console.log('🎵 rebuild: Target node type:', b.node.constructor.name);
          }
        } catch (error) {
          console.error('❌ rebuild: Failed to connect', a.id, '->', b.id, error);
        }
      } else {
        console.log('⚠️ rebuild: Cannot connect', c[0], '->', c[1], 'a:', a?.id, 'b:', b?.id, 'a.node:', !!a?.node, 'b.node:', !!b?.node);
      }
    }
  
  // Ensure output module is connected to speakers
  ensureAudioOutput();
  
  // 🎯 Check audio context state after rebuild
  const project = getProjectStore();
  if (project?.audioCtx) {
    console.log('🔧 rebuild: Audio context state after rebuild:', project.audioCtx.state);
    console.log('🔧 rebuild: Audio context sample rate:', project.audioCtx.sampleRate);
  }
  
  console.log('🔧 rebuild: Audio graph rebuild completed');
}

// 🚫 Y.js sync function removed - not needed in single-user mode
// function sync() { ... }

// 🚫 COMPLETELY DISABLED: Multiplayer synchronization
// yModules.observeDeep(sync as any);
// yCables.observe(sync as any);
// sync();

// 🎯 SINGLE-USER MODE: Initialize state directly without Y.js
console.log('🎵 Single-user mode: Initializing state directly without Y.js');

// Initialize empty state instead of syncing from Y.js
(state as any).modules = {};
(state as any).cables = [];
console.log('🎵 Single-user mode: State initialized with empty modules and cables');

let idCounter = 1;
const newId = (pfx: string) => `${pfx}_${idCounter++}`;

export function usePatch() {
  function addModule(type: ModuleType) {
    const id = newId(type);
    console.log('🔧 addModule: Creating module', type, 'with ID:', id);
    
    const mod: ModuleState = {
      id, type, x: 40 + Math.random() * 300, y: 40 + Math.random() * 200, params: {}
    };
    if (type === 'out') {
      mod.x = 600;
      mod.y = 160;
    }
    
    console.log('🔧 addModule: Module created:', mod);
    
    // 🎯 SINGLE-USER MODE: Add directly to state instead of Y.js
    (state as any).modules[id] = mod;
    
    // Try to create runtime immediately if store is available
    if (getProjectStore()) {
      console.log('🔧 addModule: Store available, creating runtime');
      const rt = ensureRT(mod);
      console.log('🔧 addModule: Runtime created:', rt?.id, 'node:', !!rt?.node);
    } else {
      console.log('🔧 addModule: Store not available, deferring runtime creation');
    }
    
    return id;
  }
  
  function connectModules(a: string, b: string) {
    console.log('🔗 connectModules: Connecting', a, '->', b);
    
    // 🎯 CRITICAL: Ensure output module exists if connecting to 'out'
    if (b === 'out') {
      const hasOut = Object.values(state.modules).some(m => m.type === 'out');
      if (!hasOut) {
        console.log('🔗 connectModules: Creating output module for connection to speakers');
        (state as any).modules['out'] = { id: 'out', type: 'out', x: 720, y: 160, params: {} };
      }
      // 🎯 CRITICAL: Ensure output is connected to speakers
      ensureAudioOutput();
    }
    
    // 🎯 SINGLE-USER MODE: Add directly to state instead of Y.js
    (state as any).cables.push([a, b]);
    console.log('🔗 connectModules: Cable added, total cables:', (state as any).cables.length);
    
    // 🎯 CRITICAL: Now establish the actual audio connection
    const aModule = (state as any).modules[a];
    const bModule = (state as any).modules[b];
    
    if (aModule && bModule) {
      const aRT = runtime.get(a);
      const bRT = runtime.get(b);
      
      if (aRT?.node && bRT?.node) {
        try {
          aRT.node.connect(bRT.node);
          console.log('🔗 connectModules: Audio connection established:', a, '->', b);
        } catch (error) {
          console.error('❌ connectModules: Failed to connect audio:', a, '->', b, error);
        }
      } else {
        console.log('⚠️ connectModules: Cannot connect audio - missing runtime nodes:', a, '->', b);
      }
    }
    
    console.log('🔗 connectModules: Connection established - audio should be playing now!');
  }
  
  function removeModule(id: string) {
    // 🎯 SINGLE-USER MODE: Remove from state instead of Y.js
    delete (state as any).modules[id];
    const idx: number[] = [];
    (state as any).cables.forEach((c: any, i: number) => {
      if (c[0] === id || c[1] === id) idx.push(i);
    });
    idx.reverse().forEach(i => (state as any).cables.splice(i, 1));
    runtime.delete(id);
    rebuild();
    if (selectedId.value === id) selectedId.value = null;
  }
  
  function disconnectSelected() {
    if (!selectedId.value) return;
    const id = selectedId.value;
    const idx: number[] = [];
    (state as any).cables.forEach((c: any, i: number) => {
      if (c[0] === id || c[1] === id) idx.push(i);
    });
    idx.reverse().forEach(i => (state as any).cables.splice(i, 1));
    rebuild();
  }
  
  function setModulePos(id: string, x: number, y: number) {
    const m = (state as any).modules[id];
    if (!m) return;
    m.x = Math.max(8, Math.min(760, x));
    m.y = Math.max(8, Math.min(300, y));
    (state as any).modules[id] = m;
  }
  
  function toggleSelect(id: string | null) {
    selectedId.value = id;
    (window as any).__awareness?.setLocalStateField('selection', id);
  }
  
  function getAudioOut() {
    const hasOut = Object.values(state.modules).some(m => m.type === 'out');
    if (!hasOut) {
      (state as any).modules['out'] = { id: 'out', type: 'out', x: 720, y: 160, params: {} };
    }
    return getOutGain();
  }
  
  function clearAll() {
    console.log('🧹 clearAll: Starting clear operation...');
    console.log('🧹 clearAll: Runtime size before clear:', runtime.size);
    
    // 🎯 SINGLE-USER MODE: Clear state directly instead of Y.js
    (state as any).modules = {};
    (state as any).cables = [];
    
    // Clear runtime modules
    runtime.clear();
    
    // Reset selection
    selectedId.value = null;
    
    // Reset ID counter
    idCounter = 1;
    
    // Rebuild audio graph
    rebuild();
    
    console.log('🧹 clearAll: Canvas cleared - starting fresh!');
    console.log('🧹 clearAll: Runtime size after clear:', runtime.size);
  }
  
  function updateModuleParams(id: string, params: any) {
    const module = (state as any).modules[id];
    if (module) {
      module.params = { ...module.params, ...params };
      (state as any).modules[id] = module;
      
      // Update runtime if it exists
      const rt = runtime.get(id);
      if (rt && rt.node) {
        console.log('🔄 updateModuleParams: Updating runtime for module:', id, 'with params:', module.params);
        rt.update(module.params);
        console.log('✅ updateModuleParams: Runtime updated successfully');
      } else {
        console.log('⚠️ updateModuleParams: No runtime found for module:', id);
      }
    }
  }
  
  function retryAudioCreation() {
    // Try to create audio nodes for modules that don't have them yet
    let needsRebuild = false;
    for (const [id, rt] of runtime.entries()) {
      if (!rt.node && getProjectStore()) {
        runtime.delete(id);
        needsRebuild = true;
      }
    }
    if (needsRebuild) {
      try {
        rebuild();
      } catch (error) {
        console.warn('⚠️ Failed to rebuild audio graph:', error);
      }
    }
  }
  
  return {
    doc: { awareness },
    state,
    runtime, // Expose runtime for debugging
    addModule,
    connectModules,
    removeModule,
    setModulePos,
    toggleSelect,
    selectedId,
    getAudioOut,
    disconnectSelected,
    clearAll,
    updateModuleParams,
    startAudio,
    ensureAudioOutput,
    retryAudioCreation
  };
}