import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function crearTexturaDeVideo(ruta) {
    const video = document.createElement('video');
    video.src = ruta;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';

    const textura = new THREE.VideoTexture(video);
    textura.colorSpace = THREE.SRGBColorSpace;

    video.addEventListener('canplay', () => { video.play().catch(e => console.warn('Video pausado:', e)); });
    return textura;
}

function crearTexturaGlifo(numero, posicionIndex) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const context = canvas.getContext('2d');

    context.fillStyle = 'rgba(0, 0, 0, 0)';
    context.fillRect(0, 0, 256, 256);
    context.font = 'bold 130px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#0dcaf0';
    context.shadowColor = '#000000';
    context.shadowBlur = 15;
    context.fillText(numero, 128, 100);

    let puntos = '';
    for (let i = 0; i <= posicionIndex; i++) puntos += '• ';

    context.font = 'bold 40px Arial';
    context.fillText(puntos.trim(), 128, 200);

    const textura = new THREE.CanvasTexture(canvas);
    textura.colorSpace = THREE.SRGBColorSpace;
    return textura;
}

function randomSeguro() {
    if (window.crypto && window.crypto.getRandomValues) {
        const array = new Uint32Array(1);
        window.crypto.getRandomValues(array);
        return array[0] / 4294967295;
    }
    return Math.random();
}

function expandirMatrix(mapa) {
    const res = [];
    for (let r = 0; r < mapa.length; r++) {
        let row1 = [];
        for (let c = 0; c < mapa[r].length; c++) {
            let v = mapa[r][c];
            row1.push(v);
            if (c % 2 !== 0) { 
                if (v === 1) row1.push(1); 
                else if (v === 5) row1.push(1); 
                else if (v === 2) row1.push(0); 
                else row1.push(0); 
            }
        }
        res.push(row1);

        if (r % 2 !== 0) { 
            let row2 = [];
            for (let c = 0; c < mapa[r].length; c++) {
                let v = mapa[r][c];
                if (v === 1) {
                    row2.push(1);
                    if (c % 2 !== 0) row2.push(1);
                } else {
                    row2.push(0);
                    if (c % 2 !== 0) row2.push(0);
                }
            }
            res.push(row2);
        }
    }
    return res;
}

export function construirMundo(scene) {
    const texLoader = new THREE.TextureLoader(THREE.DefaultLoadingManager);
    const gltfLoader = new GLTFLoader(THREE.DefaultLoadingManager);

    const mapState = {
        obstacles: [], portalsArray: [], linkedPortals: [], randomPortals: [], safeSpots: [],
        spawnPosition: new THREE.Vector3(), escapeDoor: null, doorPos: new THREE.Vector3(),
        doorBarrier: null, doorGridIndex: null, pinpadObj: null, codigoSecreto: [], grid: [],
        tileSize: 500, offset: 0, mapName: '', mapIndex: 0, mapTexture: ''
    };

    const glifosPosibles = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    for (let i = 0; i < 4; i++) {
        const index = Math.floor(randomSeguro() * glifosPosibles.length);
        mapState.codigoSecreto.push(glifosPosibles.splice(index, 1)[0]);
    }

    const tileSize = 500;
    const alturaMuro = 700;
    
    // IMPORTANTE: Se añade '../' porque Labyrinth.js está en la carpeta /js/
    const floorTex = texLoader.load('../assets/Alfombra.jpg');
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(30, 30); 

    const mapa1 = [
        [1, 1, 1, 1, 1, 1, 1, 5, 1, 1, 1, 1, 1, 1, 1],
        [1, 8, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 9, 0, 1],
        [1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1],
        [1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1],
        [1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1],
        [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 9, 0, 0, 1],
        [1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1],
        [1, 0, 1, 9, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1],
        [1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1],
        [1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1],
        [1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1],
        [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 8, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1]
    ];

    const mapa2 = [
        [1, 1, 1, 1, 1, 1, 1, 5, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 8, 0, 0, 1],
        [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1],
        [1, 9, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1],
        [1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 1, 0, 1, 9, 0, 0, 1, 0, 0, 0, 1],
        [1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1],
        [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 8, 1],
        [1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1],
        [1, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 1],
        [1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1],
        [1, 9, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1]
    ];

    const mapa3 = [
        [1, 1, 1, 1, 1, 1, 1, 5, 1, 1, 1, 1, 1, 1, 1],
        [1, 8, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 9, 1],
        [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1],
        [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
        [1, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1],
        [1, 9, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
        [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1],
        [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 9, 1],
        [1, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1],
        [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
        [1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1],
        [1, 9, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 8, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1]
    ];

    const mapa4 = [
        [1, 1, 1, 1, 1, 1, 1, 5, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 1],
        [1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1],
        [1, 9, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
        [1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1],
        [1, 0, 0, 0, 1, 0, 0, 9, 0, 0, 1, 0, 0, 0, 1],
        [1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1],
        [1, 9, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 9, 1],
        [1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1],
        [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 9, 1],
        [1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1],
        [1, 8, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1]
    ];

    const catalogoMapas = [
        { name: 'Mapa 1', grid: mapa1, texture: 'tapiz.webp' },
        { name: 'Mapa 2', grid: mapa2, texture: 'tapiz.webp' },
        { name: 'Mapa 3', grid: mapa3, texture: 'Fun.png' },
        { name: 'Mapa 4', grid: mapa4, texture: 'Fun.png' }
    ];

    const mapIndex = Math.floor(randomSeguro() * catalogoMapas.length);
    const mapSelection = catalogoMapas[mapIndex];
    
    const mapa = expandirMatrix(mapSelection.grid);

    const offset = (mapa.length * tileSize) / 2;
    const tamanoMapa = mapa.length * tileSize;

    const floorMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(tamanoMapa, tamanoMapa),
        new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 })
    );

    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(-250, 0, -250); 
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // IMPORTANTE: Se añade '../' porque Labyrinth.js está en la carpeta /js/
    const texMuro = texLoader.load('../assets/' + mapSelection.texture);
    texMuro.wrapS = THREE.RepeatWrapping;
    texMuro.wrapT = THREE.RepeatWrapping;
    texMuro.repeat.set(1, 1);

    const matMuroTapiz = new THREE.MeshStandardMaterial({ map: texMuro, roughness: 0.8 });

    const matPortalB = new THREE.MeshBasicMaterial({
        map: crearTexturaDeVideo('../assets/portal_b.webm'), transparent: true, side: THREE.DoubleSide
    });
    const matPortalP = new THREE.MeshBasicMaterial({
        map: crearTexturaDeVideo('../assets/portal_p.webm'), transparent: true, side: THREE.DoubleSide
    });

    const geomPortal = new THREE.PlaneGeometry(200, 200);

    mapState.grid = mapa;
    mapState.offset = offset;

    const geomMuro = new THREE.BoxGeometry(tileSize, alturaMuro, tileSize);

    let spawnPositionSet = false;
    const paredesDisponibles = [];

    // IMPORTANTE: Se añade '../' porque Labyrinth.js está en la carpeta /js/
    const catalogoDecoraciones = ['../models/cactus_maceta.glb', '../models/maceta.glb'];

    const cargarPropEscena = (ruta, config) => {
        gltfLoader.load(ruta, (gltf) => {
            const m = gltf.scene;
            m.scale.set(config.escala, config.escala, config.escala);
            m.position.set(config.x, config.y || 0, config.z);

            if (config.rotY) m.rotation.y = config.rotY;

            m.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                        const materials = Array.isArray(child.material) ? child.material : [child.material];
                        materials.forEach((mat) => {
                            if (mat.normalMap) { mat.normalMap.dispose(); mat.normalMap = null; }
                            if (mat.specularMap) { mat.specularMap.dispose(); mat.specularMap = null; }
                            if (mat.aoMap) { mat.aoMap.dispose(); mat.aoMap = null; }
                            if (mat.map) mat.color.set(0xffffff);
                            mat.roughness = 0.8;
                            mat.metalness = 0.1;
                            mat.needsUpdate = true;
                        });
                    }
                }
            });

            scene.add(m);
            m.updateMatrixWorld(true);
            m.boundingBox = new THREE.Box3().setFromObject(m);

            if (config.alignGround) {
                m.position.y += -m.boundingBox.min.y;
                m.updateMatrixWorld(true);
                m.boundingBox.setFromObject(m);
            }

            if (config.isObstacle !== false) mapState.obstacles.push(m);
            if (config.onLoad) config.onLoad(m);
        });
    };

    let totalMuros = 0;
    for (let f = 0; f < mapa.length; f++) {
        for (let c = 0; c < mapa[f].length; c++) {
            if (mapa[f][c] === 1 || mapa[f][c] === 5) totalMuros++;
        }
    }

    const instancedWalls = new THREE.InstancedMesh(geomMuro, matMuroTapiz, totalMuros);
    instancedWalls.castShadow = false;
    instancedWalls.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let wallCounter = 0;

    for (let f = 0; f < mapa.length; f++) {
        for (let c = 0; c < mapa[f].length; c++) {
            const posX = c * tileSize - offset;
            const posZ = f * tileSize - offset;
            const valor = mapa[f][c];

            if (valor === 1 || valor === 5) {
                dummy.position.set(posX, 175, posZ);
                dummy.updateMatrix();
                instancedWalls.setMatrixAt(wallCounter, dummy.matrix);
                wallCounter++;

                if (valor === 5) {
                    let pRotY = 0, pOffsetZ = 0, pOffsetX = 0;

                    if (mapa[f + 1] && mapa[f + 1][c] === 0) { pRotY = 0; pOffsetZ = 250; } 
                    else if (mapa[f - 1] && mapa[f - 1][c] === 0) { pRotY = Math.PI; pOffsetZ = -250; } 
                    else if (mapa[f][c + 1] === 0) { pRotY = Math.PI / 2; pOffsetX = 250; } 
                    else if (mapa[f][c - 1] === 0) { pRotY = -Math.PI / 2; pOffsetX = -250; }

                    cargarPropEscena('../models/pinpad.glb', {
                        escala: 3.5, x: posX + pOffsetX, y: 150, z: posZ + pOffsetZ, rotY: pRotY,
                        onLoad: (mesh) => { mapState.pinpadObj = mesh; },
                        isObstacle: false
                    });
                } else {
                    if (mapa[f + 1] && mapa[f + 1][c] === 0) paredesDisponibles.push({ x: posX, z: posZ + 250, rotY: 0, isFloor: false });
                    if (mapa[f - 1] && mapa[f - 1][c] === 0) paredesDisponibles.push({ x: posX, z: posZ - 250, rotY: Math.PI, isFloor: false });
                    if (mapa[f][c + 1] === 0) paredesDisponibles.push({ x: posX + 250, z: posZ, rotY: -Math.PI / 2, isFloor: false });
                    if (mapa[f][c - 1] === 0) paredesDisponibles.push({ x: posX - 250, z: posZ, rotY: Math.PI / 2, isFloor: false });
                }
            } else if (valor === 2) {
                mapState.doorPos.set(posX + 125, 0, posZ + 125);
                mapState.doorGridIndex = { r: f, c: c };

                let dRotY = 0, dOffsetX = 125, dOffsetZ = 125;
                const pushDoor = 125; 

                if (mapa[f - 1] && mapa[f - 1][c] === 0) { dRotY = 0; dOffsetZ -= pushDoor; } 
                else if (mapa[f + 1] && mapa[f + 1][c] === 0) { dRotY = Math.PI; dOffsetZ += pushDoor; } 
                else if (mapa[f][c - 1] === 0) { dRotY = Math.PI / 2; dOffsetX += pushDoor; } 
                else if (mapa[f][c + 1] === 0) { dRotY = -Math.PI / 2; dOffsetX -= pushDoor; }

                cargarPropEscena('../models/door.glb', {
                    escala: 3.8, x: posX + dOffsetX, y: 0, z: posZ + dOffsetZ, rotY: dRotY, alignGround: true,
                    onLoad: (mesh) => { mapState.escapeDoor = mesh; },
                    isObstacle: false
                });

                const doorBarrier = new THREE.Mesh(new THREE.BoxGeometry(tileSize*2, 350, 40), new THREE.MeshBasicMaterial({ visible: false }));
                doorBarrier.position.set(posX + 125, 175, posZ + 125);
                doorBarrier.updateMatrixWorld();
                mapState.obstacles.push(doorBarrier);
                mapState.doorBarrier = doorBarrier;
            } else if (valor === 8) {
                mapState.linkedPortals.push(new THREE.Vector3(posX + 125, 0, posZ + 125));
                const p = new THREE.Mesh(geomPortal, matPortalB);
                p.position.set(posX + 125, 100, posZ + 125);
                scene.add(p);
                mapState.portalsArray.push(p);
            } else if (valor === 9) {
                mapState.randomPortals.push(new THREE.Vector3(posX + 125, 0, posZ + 125));
                const p = new THREE.Mesh(geomPortal, matPortalP);
                p.position.set(posX + 125, 100, posZ + 125);
                scene.add(p);
                mapState.portalsArray.push(p);
            } else if (valor === 0) {
                if (!spawnPositionSet && (c % 2 !== 0 && r % 2 !== 0)) {
                    mapState.spawnPosition.set(posX + 125, 0, posZ + 125);
                    spawnPositionSet = true;
                }

                if (c % 2 !== 0 && r % 2 !== 0) {
                    mapState.safeSpots.push(new THREE.Vector3(posX + 125, 0, posZ + 125));
                }

                paredesDisponibles.push({ x: posX, z: posZ, rotY: 0, isFloor: true });

                let offsetX = 0, offsetZ = 0, formsL = false;
                const pushAmount = 75;

                const N = mapa[f - 1] ? mapa[f - 1][c] : 1;
                const S = mapa[f + 1] ? mapa[f + 1][c] : 1;
                const W = mapa[f][c - 1] !== undefined ? mapa[f][c - 1] : 1;
                const E = mapa[f][c + 1] !== undefined ? mapa[f][c + 1] : 1;

                if (N === 1 && W === 1 && S !== 1 && E !== 1) { formsL = true; offsetZ = -pushAmount; offsetX = -pushAmount; } 
                else if (N === 1 && E === 1 && S !== 1 && W !== 1) { formsL = true; offsetZ = -pushAmount; offsetX = pushAmount; } 
                else if (S === 1 && W === 1 && N !== 1 && E !== 1) { formsL = true; offsetZ = pushAmount; offsetX = -pushAmount; } 
                else if (S === 1 && E === 1 && N !== 1 && W !== 1) { formsL = true; offsetZ = pushAmount; offsetX = pushAmount; }

                const isSpawn = Math.abs(posX + 125 - mapState.spawnPosition.x) < 50 && Math.abs(posZ + 125 - mapState.spawnPosition.z) < 50;

                if (formsL && !isSpawn && randomSeguro() > 0.60) {
                    const recursoElegido = catalogoDecoraciones[Math.floor(randomSeguro() * catalogoDecoraciones.length)];
                    const esCactus = recursoElegido.includes('cactus');
                    cargarPropEscena(recursoElegido, {
                        escala: esCactus ? 50.0 : 1.0, x: posX + offsetX, z: posZ + offsetZ, alignGround: true
                    });
                }
            }
        }
    }

    instancedWalls.instanceMatrix.needsUpdate = true;
    instancedWalls.isInstancedMesh = true;
    scene.add(instancedWalls);
    mapState.obstacles.push(instancedWalls);

    paredesDisponibles.sort(() => randomSeguro() - 0.5);
    const lugaresParaCodigo = paredesDisponibles.splice(0, 4);

    for (let i = 0; i < 4; i++) {
        const data = lugaresParaCodigo[i];
        if (!data) continue;

        const meshSimbolo = new THREE.Mesh(
            new THREE.PlaneGeometry(120, 120),
            new THREE.MeshBasicMaterial({ map: crearTexturaGlifo(mapState.codigoSecreto[i], i), transparent: true })
        );

        if (data.isFloor) {
            meshSimbolo.position.set(data.x, 2, data.z);
            meshSimbolo.rotation.x = -Math.PI / 2;
        } else {
            meshSimbolo.position.set(data.x, 150, data.z);
            meshSimbolo.rotation.y = data.rotY;
        }
        scene.add(meshSimbolo);
    }

    let cuadrosGenerados = 0;
    for (let i = 0; i < paredesDisponibles.length; i++) {
        const data = paredesDisponibles[i];
        if (!data.isFloor && randomSeguro() > 0.50 && cuadrosGenerados < 30) {
            cargarPropEscena('../models/cuadro.glb', {
                escala: 14.0, x: data.x, y: 220, z: data.z, rotY: data.rotY, isObstacle: false
            });
            cuadrosGenerados++;
        }
    }

    return mapState;
}

export function iniciarVideosLaberinto() {
    const videos = document.querySelectorAll('video');
    videos.forEach((video) => {
        if (video.paused) {
            video.play().catch((e) => { console.warn('Error reanudando video:', e); });
        }
    });
}