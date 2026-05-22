// ═══════════════════════════════════════════════════════════════════════════
//  Labyrinth.js  —  Generación de mapa, InstancedMesh y decoración
// ═══════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// ── Constantes de geometría ─────────────────────────────────────────────────
export const CELL       = 2;      // tamaño de casilla (metros)
export const WALL_H     = 3.2;    // altura del muro
export const WALL_T     = 0.25;   // grosor del muro (decorativo, el InstancedMesh es sólido)

// ── Tipos de mapa ────────────────────────────────────────────────────────────
// Cada tipo define un set de texturas para suelos y paredes
const MAP_TYPES = [
  { floor: 'assets/textures/Alfombra/Alf1.jpg',  wall: 'assets/textures/Pared/Piedra.jpeg' },
  { floor: 'assets/textures/Alfombra/Alf2.jpg',  wall: 'assets/textures/Pared/Madera.jpeg' },
  { floor: 'assets/textures/Alfombra/Alf1.jpg',  wall: 'assets/textures/Pared/Blue.jpg'    },
  { floor: 'assets/textures/Alfombra/Alf2.jpg',  wall: 'assets/textures/Pared/Fun.png'     },
];

// ── Plantilla 15×15 (0=pasillo, 1=muro) ─────────────────────────────────────
// Generada con DFS para garantizar conectividad total.
// El algoritmo de expansión convierte cada celda a 3×3 (pared=1, pasillo=2).
function generateMaze15() {
  const R = 15, C = 15;
  const grid = Array.from({ length: R }, () => new Array(C).fill(1));

  function carve(r, c) {
    grid[r][c] = 0;
    const dirs = [[0,2],[0,-2],[2,0],[-2,0]].sort(() => Math.random() - 0.5);
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < R && nc >= 0 && nc < C && grid[nr][nc] === 1) {
        grid[r + dr/2][c + dc/2] = 0;
        carve(nr, nc);
      }
    }
  }
  carve(1, 1);
  // Asegurar que (1,1) y (R-2,C-2) sean siempre pasillo
  grid[R-2][C-2] = 0;
  return grid;
}

// ── Expansión: pasillo de 2 casillas, muro de 1 ──────────────────────────────
// Transforma una cuadrícula N×N en (2N+1)×(2N+1)
function expandMaze(base) {
  const R = base.length, C = base[0].length;
  const ER = 2*R + 1, EC = 2*C + 1;
  const exp = Array.from({ length: ER }, () => new Array(EC).fill(1));

  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (base[r][c] === 0) {
        // Celda expandida: 2×2 pasillos en posición (2r+1, 2c+1)
        exp[2*r+1][2*c+1] = 0;
        exp[2*r+2][2*c+1] = 0;
        exp[2*r+1][2*c+2] = 0;
        exp[2*r+2][2*c+2] = 0;
      }
    }
  }
  // Reconstruir conexiones
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (base[r][c] === 0) {
        if (r+1 < R && base[r+1][c] === 0) {
          // Conexión vertical
          exp[2*r+3][2*c+1] = 0;
          exp[2*r+3][2*c+2] = 0;
        }
        if (c+1 < C && base[r][c+1] === 0) {
          // Conexión horizontal
          exp[2*r+1][2*c+3] = 0;
          exp[2*r+2][2*c+3] = 0;
        }
      }
    }
  }
  return exp;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Clase principal Labyrinth
// ─────────────────────────────────────────────────────────────────────────────
export class Labyrinth {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.WebGLRenderer} renderer
   */
  constructor(scene, renderer) {
    this.scene    = scene;
    this.renderer = renderer;
    this.loader   = new GLTFLoader(THREE.DefaultLoadingManager);
    this.texLoader = new THREE.TextureLoader(THREE.DefaultLoadingManager);
    this.rgbeLoader = new RGBELoader(THREE.DefaultLoadingManager);

    // Mapa
    this.base15 = null;   // 15×15
    this.grid   = null;   // expandido
    this.ROWS   = 0;
    this.COLS   = 0;
    this.mapType = 0;

    // Instanced meshes
    this.wallMesh  = null;
    this.floorMesh = null;

    // Celdas libres (para colocar objetos)
    this.freeCells = [];

    // Posiciones especiales (world coords)
    this.startPos  = new THREE.Vector3();
    this.pinpadPos = new THREE.Vector3();
    this.doorPos   = new THREE.Vector3();
    this.doorCell  = { r: 0, c: 0 };

    // Modelos de decoración
    this._decorModels = [];

    // Código secreto
    this.secretCode = String(Math.floor(Math.random() * 9000) + 1000);
  }

  // ── Carga todos los assets del laberinto ────────────────────────────────
  async build() {
    this._chooseMapType();
    this._generateGrid();
    await this._loadEnvironment();
    this._buildInstancedWalls();
    this._buildFloor();
    this._placeLights();
    await this._placeDecoration();
    await this._placePinpad();
    await this._placeDoor();
    return this;
  }

  // ── Elige tipo de mapa aleatoriamente ───────────────────────────────────
  _chooseMapType() {
    this.mapType = Math.floor(Math.random() * MAP_TYPES.length);
  }

  // ── Genera y expande el laberinto ────────────────────────────────────────
  _generateGrid() {
    this.base15 = generateMaze15();
    this.grid   = expandMaze(this.base15);
    this.ROWS   = this.grid.length;
    this.COLS   = this.grid[0].length;

    // Recolectar celdas libres
    this.freeCells = [];
    for (let r = 0; r < this.ROWS; r++) {
      for (let c = 0; c < this.COLS; c++) {
        if (this.grid[r][c] === 0) this.freeCells.push({ r, c });
      }
    }

    // Inicio: primera celda libre cerca de (1,1)
    this.startCell = this._nearestFree(1, 1);
    this.startPos.set(
      this.startCell.c * CELL - (this.COLS * CELL) / 2 + CELL / 2,
      0,
      this.startCell.r * CELL - (this.ROWS * CELL) / 2 + CELL / 2
    );

    // Pinpad: celda libre más lejana del inicio
    const far = this._farthestFree(this.startCell);
    this.pinpadCell = far;
    this.pinpadPos.set(
      far.c * CELL - (this.COLS * CELL) / 2 + CELL / 2,
      0,
      far.r * CELL - (this.ROWS * CELL) / 2 + CELL / 2
    );

    // Puerta: segunda más lejana (diferente al pinpad)
    const far2 = this._farthestFreeExcluding(this.startCell, [far]);
    this.doorCell = far2;
    this.doorPos.set(
      far2.c * CELL - (this.COLS * CELL) / 2 + CELL / 2,
      0,
      far2.r * CELL - (this.ROWS * CELL) / 2 + CELL / 2
    );
  }

  _nearestFree(r, c) {
    let best = null, bestD = Infinity;
    for (const cell of this.freeCells) {
      const d = Math.abs(cell.r - r) + Math.abs(cell.c - c);
      if (d < bestD) { bestD = d; best = cell; }
    }
    return best;
  }

  _farthestFree(from) {
    let best = null, bestD = -Infinity;
    for (const cell of this.freeCells) {
      const d = Math.abs(cell.r - from.r) + Math.abs(cell.c - from.c);
      if (d > bestD) { bestD = d; best = cell; }
    }
    return best;
  }

  _farthestFreeExcluding(from, excludes) {
    let best = null, bestD = -Infinity;
    for (const cell of this.freeCells) {
      if (excludes.some(e => e.r === cell.r && e.c === cell.c)) continue;
      const d = Math.abs(cell.r - from.r) + Math.abs(cell.c - from.c);
      if (d > bestD) { bestD = d; best = cell; }
    }
    return best;
  }

  // ── Carga el entorno HDRI ─────────────────────────────────────────────────
  async _loadEnvironment() {
    const hdris = [
      'assets/sky/QwN.exr',
      'assets/sky/RogN.exr',
      'assets/sky/SatN.exr',
    ];
    const hdri = hdris[Math.floor(Math.random() * hdris.length)];

    return new Promise((resolve) => {
      this.rgbeLoader.load(hdri, (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        this.scene.environment = texture;
        // No fondo para mantener el techo oscuro/misterioso
        resolve();
      }, undefined, () => resolve()); // si falla, continuar
    });
  }

  // ── InstancedMesh de muros ────────────────────────────────────────────────
  _buildInstancedWalls() {
    const wallTex = this._loadTex(MAP_TYPES[this.mapType].wall, 1, 1);

    const geo = new THREE.BoxGeometry(CELL, WALL_H, CELL);
    const mat = new THREE.MeshStandardMaterial({
      map:          wallTex,
      roughness:    0.85,
      metalness:    0.05,
      envMapIntensity: 0.4,
    });

    // Contar muros
    let count = 0;
    for (let r = 0; r < this.ROWS; r++)
      for (let c = 0; c < this.COLS; c++)
        if (this.grid[r][c] === 1) count++;

    this.wallMesh = new THREE.InstancedMesh(geo, mat, count);
    this.wallMesh.castShadow    = false;
    this.wallMesh.receiveShadow = false;

    const dummy  = new THREE.Object3D();
    const half_r = (this.ROWS * CELL) / 2;
    const half_c = (this.COLS * CELL) / 2;
    let idx = 0;

    for (let r = 0; r < this.ROWS; r++) {
      for (let c = 0; c < this.COLS; c++) {
        if (this.grid[r][c] === 1) {
          dummy.position.set(
            c * CELL - half_c + CELL / 2,
            WALL_H / 2,
            r * CELL - half_r + CELL / 2
          );
          dummy.updateMatrix();
          this.wallMesh.setMatrixAt(idx++, dummy.matrix);
        }
      }
    }
    this.wallMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.wallMesh);
  }

  // ── Suelo único plano ─────────────────────────────────────────────────────
  _buildFloor() {
    const w = this.COLS * CELL;
    const h = this.ROWS * CELL;
    const floorTex = this._loadTex(MAP_TYPES[this.mapType].floor, w / 4, h / 4);

    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshStandardMaterial({
      map:       floorTex,
      roughness: 0.9,
      metalness: 0.0,
    });
    const floor = new THREE.Mesh(geo, mat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = false;
    this.scene.add(floor);

    // Techo oscuro
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x080c10 });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, h), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = WALL_H;
    this.scene.add(ceil);
  }

  // ── Iluminación básica ────────────────────────────────────────────────────
  _placeLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffeedd, 0.9);
    dir.position.set(10, 20, 10);
    this.scene.add(dir);
  }

  // ── Decoración: cactus, maceta, cuadro ───────────────────────────────────
  async _placeDecoration() {
    const models = [
      { path: 'models/cactus_maceta.glb', scale: 0.6, yOff: 0 },
      { path: 'models/maceta.glb',        scale: 0.5, yOff: 0 },
      { path: 'models/cuadro.glb',        scale: 0.8, yOff: 1.2 },
    ];

    const half_r = (this.ROWS * CELL) / 2;
    const half_c = (this.COLS * CELL) / 2;

    // Elegir ~20 celdas libres al azar para decorar
    const candidates = [...this.freeCells]
      .filter(cell =>
        !this._isSpecial(cell) &&
        !this._isNearStart(cell)
      )
      .sort(() => Math.random() - 0.5)
      .slice(0, 20);

    for (const cell of candidates) {
      const mdesc = models[Math.floor(Math.random() * models.length)];
      const x = cell.c * CELL - half_c + CELL / 2;
      const z = cell.r * CELL - half_r + CELL / 2;

      try {
        const gltf = await this._loadGLTF(mdesc.path);
        const obj  = gltf.scene.clone(true);
        obj.scale.setScalar(mdesc.scale);
        obj.position.set(x, mdesc.yOff, z);
        obj.rotation.y = Math.random() * Math.PI * 2;
        // Para cuadros, pegar a la pared más cercana
        if (mdesc.path.includes('cuadro')) {
          obj.position.y = mdesc.yOff;
        }
        this.scene.add(obj);
        this._decorModels.push(obj);
      } catch (_) { /* silenciar si el modelo falla */ }
    }
  }

  // ── PinPad ────────────────────────────────────────────────────────────────
  async _placePinpad() {
    try {
      const gltf = await this._loadGLTF('models/pinpad.glb');
      this.pinpadModel = gltf.scene;
      this.pinpadModel.scale.setScalar(0.6);
      this.pinpadModel.position.copy(this.pinpadPos);
      this.pinpadModel.position.y = 0;
      this.scene.add(this.pinpadModel);
    } catch (_) {
      // Fallback: caja naranja
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.8, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff3300, emissiveIntensity: 0.4 })
      );
      box.position.copy(this.pinpadPos);
      box.position.y = 0.6;
      this.scene.add(box);
      this.pinpadModel = box;
    }
  }

  // ── Puerta ────────────────────────────────────────────────────────────────
  async _placeDoor() {
    try {
      const gltf = await this._loadGLTF('models/door.glb');
      this.doorModel = gltf.scene;
      this.doorModel.scale.setScalar(1.0);
      this.doorModel.position.copy(this.doorPos);
      this.doorModel.position.y = 0;
      // Orientar puerta hacia el pasillo
      this.doorModel.rotation.y = Math.random() > 0.5 ? 0 : Math.PI / 2;
      this.scene.add(this.doorModel);
    } catch (_) {
      // Fallback: marco verde
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 2.4, 0.1),
        new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00aa44, emissiveIntensity: 0.5 })
      );
      box.position.copy(this.doorPos);
      box.position.y = 1.2;
      this.scene.add(box);
      this.doorModel = box;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  _isSpecial(cell) {
    return (
      (cell.r === this.pinpadCell?.r && cell.c === this.pinpadCell?.c) ||
      (cell.r === this.doorCell?.r   && cell.c === this.doorCell?.c)   ||
      (cell.r === this.startCell?.r  && cell.c === this.startCell?.c)
    );
  }

  _isNearStart(cell) {
    if (!this.startCell) return false;
    return Math.abs(cell.r - this.startCell.r) + Math.abs(cell.c - this.startCell.c) < 4;
  }

  _loadTex(url, repX = 1, repY = 1) {
    const tex = this.texLoader.load(url);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repX, repY);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _loadGLTF(path) {
    return new Promise((resolve, reject) => {
      this.loader.load(path, resolve, undefined, reject);
    });
  }

  // ── Conversión mundo → celda ───────────────────────────────────────────
  worldToCell(worldX, worldZ) {
    const half_r = (this.ROWS * CELL) / 2;
    const half_c = (this.COLS * CELL) / 2;
    const c = Math.floor((worldX + half_c) / CELL);
    const r = Math.floor((worldZ + half_r) / CELL);
    return { r, c };
  }

  isWall(r, c) {
    if (r < 0 || r >= this.ROWS || c < 0 || c >= this.COLS) return true;
    return this.grid[r][c] === 1;
  }

  // Devuelve posición world del centro de una celda
  cellToWorld(r, c) {
    const half_r = (this.ROWS * CELL) / 2;
    const half_c = (this.COLS * CELL) / 2;
    return new THREE.Vector3(
      c * CELL - half_c + CELL / 2,
      0,
      r * CELL - half_r + CELL / 2
    );
  }
}