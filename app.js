'use strict';

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

// C5 at top, C4 at bottom (13 semitones inclusive)
const NOTES = ['C5','B4','A#4','A4','G#4','G4','F#4','F4','E4','D#4','D4','C#4','C4'];
const NOTE_LABELS = ['C5','B','A#','A','G#','G','F#','F','E','D#','D','C#','C4'];
const STEPS = 16;
const PX_PER_STEP = 22;
const NODE_STACK_SPACING = 52; // px between node centres in a chord stack

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════

// grid[note][step] = true/false
const grid = {};
NOTES.forEach(note => { grid[note] = new Array(STEPS).fill(false); });

// chordGroups: Map<step, { notes: string[] (high→low), anchor: string (lowest pitch) }>
let chordGroups = new Map();

// stepSequence: [{ step, notes, anchor }, ...] in step order — drives sequence edges
let stepSequence = [];

let synth = null;
let loop = null;
let cy = null;
let isPlaying = false;

let prevPlayingNodes = [];
let prevPlayingEdges = [];

// ═══════════════════════════════════════════════════════════
// A. PIANO ROLL
// ═══════════════════════════════════════════════════════════

function buildPianoRoll() {
  const container = document.getElementById('piano-roll');

  // Header: blank label + step numbers
  const blankLabel = document.createElement('div');
  blankLabel.className = 'pr-label';
  container.appendChild(blankLabel);

  for (let s = 0; s < STEPS; s++) {
    const num = document.createElement('div');
    num.className = 'pr-step-num';
    num.textContent = s + 1;
    container.appendChild(num);
  }

  // Note rows — C5 at top, C4 at bottom
  NOTES.forEach((note, ni) => {
    const lbl = document.createElement('div');
    lbl.className = 'pr-label';
    lbl.textContent = NOTE_LABELS[ni];
    container.appendChild(lbl);

    for (let s = 0; s < STEPS; s++) {
      const cell = document.createElement('div');
      cell.className = 'step-cell';
      cell.dataset.note = note;
      cell.dataset.step = s;
      cell.addEventListener('click', () => onCellClick(note, s, cell));
      container.appendChild(cell);
    }
  });
}

function onCellClick(note, step, cell) {
  grid[note][step] = !grid[note][step];
  cell.classList.toggle('active', grid[note][step]);
  updateGraph();
}

function highlightPlayhead(step) {
  document.querySelectorAll('.step-cell.playhead').forEach(el => el.classList.remove('playhead'));
  document.querySelectorAll(`.step-cell[data-step="${step}"]`).forEach(el => el.classList.add('playhead'));
}

// ═══════════════════════════════════════════════════════════
// B. SEQUENCER (Tone.js)
// ═══════════════════════════════════════════════════════════

function initSynth() {
  synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.4 },
  });
  synth.toDestination();

  loop = new Tone.Sequence(
    (time, step) => {
      const activeNotes = NOTES.filter(n => grid[n][step]);
      if (activeNotes.length > 0) {
        synth.triggerAttackRelease(activeNotes, '16n', time);
      }
      scheduleVisual(() => {
        highlightPlayhead(step);
        updateGraphPlayhead(step);
      }, time);
    },
    [...Array(STEPS).keys()],
    '16n',
  );
  loop.start(0);
}

function scheduleVisual(cb, time) {
  if (typeof Tone.getDraw === 'function') {
    try { Tone.getDraw().schedule(cb, time); return; } catch (_) { /* fall through */ }
  }
  requestAnimationFrame(cb);
}

async function play() {
  if (isPlaying) return;
  await Tone.start();
  Tone.Transport.bpm.value = Number(document.getElementById('bpm').value) || 120;
  Tone.Transport.start();
  isPlaying = true;
}

function stop() {
  if (!isPlaying) return;
  Tone.Transport.stop();
  isPlaying = false;
  document.querySelectorAll('.step-cell.playhead').forEach(el => el.classList.remove('playhead'));
  prevPlayingNodes.forEach(n => n.removeClass('playing'));
  prevPlayingEdges.forEach(e => e.removeClass('playing'));
  prevPlayingNodes = [];
  prevPlayingEdges = [];
}

function setBPM(val) {
  const bpm = parseInt(val, 10);
  if (!isNaN(bpm) && bpm > 0) Tone.Transport.bpm.value = bpm;
}

function setWaveform(type) { synth.set({ oscillator: { type } }); }

function setEnvelope(param, value) { synth.set({ envelope: { [param]: value } }); }

function clearAll() {
  NOTES.forEach(note => { for (let s = 0; s < STEPS; s++) grid[note][s] = false; });
  document.querySelectorAll('.step-cell.active').forEach(el => el.classList.remove('active'));
  updateGraph();
}

// ═══════════════════════════════════════════════════════════
// C. GRAPH VISUALIZATION (Cytoscape.js)
// ═══════════════════════════════════════════════════════════

function initGraph() {
  cy = cytoscape({
    container: document.getElementById('graph'),
    userZoomingEnabled: true,
    userPanningEnabled: true,
    style: [
      {
        selector: 'node',
        style: {
          'width': 38,
          'height': 38,
          'background-color': '#00251e',
          'border-width': 2,
          'border-color': '#00d4aa',
          'label': 'data(label)',
          'font-size': '11px',
          'font-family': 'monospace',
          'color': '#00d4aa',
          'text-valign': 'center',
          'text-halign': 'center',
        },
      },
      {
        selector: 'node.playing',
        style: {
          'background-color': '#2e2500',
          'border-color': '#ffcc00',
          'border-width': 2.5,
          'color': '#ffcc00',
        },
      },
      // Rhythmic sequence arrows
      {
        selector: 'edge[type = "sequence"]',
        style: {
          'width': 1.5,
          'line-color': '#00d4aa40',
          'target-arrow-color': '#00d4aa40',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 0.75,
        },
      },
      {
        selector: 'edge[type = "sequence"].playing',
        style: {
          'line-color': '#ffcc00',
          'target-arrow-color': '#ffcc00',
          'width': 2.5,
        },
      },
      // Chord-stack pipes — thin, no arrows, straight
      {
        selector: 'edge[type = "chord-stack"]',
        style: {
          'width': 2,
          'line-color': '#1a4040',
          'target-arrow-shape': 'none',
          'source-arrow-shape': 'none',
          'curve-style': 'straight',
        },
      },
    ],
    elements: [],
    layout: { name: 'null' },
  });
}

/** Unique node ID for one occurrence of a note at a specific step. */
const eventId = (note, step) => `${note}@${step}`;

/**
 * Group active notes by step.
 * Notes within a step are ordered high→low (NOTES array order).
 * Each note occurrence gets its own event-node ID so the same pitch at two
 * different steps produces two distinct nodes — no self-loops possible.
 * The anchor = lowest pitch = bottom of the snowman stack.
 */
function buildChordGroups() {
  const groups = new Map();
  for (let s = 0; s < STEPS; s++) {
    const notesAtStep = NOTES.filter(n => grid[n][s]); // already high→low
    if (notesAtStep.length > 0) {
      const nodeIds  = notesAtStep.map(n => eventId(n, s));
      const anchorId = nodeIds[nodeIds.length - 1]; // lowest pitch node
      groups.set(s, {
        notes: notesAtStep,
        nodeIds,
        anchor:   notesAtStep[notesAtStep.length - 1],
        anchorId,
      });
    }
  }
  return groups;
}

/**
 * Snap every chord stack into a strict vertical column above its anchor.
 * Called after the COSE layout settles so the anchor's final position is known.
 */
function snapChordStacks() {
  chordGroups.forEach(({ nodeIds, anchorId }) => {
    if (nodeIds.length <= 1) return;
    const { x: ax, y: ay } = cy.getElementById(anchorId).position();
    nodeIds.forEach((id, i) => {
      const stepsAbove = nodeIds.length - 1 - i; // 0 for anchor, counting up
      cy.getElementById(id).position({ x: ax, y: ay - stepsAbove * NODE_STACK_SPACING });
    });
  });
}

/**
 * Place each step's anchor node clockwise around a circle, with position
 * proportional to step index (step 0 = 12 o'clock, increasing clockwise).
 * Then snap chord stacks above their anchors and fit the viewport.
 */
function positionNodes() {
  const containerW = cy.container().clientWidth  || 400;
  const containerH = cy.container().clientHeight || 380;
  const r  = Math.min(containerW, containerH) * 0.28;
  const cx = containerW  / 2;
  const cy_center = containerH / 2;

  stepSequence.forEach(({ step, anchorId }) => {
    // -π/2 puts step 0 at 12 o'clock; adding a positive fraction goes clockwise
    const angle = -Math.PI / 2 + (step / STEPS) * 2 * Math.PI;
    cy.getElementById(anchorId).position({
      x: cx       + r * Math.cos(angle),
      y: cy_center + r * Math.sin(angle),
    });
  });

  snapChordStacks();
  cy.fit(40);
}

/**
 * Rebuild node/edge state whenever the grid changes.
 *
 * Solo notes  → standalone node, sequence arrows in/out.
 * Chord notes → vertical snowman stack; only the bottom (anchor) node carries
 *               sequence arrows; stack members are joined by thin pipe edges.
 */
function updateGraph() {
  if (!cy) return;

  chordGroups = buildChordGroups();
  stepSequence = [];
  for (let s = 0; s < STEPS; s++) {
    if (chordGroups.has(s)) stepSequence.push({ step: s, ...chordGroups.get(s) });
  }

  // Active set is now keyed by event-node IDs (note@step), not bare note names.
  // This guarantees each occurrence of a pitch is a distinct node — no self-loops.
  const activeIds = new Set([...chordGroups.values()].flatMap(g => g.nodeIds));

  // Clear edges and playhead tracking
  cy.edges().remove();
  prevPlayingEdges = [];
  prevPlayingNodes = [];

  // Remove stale event-nodes; reset class on still-active ones
  cy.nodes().forEach(node => {
    if (activeIds.has(node.id())) {
      node.removeClass('playing');
    } else {
      node.remove();
    }
  });

  // Add newly active event-nodes — seed positions on a circle spread by step
  const containerW = cy.container().clientWidth  || 400;
  const containerH = cy.container().clientHeight || 380;
  const r = Math.min(containerW, containerH) * 0.35;
  chordGroups.forEach(({ notes, nodeIds }, step) => {
    notes.forEach((note, i) => {
      const id = nodeIds[i];
      if (cy.getElementById(id).length === 0) {
        const ni = NOTES.indexOf(note);
        const angle = (step / STEPS) * 2 * Math.PI - Math.PI / 2;
        cy.add({
          data: { id, label: NOTE_LABELS[ni] },
          position: {
            x: containerW / 2 + r * Math.cos(angle),
            y: containerH / 2 + r * Math.sin(angle),
          },
        });
      }
    });
  });

  if (activeIds.size === 0) return;

  // ── Chord-stack pipe edges (within each step, high → low, no arrows) ──
  const stackEdges = [];
  chordGroups.forEach(({ nodeIds }, step) => {
    for (let i = 0; i < nodeIds.length - 1; i++) {
      stackEdges.push({
        data: {
          id: `stack-${step}-${i}`,
          source: nodeIds[i],       // higher note (top)
          target: nodeIds[i + 1],  // lower note (towards anchor)
          type: 'chord-stack',
        },
      });
    }
  });

  // ── Sequence edges (anchorId → next anchorId, step distance in length) ──
  const seqEdges = [];
  if (stepSequence.length >= 2) {
    const n = stepSequence.length;
    stepSequence.forEach(({ step, anchorId }, i) => {
      const next = stepSequence[(i + 1) % n];
      let dist = i < n - 1 ? next.step - step : (STEPS - step) + next.step;
      dist = Math.max(dist, 1);
      seqEdges.push({
        data: {
          id: `seq-${i}`,
          source: anchorId,
          target: next.anchorId,
          dist,
          seqIdx: i,
          type: 'sequence',
        },
      });
    });
  }

  cy.add([...stackEdges, ...seqEdges]);

  // Place anchors clockwise on a circle, snap chord stacks, fit viewport
  positionNodes();
}

/**
 * Called on every sequencer tick.
 * Highlights all notes in the active chord and the incoming sequence edge.
 */
function updateGraphPlayhead(step) {
  if (!cy) return;

  prevPlayingNodes.forEach(n => n.removeClass('playing'));
  prevPlayingEdges.forEach(e => e.removeClass('playing'));
  prevPlayingNodes = [];
  prevPlayingEdges = [];

  if (!chordGroups.has(step)) return;

  // Highlight every event-node in the chord (the whole snowman lights up)
  chordGroups.get(step).nodeIds.forEach(id => {
    const node = cy.getElementById(id);
    if (node.length) {
      node.addClass('playing');
      prevPlayingNodes.push(node);
    }
  });

  // Highlight the sequence edge that was just traversed to reach this step
  if (stepSequence.length >= 2) {
    const idx = stepSequence.findIndex(g => g.step === step);
    if (idx >= 0) {
      const prevIdx = (idx - 1 + stepSequence.length) % stepSequence.length;
      cy.edges(`[seqIdx = ${prevIdx}]`).forEach(e => {
        e.addClass('playing');
        prevPlayingEdges.push(e);
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  buildPianoRoll();
  initSynth();
  initGraph();

  document.getElementById('play-btn').addEventListener('click', play);
  document.getElementById('stop-btn').addEventListener('click', stop);
  document.getElementById('clear-btn').addEventListener('click', clearAll);

  document.getElementById('bpm').addEventListener('input', e => setBPM(e.target.value));

  document.querySelectorAll('.waveform-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.waveform-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      setWaveform(btn.dataset.wave);
    });
  });

  // ADSR sliders
  const adsrParams = [
    { id: 'adsr-a', param: 'attack',  valId: 'adsr-a-val', unit: 's' },
    { id: 'adsr-d', param: 'decay',   valId: 'adsr-d-val', unit: 's' },
    { id: 'adsr-s', param: 'sustain', valId: 'adsr-s-val', unit: ''  },
    { id: 'adsr-r', param: 'release', valId: 'adsr-r-val', unit: 's' },
  ];
  adsrParams.forEach(({ id, param, valId, unit }) => {
    const slider = document.getElementById(id);
    const display = document.getElementById(valId);
    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      setEnvelope(param, val);
      display.textContent = val.toFixed(2) + unit;
    });
  });
});
