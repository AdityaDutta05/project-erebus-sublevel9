import * as THREE from 'three';

export class PlayerController {
  constructor(camera, domElement, colliders) {
    this.camera = camera;
    this.domElement = domElement;
    this.colliders = colliders;

    // Player physical dimensions
    this.eyeHeight = 1.7;
    this.playerRadius = 0.42;
    this.position = new THREE.Vector3(0, this.eyeHeight, 6);
    this.camera.position.copy(this.position);

    // Rotation (Euler YXZ prevents gimbal roll)
    this.yaw = 0;
    this.pitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;

    // Movement & Stamina
    this.walkSpeed = 3.4;
    this.sprintSpeed = 6.0;
    this.stamina = 100;
    this.isSprinting = false;
    this.sprintButtonHeld = false;
    this.currentSpeed = 0;

    // Head-bobbing
    this.bobTimer = 0;
    this.bobOffset = 0;

    // Input state
    this.moveInput = { x: 0, y: 0 }; // x: strafe, y: forward
    this.keys = {};

    // Multi-touch tracking
    this.leftTouchId = null;
    this.leftOrigin = { x: 0, y: 0 };
    this.rightTouchId = null;
    this.rightLast = { x: 0, y: 0 };
    this.maxJoyRadius = 46;

    // UI Elements
    this.joyVisual = document.getElementById('joystick-zone-visual');
    this.joyKnob = document.getElementById('joystick-knob');
    this.btnSprint = document.getElementById('btn-sprint');
    this.staminaBar = document.getElementById('stamina-fill');

    this._bindEvents();
  }

  _bindEvents() {
    // Touch Controls (Dual-Thumb)
    window.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
    window.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
    window.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: false });
    window.addEventListener('touchcancel', (e) => this._onTouchEnd(e), { passive: false });

    // Sprint Button
    if (this.btnSprint) {
      const startSprint = (e) => {
        e.stopPropagation();
        this.sprintButtonHeld = true;
        this.btnSprint.classList.add('active');
      };
      const endSprint = (e) => {
        e.stopPropagation();
        this.sprintButtonHeld = false;
        this.btnSprint.classList.remove('active');
      };
      this.btnSprint.addEventListener('touchstart', startSprint, { passive: false });
      this.btnSprint.addEventListener('touchend', endSprint, { passive: false });
      this.btnSprint.addEventListener('mousedown', startSprint);
      this.btnSprint.addEventListener('mouseup', endSprint);
    }

    // Desktop WASD + Mouse PointerLock Fallback
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    this.domElement.addEventListener('click', () => {
      if (this.domElement.requestPointerLock && !('ontouchstart' in window)) {
        this.domElement.requestPointerLock();
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.domElement) {
        const sensitivity = 0.0022;
        this.targetYaw -= e.movementX * sensitivity;
        this.targetPitch -= e.movementY * sensitivity;
        this.targetPitch = Math.max(-Math.PI * 0.44, Math.min(Math.PI * 0.44, this.targetPitch));
      }
    });
  }

  _onTouchStart(e) {
    // Ignore touches on tactical buttons
    if (e.target.closest('.tac-btn') || e.target.closest('#boot-screen')) return;

    const halfWidth = window.innerWidth * 0.5;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];

      if (t.clientX < halfWidth && this.leftTouchId === null) {
        this.leftTouchId = t.identifier;
        this.leftOrigin = { x: t.clientX, y: t.clientY };

        if (this.joyVisual && this.joyKnob) {
          this.joyVisual.style.display = 'block';
          this.joyVisual.style.left = `${t.clientX}px`;
          this.joyVisual.style.top = `${t.clientY}px`;
          this.joyKnob.style.transform = `translate(-50%, -50%)`;
        }
      } else if (t.clientX >= halfWidth && this.rightTouchId === null) {
        this.rightTouchId = t.identifier;
        this.rightLast = { x: t.clientX, y: t.clientY };
      }
    }
  }

  _onTouchMove(e) {
    if (e.target.closest('#boot-screen')) return;
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];

      if (t.identifier === this.leftTouchId) {
        const dx = t.clientX - this.leftOrigin.x;
        const dy = t.clientY - this.leftOrigin.y;
        const dist = Math.hypot(dx, dy);
        const clampedDist = Math.min(dist, this.maxJoyRadius);
        const angle = Math.atan2(dy, dx);

        const normX = (Math.cos(angle) * clampedDist) / this.maxJoyRadius;
        const normY = (Math.sin(angle) * clampedDist) / this.maxJoyRadius;

        this.moveInput.x = normX;
        this.moveInput.y = -normY; // Up on screen is forward (+1)

        if (this.joyKnob) {
          const knobX = Math.cos(angle) * clampedDist;
          const knobY = Math.sin(angle) * clampedDist;
          this.joyKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
        }
      } else if (t.identifier === this.rightTouchId) {
        const deltaX = t.clientX - this.rightLast.x;
        const deltaY = t.clientY - this.rightLast.y;
        this.rightLast = { x: t.clientX, y: t.clientY };

        const lookSensitivity = 0.0045;
        this.targetYaw -= deltaX * lookSensitivity;
        this.targetPitch -= deltaY * lookSensitivity;
        this.targetPitch = Math.max(-Math.PI * 0.44, Math.min(Math.PI * 0.44, this.targetPitch));
      }
    }
  }

  _onTouchEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];

      if (t.identifier === this.leftTouchId) {
        this.leftTouchId = null;
        this.moveInput.x = 0;
        this.moveInput.y = 0;
        if (this.joyVisual) {
          this.joyVisual.style.display = 'none';
        }
      } else if (t.identifier === this.rightTouchId) {
        this.rightTouchId = null;
      }
    }
  }

  _getCombinedMoveVector() {
    let x = this.moveInput.x;
    let y = this.moveInput.y;

    // Keyboard override if active
    if (this.keys['KeyW'] || this.keys['ArrowUp']) y += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) y -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) x += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) x -= 1;

    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y, magnitude: Math.min(1, len) };
  }

  _resolveCollisions(nextPos) {
    const r = this.playerRadius;

    for (let i = 0; i < this.colliders.length; i++) {
      const box = this.colliders[i]; // { minX, maxX, minZ, maxZ }

      // Find closest point on AABB to player circle
      const closestX = Math.max(box.minX, Math.min(nextPos.x, box.maxX));
      const closestZ = Math.max(box.minZ, Math.min(nextPos.z, box.maxZ));

      const dx = nextPos.x - closestX;
      const dz = nextPos.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < r * r) {
        const dist = Math.sqrt(distSq);
        if (dist > 0.0001) {
          const overlap = r - dist;
          nextPos.x += (dx / dist) * overlap;
          nextPos.z += (dz / dist) * overlap;
        } else {
          // Inside box edge fallback
          nextPos.z += r;
        }
      }
    }
  }

  update(dt) {
    // 1. Smooth Camera Interpolation
    const lerpFactor = Math.min(1, dt * 18);
    this.yaw += (this.targetYaw - this.yaw) * lerpFactor;
    this.pitch += (this.targetPitch - this.pitch) * lerpFactor;

    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    // 2. Movement & Stamina Logic
    const move = this._getCombinedMoveVector();
    const wantsSprint = this.sprintButtonHeld || this.keys['ShiftLeft'] || this.keys['ShiftRight'];

    if (wantsSprint && move.magnitude > 0.2 && this.stamina > 1) {
      this.isSprinting = true;
      this.stamina = Math.max(0, this.stamina - 28 * dt);
    } else {
      this.isSprinting = false;
      this.stamina = Math.min(100, this.stamina + 16 * dt);
    }

    if (this.staminaBar) {
      this.staminaBar.style.width = `${this.stamina}%`;
      this.staminaBar.style.backgroundColor = this.stamina < 25 ? '#f87171' : '#94a3b8';
    }

    const activeSpeed = this.isSprinting ? this.sprintSpeed : this.walkSpeed;
    this.currentSpeed = move.magnitude * activeSpeed;

    // Forward & Right vectors on XZ plane
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const velocity = new THREE.Vector3()
      .addScaledVector(forward, move.y * activeSpeed * dt)
      .addScaledVector(right, move.x * activeSpeed * dt);

    const nextPos = this.position.clone().add(velocity);
    this._resolveCollisions(nextPos);
    this.position.copy(nextPos);

    // 3. Procedural Head-Bobbing
    if (this.currentSpeed > 0.15) {
      const bobFreq = this.isSprinting ? 13.5 : 8.5;
      const bobAmp = this.isSprinting ? 0.065 : 0.035;
      this.bobTimer += dt * bobFreq;
      this.bobOffset = Math.sin(this.bobTimer) * bobAmp;
    } else {
      this.bobTimer = 0;
      this.bobOffset += (0 - this.bobOffset) * Math.min(1, dt * 10);
    }

    this.camera.position.set(
      this.position.x,
      this.eyeHeight + this.bobOffset,
      this.position.z
    );
  }
          }
