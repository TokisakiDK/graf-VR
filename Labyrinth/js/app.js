import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

import { Labyrinth } from './Labyrinth.js';
import { Player } from './Player.js';

let scene;
let camera;
let renderer;
let clock;

let labyrinth;
let player;

let gltfLoader;
let exrLoader;
let audioLoader;

let listener;
let bgmAudio;
let audioUnlocked = false;

let models = {};
let sounds = {};

let doorObject;
let pinpadObject;

let portalCooldown = 0;
let randomPortalsP = [];
let linkedPortalsB = [];

let doorMount;
let pinpadMount;

let playerCode = '';
let enteredCode = '';
let hasCode = false;
let gameWon = false;

let promptGroup;
let pinpadUI;
let pinpadButtons = [];
let selectedButtonIndex = 0;
let pinpadOpen = false;

let desktopAvatar;
let codeCluesGroup;

const DOOR_TARGET_HEIGHT = 2.35;
const PINPAD_TARGET_HEIGHT = 0.62;

// Casi cero para evitar barreras invisibles frente a puerta y pinpad.
const DOOR_COLLISION_RADIUS = 0.02;
const PINPAD_COLLISION_RADIUS = 0.02;

const RANDOM_PORTAL_COUNT = 5;
const LINKED_PORTAL_PAIR_COUNT = 3;

const PORTAL_WIDTH = 0.95;
const PORTAL_HEIGHT = 1.45;

// Activación más estricta: debes estar pegado al portal.
const PORTAL_TRIGGER_DISTANCE_FROM_PLANE = 0.22;
const PORTAL_TRIGGER_HALF_WIDTH = 0.48;

// Cooldown más largo para evitar bucles.
const PORTAL_COOLDOWN_TIME = 1.6;

// Salida más lejos del portal para no quedar dentro del trigger.
const PORTAL_EXIT_DISTANCE = 1.8;

const CLUE_ROTATE_180 = true;

const ASSETS = {
    affects: {
        error: './assets/affects/error.wav',
        pin: './assets/affects/pin.wav',
        pinpad: './assets/affects/pinpad.wav',
        portalB: './assets/affects/portal_b.wav',
        portalP: './assets/affects/portal_p.wav'
    },
    bgm: [
        './assets/bgm/dm1.wav',
        './assets/bgm/dm2.wav'
    ],
    sky: [
        './assets/sky/QwN.exr',
        './assets/sky/RogN.exr',
        './assets/sky/SatN.exr'
    ],
    models: {
        cactus_maceta: './models/cactus_maceta.glb',
        cuadro: './models/cuadro.glb',
        door: './models/door.glb',
        maceta: './models/maceta.glb',
        pinpad: './models/pinpad.glb'
    },
    videos: {
        portalB: './assets/portal_b.webm',
        portalP: './assets/portal_p.webm'
    }
};

init();

async function init() {
    setupLoadingManager();

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070c);

    clock = new THREE.Clock();

    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.05,
        120
    );

    const canvas = document.getElementById('game-canvas');

    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance'
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    document.body.appendChild(VRButton.createButton(renderer));

    gltfLoader = new GLTFLoader(THREE.DefaultLoadingManager);
    exrLoader = new EXRLoader(THREE.DefaultLoadingManager);
    audioLoader = new THREE.AudioLoader(THREE.DefaultLoadingManager);

    setupAudio();
    setupLights();

    await Promise.all([
        loadEnvironment(),
        loadModels(),
        loadAudio()
    ]);

    labyrinth = new Labyrinth(scene, THREE.DefaultLoadingManager, {
        cellSize: 1.15,
        wallHeight: 2.8
    });

    labyrinth.placeDecorations(models);

    setupPlayer();
    setupInteractables();
    setupUI();

    playerCode = generateCode();
    console.log('Código generado:', playerCode);

    createCodeClues(playerCode);

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('pointerdown', unlockAudioOnce, { once: true });
    window.addEventListener('keydown', unlockAudioOnce, { once: true });

    renderer.setAnimationLoop(animate);
}

function setupLoadingManager() {
    THREE.DefaultLoadingManager.onStart = () => {
        updateLoading(0, 'Cargando recursos...');
    };

    THREE.DefaultLoadingManager.onProgress = (_, loaded, total) => {
        const progress = total > 0 ? loaded / total : 0;
        updateLoading(progress, `Cargando ${loaded}/${total}`);
    };

    THREE.DefaultLoadingManager.onLoad = () => {
        updateLoading(1, 'Listo');
        hideLoadingScreen();
    };

    THREE.DefaultLoadingManager.onError = (url) => {
        console.warn('No se pudo cargar:', url);
    };
}

function updateLoading(progress, text) {
    const bar = document.getElementById('loading-bar');
    const label = document.getElementById('loading-text');

    if (bar) bar.style.width = `${Math.round(progress * 100)}%`;
    if (label) label.textContent = text;
}

function hideLoadingScreen() {
    const loading = document.getElementById('loading-screen');
    const hud = document.getElementById('hud');

    if (hud) hud.style.display = 'block';

    if (!loading) return;

    loading.classList.add('fade-out');

    setTimeout(() => {
        loading.style.display = 'none';
    }, 850);
}

function setupLights() {
    scene.add(new THREE.AmbientLight(0xffffff, 0.65));

    const directional = new THREE.DirectionalLight(0xffffff, 1.15);
    directional.position.set(9, 12, 5);
    directional.castShadow = false;
    scene.add(directional);
}

async function loadEnvironment() {
    const skyPath = ASSETS.sky[Math.floor(Math.random() * ASSETS.sky.length)];

    try {
        const exr = await exrLoader.loadAsync(skyPath);
        exr.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = exr;
        scene.background = exr;
    } catch (error) {
        console.warn('No se pudo cargar el cielo EXR:', error);
        scene.background = new THREE.Color(0x09111f);
    }
}

async function loadModels() {
    const entries = Object.entries(ASSETS.models);

    await Promise.all(entries.map(async ([key, path]) => {
        try {
            const gltf = await gltfLoader.loadAsync(path);
            const model = gltf.scene;

            model.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = false;
                    child.receiveShadow = false;
                    child.frustumCulled = true;

                    if (child.material) {
                        child.material.needsUpdate = true;
                    }
                }
            });

            models[key] = model;
        } catch (error) {
            console.warn(`No se pudo cargar el modelo ${key}:`, error);
        }
    }));
}

function setupAudio() {
    listener = new THREE.AudioListener();
    camera.add(listener);
}

async function loadAudio() {
    const entries = Object.entries(ASSETS.affects);

    await Promise.all(entries.map(async ([key, path]) => {
        try {
            const buffer = await audioLoader.loadAsync(path);
            sounds[key] = buffer;
        } catch (error) {
            console.warn(`No se pudo cargar audio ${key}:`, error);
        }
    }));

    try {
        const bgmPath = ASSETS.bgm[Math.floor(Math.random() * ASSETS.bgm.length)];
        const buffer = await audioLoader.loadAsync(bgmPath);

        bgmAudio = new THREE.Audio(listener);
        bgmAudio.setBuffer(buffer);
        bgmAudio.setLoop(true);
        bgmAudio.setVolume(0.28);
    } catch (error) {
        console.warn('No se pudo cargar música de fondo:', error);
    }
}

function unlockAudioOnce() {
    if (audioUnlocked) return;

    audioUnlocked = true;

    if (listener.context.state === 'suspended') {
        listener.context.resume();
    }

    if (bgmAudio && !bgmAudio.isPlaying) {
        bgmAudio.play();
    }
}

function playSound(name, volume = 0.75) {
    if (!audioUnlocked || !sounds[name]) return;

    const sound = new THREE.Audio(listener);
    sound.setBuffer(sounds[name]);
    sound.setVolume(volume);
    sound.play();
}

function setupPlayer() {
    player = new Player(camera, renderer, labyrinth, {
        speed: 2.45,
        runSpeed: 4.35,
        rotationSpeed: 2.6,
        collisionRadius: 0.28
    });

    scene.add(player.getObject());

    desktopAvatar = createDesktopAvatar();
    scene.add(desktopAvatar);

    player.setDesktopAvatar(desktopAvatar);

    player.setCallbacks({
        interact: handleInteraction,
        pinpadNavigate: navigatePinpad,
        pinpadSelect: selectPinpadButton,
        pinpadClose: closePinpad
    });
}

function createDesktopAvatar() {
    const group = new THREE.Group();
    group.name = 'DesktopPlayerAvatar';

    const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.22, 1.05, 5, 10),
        new THREE.MeshStandardMaterial({
            color: 0x6cc4ff,
            roughness: 0.7
        })
    );
    body.position.y = 0.85;

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 12, 12),
        new THREE.MeshStandardMaterial({
            color: 0xffd2a6,
            roughness: 0.7
        })
    );
    head.position.y = 1.55;

    group.add(body, head);

    return group;
}

function setupInteractables() {
    const neededMounts = 2 + RANDOM_PORTAL_COUNT + LINKED_PORTAL_PAIR_COUNT * 2;

    const mounts = labyrinth.findWallMountSpots(neededMounts, {
        minDistanceBetween: 7,
        avoid: [labyrinth.startPosition],
        avoidDistance: 7
    });

    doorMount = mounts[0] ?? labyrinth.findWallMountSpot();
    pinpadMount = mounts[1] ?? labyrinth.findWallMountSpot();

    setupDoor();
    setupPinpad();

    const portalMounts = mounts.slice(2);
    setupPortals(portalMounts);
}

function setupDoor() {
    if (models.door) {
        doorObject = models.door.clone(true);
    } else {
        doorObject = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, 2.2, 0.18),
            new THREE.MeshStandardMaterial({ color: 0x332211 })
        );
    }

    doorObject.name = 'ExitDoor';

    doorObject.traverse(child => {
        if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
            child.frustumCulled = true;
        }
    });

    normalizeModelHeight(doorObject, DOOR_TARGET_HEIGHT);

    doorObject.position.copy(doorMount.position);
    doorObject.position.y = 0;
    doorObject.position.addScaledVector(doorMount.normal, 0.035);
    doorObject.rotation.y = doorMount.rotationY;

    alignModelBottomToY(doorObject, 0);

    if (DOOR_COLLISION_RADIUS > 0.05) {
        labyrinth.registerObstacle(
            doorMount.accessPosition,
            DOOR_COLLISION_RADIUS,
            'door'
        );
    }

    scene.add(doorObject);
}

function setupPinpad() {
    if (models.pinpad) {
        pinpadObject = models.pinpad.clone(true);
    } else {
        pinpadObject = new THREE.Mesh(
            new THREE.BoxGeometry(0.42, 0.72, 0.08),
            new THREE.MeshStandardMaterial({ color: 0x151515 })
        );
    }

    pinpadObject.name = 'HiddenPinpad';

    pinpadObject.traverse(child => {
        if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
            child.frustumCulled = true;
        }
    });

    normalizeModelHeight(pinpadObject, PINPAD_TARGET_HEIGHT);

    pinpadObject.position.copy(pinpadMount.position);
    pinpadObject.position.y = 1.15;
    pinpadObject.position.addScaledVector(pinpadMount.normal, 0.045);
    pinpadObject.rotation.y = pinpadMount.rotationY;

    if (PINPAD_COLLISION_RADIUS > 0.05) {
        labyrinth.registerObstacle(
            pinpadMount.accessPosition,
            PINPAD_COLLISION_RADIUS,
            'pinpad'
        );
    }

    scene.add(pinpadObject);
}

function normalizeModelHeight(object, targetHeight) {
    object.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    box.getSize(size);

    if (size.y <= 0) return;

    const scaleFactor = targetHeight / size.y;
    object.scale.multiplyScalar(scaleFactor);

    object.updateMatrixWorld(true);
}

function alignModelBottomToY(object, targetY = 0) {
    object.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(object);
    const offset = targetY - box.min.y;

    object.position.y += offset;
}

function setupPortals(portalMounts) {
    randomPortalsP = [];
    linkedPortalsB = [];

    let index = 0;

    for (let i = 0; i < RANDOM_PORTAL_COUNT; i++) {
        const mount = portalMounts[index++];
        if (!mount) break;

        const portal = createVideoPortal(ASSETS.videos.portalP, PORTAL_WIDTH, PORTAL_HEIGHT);
        portal.name = `Portal_P_${i + 1}`;

        placePortalOnWall(portal, mount, 1.25, 0.08);
        scene.add(portal);

        randomPortalsP.push({
            mesh: portal,
            mount
        });
    }

    for (let i = 0; i < LINKED_PORTAL_PAIR_COUNT; i++) {
        const mountA = portalMounts[index++];
        const mountB = portalMounts[index++];

        if (!mountA || !mountB) break;

        const portalA = createVideoPortal(ASSETS.videos.portalB, PORTAL_WIDTH, PORTAL_HEIGHT);
        portalA.name = `Portal_B_${i + 1}_A`;
        placePortalOnWall(portalA, mountA, 1.25, 0.08);
        scene.add(portalA);

        const portalB = createVideoPortal(ASSETS.videos.portalB, PORTAL_WIDTH, PORTAL_HEIGHT);
        portalB.name = `Portal_B_${i + 1}_B`;
        placePortalOnWall(portalB, mountB, 1.25, 0.08);
        scene.add(portalB);

        linkedPortalsB.push({
            a: {
                mesh: portalA,
                mount: mountA
            },
            b: {
                mesh: portalB,
                mount: mountB
            }
        });
    }
}

function placePortalOnWall(portal, mount, height = 1.25, offset = 0.06) {
    portal.position.copy(mount.position);
    portal.position.y = height;
    portal.position.addScaledVector(mount.normal, offset);
    portal.rotation.y = mount.rotationY;

    portal.userData.mount = mount;
    portal.userData.width = PORTAL_WIDTH;
    portal.userData.height = PORTAL_HEIGHT;
}

function createVideoPortal(path, width, height) {
    const video = document.createElement('video');
    video.src = path;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.play().catch(() => {});

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        material
    );

    mesh.renderOrder = 8;

    return mesh;
}

function updatePortalTeleport(delta) {
    portalCooldown = Math.max(0, portalCooldown - delta);

    if (portalCooldown > 0 || gameWon || pinpadOpen) return;

    const rig = player.getObject();
    const pos = rig.position;

    for (const portal of randomPortalsP) {
        if (isPlayerInsidePortalTrigger(pos, portal.mesh, portal.mount)) {
            const excluded = [
                pos,
                doorMount.accessPosition,
                pinpadMount.accessPosition
            ];

            for (const p of randomPortalsP) {
                excluded.push(p.mount.accessPosition);
            }

            for (const pair of linkedPortalsB) {
                excluded.push(pair.a.mount.accessPosition);
                excluded.push(pair.b.mount.accessPosition);
            }

            const target = labyrinth.getSafeTeleportPosition({
                exclude: excluded,
                minDistance: 7,
                radius: 0.42
            });

            rig.position.copy(target);
            portalCooldown = PORTAL_COOLDOWN_TIME;
            playSound('portalP', 1);
            return;
        }
    }

    for (const pair of linkedPortalsB) {
        if (isPlayerInsidePortalTrigger(pos, pair.a.mesh, pair.a.mount)) {
            teleportToLinkedPortal(pair.b.mount);
            playSound('portalB', 1);
            return;
        }

        if (isPlayerInsidePortalTrigger(pos, pair.b.mesh, pair.b.mount)) {
            teleportToLinkedPortal(pair.a.mount);
            playSound('portalB', 1);
            return;
        }
    }
}

function isPlayerInsidePortalTrigger(playerPosition, portalMesh, mount) {
    const normal = mount.normal.clone();
    normal.y = 0;
    normal.normalize();

    const tangent = new THREE.Vector3(-normal.z, 0, normal.x).normalize();

    const toPlayer = new THREE.Vector3(
        playerPosition.x - portalMesh.position.x,
        0,
        playerPosition.z - portalMesh.position.z
    );

    const distanceFromPlane = Math.abs(toPlayer.dot(normal));
    const lateralDistance = Math.abs(toPlayer.dot(tangent));

    const heightOk = playerPosition.y > 0.4 && playerPosition.y < 2.4;

    return (
        heightOk &&
        distanceFromPlane <= PORTAL_TRIGGER_DISTANCE_FROM_PLANE &&
        lateralDistance <= PORTAL_TRIGGER_HALF_WIDTH
    );
}

function teleportToLinkedPortal(destinationMount) {
    const rig = player.getObject();
    const safeTarget = getSafePositionAwayFromPortal(destinationMount);

    rig.position.copy(safeTarget);

    // Mira hacia afuera del portal de salida.
    rig.rotation.y = destinationMount.rotationY + Math.PI;

    portalCooldown = PORTAL_COOLDOWN_TIME;
}

function getSafePositionAwayFromPortal(mount) {
    const normal = mount.normal.clone();
    normal.y = 0;
    normal.normalize();

    const tangent = new THREE.Vector3(-normal.z, 0, normal.x).normalize();

    const distances = [
        PORTAL_EXIT_DISTANCE,
        1.55,
        1.3,
        1.05,
        0.85,
        0.65
    ];

    const sideOffsets = [
        0,
        0.45,
        -0.45,
        0.8,
        -0.8
    ];

    for (const distance of distances) {
        for (const side of sideOffsets) {
            const target = mount.accessPosition.clone();

            target.addScaledVector(normal, distance);
            target.addScaledVector(tangent, side);
            target.y = 1.65;

            if (
                labyrinth.isWalkableWorld(target.x, target.z, 0.34) &&
                !isPointStillInsidePortalTrigger(target, mount)
            ) {
                return target;
            }
        }
    }

    return labyrinth.getSafeTeleportPosition({
        exclude: [mount.accessPosition],
        minDistance: 4,
        radius: 0.42
    });
}

function isPointStillInsidePortalTrigger(point, mount) {
    const normal = mount.normal.clone();
    normal.y = 0;
    normal.normalize();

    const tangent = new THREE.Vector3(-normal.z, 0, normal.x).normalize();

    const portalCenter = mount.position.clone();
    portalCenter.y = 1.25;
    portalCenter.addScaledVector(mount.normal, 0.08);

    const toPoint = new THREE.Vector3(
        point.x - portalCenter.x,
        0,
        point.z - portalCenter.z
    );

    const distanceFromPlane = Math.abs(toPoint.dot(normal));
    const lateralDistance = Math.abs(toPoint.dot(tangent));

    return (
        distanceFromPlane <= PORTAL_TRIGGER_DISTANCE_FROM_PLANE + 0.25 &&
        lateralDistance <= PORTAL_TRIGGER_HALF_WIDTH + 0.25
    );
}

function setupUI() {
    promptGroup = createBillboardText('Presiona gatillo derecho / A / E', {
        fontSize: 42,
        width: 768,
        height: 160,
        background: 'rgba(0,0,0,0.62)',
        color: '#ffffff'
    });

    promptGroup.visible = false;
    scene.add(promptGroup);

    pinpadUI = createPinpadUI();
    pinpadUI.visible = false;
    scene.add(pinpadUI);
}

function createBillboardText(text, options = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = options.width ?? 512;
    canvas.height = options.height ?? 128;

    const ctx = canvas.getContext('2d');

    const bg = options.background ?? 'rgba(0,0,0,0.55)';
    const color = options.color ?? '#fff';
    const fontSize = options.fontSize ?? 34;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, canvas.width, canvas.height, 28);
    ctx.fill();

    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.3, 0.48, 1);

    sprite.userData.canvas = canvas;
    sprite.userData.context = ctx;
    sprite.userData.texture = texture;
    sprite.userData.options = options;

    return sprite;
}

function updateBillboardText(sprite, text) {
    const canvas = sprite.userData.canvas;
    const ctx = sprite.userData.context;
    const texture = sprite.userData.texture;
    const options = sprite.userData.options ?? {};

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = options.background ?? 'rgba(0,0,0,0.55)';
    roundRect(ctx, 0, 0, canvas.width, canvas.height, 28);
    ctx.fill();

    ctx.font = `bold ${options.fontSize ?? 34}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = options.color ?? '#ffffff';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    texture.needsUpdate = true;
}

function createPinpadUI() {
    const group = new THREE.Group();
    group.name = 'VRPinpadUI';

    const panel = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 2.25, 0.08),
        new THREE.MeshStandardMaterial({
            color: 0x111827,
            roughness: 0.8,
            metalness: 0.05
        })
    );

    group.add(panel);

    const title = createSmallText('PINPAD VR', 0.82, 0.18);
    title.position.set(0, 0.96, 0.07);
    group.add(title);

    const display = createSmallText('____', 1.0, 0.24);
    display.name = 'PinpadDisplay';
    display.position.set(0, 0.66, 0.07);
    group.add(display);

    const labels = [
        '1','2','3',
        '4','5','6',
        '7','8','9',
        'CLR','0','OK'
    ];

    pinpadButtons = [];

    const startX = -0.48;
    const startY = 0.3;
    const gapX = 0.48;
    const gapY = 0.36;

    labels.forEach((label, index) => {
        const col = index % 3;
        const row = Math.floor(index / 3);

        const btn = createPinpadButton(label);

        btn.position.set(
            startX + col * gapX,
            startY - row * gapY,
            0.1
        );

        btn.userData.label = label;
        btn.userData.index = index;

        group.add(btn);
        pinpadButtons.push(btn);
    });

    const hint = createSmallText(
        'Joystick derecho: navegar | Gatillo/A: elegir | B: cerrar',
        1.45,
        0.14,
        18
    );

    hint.position.set(0, -0.94, 0.07);
    group.add(hint);

    return group;
}

function createPinpadButton(label) {
    const group = new THREE.Group();

    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.25, 0.08),
        new THREE.MeshStandardMaterial({
            color: 0x243244,
            roughness: 0.7
        })
    );

    mesh.name = 'ButtonMesh';

    const text = createSmallText(label, 0.29, 0.16, label.length > 1 ? 20 : 26);
    text.position.z = 0.055;

    group.add(mesh, text);

    return group;
}

function createSmallText(text, width = 0.5, height = 0.18, fontSize = 26) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;

    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    roundRect(ctx, 0, 0, canvas.width, canvas.height, 28);
    ctx.fill();

    ctx.font = `bold ${fontSize * 3}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        material
    );

    mesh.userData.canvas = canvas;
    mesh.userData.context = ctx;
    mesh.userData.texture = texture;

    return mesh;
}

function updateSmallText(mesh, text) {
    const canvas = mesh.userData.canvas;
    const ctx = mesh.userData.context;
    const texture = mesh.userData.texture;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    roundRect(ctx, 0, 0, canvas.width, canvas.height, 28);
    ctx.fill();

    ctx.font = 'bold 78px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    texture.needsUpdate = true;
}

function createCodeClues(code) {
    codeCluesGroup = new THREE.Group();
    codeCluesGroup.name = 'CodeClues';

    scene.add(codeCluesGroup);

    const digits = code.split('');

    const floorPositions = labyrinth.getRandomWalkablePositions(4, 10, 6);

    const avoidPoints = [
        doorMount.position,
        pinpadMount.position
    ];

    for (const p of randomPortalsP) {
        avoidPoints.push(p.mount.position);
    }

    for (const pair of linkedPortalsB) {
        avoidPoints.push(pair.a.mount.position);
        avoidPoints.push(pair.b.mount.position);
    }

    const wallPositions = labyrinth.findWallMountSpots(4, {
        minDistanceBetween: 5,
        avoid: avoidPoints,
        avoidDistance: 4
    });

    for (let i = 0; i < 4; i++) {
        const digit = digits[i];
        const pos = floorPositions[i];

        if (!pos) continue;

        // Pista de orden en el suelo.
        const clue = createNumberClue(`${i + 1}°  ${digit}`, 1.05, 0.62, 62);

        clue.position.set(pos.x, 0.025, pos.z);
        clue.rotation.x = -Math.PI / 2;
        clue.rotation.z = Math.random() * Math.PI * 2 + (CLUE_ROTATE_180 ? Math.PI : 0);

        codeCluesGroup.add(clue);
    }

    for (let i = 0; i < 4; i++) {
        const digit = digits[i];
        const spot = wallPositions[i];

        if (!spot) continue;

        // Pista de orden en pared.
        const clue = createNumberClue(`${i + 1}°  ${digit}`, 1.05, 0.62, 62);

        clue.position.copy(spot.position);
        clue.position.y = 1.38;
        clue.position.addScaledVector(spot.normal, 0.06);
        clue.rotation.y = spot.rotationY + (CLUE_ROTATE_180 ? Math.PI : 0);

        codeCluesGroup.add(clue);
    }
}

function createNumberClue(text, width = 1.05, height = 0.62, fontSize = 62) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;

    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const gradient = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        30,
        canvas.width / 2,
        canvas.height / 2,
        420
    );

    gradient.addColorStop(0, 'rgba(0,255,231,0.68)');
    gradient.addColorStop(0.5, 'rgba(0,255,231,0.18)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = `900 ${fontSize * 3}px Orbitron, Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.shadowColor = '#00ffe7';
    ctx.shadowBlur = 42;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 10);

    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#ff00c8';
    ctx.lineWidth = 8;
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2 + 10);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        material
    );

    mesh.name = `CodeClue_${text}`;
    mesh.renderOrder = 10;

    return mesh;
}

function handleInteraction() {
    if (gameWon) return;

    const pos = player.getWorldPosition();

    const distanceToPinpad = distanceXZ(pos, pinpadMount.accessPosition);
    const distanceToDoor = distanceXZ(pos, doorMount.accessPosition);

    if (distanceToPinpad < 2.8) {
        openPinpad();
        return;
    }

    if (distanceToDoor < 2.6) {
        tryOpenDoor();
    }
}

function openPinpad() {
    if (pinpadOpen) return;

    pinpadOpen = true;
    enteredCode = '';
    selectedButtonIndex = 0;

    pinpadUI.visible = true;

    player.setPinpadMode(true);

    placeUIInFrontOfPlayer(pinpadUI, 1.25, 1.55);

    updatePinpadDisplay();
    updateButtonSelection();

    playSound('pinpad', 0.75);
}

function closePinpad() {
    if (!pinpadOpen) return;

    pinpadOpen = false;
    pinpadUI.visible = false;

    player.setPinpadMode(false);

    playSound('pin', 0.45);
}

function navigatePinpad(dx, dy) {
    if (!pinpadOpen) return;

    const col = selectedButtonIndex % 3;
    const row = Math.floor(selectedButtonIndex / 3);

    const newCol = THREE.MathUtils.clamp(col + dx, 0, 2);
    const newRow = THREE.MathUtils.clamp(row + dy, 0, 3);

    selectedButtonIndex = newRow * 3 + newCol;

    updateButtonSelection();
    playSound('pin', 0.24);
}

function selectPinpadButton() {
    if (!pinpadOpen) {
        handleInteraction();
        return;
    }

    const button = pinpadButtons[selectedButtonIndex];
    if (!button) return;

    const label = button.userData.label;

    if (/^\d$/.test(label)) {
        if (enteredCode.length < 4) {
            enteredCode += label;
            playSound('pin', 0.5);
        }
    } else if (label === 'CLR') {
        enteredCode = '';
        playSound('pin', 0.45);
    } else if (label === 'OK') {
        validatePinpadCode();
    }

    updatePinpadDisplay();
}

function validatePinpadCode() {
    if (enteredCode === playerCode) {
        hasCode = true;

        closePinpad();

        updateHudCode(playerCode);
        updateBillboardText(promptGroup, 'Código obtenido. Busca la puerta de salida.');

        playSound('portalP', 0.85);
    } else {
        enteredCode = '';
        playSound('error', 0.8);
    }
}

function updatePinpadDisplay() {
    const display = pinpadUI.getObjectByName('PinpadDisplay');
    if (!display) return;

    const masked = enteredCode.padEnd(4, '_');
    updateSmallText(display, masked);
}

function updateButtonSelection() {
    pinpadButtons.forEach((button, index) => {
        const mesh = button.getObjectByName('ButtonMesh');
        if (!mesh) return;

        const selected = index === selectedButtonIndex;

        mesh.material.color.set(selected ? 0x38bdf8 : 0x243244);
        mesh.scale.set(selected ? 1.12 : 1, selected ? 1.12 : 1, 1);
    });
}

function tryOpenDoor() {
    if (!hasCode) {
        updateBillboardText(promptGroup, 'Necesitas encontrar el PinPad primero');
        playSound('error', 0.75);
        return;
    }

    gameWon = true;

    playSound('portalB', 1);

    updateBillboardText(promptGroup, '¡Escapaste del laberinto!');
    promptGroup.visible = true;

    labyrinth.removeObstaclesByName('door');

    if (doorObject) {
        doorObject.rotation.y += Math.PI / 2;
    }
}

function placeUIInFrontOfPlayer(object, distance = 1.25, height = 1.55) {
    const rig = player.getObject();

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(rig.quaternion);
    forward.y = 0;
    forward.normalize();

    object.position.copy(rig.position).addScaledVector(forward, distance);
    object.position.y = height;

    object.lookAt(camera.getWorldPosition(new THREE.Vector3()));
}

function updatePrompt() {
    if (pinpadOpen || gameWon) {
        if (pinpadOpen) promptGroup.visible = false;
        return;
    }

    const pos = player.getWorldPosition();

    const distanceToPinpad = distanceXZ(pos, pinpadMount.accessPosition);
    const distanceToDoor = distanceXZ(pos, doorMount.accessPosition);

    const hudHint = document.getElementById('hud-hint');

    if (distanceToPinpad < 2.8 && !hasCode) {
        const text = 'Abrir PinPad: gatillo derecho / A / E';

        updateBillboardText(promptGroup, text);
        promptGroup.position.copy(pinpadObject.position);
        promptGroup.position.y = 2.0;
        promptGroup.visible = true;

        if (hudHint) hudHint.textContent = text;
    } else if (distanceToDoor < 2.6) {
        const text = hasCode
            ? 'Abrir puerta: gatillo derecho / A / E'
            : 'Busca el PinPad antes de salir';

        updateBillboardText(promptGroup, text);
        promptGroup.position.copy(doorObject.position);
        promptGroup.position.y = 2.6;
        promptGroup.visible = true;

        if (hudHint) hudHint.textContent = text;
    } else {
        promptGroup.visible = false;

        if (hudHint) hudHint.textContent = '';
    }

    if (promptGroup.visible) {
        promptGroup.lookAt(camera.getWorldPosition(new THREE.Vector3()));
    }
}

function updatePinpadBillboard() {
    if (!pinpadOpen || !pinpadUI.visible) return;

    pinpadUI.lookAt(camera.getWorldPosition(new THREE.Vector3()));
}

function updateHudCode(value) {
    const hudCode = document.getElementById('hud-code-value');
    if (!hudCode) return;

    hudCode.textContent = value;
}

function generateCode() {
    let code = '';

    for (let i = 0; i < 4; i++) {
        code += Math.floor(Math.random() * 10).toString();
    }

    return code;
}

function distanceXZ(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;

    return Math.hypot(dx, dz);
}

function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
}

function animate() {
    const delta = Math.min(clock.getDelta(), 0.05);

    player.update(delta);

    updatePrompt();
    updatePinpadBillboard();
    updatePortalTeleport(delta);

    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
}