import * as THREE from 'three';

export class Player {
    constructor(camera, renderer, labyrinth, options = {}) {
        this.camera = camera;
        this.renderer = renderer;
        this.labyrinth = labyrinth;

        this.speed = options.speed ?? 2.4;
        this.runSpeed = options.runSpeed ?? 4.4;
        this.rotationSpeed = options.rotationSpeed ?? 2.45;
        this.collisionRadius = options.collisionRadius ?? 0.28;
        this.desktopEyeHeight = options.desktopEyeHeight ?? 1.45;

        this.rig = new THREE.Group();
        this.rig.name = 'PlayerRig';

        this.rig.position.set(
            labyrinth.startPosition.x,
            this.desktopEyeHeight,
            labyrinth.startPosition.z
        );

        this.rig.add(camera);

        this.desktopAvatar = null;
        this.keys = new Set();

        this.leftController = renderer.xr.getController(0);
        this.rightController = renderer.xr.getController(1);

        this.leftInputSource = null;
        this.rightInputSource = null;

        this.previousButtons = {
            rightSelect: false,
            rightBack: false,
            leftRun: false
        };

        this.callbacks = {
            interact: null,
            pinpadNavigate: null,
            pinpadSelect: null,
            pinpadClose: null
        };

        this.pinpadMode = false;
        this.navCooldown = 0;

        this.tempForward = new THREE.Vector3();
        this.tempRight = new THREE.Vector3();
        this.tempMove = new THREE.Vector3();

        this.setupEvents();
    }

    setupEvents() {
        window.addEventListener('keydown', (e) => {
            this.keys.add(e.code);

            if (e.code === 'KeyE' && this.callbacks.interact && !this.pinpadMode) {
                this.callbacks.interact();
            }

            if (e.code === 'Escape' && this.callbacks.pinpadClose) {
                this.callbacks.pinpadClose();
            }

            if (e.code === 'Enter' && this.callbacks.pinpadSelect) {
                this.callbacks.pinpadSelect();
            }

            if (
                ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)
                && this.callbacks.pinpadNavigate
            ) {
                let dx = 0;
                let dy = 0;

                if (e.code === 'ArrowLeft') dx = -1;
                if (e.code === 'ArrowRight') dx = 1;
                if (e.code === 'ArrowUp') dy = -1;
                if (e.code === 'ArrowDown') dy = 1;

                this.callbacks.pinpadNavigate(dx, dy);
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys.delete(e.code);
        });

        this.renderer.xr.addEventListener('sessionstart', () => {
            this.rig.position.y = 0;

            if (this.desktopAvatar) {
                this.desktopAvatar.visible = false;
            }
        });

        this.renderer.xr.addEventListener('sessionend', () => {
            this.rig.position.y = this.desktopEyeHeight;

            if (this.desktopAvatar) {
                this.desktopAvatar.visible = true;
            }
        });

        this.leftController.addEventListener('connected', (event) => {
            this.leftInputSource = event.data;
        });

        this.rightController.addEventListener('connected', (event) => {
            this.rightInputSource = event.data;
        });

        this.leftController.addEventListener('disconnected', () => {
            this.leftInputSource = null;
        });

        this.rightController.addEventListener('disconnected', () => {
            this.rightInputSource = null;
        });
    }

    setCallbacks(callbacks = {}) {
        this.callbacks = {
            ...this.callbacks,
            ...callbacks
        };
    }

    setDesktopAvatar(object3D) {
        this.desktopAvatar = object3D;
    }

    setPinpadMode(enabled) {
        this.pinpadMode = enabled;

        if (!enabled) {
            this.navCooldown = 0;
        }
    }

    getObject() {
        return this.rig;
    }

    getWorldPosition() {
        if (this.renderer.xr.isPresenting) {
            return this.camera.getWorldPosition(new THREE.Vector3());
        }

        return this.rig.position.clone();
    }

    update(delta) {
        this.handleXRInput(delta);
        this.handleDesktopInput(delta);
        this.updateDesktopAvatar();
    }

    handleDesktopInput(delta) {
        if (this.renderer.xr.isPresenting) return;
        if (this.pinpadMode) return;

        let forwardAmount = 0;
        let rightAmount = 0;

        if (this.keys.has('KeyW')) forwardAmount += 1;
        if (this.keys.has('KeyS')) forwardAmount -= 1;
        if (this.keys.has('KeyA')) rightAmount -= 1;
        if (this.keys.has('KeyD')) rightAmount += 1;

        if (this.keys.has('KeyQ')) this.rig.rotation.y += this.rotationSpeed * delta;
        if (this.keys.has('KeyE')) this.rig.rotation.y -= this.rotationSpeed * delta;

        if (this.keys.has('ArrowLeft')) this.rig.rotation.y += this.rotationSpeed * delta;
        if (this.keys.has('ArrowRight')) this.rig.rotation.y -= this.rotationSpeed * delta;

        const running = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
        const speed = running ? this.runSpeed : this.speed;

        this.moveRelative(forwardAmount, rightAmount, speed, delta, false);
    }

    handleXRInput(delta) {
        if (!this.renderer.xr.isPresenting) return;

        const leftGamepad = this.leftInputSource?.gamepad;
        const rightGamepad = this.rightInputSource?.gamepad;

        let moveX = 0;
        let moveY = 0;
        let lookX = 0;
        let lookY = 0;

        if (leftGamepad) {
            const axes = leftGamepad.axes ?? [];
            moveX = this.deadzone(axes[2] ?? axes[0] ?? 0);
            moveY = this.deadzone(axes[3] ?? axes[1] ?? 0);
        }

        if (rightGamepad) {
            const axes = rightGamepad.axes ?? [];
            lookX = this.deadzone(axes[2] ?? axes[0] ?? 0);
            lookY = this.deadzone(axes[3] ?? axes[1] ?? 0);
        }

        const leftRun = this.isButtonPressed(leftGamepad, [0, 1]);
        const speed = leftRun ? this.runSpeed : this.speed;

        if (this.pinpadMode) {
            this.handlePinpadVRNavigation(lookX, lookY, delta);
        } else {
            this.moveRelative(-moveY, moveX, speed, delta, true);

            if (Math.abs(lookX) > 0) {
                this.rig.rotation.y -= lookX * this.rotationSpeed * delta;
            }
        }

        const rightSelect = this.isButtonPressed(rightGamepad, [0, 4]);
        const rightBack = this.isButtonPressed(rightGamepad, [1, 5]);

        if (rightSelect && !this.previousButtons.rightSelect) {
            if (this.pinpadMode && this.callbacks.pinpadSelect) {
                this.callbacks.pinpadSelect();
            } else if (this.callbacks.interact) {
                this.callbacks.interact();
            }
        }

        if (rightBack && !this.previousButtons.rightBack) {
            if (this.callbacks.pinpadClose) {
                this.callbacks.pinpadClose();
            }
        }

        this.previousButtons.rightSelect = rightSelect;
        this.previousButtons.rightBack = rightBack;
        this.previousButtons.leftRun = leftRun;
    }

    handlePinpadVRNavigation(x, y, delta) {
        if (!this.callbacks.pinpadNavigate) return;

        this.navCooldown = Math.max(0, this.navCooldown - delta);

        if (this.navCooldown > 0) return;

        let dx = 0;
        let dy = 0;

        if (x > 0.65) dx = 1;
        else if (x < -0.65) dx = -1;

        if (y > 0.65) dy = 1;
        else if (y < -0.65) dy = -1;

        if (dx !== 0 || dy !== 0) {
            this.callbacks.pinpadNavigate(dx, dy);
            this.navCooldown = 0.22;
        }
    }

    moveRelative(forwardAmount, rightAmount, speed, delta, useCameraDirection = false) {
        if (forwardAmount === 0 && rightAmount === 0) return;

        if (useCameraDirection) {
            this.camera.getWorldDirection(this.tempForward);
            this.tempForward.y = 0;

            if (this.tempForward.lengthSq() < 0.0001) {
                this.tempForward.set(0, 0, -1).applyQuaternion(this.rig.quaternion);
            }

            this.tempForward.normalize();

            this.tempRight.crossVectors(
                this.tempForward,
                new THREE.Vector3(0, 1, 0)
            ).normalize();
        } else {
            this.tempForward.set(0, 0, -1).applyQuaternion(this.rig.quaternion);
            this.tempForward.y = 0;
            this.tempForward.normalize();

            this.tempRight.set(1, 0, 0).applyQuaternion(this.rig.quaternion);
            this.tempRight.y = 0;
            this.tempRight.normalize();
        }

        this.tempMove.set(0, 0, 0);
        this.tempMove.addScaledVector(this.tempForward, forwardAmount);
        this.tempMove.addScaledVector(this.tempRight, rightAmount);

        if (this.tempMove.lengthSq() > 1) {
            this.tempMove.normalize();
        }

        this.tempMove.multiplyScalar(speed * delta);

        const nextX = this.rig.position.x + this.tempMove.x;
        const nextZ = this.rig.position.z + this.tempMove.z;

        if (this.labyrinth.isWalkableWorld(nextX, this.rig.position.z, this.collisionRadius)) {
            this.rig.position.x = nextX;
        }

        if (this.labyrinth.isWalkableWorld(this.rig.position.x, nextZ, this.collisionRadius)) {
            this.rig.position.z = nextZ;
        }
    }

    updateDesktopAvatar() {
        if (!this.desktopAvatar || this.renderer.xr.isPresenting) return;

        this.desktopAvatar.position.copy(this.rig.position);
        this.desktopAvatar.position.y = 0;
        this.desktopAvatar.rotation.y = this.rig.rotation.y + Math.PI;
    }

    deadzone(value, threshold = 0.16) {
        return Math.abs(value) < threshold ? 0 : value;
    }

    isButtonPressed(gamepad, indices = []) {
        if (!gamepad?.buttons) return false;

        return indices.some(index => {
            const button = gamepad.buttons[index];
            return button && (button.pressed || button.value > 0.55);
        });
    }
}