// ═══════════════════════════════════════════════════════════════════════════
//  app.js  —  Punto de entrada principal: escena, VR, audio, render loop
// ═══════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { Labyrinth } from './Labyrinth.js';
import { Player } from './Player.js';

// ── Referencias DOM ────────────────────────────────────────────────────────
const loadingScreen = document.getElementById('loading-screen');
const loadingBar    = document.getElementById('loading-bar');
const loadingText   = document.getElementById('loading-text');
const hud           = document.getElementById('hud');
const hudCodeVal    = document.getElementById('hud-code-value');
const hudHint       = document.getElementById('hud-hint');
const crosshair     = document.getElementById('crosshair');
const canvas        = document.getElementById('game-canvas');

// ── Renderer ────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias:       true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace  = THREE.SRGBColorSpace;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// Botón VR (se inyecta en el body)
const vrBtn = VRButton.createButton(renderer);
document.body.appendChild(vrBtn);

// ── Escena & Cámara ──────────────────────────────────────────────────────────
const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x050a0e);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 1.65, 0);

// ── Reloj ────────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

// ── Audio ─────────────────────────────────────────────────────────────────────
let audioUnlocked = false;
let bgmSource     = null;
let audioCtx      = null;
let errorBuffer   = null, pinBuffer = null, pinpadBuffer = null;
let portalBBuffer = null, portalPBuffer = null;

async function initAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  const files = {
    bgm1:    'assets/bgm/dm1.wav',
    bgm2:    'assets/bgm/dm2.wav',
    error:   'assets/affects/error.wav',
    pin:     'assets/affects/pin.wav',
    pinpad:  'assets/affects/pinpad.wav',
    portalB: 'assets/affects/portal_b.wav',
    portalP: 'assets/affects/portal_p.wav',
  };

  const loaded = {};
  for (const [key, path] of Object.entries(files)) {
    try {
      const res  = await fetch(path);
      const buf  = await res.arrayBuffer();
      loaded[key] = await audioCtx.decodeAudioData(buf);
    } catch (_) { /* fallar silenciosamente */ }
  }

  errorBuffer   = loaded.error;
  pinBuffer     = loaded.pin;
  pinpadBuffer  = loaded.pinpad;
  portalBBuffer = loaded.portalB;
  portalPBuffer = loaded.portalP;

  // BGM aleatoria en loop
  const bgmBuf = Math.random() > 0.5 ? loaded.bgm1 : loaded.bgm2;
  if (bgmBuf) {
    bgmSource = audioCtx.createBufferSource();
    bgmSource.buffer = bgmBuf;
    bgmSource.loop   = true;
    bgmSource.connect(audioCtx.destination);
    bgmSource.start();
  }
}

function playSound(buffer) {
  if (!buffer || !audioCtx) return;
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  src.connect(audioCtx.destination);
  src.start();
}

// ── LoadingManager ────────────────────────────────────────────────────────────
THREE.DefaultLoadingManager.onProgress = (url, loaded, total) => {
  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 100;
  loadingBar.style.width = pct + '%';
  loadingText.textContent = `Cargando: ${url.split('/').pop()} (${pct}%)`;
};

THREE.DefaultLoadingManager.onLoad = () => {
  loadingBar.style.width = '100%';
  loadingText.textContent = 'Iniciando...';
  setTimeout(hideLoadingScreen, 600);
};

THREE.DefaultLoadingManager.onError = (url) => {
  console.warn('Asset no encontrado (ignorado):', url);
};

// ── Estado de juego ────────────────────────────────────────────────────────────
let labyrinth = null;
let player    = null;
let gameState = 'loading'; // loading | playing | won

// ── Portal VFX (video textura) ─────────────────────────────────────────────────
let portalBMesh = null, portalPMesh = null;

function createPortalVideo(path, pos) {
  const video = document.createElement('video');
  video.src      = path;
  video.loop     = true;
  video.muted    = true;
  video.autoplay = true;
  video.playsInline = true;
  video.play().catch(() => {});

  const tex = new THREE.VideoTexture(video);
  tex.colorSpace = THREE.SRGBColorSpace;

  const geo  = new THREE.PlaneGeometry(1.2, 2.2);
  const mat  = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  mesh.position.y = 1.1;
  scene.add(mesh);
  return mesh;
}

// ── Texto 3D de victoria ───────────────────────────────────────────────────────
function showWinScreen() {
  gameState = 'won';
  crosshair.style.display = 'none';

  const canvas2 = document.createElement('canvas');
  canvas2.width = 800; canvas2.height = 300;
  const ctx = canvas2.getContext('2d');
  ctx.fillStyle = 'rgba(0,10,15,0.92)';
  ctx.beginPath();
  ctx.roundRect(10, 10, 780, 280, 20);
  ctx.fill();
  ctx.fillStyle = '#00ffe7';
  ctx.font = 'bold 80px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('¡ESCAPASTE!', 400, 110);
  ctx.font = '28px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Felicitaciones. El laberinto ha sido conquistado.', 400, 170);
  ctx.font = '22px monospace';
  ctx.fillStyle = 'rgba(0,255,231,0.6)';
  ctx.fillText('Recarga la página para jugar de nuevo.', 400, 220);

  const tex  = new THREE.CanvasTexture(canvas2);
  const geo  = new THREE.PlaneGeometry(3.5, 1.3);
  const mat  = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);

  // Poner frente al jugador
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0; dir.normalize();
  mesh.position.copy(camera.position).addScaledVector(dir, 2.5);
  mesh.position.y = 1.65;
  mesh.lookAt(camera.position);
  scene.add(mesh);

  if (hudHint) hudHint.textContent = '¡Has escapado!';
}

// ── Callbacks del jugador ──────────────────────────────────────────────────────
const playerCallbacks = {
  onPinpadOpen() {
    playSound(pinpadBuffer);
    crosshair.style.display = 'none';
    hudHint.textContent = 'Introduce el código';
  },
  onPinpadClose() {
    crosshair.style.display = 'block';
    hudHint.textContent = '';
  },
  onCodeCorrect() {
    playSound(pinBuffer);
    hudCodeVal.textContent = labyrinth?.secretCode ?? '????';
    hudHint.textContent = '¡Código correcto! Ve a la puerta.';
    // Activar portal pinpad
    if (portalPMesh) { portalPMesh.visible = true; }
  },
  onCodeWrong() {
    playSound(errorBuffer);
    hudHint.textContent = 'Código incorrecto, inténtalo de nuevo.';
    setTimeout(() => { if (hudHint) hudHint.textContent = ''; }, 2000);
  },
  onDoorOpen() {
    playSound(portalBBuffer);
    showWinScreen();
    if (portalBMesh) portalBMesh.visible = true;
  },
  onDoorLocked() {
    playSound(errorBuffer);
    hudHint.textContent = 'Primero encuentra el PinPad.';
    setTimeout(() => { if (hudHint) hudHint.textContent = ''; }, 2500);
  },
};

// ── HUD Desktop: teclado pinpad ────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (player) player.handleKeyForPinpad(e.code);
  // Audio unlock en primera tecla
  if (!audioUnlocked) initAudio();
});

// Audio unlock en click también
window.addEventListener('click', () => {
  if (!audioUnlocked) initAudio();
}, { once: true });

// ── Ocultar loading screen ─────────────────────────────────────────────────────
function hideLoadingScreen() {
  loadingScreen.classList.add('fade-out');
  hud.style.display = 'block';
  crosshair.style.display = 'block';
  gameState = 'playing';
  setTimeout(() => { loadingScreen.style.display = 'none'; }, 900);
}

// ── Inicialización principal ───────────────────────────────────────────────────
async function init() {
  labyrinth = new Labyrinth(scene, renderer);
  await labyrinth.build();

  // Portales de video
  portalBMesh = createPortalVideo('assets/portal_b.webm', labyrinth.doorPos);
  portalBMesh.visible = false;

  portalPMesh = createPortalVideo('assets/portal_p.webm', labyrinth.pinpadPos);
  portalPMesh.visible = false;

  // Jugador
  player = new Player(renderer, scene, camera, labyrinth, playerCallbacks);
  player.setStartPosition(labyrinth.startPos);

  // HUD inicial
  hudCodeVal.textContent = '????'; // código oculto hasta que se resuelva

  // Código de acceso (mostrar en consola para debug)
  console.log('%c[LABYRINTH] Código secreto: ' + labyrinth.secretCode,
    'color:#00ffe7;font-size:18px;font-weight:bold;');

  // VR events
  renderer.xr.addEventListener('sessionstart', () => {
    player.isVR = true;
    player.initVRControllers();
    crosshair.style.display = 'none';
    hud.style.display       = 'block';
    initAudio();
  });
  renderer.xr.addEventListener('sessionend', () => {
    player.isVR = false;
    crosshair.style.display = 'block';
  });

  // Si el LoadingManager ya terminó (todos los assets cargados)
  // el callback onLoad ya habrá llamado hideLoadingScreen.
  // Por si acaso no hay assets pendientes, forzamos la ocultación tras 1s.
  setTimeout(() => {
    if (gameState === 'loading') hideLoadingScreen();
  }, 3000);
}

// ── Resize ─────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Render Loop ────────────────────────────────────────────────────────────────
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05); // cap a 50ms

  if (player && gameState === 'playing') {
    player.update(dt);
  }

  // Hacer que los portales miren a la cámara (billboard)
  if (portalBMesh?.visible) portalBMesh.lookAt(camera.position);
  if (portalPMesh?.visible) portalPMesh.lookAt(camera.position);

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

// ── Arrancar ────────────────────────────────────────────────────────────────────
init().catch(err => {
  console.error('Error al inicializar Labyrinth:', err);
  loadingText.textContent = 'Error al cargar. Revisa la consola.';
});