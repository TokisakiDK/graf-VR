// ═══════════════════════════════════════════════════════════════════════════
//  Player.js  —  Controles, físicas de colisión y lógica VR/Desktop
// ═══════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { CELL } from './Labyrinth.js';

// ── Constantes de movimiento ──────────────────────────────────────────────
const WALK_SPEED  = 4.0;   // m/s
const RUN_SPEED   = 8.5;   // m/s
const TURN_SPEED  = 2.0;   // rad/s (joystick)
const PLAYER_H    = 1.65;  // altura de la cámara
const COLLIDER_R  = 0.35;  // radio de colisión

// ── Zona de interacción ───────────────────────────────────────────────────
const INTERACT_DIST = 2.0; // metros

export class Player {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene}         scene
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('./Labyrinth.js').Labyrinth} labyrinth
   * @param {object} callbacks  { onPinpadOpen, onPinpadClose, onDoorOpen }
   */
  constructor(renderer, scene, camera, labyrinth, callbacks = {}) {
    this.renderer   = renderer;
    this.scene      = scene;
    this.camera     = camera;
    this.labyrinth  = labyrinth;
    this.callbacks  = callbacks;

    // Estado
    this.isVR         = false;
    this.pinpadOpen   = false;
    this.pinpadSolved = false;
    this.enteredCode  = '';
    this.hasCode      = false; // el jugador visitó el pinpad y tomó el código

    // Movimiento desktop
    this._keys   = {};
    this._euler  = new THREE.Euler(0, 0, 0, 'YXZ');
    this._locked = false; // pointer lock activo

    // VR controllers
    this._controller0 = null; // mano izquierda (movimiento)
    this._controller1 = null; // mano derecha (interacción)
    this._gamepad0    = null;
    this._gamepad1    = null;

    // Joystick acumulador de rotación (para evitar deriva)
    this._turnAccum = 0;
    this._prevRightX = 0;

    // Helpers 3D
    this._billboardHint = null;   // Texto flotante "Interactuar"
    this._vrPinpadUI    = null;   // Panel 3D del PinPad

    // Selección VR en teclado
    this._vrPinpadButtons = [];
    this._vrPinpadCursor  = 0;
    this._vrPinpadNavCooldown = 0;

    // Posición temporal
    this._tmpPos  = new THREE.Vector3();
    this._moveVec = new THREE.Vector3();
    this._fwd     = new THREE.Vector3();

    this._initDesktopControls();
    this._createBillboardHint();
    this._createVRPinpadUI();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  INIT DESKTOP
  // ─────────────────────────────────────────────────────────────────────────
  _initDesktopControls() {
    const canvas = this.renderer.domElement;

    // Teclado
    window.addEventListener('keydown', e => {
      this._keys[e.code] = true;
      // 'F' = interactuar en desktop
      if (e.code === 'KeyF') this._tryInteract();
      // Escape = salir del pinpad
      if (e.code === 'Escape' && this.pinpadOpen) this._closePinpad();
    });
    window.addEventListener('keyup', e => { this._keys[e.code] = false; });

    // Pointer Lock (mouse look)
    canvas.addEventListener('click', () => {
      if (!this.isVR) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this._locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', e => {
      if (!this._locked) return;
      this._euler.setFromQuaternion(this.camera.quaternion);
      this._euler.y -= e.movementX * 0.0022;
      this._euler.x -= e.movementY * 0.0022;
      this._euler.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this._euler.x));
      this.camera.quaternion.setFromEuler(this._euler);
    });
  }

  // ── Inicializar gamepads VR ────────────────────────────────────────────
  initVRControllers() {
    this._controller0 = this.renderer.xr.getController(0); // izquierdo
    this._controller1 = this.renderer.xr.getController(1); // derecho
    this.scene.add(this._controller0, this._controller1);

    // Botón A (button[4]) → interactuar / confirmar
    this._controller1.addEventListener('selectstart', () => {
      if (this.pinpadOpen) {
        this._pinpadConfirmButton();
      } else {
        this._tryInteract();
      }
    });

    // Botón B (button[5]) → cerrar pinpad
    this._controller1.addEventListener('squeezestart', () => {
      if (this.pinpadOpen) this._closePinpad();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  BILLBOARD HINT "Interactuar"
  // ─────────────────────────────────────────────────────────────────────────
  _createBillboardHint() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    this._hintCanvas = canvas;
    this._hintCtx    = canvas.getContext('2d');

    const tex  = new THREE.CanvasTexture(canvas);
    this._hintTex = tex;

    const geo  = new THREE.PlaneGeometry(1.4, 0.35);
    const mat  = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide
    });

    this._billboardHint = new THREE.Mesh(geo, mat);
    this._billboardHint.visible = false;
    this._billboardHint.renderOrder = 10;
    this.scene.add(this._billboardHint);
  }

  _drawHint(text) {
    const ctx = this._hintCtx;
    const w = this._hintCanvas.width, h = this._hintCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Fondo semitransparente
    ctx.fillStyle = 'rgba(0, 20, 30, 0.82)';
    ctx.strokeStyle = '#00ffe7';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(8, 8, w-16, h-16, 14);
    ctx.fill(); ctx.stroke();

    // Texto
    ctx.fillStyle = '#00ffe7';
    ctx.font = 'bold 38px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w/2, h/2);

    this._hintTex.needsUpdate = true;
  }

  _showHint(text, worldPos) {
    this._drawHint(text);
    this._billboardHint.visible = true;
    this._billboardHint.position.set(worldPos.x, PLAYER_H + 0.55, worldPos.z);
  }

  _hideHint() {
    this._billboardHint.visible = false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  VR PINPAD UI  (panel 3D flotante)
  // ─────────────────────────────────────────────────────────────────────────
  _createVRPinpadUI() {
    // Raíz del panel
    this._vrPinpadUI = new THREE.Group();
    this._vrPinpadUI.visible = false;
    this.scene.add(this._vrPinpadUI);

    // Canvas 2D → Texture
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 640;
    this._padCanvas = canvas;
    this._padCtx    = canvas.getContext('2d');
    this._padTex    = new THREE.CanvasTexture(canvas);

    const geo = new THREE.PlaneGeometry(0.9, 1.1);
    const mat = new THREE.MeshBasicMaterial({
      map: this._padTex, transparent: true, depthWrite: false, side: THREE.DoubleSide
    });
    this._padMesh = new THREE.Mesh(geo, mat);
    this._vrPinpadUI.add(this._padMesh);

    this._renderPadCanvas();
  }

  _renderPadCanvas() {
    const ctx = this._padCtx;
    const W = 512, H = 640;
    ctx.clearRect(0, 0, W, H);

    // Fondo
    ctx.fillStyle = 'rgba(3,12,20,0.94)';
    ctx.strokeStyle = '#00ffe7';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(10, 10, W-20, H-20, 20);
    ctx.fill(); ctx.stroke();

    // Título
    ctx.fillStyle = '#00ffe7';
    ctx.font = 'bold 30px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PINPAD', W/2, 60);

    // Display del código ingresado
    ctx.strokeStyle = '#00ffe7';
    ctx.lineWidth = 2;
    ctx.strokeRect(60, 85, W-120, 60);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 42px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.enteredCode.padEnd(4, '_'), W/2, 130);

    // Botones 0-9, *, #
    const labels = ['1','2','3','4','5','6','7','8','9','*','0','#'];
    const cols = 3, rows = 4;
    const bw = 110, bh = 80, gap = 18;
    const startX = 56, startY = 170;

    this._vrPinpadButtons = [];
    labels.forEach((label, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = startX + col * (bw + gap);
      const y = startY + row * (bh + gap);
      const isCursor = i === this._vrPinpadCursor;

      ctx.fillStyle   = isCursor ? '#00ffe7' : 'rgba(0,60,80,0.85)';
      ctx.strokeStyle = isCursor ? '#ffffff'  : '#00ffe7';
      ctx.lineWidth   = isCursor ? 4 : 2;
      ctx.beginPath();
      ctx.roundRect(x, y, bw, bh, 10);
      ctx.fill(); ctx.stroke();

      ctx.fillStyle = isCursor ? '#000' : '#fff';
      ctx.font = 'bold 32px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + bw/2, y + bh/2 + 10);

      this._vrPinpadButtons.push({ label, x, y, w: bw, h: bh });
    });

    // Instrucciones VR
    ctx.fillStyle = 'rgba(0,255,231,0.45)';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[Joystick] Navegar  [A] Seleccionar  [B] Cerrar', W/2, 622);

    this._padTex.needsUpdate = true;
  }

  _openPinpad() {
    if (this.pinpadOpen) return;
    this.pinpadOpen = true;
    this.enteredCode = '';
    this._vrPinpadCursor = 0;
    this._renderPadCanvas();

    // Posicionar el panel frente al jugador
    const camPos = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    this.camera.getWorldPosition(camPos);
    this.camera.getWorldDirection(camDir);
    camDir.y = 0;
    camDir.normalize();

    const panelPos = camPos.clone().addScaledVector(camDir, 1.2);
    panelPos.y = PLAYER_H;

    this._vrPinpadUI.position.copy(panelPos);
    this._vrPinpadUI.lookAt(camPos);
    this._vrPinpadUI.visible = true;
    this._hideHint();

    if (this.callbacks.onPinpadOpen) this.callbacks.onPinpadOpen();
  }

  _closePinpad() {
    this.pinpadOpen = false;
    this._vrPinpadUI.visible = false;
    if (this.callbacks.onPinpadClose) this.callbacks.onPinpadClose();
  }

  _pinpadConfirmButton() {
    const btn = this._vrPinpadButtons[this._vrPinpadCursor];
    if (!btn) return;
    this._pinpadPressLabel(btn.label);
  }

  _pinpadPressLabel(label) {
    if (label === '#') {
      // Backspace
      this.enteredCode = this.enteredCode.slice(0, -1);
    } else if (label === '*') {
      // Limpiar
      this.enteredCode = '';
    } else if (this.enteredCode.length < 4 && /[0-9]/.test(label)) {
      this.enteredCode += label;
    }
    if (this.enteredCode.length === 4) {
      this._checkCode();
    }
    this._renderPadCanvas();
  }

  _checkCode() {
    if (this.enteredCode === this.labyrinth.secretCode) {
      // ¡Correcto!
      this.pinpadSolved = true;
      this.hasCode = true;
      setTimeout(() => this._closePinpad(), 800);
      if (this.callbacks.onCodeCorrect) this.callbacks.onCodeCorrect();
    } else {
      // Incorrecto
      this.enteredCode = '';
      if (this.callbacks.onCodeWrong) this.callbacks.onCodeWrong();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  INTERACCIÓN
  // ─────────────────────────────────────────────────────────────────────────
  _tryInteract() {
    const playerPos = new THREE.Vector3();
    this.camera.getWorldPosition(playerPos);
    playerPos.y = 0;

    const toPinpad = this.labyrinth.pinpadPos.clone().setY(0).distanceTo(playerPos);
    const toDoor   = this.labyrinth.doorPos.clone().setY(0).distanceTo(playerPos);

    if (toPinpad < INTERACT_DIST && !this.pinpadSolved) {
      this._openPinpad();
    } else if (toDoor < INTERACT_DIST) {
      if (this.hasCode && this.callbacks.onDoorOpen) {
        this.callbacks.onDoorOpen();
      } else if (this.callbacks.onDoorLocked) {
        this.callbacks.onDoorLocked();
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  UPDATE  (llamado cada frame)
  // ─────────────────────────────────────────────────────────────────────────
  update(dt) {
    if (this.isVR) {
      this._updateVR(dt);
    } else {
      this._updateDesktop(dt);
    }
    this._updateHint();
    if (this.pinpadOpen) this._updateVRPinpadNav(dt);
    // Billboard siempre mira a la cámara
    if (this._billboardHint.visible) {
      this._billboardHint.lookAt(this.camera.position);
    }
  }

  // ── Desktop movement ───────────────────────────────────────────────────
  _updateDesktop(dt) {
    if (this.pinpadOpen) return;

    const speed = this._keys['ShiftLeft'] ? RUN_SPEED : WALK_SPEED;
    this._moveVec.set(0, 0, 0);

    this.camera.getWorldDirection(this._fwd);
    this._fwd.y = 0;
    this._fwd.normalize();
    const right = new THREE.Vector3();
    right.crossVectors(this._fwd, new THREE.Vector3(0, 1, 0)).normalize();

    if (this._keys['KeyW'] || this._keys['ArrowUp'])    this._moveVec.addScaledVector(this._fwd, speed * dt);
    if (this._keys['KeyS'] || this._keys['ArrowDown'])  this._moveVec.addScaledVector(this._fwd, -speed * dt);
    if (this._keys['KeyA'] || this._keys['ArrowLeft'])  this._moveVec.addScaledVector(right, -speed * dt);
    if (this._keys['KeyD'] || this._keys['ArrowRight']) this._moveVec.addScaledVector(right, speed * dt);

    this._applyMovement(this._moveVec);
  }

  // ── VR movement ────────────────────────────────────────────────────────
  _updateVR(dt) {
    const session = this.renderer.xr.getSession();
    if (!session) return;

    let lx = 0, ly = 0, rx = 0;
    let running = false;

    for (const src of session.inputSources) {
      const gp = src.gamepad;
      if (!gp) continue;
      if (src.handedness === 'left') {
        lx = gp.axes[2] ?? 0;   // joystick izq X
        ly = gp.axes[3] ?? 0;   // joystick izq Y
        running = gp.buttons[1]?.pressed ?? false; // gatillo
      }
      if (src.handedness === 'right') {
        rx = gp.axes[2] ?? 0;   // joystick der X
      }
    }

    // Movimiento
    if (Math.abs(lx) > 0.12 || Math.abs(ly) > 0.12) {
      const speed = running ? RUN_SPEED : WALK_SPEED;
      this.camera.getWorldDirection(this._fwd);
      this._fwd.y = 0; this._fwd.normalize();
      const right = new THREE.Vector3();
      right.crossVectors(this._fwd, new THREE.Vector3(0, 1, 0)).normalize();

      this._moveVec.set(0, 0, 0);
      this._moveVec.addScaledVector(this._fwd, -ly * speed * dt);
      this._moveVec.addScaledVector(right,      lx * speed * dt);
      this._applyMovement(this._moveVec);
    }

    // Rotación (joystick derecho) — snap turning
    if (!this.pinpadOpen) {
      const deadzone = 0.4;
      if (Math.abs(rx) > deadzone && Math.abs(this._prevRightX) <= deadzone) {
        const snapAngle = Math.PI / 6; // 30°
        const ref = this.renderer.xr.getReferenceSpace();
        if (ref) {
          const angle = rx > 0 ? -snapAngle : snapAngle;
          const rot = new XRRigidTransform(
            { x: 0, y: 0, z: 0, w: 1 },
            { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) }
          );
          const newRef = ref.getOffsetReferenceSpace(rot);
          this.renderer.xr.setReferenceSpace(newRef);
        }
      }
      this._prevRightX = rx;
    } else {
      // En pinpad, navegar con joystick derecho
      // (manejado en _updateVRPinpadNav)
    }
  }

  // ── Colisión AABB simple contra muros ─────────────────────────────────
  _applyMovement(delta) {
    const pos = this.camera.position;

    // Mover en X
    this._tmpPos.copy(pos);
    this._tmpPos.x += delta.x;
    if (!this._collides(this._tmpPos)) {
      pos.x = this._tmpPos.x;
    }

    // Mover en Z
    this._tmpPos.copy(pos);
    this._tmpPos.z += delta.z;
    if (!this._collides(this._tmpPos)) {
      pos.z = this._tmpPos.z;
    }

    // Mantener altura en VR el XRReferenceSpace posiciona, en desktop fijamos Y
    if (!this.isVR) {
      pos.y = PLAYER_H;
    }
  }

  _collides(pos) {
    const cell = this.labyrinth.worldToCell(pos.x, pos.z);
    const r0 = Math.floor((pos.z - COLLIDER_R + (this.labyrinth.ROWS * CELL) / 2) / CELL);
    const r1 = Math.floor((pos.z + COLLIDER_R + (this.labyrinth.ROWS * CELL) / 2) / CELL);
    const c0 = Math.floor((pos.x - COLLIDER_R + (this.labyrinth.COLS * CELL) / 2) / CELL);
    const c1 = Math.floor((pos.x + COLLIDER_R + (this.labyrinth.COLS * CELL) / 2) / CELL);

    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++)
        if (this.labyrinth.isWall(r, c)) return true;

    return false;
  }

  // ── Actualizar hint de interacción ────────────────────────────────────
  _updateHint() {
    if (this.pinpadOpen) return;

    const playerPos = new THREE.Vector3();
    this.camera.getWorldPosition(playerPos);
    playerPos.y = 0;

    const toPinpad = this.labyrinth.pinpadPos.clone().setY(0).distanceTo(playerPos);
    const toDoor   = this.labyrinth.doorPos.clone().setY(0).distanceTo(playerPos);

    if (toPinpad < INTERACT_DIST && !this.pinpadSolved) {
      const label = this.isVR ? '[A] Pinpad' : '[F] Pinpad';
      this._showHint(label, this.labyrinth.pinpadPos);
    } else if (toDoor < INTERACT_DIST) {
      const label = this.hasCode
        ? (this.isVR ? '[A] Abrir Puerta' : '[F] Abrir Puerta')
        : 'Necesitas el código';
      this._showHint(label, this.labyrinth.doorPos);
    } else {
      this._hideHint();
    }
  }

  // ── Navegar VR PinPad con joystick derecho ────────────────────────────
  _updateVRPinpadNav(dt) {
    if (!this.pinpadOpen) return;
    this._vrPinpadNavCooldown -= dt;
    if (this._vrPinpadNavCooldown > 0) return;

    const session = this.renderer.xr.getSession();
    if (!session) return;

    let rx = 0, ry = 0;
    for (const src of session.inputSources) {
      const gp = src.gamepad;
      if (!gp) continue;
      if (src.handedness === 'right') {
        rx = gp.axes[2] ?? 0;
        ry = gp.axes[3] ?? 0;

        // Botón A → confirmar
        if (gp.buttons[4]?.pressed) {
          this._pinpadConfirmButton();
          this._vrPinpadNavCooldown = 0.35;
          return;
        }
        // Botón B → cerrar
        if (gp.buttons[5]?.pressed) {
          this._closePinpad();
          return;
        }
      }
    }

    const cols = 3;
    const total = 12;
    if (Math.abs(rx) > 0.5) {
      this._vrPinpadCursor = (this._vrPinpadCursor + (rx > 0 ? 1 : -1) + total) % total;
      this._vrPinpadNavCooldown = 0.2;
      this._renderPadCanvas();
    } else if (Math.abs(ry) > 0.5) {
      this._vrPinpadCursor = (this._vrPinpadCursor + (ry > 0 ? cols : -cols) + total) % total;
      this._vrPinpadNavCooldown = 0.2;
      this._renderPadCanvas();
    }
  }

  // ── Establecer posición inicial ────────────────────────────────────────
  setStartPosition(pos) {
    if (!this.isVR) {
      this.camera.position.set(pos.x, PLAYER_H, pos.z);
    }
    // En VR la posición la gestiona el XR reference space
  }

  // ── Desktop: manejo del teclado para el PinPad ────────────────────────
  handleKeyForPinpad(code) {
    if (!this.pinpadOpen) return;
    if (code === 'Backspace') { this._pinpadPressLabel('#'); return; }
    if (code === 'Escape')    { this._closePinpad(); return; }
    const digit = code.replace('Digit','').replace('Numpad','');
    if (/^[0-9]$/.test(digit)) this._pinpadPressLabel(digit);
  }
}