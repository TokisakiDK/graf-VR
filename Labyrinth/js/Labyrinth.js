import * as THREE from 'three';

export class Labyrinth {
    constructor(scene, loadingManager, options = {}) {
        this.scene = scene;
        this.loadingManager = loadingManager;

        this.cellSize = options.cellSize ?? 1.15;
        this.wallHeight = options.wallHeight ?? 2.8;
        this.wallThickness = options.wallThickness ?? 1;

        this.textureLoader = new THREE.TextureLoader(this.loadingManager);

        this.baseMaps = this.createBaseMaps();
        this.baseMap = this.baseMaps[Math.floor(Math.random() * this.baseMaps.length)];

        this.expandedGrid = this.expandMap(this.baseMap);
        this.rows = this.expandedGrid.length;
        this.cols = this.expandedGrid[0].length;

        this.offsetX = -(this.cols * this.cellSize) / 2;
        this.offsetZ = -(this.rows * this.cellSize) / 2;

        this.theme = this.createTheme();

        this.group = new THREE.Group();
        this.group.name = 'OptimizedLabyrinth';
        this.scene.add(this.group);

        this.walkableWorldPositions = [];
        this.obstacles = [];
        this.wallReservations = [];

        this.wallMesh = null;
        this.floorMesh = null;

        this.startPosition = new THREE.Vector3();
        this.exitPosition = new THREE.Vector3();
        this.pinpadPosition = new THREE.Vector3();

        this.generate();
    }

    createBaseMaps() {
        const M = 1;
        const P = 0;

        return [
            [
                [M,M,M,M,M,M,M,M,M,M,M,M,M,M,M],
                [M,P,P,P,M,P,P,P,P,P,M,P,P,P,M],
                [M,P,M,P,M,P,M,M,M,P,M,P,M,P,M],
                [M,P,M,P,P,P,M,P,P,P,P,P,M,P,M],
                [M,P,M,M,M,M,M,P,M,M,M,M,M,P,M],
                [M,P,P,P,P,P,P,P,M,P,P,P,P,P,M],
                [M,M,M,M,M,P,M,M,M,P,M,M,M,P,M],
                [M,P,P,P,M,P,P,P,P,P,M,P,P,P,M],
                [M,P,M,P,M,M,M,M,M,P,M,P,M,M,M],
                [M,P,M,P,P,P,P,P,M,P,P,P,P,P,M],
                [M,P,M,M,M,M,M,P,M,M,M,M,M,P,M],
                [M,P,P,P,P,P,M,P,P,P,P,P,M,P,M],
                [M,M,M,M,M,P,M,M,M,M,M,P,M,P,M],
                [M,P,P,P,P,P,P,P,P,P,P,P,P,P,M],
                [M,M,M,M,M,M,M,M,M,M,M,M,M,M,M]
            ],
            [
                [M,M,M,M,M,M,M,M,M,M,M,M,M,M,M],
                [M,P,P,P,P,P,P,P,M,P,P,P,P,P,M],
                [M,P,M,M,M,M,M,P,M,P,M,M,M,P,M],
                [M,P,M,P,P,P,M,P,P,P,M,P,P,P,M],
                [M,P,M,P,M,P,M,M,M,M,M,P,M,M,M],
                [M,P,P,P,M,P,P,P,P,P,P,P,P,P,M],
                [M,M,M,P,M,M,M,M,M,P,M,M,M,P,M],
                [M,P,P,P,P,P,P,P,M,P,P,P,M,P,M],
                [M,P,M,M,M,M,M,P,M,M,M,P,M,P,M],
                [M,P,P,P,P,P,M,P,P,P,P,P,M,P,M],
                [M,M,M,M,M,P,M,M,M,M,M,P,M,P,M],
                [M,P,P,P,M,P,P,P,P,P,M,P,P,P,M],
                [M,P,M,P,M,M,M,M,M,P,M,M,M,P,M],
                [M,P,M,P,P,P,P,P,P,P,P,P,P,P,M],
                [M,M,M,M,M,M,M,M,M,M,M,M,M,M,M]
            ],
            [
                [M,M,M,M,M,M,M,M,M,M,M,M,M,M,M],
                [M,P,P,P,P,P,M,P,P,P,P,P,P,P,M],
                [M,P,M,M,M,P,M,P,M,M,M,M,M,P,M],
                [M,P,P,P,M,P,P,P,M,P,P,P,M,P,M],
                [M,M,M,P,M,M,M,M,M,P,M,P,M,P,M],
                [M,P,P,P,P,P,P,P,P,P,M,P,P,P,M],
                [M,P,M,M,M,M,M,M,M,P,M,M,M,P,M],
                [M,P,M,P,P,P,P,P,M,P,P,P,M,P,M],
                [M,P,M,P,M,M,M,P,M,M,M,P,M,P,M],
                [M,P,P,P,M,P,P,P,P,P,M,P,P,P,M],
                [M,M,M,M,M,P,M,M,M,P,M,M,M,P,M],
                [M,P,P,P,P,P,M,P,P,P,P,P,M,P,M],
                [M,P,M,M,M,M,M,P,M,M,M,M,M,P,M],
                [M,P,P,P,P,P,P,P,P,P,P,P,P,P,M],
                [M,M,M,M,M,M,M,M,M,M,M,M,M,M,M]
            ],
            [
                [M,M,M,M,M,M,M,M,M,M,M,M,M,M,M],
                [M,P,P,P,M,P,P,P,P,P,P,P,P,P,M],
                [M,P,M,P,M,P,M,M,M,M,M,M,M,P,M],
                [M,P,M,P,P,P,P,P,P,P,P,P,M,P,M],
                [M,P,M,M,M,M,M,M,M,M,M,P,M,P,M],
                [M,P,P,P,P,P,P,P,P,P,M,P,P,P,M],
                [M,M,M,M,M,M,M,P,M,P,M,M,M,P,M],
                [M,P,P,P,P,P,M,P,M,P,P,P,P,P,M],
                [M,P,M,M,M,P,M,P,M,M,M,M,M,P,M],
                [M,P,P,P,M,P,P,P,P,P,P,P,M,P,M],
                [M,M,M,P,M,M,M,M,M,M,M,P,M,P,M],
                [M,P,P,P,P,P,P,P,M,P,P,P,P,P,M],
                [M,P,M,M,M,M,M,P,M,P,M,M,M,P,M],
                [M,P,P,P,P,P,P,P,P,P,P,P,P,P,M],
                [M,M,M,M,M,M,M,M,M,M,M,M,M,M,M]
            ]
        ];
    }

    createTheme() {
        const repeatTexture = (path, repeatX = 1, repeatY = 1) => {
            const tex = this.textureLoader.load(path);
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(repeatX, repeatY);
            tex.colorSpace = THREE.SRGBColorSpace;
            return tex;
        };

        const wallTextures = [
            './assets/textures/Pared/Blue.jpg',
            './assets/textures/Pared/Fun.png',
            './assets/textures/Pared/Madera.jpeg',
            './assets/textures/Pared/Piedra.jpeg'
        ];

        const floorTextures = [
            './assets/textures/Alfombra/Alf1.jpg',
            './assets/textures/Alfombra/Alf2.jpg'
        ];

        return {
            wallMap: repeatTexture(wallTextures[Math.floor(Math.random() * wallTextures.length)], 1, 1),
            floorMap: repeatTexture(floorTextures[Math.floor(Math.random() * floorTextures.length)], 28, 28)
        };
    }

    expandMap(baseMap) {
        const baseRows = baseMap.length;
        const baseCols = baseMap[0].length;

        const rows = baseRows * 3 + 1;
        const cols = baseCols * 3 + 1;

        const grid = Array.from({ length: rows }, () => Array(cols).fill(1));

        const isPath = (r, c) => {
            if (r < 0 || c < 0 || r >= baseRows || c >= baseCols) return false;
            return baseMap[r][c] === 0;
        };

        for (let r = 0; r < baseRows; r++) {
            for (let c = 0; c < baseCols; c++) {
                if (!isPath(r, c)) continue;

                const er = r * 3 + 1;
                const ec = c * 3 + 1;

                grid[er][ec] = 0;
                grid[er][ec + 1] = 0;
                grid[er + 1][ec] = 0;
                grid[er + 1][ec + 1] = 0;

                if (isPath(r, c + 1)) {
                    grid[er][ec + 2] = 0;
                    grid[er + 1][ec + 2] = 0;
                }

                if (isPath(r + 1, c)) {
                    grid[er + 2][ec] = 0;
                    grid[er + 2][ec + 1] = 0;
                }
            }
        }

        return grid;
    }

    generate() {
        this.createFloor();
        this.createWallsInstanced();
        this.calculateImportantPositions();
    }

    createFloor() {
        const width = this.cols * this.cellSize;
        const depth = this.rows * this.cellSize;

        const geometry = new THREE.PlaneGeometry(width, depth);
        const material = new THREE.MeshStandardMaterial({
            map: this.theme.floorMap,
            roughness: 0.92,
            metalness: 0.02
        });

        this.floorMesh = new THREE.Mesh(geometry, material);
        this.floorMesh.rotation.x = -Math.PI / 2;
        this.floorMesh.receiveShadow = false;
        this.floorMesh.name = 'Floor';

        this.group.add(this.floorMesh);
    }

    createWallsInstanced() {
        let wallCount = 0;

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.expandedGrid[r][c] === 1) wallCount++;
            }
        }

        const geometry = new THREE.BoxGeometry(
            this.cellSize * this.wallThickness,
            this.wallHeight,
            this.cellSize * this.wallThickness
        );

        const material = new THREE.MeshStandardMaterial({
            map: this.theme.wallMap,
            roughness: 0.86,
            metalness: 0.04
        });

        this.wallMesh = new THREE.InstancedMesh(geometry, material, wallCount);
        this.wallMesh.name = 'InstancedWalls';
        this.wallMesh.frustumCulled = false;

        const dummy = new THREE.Object3D();
        let index = 0;

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const pos = this.gridToWorld(r, c);

                if (this.expandedGrid[r][c] !== 1) {
                    this.walkableWorldPositions.push(pos);
                    continue;
                }

                dummy.position.set(pos.x, this.wallHeight / 2, pos.z);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();

                this.wallMesh.setMatrixAt(index, dummy.matrix);
                index++;
            }
        }

        this.wallMesh.instanceMatrix.needsUpdate = true;
        this.group.add(this.wallMesh);
    }

    calculateImportantPositions() {
        const first = this.findFirstWalkable();
        const last = this.findLastWalkable();

        this.startPosition.copy(this.gridToWorld(first.r, first.c));
        this.startPosition.y = 1.65;

        this.exitPosition.copy(this.gridToWorld(last.r, last.c));
        this.exitPosition.y = 0;

        const pin = this.findFarHiddenPosition(first, last);
        this.pinpadPosition.copy(this.gridToWorld(pin.r, pin.c));
        this.pinpadPosition.y = 1.05;
    }

    findFirstWalkable() {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.expandedGrid[r][c] === 0) return { r, c };
            }
        }

        return { r: 1, c: 1 };
    }

    findLastWalkable() {
        for (let r = this.rows - 1; r >= 0; r--) {
            for (let c = this.cols - 1; c >= 0; c--) {
                if (this.expandedGrid[r][c] === 0) return { r, c };
            }
        }

        return { r: this.rows - 2, c: this.cols - 2 };
    }

    findFarHiddenPosition(start, exit) {
        const candidates = [];

        for (let r = 2; r < this.rows - 2; r++) {
            for (let c = 2; c < this.cols - 2; c++) {
                if (this.expandedGrid[r][c] !== 0) continue;

                const dStart = Math.hypot(r - start.r, c - start.c);
                const dExit = Math.hypot(r - exit.r, c - exit.c);

                if (dStart > 16 && dExit > 12) {
                    candidates.push({
                        r,
                        c,
                        score: dStart + dExit * 0.45
                    });
                }
            }
        }

        candidates.sort((a, b) => b.score - a.score);

        return candidates[Math.floor(Math.random() * Math.min(candidates.length, 12))]
            ?? this.findLastWalkable();
    }

    gridToWorld(r, c) {
        return new THREE.Vector3(
            this.offsetX + c * this.cellSize + this.cellSize / 2,
            0,
            this.offsetZ + r * this.cellSize + this.cellSize / 2
        );
    }

    worldToGrid(x, z) {
        const c = Math.floor((x - this.offsetX) / this.cellSize);
        const r = Math.floor((z - this.offsetZ) / this.cellSize);

        return { r, c };
    }

    registerObstacle(position, radius = 0.45, name = 'obstacle') {
        this.obstacles.push({
            position: position.clone(),
            radius,
            name
        });
    }

    removeObstaclesByName(name) {
        this.obstacles = this.obstacles.filter(obstacle => obstacle.name !== name);
    }

    registerWallReservation(position, radius = 2.5, name = 'reserved') {
        this.wallReservations.push({
            position: position.clone(),
            radius,
            name
        });
    }

    isWallReserved(position, radius = 1.5) {
        for (const item of this.wallReservations) {
            if (position.distanceTo(item.position) < item.radius + radius) {
                return true;
            }
        }

        return false;
    }

    isBlockedByObstacle(x, z, playerRadius = 0.26) {
        for (const obstacle of this.obstacles) {
            const dx = x - obstacle.position.x;
            const dz = z - obstacle.position.z;
            const distance = Math.hypot(dx, dz);

            if (distance < obstacle.radius + playerRadius) {
                return true;
            }
        }

        return false;
    }

    isWalkableWorld(x, z, radius = 0.26) {
        const checks = [
            [x, z],
            [x + radius, z],
            [x - radius, z],
            [x, z + radius],
            [x, z - radius],
            [x + radius, z + radius],
            [x - radius, z - radius],
            [x + radius, z - radius],
            [x - radius, z + radius]
        ];

        for (const [px, pz] of checks) {
            const { r, c } = this.worldToGrid(px, pz);

            if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return false;
            if (this.expandedGrid[r][c] !== 0) return false;
            if (this.isBlockedByObstacle(px, pz, radius)) return false;
        }

        return true;
    }

    getRandomWalkablePositions(amount, minDistanceFromStart = 7, minDistanceBetween = 3.2) {
        const positions = [];
        const shuffled = [...this.walkableWorldPositions].sort(() => Math.random() - 0.5);

        for (const pos of shuffled) {
            if (positions.length >= amount) break;

            if (pos.distanceTo(this.startPosition) < minDistanceFromStart) continue;
            if (pos.distanceTo(this.exitPosition) < 4) continue;
            if (pos.distanceTo(this.pinpadPosition) < 4) continue;
            if (!this.isWalkableWorld(pos.x, pos.z, 0.33)) continue;

            let tooClose = false;

            for (const selected of positions) {
                if (pos.distanceTo(selected) < minDistanceBetween) {
                    tooClose = true;
                    break;
                }
            }

            if (tooClose) continue;

            positions.push(pos.clone());
        }

        return positions;
    }

    getSafeTeleportPosition(options = {}) {
        const exclude = options.exclude ?? [];
        const minDistance = options.minDistance ?? 6;
        const radius = options.radius ?? 0.38;
        const tries = options.tries ?? 300;

        for (let i = 0; i < tries; i++) {
            const pos = this.walkableWorldPositions[
                Math.floor(Math.random() * this.walkableWorldPositions.length)
            ].clone();

            if (!this.isWalkableWorld(pos.x, pos.z, radius)) continue;

            let valid = true;

            for (const ex of exclude) {
                if (pos.distanceTo(ex) < minDistance) {
                    valid = false;
                    break;
                }
            }

            if (!valid) continue;

            pos.y = 1.65;
            return pos;
        }

        const fallback = this.startPosition.clone();
        fallback.y = 1.65;
        return fallback;
    }

    findWallMountSpots(amount = 1, options = {}) {
        const minDistanceBetween = options.minDistanceBetween ?? 5;
        const avoid = options.avoid ?? [];
        const avoidDistance = options.avoidDistance ?? 5;
        const reserve = options.reserve ?? false;
        const reserveName = options.reserveName ?? 'mount';

        const candidates = [];

        const dirs = [
            {
                dr: -1,
                dc: 0,
                rot: 0,
                normal: new THREE.Vector3(0, 0, 1)
            },
            {
                dr: 1,
                dc: 0,
                rot: Math.PI,
                normal: new THREE.Vector3(0, 0, -1)
            },
            {
                dr: 0,
                dc: -1,
                rot: Math.PI / 2,
                normal: new THREE.Vector3(1, 0, 0)
            },
            {
                dr: 0,
                dc: 1,
                rot: -Math.PI / 2,
                normal: new THREE.Vector3(-1, 0, 0)
            }
        ];

        for (let r = 2; r < this.rows - 2; r++) {
            for (let c = 2; c < this.cols - 2; c++) {
                if (this.expandedGrid[r][c] !== 0) continue;

                for (const d of dirs) {
                    if (this.expandedGrid[r + d.dr]?.[c + d.dc] !== 1) continue;

                    const sideA = d.dr !== 0
                        ? this.expandedGrid[r]?.[c - 1] === 0
                        : this.expandedGrid[r - 1]?.[c] === 0;

                    const sideB = d.dr !== 0
                        ? this.expandedGrid[r]?.[c + 1] === 0
                        : this.expandedGrid[r + 1]?.[c] === 0;

                    if (!sideA || !sideB) continue;

                    const base = this.gridToWorld(r, c);
                    const wallOffset = this.cellSize * 0.46;

                    const position = base.clone().addScaledVector(d.normal, -wallOffset);
                    position.y = 0;

                    if (this.isWallReserved(position, 1.7)) continue;

                    let avoidSpot = false;

                    for (const point of avoid) {
                        if (position.distanceTo(point) < avoidDistance) {
                            avoidSpot = true;
                            break;
                        }
                    }

                    if (avoidSpot) continue;

                    candidates.push({
                        position,
                        accessPosition: base.clone(),
                        rotationY: d.rot,
                        normal: d.normal.clone()
                    });
                }
            }
        }

        const selected = [];
        const shuffled = candidates.sort(() => Math.random() - 0.5);

        for (const spot of shuffled) {
            if (selected.length >= amount) break;

            let tooClose = false;

            for (const selectedSpot of selected) {
                if (spot.position.distanceTo(selectedSpot.position) < minDistanceBetween) {
                    tooClose = true;
                    break;
                }
            }

            if (!tooClose) {
                selected.push(spot);

                if (reserve) {
                    this.registerWallReservation(
                        spot.position,
                        minDistanceBetween * 0.55,
                        reserveName
                    );
                }
            }
        }

        return selected;
    }

    findWallMountSpot(options = {}) {
        const spots = this.findWallMountSpots(1, options);
        return spots[0] ?? null;
    }

    placeDecorations(models = {}, options = {}) {
        const cactus = models.cactus_maceta;
        const maceta = models.maceta;
        const cuadro = models.cuadro;

        const avoid = options.avoid ?? [];

        let floorDecorations = this.getRandomWalkablePositions(34, 8, 3.4);

        floorDecorations = floorDecorations.filter(pos => {
            for (const point of avoid) {
                if (pos.distanceTo(point) < 3.2) return false;
            }

            return true;
        });

        floorDecorations.forEach((pos, i) => {
            let source = null;
            let type = '';

            if (i % 2 === 0 && cactus) {
                source = cactus;
                type = 'cactus';
            } else if (maceta) {
                source = maceta;
                type = 'maceta';
            } else if (cactus) {
                source = cactus;
                type = 'cactus';
            }

            if (!source) return;

            const obj = source.clone(true);

            obj.position.set(pos.x, 0, pos.z);
            obj.rotation.y = Math.random() * Math.PI * 2;

            if (type === 'maceta') {
                obj.scale.setScalar(0.01);
                this.registerObstacle(obj.position, 0.18, 'maceta');
            } else {
                obj.scale.setScalar(0.42 + Math.random() * 0.18);
                this.registerObstacle(obj.position, 0.42, 'cactus_maceta');
            }

            obj.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = false;
                    child.receiveShadow = false;
                    child.frustumCulled = true;
                }
            });

            this.group.add(obj);
        });

        if (cuadro) {
            const wallSpots = this.findWallMountSpots(24, {
                minDistanceBetween: 3.4,
                avoid,
                avoidDistance: 4,
                reserve: true,
                reserveName: 'cuadro'
            });

            wallSpots.forEach((spot) => {
                const obj = cuadro.clone(true);

                obj.position.copy(spot.position);
                obj.position.y = 1.45;
                obj.position.addScaledVector(spot.normal, 0.035);
                obj.rotation.y = spot.rotationY;
                obj.scale.setScalar(0.55);

                obj.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = false;
                        child.receiveShadow = false;
                        child.frustumCulled = true;
                    }
                });

                this.group.add(obj);
            });
        }
    }
}