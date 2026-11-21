import * as THREE from 'three';

export const AIState = {
  DORMANT: 'DORMANT',
  PATROL: 'PATROL',
  INVESTIGATE: 'INVESTIGATE',
  HUNT: 'HUNT',
};

export class StalkerAI {
  constructor(scene, world, player) {
    this.scene = scene;
    this.world = world;
    this.player = player;

    // FSM State & Timers
    this.state = AIState.DORMANT;
    this.stateTimer = 2.5; // Wakes up into PATROL after 2.5s
    this.investigateTarget = new THREE.Vector3();
    this.lostSightTimer = 0;
    this.attackCooldown = 0;
    this.playerCaught = false;

    // Movement & Sensing Config
    this.position = new THREE.Vector3(0, 0, -13.5); // Starts in Deep Containment
    this.yaw = 0;
    this.patrolSpeed = 2.1;
    this.investigateSpeed = 3.2;
    this.huntSpeed = 5.35; // Slightly slower than max sprint (6.0), faster than walk (3.4)
    this.sightRange = 16.5;
    this.sightHalfAngle = Math.PI * 0.28; // ~100-degree total FOV cone
    this.entityRadius = 0.45;

    // Waypoint Graph (Navigable nodes across Sub-Level 9 rooms & doorways)
    this.waypoints = [
      new THREE.Vector3(0, 0, -13.5),  // 0: North Reactor
      new THREE.Vector3(0, 0, -8.5),   // 1: North Corridor South
      new THREE.Vector3(0, 0, -4.0),   // 2: Central Hub North
      new THREE.Vector3(-5.8, 0, -3.0),// 3: Central Hub West Door
      new THREE.Vector3(-11.5, 0, -3.0),// 4: West Cryo Wing
      new THREE.Vector3(-11.5, 0, 1.5), // 5: West Cryo South
      new THREE.Vector3(5.8, 0, -3.0), // 6: Central Hub East Door
      new THREE.Vector3(11.5, 0, -3.0),// 7: East Biometrics Lab
      new THREE.Vector3(11.5, 0, 1.5), // 8: East Lab South
      new THREE.Vector3(0, 0, -1.0),   // 9: Central Hub South
    ];
    this.currentWaypointIdx = 1;

    // Raycaster & Wall Meshes for Line-of-Sight Occlusion
    this.raycaster = new THREE.Raycaster();
    this.wallMeshes = [];
    this.scene.traverse((obj) => {
      if (obj.isMesh && obj.geometry && obj.geometry.type === 'BoxGeometry') {
        this.wallMeshes.push(obj);
      }
    });

    // Build Procedural Biomech Entity & Debug Telemetry Visuals
    this._buildEntityMesh();
    this._buildDebugVisuals();
    this._bindDebugToggle();
  }

  _buildEntityMesh() {
    this.root = new THREE.Group();
    this.root.position.copy(this.position);

    const carapaceMat = new THREE.MeshStandardMaterial({
      color: 0x090b0e,
      roughness: 0.35,
      metalness: 0.85,
    });

    const sinewMat = new THREE.MeshStandardMaterial({
      color: 0x1c1215,
      roughness: 0.7,
      metalness: 0.3,
    });

    const eyeMat = new THREE.MeshBasicMaterial({
      color: 0xff1e1e,
    });

    // Pelvis / Core Hub
    this.pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.26), carapaceMat);
    this.pelvis.position.y = 1.25;
    this.pelvis.castShadow = true;
    this.root.add(this.pelvis);

    // Hunched Elongated Ribcage / Torso
    this.torso = new THREE.Group();
    this.torso.position.set(0, 1.38, 0);
    this.pelvis.add(this.torso);

    const chestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.78, 0.34), carapaceMat);
    chestMesh.position.set(0, 0.38, -0.06);
    chestMesh.rotation.x = 0.18; // Predatory forward hunch
    chestMesh.castShadow = true;
    this.torso.add(chestMesh);

    // Dorsal Biomech Spines
    for (let i = 0; i < 3; i++) {
      const spine = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 5), sinewMat);
      spine.position.set(0, 0.2 + i * 0.22, 0.16);
      spine.rotation.x = -0.65;
      this.torso.add(spine);
    }

    // Skull & Optical Sensor Array
    this.head = new THREE.Group();
    this.head.position.set(0, 0.84, -0.18);
    this.torso.add(this.head);

    const skullMesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.32), carapaceMat);
    skullMesh.castShadow = true;
    this.head.add(skullMesh);

    // Twin Glowing Crimson Eyes + Asymmetric Sensor Cluster
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), eyeMat);
    leftEye.position.set(-0.065, 0.03, -0.16);
    this.head.add(leftEye);

    const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), eyeMat);
    rightEye.position.set(0.065, 0.03, -0.16);
    this.head.add(rightEye);

    const thirdEye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), eyeMat);
    thirdEye.position.set(0.03, 0.09, -0.155);
    this.head.add(thirdEye);

    // Subtle crimson eye aura light
    this.eyeGlow = new THREE.PointLight(0xff1a1a, 1.4, 4.5, 2);
    this.eyeGlow.position.set(0, 0.05, -0.35);
    this.head.add(this.eyeGlow);

    // Articulated Arms (Long, scraping claws)
    this.leftArm = this._createLimb(0.09, 0.65, 0.07, 0.72, carapaceMat, sinewMat);
    this.leftArm.pivot.position.set(-0.36, 0.68, -0.05);
    this.torso.add(this.leftArm.pivot);

    this.rightArm = this._createLimb(0.09, 0.65, 0.07, 0.72, carapaceMat, sinewMat);
    this.rightArm.pivot.position.set(0.36, 0.68, -0.05);
    this.torso.add(this.rightArm.pivot);

    // Articulated Digitigrade Legs
    this.leftLeg = this._createLimb(0.11, 0.64, 0.09, 0.64, carapaceMat, sinewMat);
    this.leftLeg.pivot.position.set(-0.16, 1.22, 0);
    this.root.add(this.leftLeg.pivot);

    this.rightLeg = this._createLimb(0.11, 0.64, 0.09, 0.64, carapaceMat, sinewMat);
    this.rightLeg.pivot.position.set(0.16, 1.22, 0);
    this.root.add(this.rightLeg.pivot);

    this.scene.add(this.root);
    this.animCycle = 0;
  }

  _createLimb(upperRadius, upperLen, lowerRadius, lowerLen, upperMat, lowerMat) {
    const pivot = new THREE.Group();

    const upperMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(upperRadius, upperRadius * 0.8, upperLen, 6),
      upperMat
    );
    upperMesh.position.y = -upperLen * 0.5;
    upperMesh.castShadow = true;
    pivot.add(upperMesh);

    const kneePivot = new THREE.Group();
    kneePivot.position.y = -upperLen;
    pivot.add(kneePivot);

    const lowerMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(lowerRadius, lowerRadius * 0.6, lowerLen, 6),
      lowerMat
    );
    lowerMesh.position.y = -lowerLen * 0.5;
    lowerMesh.castShadow = true;
    kneePivot.add(lowerMesh);

    return { pivot, kneePivot };
  }

  _buildDebugVisuals() {
    this.debugEnabled = false;

    // 1. 3D Vision Cone Wireframe attached to Stalker's head direction
    const coneRadius = Math.tan(this.sightHalfAngle) * this.sightRange;
    const coneGeo = new THREE.ConeGeometry(coneRadius, this.sightRange, 16, 1, true);
    // Rotate cone so tip is at origin and opens along -Z
    coneGeo.translate(0, -this.sightRange * 0.5, 0);
    coneGeo.rotateX(Math.PI * 0.5);

    this.visionConeMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.28,
    });
    this.visionConeMesh = new THREE.Mesh(coneGeo, this.visionConeMat);
    this.visionConeMesh.position.set(0, 1.95, -0.2);
    this.visionConeMesh.visible = false;
    this.root.add(this.visionConeMesh);

    // 2. Investigation Target Marker on Floor
    const markerGeo = new THREE.RingGeometry(0.25, 0.4, 16);
    markerGeo.rotateX(-Math.PI * 0.5);
    this.targetMarker = new THREE.Mesh(
      markerGeo,
      new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide })
    );
    this.targetMarker.position.y = 0.04;
    this.targetMarker.visible = false;
    this.scene.add(this.targetMarker);
  }

  _bindDebugToggle() {
    this.btnDebug = document.getElementById('btn-debug-ai');
    this.telemetryDrawer = document.getElementById('ai-telemetry-drawer');
    this.telemetryStateEl = document.getElementById('ai-state-val');
    this.telemetryDistEl = document.getElementById('ai-dist-val');
    this.telemetrySensorEl = document.getElementById('ai-sensor-val');

    if (!this.btnDebug) return;

    const toggle = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.debugEnabled = !this.debugEnabled;
      this.visionConeMesh.visible = this.debugEnabled;
      this.targetMarker.visible =
        this.debugEnabled && this.state === AIState.INVESTIGATE;

      if (this.telemetryDrawer) {
        this.telemetryDrawer.style.display = this.debugEnabled ? 'block' : 'none';
      }
      this.btnDebug.classList.toggle('active', this.debugEnabled);
    };

    this.btnDebug.addEventListener('touchstart', toggle, { passive: false });
    this.btnDebug.addEventListener('click', toggle);
  }

  _checkLineOfSight(distToPlayer) {
    if (distToPlayer > this.sightRange) return false;

    // Stalker forward direction (-Z rotated by this.yaw)
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const toPlayer = new THREE.Vector3(
      this.player.position.x - this.position.x,
      0,
      this.player.position.z - this.position.z
    ).normalize();

    const angle = forward.angleTo(toPlayer);
    if (angle > this.sightHalfAngle) return false;

    // Wall Occlusion Raycast from Stalker eye level to Player eye level
    const origin = new THREE.Vector3(this.position.x, 1.95, this.position.z);
    const target = new THREE.Vector3(
      this.player.position.x,
      this.player.eyeHeight,
      this.player.position.z
    );
    const rayDir = target.clone().sub(origin);
    const rayDist = rayDir.length();
    rayDir.normalize();

    this.raycaster.set(origin, rayDir);
    this.raycaster.far = rayDist;

    const hits = this.raycaster.intersectObjects(this.wallMeshes, false);
    return hits.length === 0;
  }

  _checkSensoryStimuli(distToPlayer) {
    // 1. Acoustic Footstep Detection (Sprinting emits high decibels up to 14m)
    if (this.player.isSprinting && distToPlayer < 14.0) {
      return 'ACOUSTIC: SPRINT DECIBELS';
    }

    // 2. Tactical Flashlight Beam Detection
    if (this.world.flashlightOn && distToPlayer < 18.0) {
      const lightPos = this.world.flashlight.position;
      const lightDir = new THREE.Vector3()
        .subVectors(this.world.flashlightTarget.position, lightPos)
        .normalize();

      const toStalker = new THREE.Vector3(
        this.position.x - lightPos.x,
        1.5 - lightPos.y,
        this.position.z - lightPos.z
      );
      const beamDist = toStalker.length();
      toStalker.normalize();

      const beamAngle = lightDir.angleTo(toStalker);
      // SpotLight outer cone is ~0.21 * PI (~0.66 rad)
      if (beamAngle < 0.45 && beamDist < 18.0) {
        // Verify wall isn't blocking the flashlight beam
        this.raycaster.set(lightPos, toStalker);
        this.raycaster.far = beamDist;
        const hits = this.raycaster.intersectObjects(this.wallMeshes, false);
        if (hits.length === 0) {
          return 'OPTICAL: FLASHLIGHT BEAM';
        }
      }
    }

    return null;
  }

  _resolveWallCollisions(nextPos) {
    const r = this.entityRadius;
    const colliders = this.world.colliders;

    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
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
          nextPos.z += r;
        }
      }
    }
  }

  _steerToward(targetPos, speed, dt) {
    const dx = targetPos.x - this.position.x;
    const dz = targetPos.z - this.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.05) return 0;

    // Target yaw (-Z is forward)
    const desiredYaw = Math.atan2(-dx, -dz);

    // Shortest angular interpolation
    let diff = desiredYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * Math.min(1, dt * 7.5);

    const step = Math.min(dist, speed * dt);
    const nextPos = this.position.clone();
    nextPos.x += (dx / dist) * step;
    nextPos.z += (dz / dist) * step;

    this._resolveWallCollisions(nextPos);
    this.position.copy(nextPos);

    return dist;
  }

  _animateLimbs(currentSpeed, dt, elapsedTime) {
    this.root.position.copy(this.position);
    this.root.rotation.y = this.yaw;

    if (this.state === AIState.DORMANT) {
      // Crouched, twitching idle posture
      this.pelvis.position.y = 0.95;
      this.torso.rotation.x = 0.45;
      this.head.rotation.z = Math.sin(elapsedTime * 14) * 0.08;
      this.leftLeg.pivot.rotation.x = -0.65;
      this.leftLeg.kneePivot.rotation.x = 1.25;
      this.rightLeg.pivot.rotation.x = -0.65;
      this.rightLeg.kneePivot.rotation.x = 1.25;
      return;
    }

    // Active stride kinematics
    const strideFreq = currentSpeed * 2.4;
    this.animCycle += dt * strideFreq;

    const swing = Math.sin(this.animCycle);
    const oppositeSwing = Math.sin(this.animCycle + Math.PI);

    // Vertical pelvis bob
    this.pelvis.position.y = 1.24 + Math.abs(Math.cos(this.animCycle)) * 0.07;

    // Aggressive forward lean when hunting
    const targetLean = this.state === AIState.HUNT ? 0.34 : 0.12;
    this.torso.rotation.x += (targetLean - this.torso.rotation.x) * Math.min(1, dt * 6);
    this.torso.rotation.z = swing * 0.06;

    // Twitchy head tracking
    this.head.rotation.y = Math.sin(elapsedTime * 3.1) * 0.14;
    this.head.rotation.z = Math.cos(elapsedTime * 7.5) * 0.05;

    // Legs
    this.leftLeg.pivot.rotation.x = swing * 0.65;
    this.leftLeg.kneePivot.rotation.x = Math.max(0, -swing * 0.85);

    this.rightLeg.pivot.rotation.x = oppositeSwing * 0.65;
    this.rightLeg.kneePivot.rotation.x = Math.max(0, -oppositeSwing * 0.85);

    // Long Counter-Swinging Arms
    const armReach = this.state === AIState.HUNT ? -0.55 : -0.15;
    this.leftArm.pivot.rotation.x = armReach + oppositeSwing * 0.55;
    this.leftArm.kneePivot.rotation.x = -0.35 - Math.max(0, swing * 0.4);

    this.rightArm.pivot.rotation.x = armReach + swing * 0.55;
    this.rightArm.kneePivot.rotation.x = -0.35 - Math.max(0, oppositeSwing * 0.4);
  }

  _updateTelemetryHUD(distToPlayer, lastStimulus) {
    if (!this.debugEnabled) return;

    if (this.telemetryStateEl) {
      this.telemetryStateEl.textContent = this.state;
      const colorMap = {
        [AIState.DORMANT]: '#94a3b8',
        [AIState.PATROL]: '#38bdf8',
        [AIState.INVESTIGATE]: '#facc15',
        [AIState.HUNT]: '#ef4444',
      };
      this.telemetryStateEl.style.color = colorMap[this.state] || '#e0f2fe';
    }

    if (this.telemetryDistEl) {
      this.telemetryDistEl.textContent = `${distToPlayer.toFixed(1)} m`;
    }

    if (this.telemetrySensorEl) {
      this.telemetrySensorEl.textContent = lastStimulus || 'NONE';
    }

    // Update 3D Debug Cone Color
    const coneColors = {
      [AIState.DORMANT]: 0x64748b,
      [AIState.PATROL]: 0x38bdf8,
      [AIState.INVESTIGATE]: 0xfacc15,
      [AIState.HUNT]: 0xef4444,
    };
    this.visionConeMat.color.setHex(coneColors[this.state]);

    if (this.state === AIState.INVESTIGATE) {
      this.targetMarker.visible = true;
      this.targetMarker.position.set(
        this.investigateTarget.x,
        0.04,
        this.investigateTarget.z
      );
    } else {
      this.targetMarker.visible = false;
    }
  }

  update(dt, elapsedTime) {
    const distToPlayer = Math.hypot(
      this.player.position.x - this.position.x,
      this.player.position.z - this.position.z
    );

    const hasLOS = this._checkLineOfSight(distToPlayer);
    const stimulus = this._checkSensoryStimuli(distToPlayer);
    let activeSpeed = 0;

    // --- FINITE STATE MACHINE TRANSITIONS & BEHAVIORS ---
    switch (this.state) {
      case AIState.DORMANT:
        this.stateTimer -= dt;
        this.eyeGlow.intensity = 0.4;
        if (this.stateTimer <= 0 || hasLOS || stimulus) {
          this.state = hasLOS ? AIState.HUNT : AIState.PATROL;
          this.eyeGlow.intensity = 1.6;
        }
        break;

      case AIState.PATROL: {
        activeSpeed = this.patrolSpeed;
        const wp = this.waypoints[this.currentWaypointIdx];
        const distToWp = this._steerToward(wp, activeSpeed, dt);

        if (distToWp < 0.65) {
          // Pick next connected/nearby waypoint (never repeat the exact same node)
          let nextIdx = Math.floor(Math.random() * this.waypoints.length);
          if (nextIdx === this.currentWaypointIdx) {
            nextIdx = (nextIdx + 1) % this.waypoints.length;
          }
          this.currentWaypointIdx = nextIdx;
        }

        if (hasLOS) {
          this.state = AIState.HUNT;
          this.lostSightTimer = 3.5;
        } else if (stimulus) {
          this.state = AIState.INVESTIGATE;
          this.investigateTarget.set(this.player.position.x, 0, this.player.position.z);
          this.stateTimer = 7.0;
        }
        break;
      }

      case AIState.INVESTIGATE: {
        activeSpeed = this.investigateSpeed;
        this.stateTimer -= dt;

        // Continuously update target if player keeps making noise/light
        if (stimulus) {
          this.investigateTarget.set(this.player.position.x, 0, this.player.position.z);
          this.stateTimer = 6.0;
        }

        const distToTarget = this._steerToward(this.investigateTarget, activeSpeed, dt);

        if (hasLOS) {
          this.state = AIState.HUNT;
          this.lostSightTimer = 4.0;
        } else if (distToTarget < 0.75 || this.stateTimer <= 0) {
          // Sweep head briefly then resume patrol
          this.state = AIState.PATROL;
        }
        break;
      }

      case AIState.HUNT: {
        activeSpeed = this.huntSpeed;
        this.eyeGlow.intensity = 2.6;

        if (hasLOS) {
          this.lostSightTimer = 4.0;
          this.investigateTarget.set(this.player.position.x, 0, this.player.position.z);
        } else {
          this.lostSightTimer -= dt;
        }

        this._steerToward(this.investigateTarget, activeSpeed, dt);

        // Check Capture Range
        if (distToPlayer < 1.15 && !this.playerCaught) {
          this.playerCaught = true;
          const overlay = document.getElementById('capture-overlay');
          if (overlay) overlay.style.display = 'flex';
        }

        if (this.lostSightTimer <= 0) {
          this.eyeGlow.intensity = 1.6;
          this.state = AIState.INVESTIGATE;
          this.stateTimer = 5.0;
        }
        break;
      }
    }

    this._animateLimbs(activeSpeed, dt, elapsedTime);
    this._updateTelemetryHUD(distToPlayer, hasLOS ? 'VISUAL: LINE OF SIGHT' : stimulus);
  }

  reset() {
    this.position.set(0, 0, -13.5);
    this.yaw = 0;
    this.state = AIState.PATROL;
    this.playerCaught = false;
    this.currentWaypointIdx = 1;
  }
}
