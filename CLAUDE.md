# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ToneSeq is a browser-based groovebox (step sequencer + drum machine) at toneseq.com. Pure HTML/CSS/JS with no framework, no build step, no server. Hosted on GitHub Pages.

## Development

Open `index.html` directly in a browser — no build or install needed. There are no tests, linters, or CI pipelines.

Vendored JS libraries live in `vendor/` (Tone.js, Cytoscape.js, lz-string). Drum samples live in `audio/`.

## Architecture

The entire app is three files: `index.html` (structure), `style.css` (~1150 lines), and `app.js` (~2930 lines).

### app.js Sections (in order)

1. **CONSTANTS** — grid dimensions (13 rows × 16 steps), drum instrument definitions, chromatic scale
2. **PITCH STATE** — `octaveOffset`, `rootSemitone`, dynamic note/label generation via `getCurrentNotes()`
3. **AUTOMATION PARAMS CONFIG** — `AUTO_PARAMS` array defining each automatable parameter (filter, reverb, ADSR) with id, range, format, and apply functions
4. **STATE** — all mutable state: `grid[][]` (note grid), `drumGrid[][]`, per-drum volumes/mutes, waveform, play mode, automation sequences, pattern banks (`notePatterns[]`, `drumPatterns[]`)
5. **PATTERN BANK** — snapshot/restore/thumbnail logic for saving and switching between up to 6 note patterns and 6 drum patterns. Pattern switches queue at loop boundaries.
6. **URL HASH SESSION** — full session state serialized to URL hash via lz-string compression. Covers all patterns, controls, waveform, playback mode. Uses `encodeSession()` / `decodeSession()`.
7. **PIANO ROLL** (Section A) — DOM-based 13×16 grid with click-and-drag painting, row labels, step highlights
8. **SEQUENCER** (Section B) — Tone.js Transport scheduling. `Tone.PolySynth` through filter → reverb chain. Handles forward/reverse/ping-pong playback.
9. **DRUM SEQUENCER** (Section B2) — Independent `Tone.Player` instances per instrument, own playback direction (or linked to note sequencer), per-track volume/mute
10. **GRAPH VISUALIZATION** (Section C) — Cytoscape.js graph showing saved patterns as nodes with thumbnail previews, note nodes as chord stacks, drum ring indicators
11. **AUTOMATION SEQUENCING** (Section D) — per-step value bars for any parameter with SEQ enabled, stored per-pattern, applied during playback
12. **INITIALIZATION** — wires up all DOM events, loads session from URL hash, sets initial UI state

### Audio Signal Chain

```
PolySynth → Filter (LP/HP) → reverbSend (gain) → Reverb → masterGain → Destination
                            → masterGain (dry) → Destination
Drum Players → individual gains → masterGain → Destination
```

### Key Patterns

- **State-first rendering**: UI is driven by state arrays (`grid`, `drumGrid`, automation arrays). Modify state, then call the appropriate render function.
- **Pattern queuing**: Pattern switches are queued via `pendingNotePattern` / `pendingDrumPattern` and applied at loop boundary in the Transport callback.
- **Session persistence**: All state round-trips through URL hash. Any state change should call `syncHash()` to keep the URL current.
- **Automation**: Each automatable param has a 16-step array of values. When SEQ is active for a param, values are applied per-step during playback and the corresponding slider updates visually.

## Branding

- Display name: TONE·SEQ (middot separator) in the h1
- Brand colors: `#00d4aa` (teal/notes), `#ff6b6b` (red/drums), `#0d0d1a` (dark background)
- Desktop-first design; mobile should work but is secondary
