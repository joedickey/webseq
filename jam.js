'use strict';

// ═══════════════════════════════════════════════════════════
// JAM SESSION — WebSocket connection, session UI, reconnect
// ═══════════════════════════════════════════════════════════

const JAM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const JAM_CODE_LENGTH = 5;
const WS_RECONNECT_BASE = 1000;
const WS_RECONNECT_MAX = 16000;
const WS_URL = 'ws://localhost:8080';

// ── State ────────────────────────────────────────────────

let jamWs = null;
let jamRoomCode = null;
let jamTabId = null;
let jamReconnectDelay = WS_RECONNECT_BASE;
let jamReconnectTimer = null;
let jamConnected = false;

// ── Tab identity ─────────────────────────────────────────

function getOrCreateTabId() {
  let id = sessionStorage.getItem('jamTabId');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('jamTabId', id);
  }
  return id;
}

// ── Join code generation ─────────────────────────────────

function generateJamCode() {
  let code = '';
  for (let i = 0; i < JAM_CODE_LENGTH; i++) {
    code += JAM_CODE_CHARS[Math.floor(Math.random() * JAM_CODE_CHARS.length)];
  }
  return code;
}

// ── WebSocket connection ─────────────────────────────────

function connectToRoom(roomCode) {
  if (jamWs && (jamWs.readyState === WebSocket.OPEN || jamWs.readyState === WebSocket.CONNECTING)) {
    jamWs.close();
  }

  jamRoomCode = roomCode.toUpperCase();
  jamTabId = getOrCreateTabId();
  sessionStorage.setItem('jamRoom', jamRoomCode);

  const ws = new WebSocket(`${WS_URL}?room=${jamRoomCode}`);
  jamWs = ws;

  ws.onopen = () => {
    jamConnected = true;
    jamReconnectDelay = WS_RECONNECT_BASE;
    updateJamUI('connected');

    // Announce this tab to the room
    ws.send(JSON.stringify({
      type: 'announce',
      tabId: jamTabId,
      state: typeof encodeSession === 'function' ? encodeSession() : null
    }));
  };

  ws.onmessage = (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    handleJamMessage(msg);
  };

  ws.onclose = (e) => {
    jamConnected = false;
    if (e.code === 4002) {
      updateJamUI('full');
      sessionStorage.removeItem('jamRoom');
      return;
    }
    if (jamRoomCode) {
      updateJamUI('reconnecting');
      scheduleReconnect();
    }
  };

  ws.onerror = () => {
    // onclose will fire after this
  };
}

function scheduleReconnect() {
  if (jamReconnectTimer) clearTimeout(jamReconnectTimer);
  jamReconnectTimer = setTimeout(() => {
    if (jamRoomCode) {
      connectToRoom(jamRoomCode);
    }
  }, jamReconnectDelay);
  jamReconnectDelay = Math.min(jamReconnectDelay * 2, WS_RECONNECT_MAX);
}

function disconnectJam() {
  jamRoomCode = null;
  sessionStorage.removeItem('jamRoom');
  if (jamReconnectTimer) {
    clearTimeout(jamReconnectTimer);
    jamReconnectTimer = null;
  }
  if (jamWs) {
    jamWs.close();
    jamWs = null;
  }
  jamConnected = false;
  updateJamUI('disconnected');
}

// ── Message handling (stub — Task 5 will flesh this out) ─

function handleJamMessage(msg) {
  switch (msg.type) {
    case 'room-state':
      // Received existing room state on join — Task 5
      break;
    case 'announce':
      // Another tab joined — Task 5
      break;
    case 'leave':
      // A tab left — Task 5
      break;
    case 'edit':
      // Remote edit — Task 5
      break;
    case 'transport':
      // Transport sync — Task 7
      break;
  }
}

// ── UI ───────────────────────────────────────────────────

function updateJamUI(state) {
  const btn = document.getElementById('jam-btn');
  const panel = document.getElementById('jam-panel');
  if (!btn || !panel) return;

  switch (state) {
    case 'connected':
      btn.classList.add('active');
      btn.textContent = 'Jam';
      panel.innerHTML = `
        <div class="jam-connected">
          <span class="jam-code-display">${jamRoomCode}</span>
          <button id="jam-copy-btn" class="jam-action-btn" title="Copy code">Copy</button>
          <button id="jam-leave-btn" class="jam-action-btn jam-leave" title="Leave session">Leave</button>
        </div>
      `;
      panel.style.display = 'flex';
      document.getElementById('jam-copy-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(jamRoomCode).then(() => {
          const btn = document.getElementById('jam-copy-btn');
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
        });
      });
      document.getElementById('jam-leave-btn').addEventListener('click', disconnectJam);
      break;

    case 'reconnecting':
      btn.classList.add('active');
      btn.textContent = 'Reconnecting...';
      break;

    case 'full':
      btn.classList.remove('active');
      btn.textContent = 'Jam';
      panel.innerHTML = `<div class="jam-error">Room is full (max 4)</div>`;
      panel.style.display = 'flex';
      setTimeout(() => {
        panel.style.display = 'none';
        panel.innerHTML = '';
        showJamOptions(panel);
      }, 3000);
      break;

    case 'disconnected':
    default:
      btn.classList.remove('active');
      btn.textContent = 'Jam';
      panel.style.display = 'none';
      panel.innerHTML = '';
      break;
  }
}

function showJamOptions(panel) {
  panel.innerHTML = `
    <button id="jam-start-btn" class="jam-action-btn">Start Session</button>
    <div class="jam-join-group">
      <input id="jam-join-input" type="text" maxlength="5" placeholder="CODE" spellcheck="false" autocomplete="off">
      <button id="jam-join-btn" class="jam-action-btn">Join</button>
    </div>
  `;
  panel.style.display = 'flex';

  document.getElementById('jam-start-btn').addEventListener('click', () => {
    const code = generateJamCode();
    connectToRoom(code);
  });

  const joinInput = document.getElementById('jam-join-input');
  const joinBtn = document.getElementById('jam-join-btn');

  joinBtn.addEventListener('click', () => {
    const code = joinInput.value.trim().toUpperCase();
    if (code.length >= 3) connectToRoom(code);
  });

  joinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const code = joinInput.value.trim().toUpperCase();
      if (code.length >= 3) connectToRoom(code);
    }
  });

  // Auto-uppercase input
  joinInput.addEventListener('input', () => {
    joinInput.value = joinInput.value.toUpperCase();
  });
}

function toggleJamPanel() {
  const panel = document.getElementById('jam-panel');
  if (!panel) return;

  if (jamConnected) {
    // Already connected — clicking toggle should do nothing, panel stays visible
    return;
  }

  if (panel.style.display === 'flex') {
    panel.style.display = 'none';
    panel.innerHTML = '';
  } else {
    showJamOptions(panel);
  }
}

// ── Init ─────────────────────────────────────────────────

function initJam() {
  const btn = document.getElementById('jam-btn');
  if (!btn) return;

  btn.addEventListener('click', toggleJamPanel);

  // Click outside to close panel
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('jam-panel');
    const control = document.querySelector('.jam-control');
    if (panel && panel.style.display === 'flex' && !jamConnected && !control.contains(e.target)) {
      panel.style.display = 'none';
      panel.innerHTML = '';
    }
  });

  // Auto-reconnect if session exists
  const savedRoom = sessionStorage.getItem('jamRoom');
  if (savedRoom) {
    connectToRoom(savedRoom);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initJam);
} else {
  initJam();
}
