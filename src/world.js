import * as THREE from 'three';

export class SubLevelWorld {
  constructor(scene, camera, audio = null) {
    this.scene = scene;
    this.camera = camera;
    this.audio = audio;
    this.colliders = [];
    this.flickerLights = [];

    // Flashlight State
    this.flashlightOn = true;
    this.battery = 100;
    this.maxIntensity = 18;
    this.batteryBar = document.getElementById('battery-fill');
    this.btnLight = document.getElementById('btn-light');

    // Lagging flashlight spring target
    this.lightPos = new THREE.Vector3();
    this.lightQuat = new THREE.Quaternion();

    // Objectives: 3 Encrypted Override Keycards + Extraction Elevator
    this.keycards = [];
    this.collectedCount = 0;
    this.totalKeycards = 3;
    this.elevatorUnlocked = false;
    this.escaped = false;

    this.objMainEl = document.getElementById('objective-main');
    this.objCountEl = document.getElementById('objective-count');

    this._setupAtmosphere();
    this._createMaterials();
    this._buildFacility();
    this._spawnObjectives();
    this._setupFlashlight();
    this._bindFlashlightButton();
  }

  _setupAtmosphere() {
    const bgColor = new THREE.Color(0x020407);
    this.scene.background = bgColor;
    this.scene.fog = new THREE.FogExp2(0x03060a, 0.072);

    const hemiLight = new THREE.HemisphereLight(0x162638, 0x050709, 0.22);
    this.scene.add(hemiLight);
  }

  _generateWetConcreteTextures() {
    const size = 512;

    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = size;
    diffCanvas.height = size;
    const dCtx = diffCanvas.getContext('2d');

    dCtx.fillStyle = '#2d3339';
    dCtx.fillRect(0, 0, size, size);

    for (let i = 0; i < 18000; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const v = 30 + Math.floor(Math.random() * 35);
      dCtx.fillStyle = `rgba(${v}, ${v + 3}, ${v + 6}, 0.25)`;
      dCtx.fillRect(x, y, 2, 2);
    }

    dCtx.strokeStyle = 'rgba(10, 12, 15, 0.75)';
    dCtx.lineWidth = 3;
    dCtx.strokeRect(1, 1, size - 2, size - 2);
    dCtx.beginPath();
    dCtx.moveTo(0, size / 2);
    dCtx.lineTo(size, size / 2);
    dCtx.moveTo(size / 2, 0);
    dCtx.lineTo(size / 2, size);
    dCtx.stroke();

    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = size;
    roughCanvas.height = size;
    const rCtx = roughCanvas.getContext('2d');

    rCtx.fillStyle = '#c8c8c8';
    rCtx.fillRect(0, 0, size, size);

    for (let i = 0; i < 14; i++) {
      const px = Math.random() * size;
      const py = Math.random() * size;
      const radius = 35 + Math.random() * 95;
      const grad = rCtx.createRadialGradient(px, py, 5, px, py, radius);
      grad.addColorStop(0, 'rgba(18, 18, 18, 0.95)');
      grad.addColorStop(0.65, 'rgba(60, 60, 60, 0.6)');
      grad.addColorStop(1, 'rgba(200, 200, 200, 0)');
      rCtx.fillStyle = grad;
      rCtx.beginPath();
      rCtx.arc(px, py, radius, 0, Math.PI * 2);
      rCtx.fill();
    }

    const map = new THREE.CanvasTexture(diffCanvas);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = THREE.SRGBColorSpace;

    const roughnessMap = new THREE.CanvasTexture(roughCanvas);
    roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;

    return { map, roughnessMap };
  }

  _createMaterials() {
    const floorTex = this._generateWetConcreteTextures();
    floorTex.map.repeat.set(16, 16);
    floorTex.roughnessMap.repeat.set(16, 16);

    this.floorMat = new THREE.MeshStandardMaterial({
      map: floorTex.map,
      roughnessMap: floorTex.roughnessMap,
      bumpMap: floorTex.map,
      bumpScale: 0.025,
      roughness: 0.85,
      metalness: 0.15,
    });

    const wallTex = this._generateWetConcreteTextures();
    wallTex.map.repeat.set(2, 1);
    wallTex.roughnessMap.repeat.set(2, 1);

    this.wallMat = new THREE.MeshStandardMaterial({
      color: 0x5c6873,
      map: wallTex.map,
      roughnessMap: wallTex.roughnessMap,
      bumpMap: wallTex.map,
      bumpScale: 0.04,
      roughness: 0.78,
      metalness: 0.2,
    });

    this.ceilingMat = new THREE.MeshStandardMaterial({
      color: 0x1e242b,
      roughness: 0.9,
      metalness: 0.3,
    });

    this.trimMat = new THREE.MeshStandardMaterial({
      color: 0x161b20,
      roughness: 0.45,
      metalness: 0.75,
    });
  }

  _addWall(x, z, width, depth, height = 3.6) {
    const geo = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geo, this.wallMat);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    this.colliders.push({
      minX: x - width * 0.5,
      maxX: x + width * 0.5,
      minZ: z - depth * 0.5,
      maxZ: z + depth * 0.5,
    });
  }

  _addPillar(x, z) {
    const geo = new THREE.BoxGeometry(0.75, 3.6, 0.75);
    const mesh = new THREE.Mesh(geo, this.trimMat);
    mesh.position.set(x, 1.8, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    this.colliders.push({
      minX: x - 0.375,
      maxX: x + 0.375,
      minZ: z - 0.375,
      maxZ: z + 0.375,
    });
  }

  _addEmergencyLight(x, z, colorHex = 0xff3b2f, baseIntensity = 2.4) {
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.12, 0.2),
      this.trimMat
    );
    housing.position.set(x, 3.52, z);
    this.scene.add(housing);

    const bulbMat = new THREE.MeshBasicMaterial({ color: colorHex });
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 0.12), bulbMat);
    bulb.position.set(x, 3.45, z);
    this.scene.add(bulb);

    const light = new THREE.PointLight(colorHex, baseIntensity, 11, 1.8);
    light.position.set(x, 3.25, z);
    this.scene.add(light);

    this.flickerLights.push({
      light,
      bulbMat,
      baseIntensity,
      baseColor: new THREE.Color(colorHex),
      seed: Math.random() * 100,
    });
  }

  _buildFacility() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), this.ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 3.6;
    this.scene.add(ceiling);

    // Outer Containment Perimeter Walls
    this._addWall(0, -16, 32, 0.8);
    this._addWall(0, 12, 32, 0.8);
    this._addWall(-16, -2, 0.8, 28);
    this._addWall(16, -2, 0.8, 28);

    // ROOM 1: Extraction Elevator Bay (Spawn: x=0, z=6)
    this._addWall(-4.5, 6.5, 0.5, 11);
    this._addWall(4.5, 6.5, 0.5, 11);
    this._addWall(-3.1, 1, 2.8, 0.5);
    this._addWall(3.1, 1, 2.8, 0.5);

    // Extraction Elevator Gate & Status Beacon at South End (z=11.3)
    const gate = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.8, 0.25), this.trimMat);
    gate.position.set(0, 1.4, 11.4);
    gate.castShadow = true;
    gate.receiveShadow = true;
    this.scene.add(gate);

    this.elevatorBeaconMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const beacon = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.16, 0.32), this.elevatorBeaconMat);
    beacon.position.set(0, 2.9, 11.35);
    this.scene.add(beacon);

    // ROOM 2: Central Sub-Level Hub
    this._addWall(-8, -0.5, 0.5, 3);
    this._addWall(-8, -5.5, 0.5, 3);
    this._addWall(8, -0.5, 0.5, 3);
    this._addWall(8, -5.5, 0.5, 3);
    this._addWall(-5, -7, 6.5, 0.5);
    this._addWall(5, -7, 6.5, 0.5);

    this._addPillar(-3.5, -2.5);
    this._addPillar(3.5, -2.5);
    this._addPillar(-3.5, -5.2);
    this._addPillar(3.5, -5.2);

    // ROOM 3: West Cryo-Storage Wing
    this._addWall(-12, 4, 8, 0.5);
    this._addWall(-12, -7, 8, 0.5);
    this._addPillar(-12, -1.5);

    // ROOM 4: East Biometrics Lab
    this._addWall(12, 4, 8, 0.5);
    this._addWall(12, -7, 8, 0.5);
    this._addPillar(12, -1.5);

    // ROOM 5 & 6: North Reactor & Deep Containment
    this._addWall(-5, -7, 0.5, 9);
    this._addWall(5, -7, 0.5, 9);
    this._addPillar(0, -11.5);

    // Emergency Warning Fixtures
    this._addEmergencyLight(0, 8.5, 0x38bdf8, 2.2);
    this._addEmergencyLight(0, -3.0, 0xff3322, 2.6);
    this._addEmergencyLight(-12, -3.0, 0xff4522, 2.2);
    this._addEmergencyLight(12, -3.0, 0xff4522, 2.2);
    this._addEmergencyLight(0, -13.0, 0xf59e0b, 2.5);
  }

    _spawnObjectives() {
    // 3 Encrypted Override Keycards: 2 in outer wings + 1 hidden behind the North Pillar
    const locations = [
      new THREE.Vector3(-13.8, 1.15, 2.2),  // Keycard 1: West Cryo-Storage
      new THREE.Vector3(13.8, 1.15, -5.2),  // Keycard 2: East Biometrics Lab
      new THREE.Vector3(1.15, 1.15, -11.8), // Keycard 3: Tucked behind right edge of North Pillar (safe from Warden spawn!)
    ];

    const cardGeo = new THREE.BoxGeometry(0.32, 0.2, 0.03);
    const cardMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    locations.forEach((pos, index) => {
      const group = new THREE.Group();
      group.position.copy(pos);

      const mesh = new THREE.Mesh(cardGeo, cardMat);
      group.add(mesh);

      const glow = new THREE.PointLight(0x38bdf8, 2.2, 5.5, 2);
      group.add(glow);

      this.scene.add(group);
      this.keycards.push({
        id: index,
        group,
        collected: false,
        baseY: pos.y,
      });
    });
    }
  
  

  _setupFlashlight() {
    this.flashlight = new THREE.SpotLight(0xeef6ff, this.maxIntensity, 28, Math.PI * 0.21, 0.55, 1.35);
    this.flashlight.castShadow = true;

    this.flashlight.shadow.mapSize.width = 1024;
    this.flashlight.shadow.mapSize.height = 1024;
    this.flashlight.shadow.camera.near = 0.25;
    this.flashlight.shadow.camera.far = 28;
    this.flashlight.shadow.bias = -0.0004;

    this.flashlightTarget = new THREE.Object3D();
    this.scene.add(this.flashlight);
    this.scene.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    this.lightPos.copy(this.camera.position);
    this.lightQuat.copy(this.camera.quaternion);
  }

  _bindFlashlightButton() {
    if (!this.btnLight) return;

    const toggleLight = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.battery <= 0) return;

      this.flashlightOn = !this.flashlightOn;
      this.flashlight.visible = this.flashlightOn;
      if (this.audio) this.audio.playClick(this.flashlightOn ? 1050 : 750);

      if (this.flashlightOn) {
        this.btnLight.classList.add('active');
        this.btnLight.classList.remove('off');
        this.btnLight.innerHTML = 'LIGHT<br />ON';
      } else {
        this.btnLight.classList.remove('active');
        this.btnLight.classList.add('off');
        this.btnLight.innerHTML = 'LIGHT<br />OFF';
      }
    };

    this.btnLight.addEventListener('touchstart', toggleLight, { passive: false });
    this.btnLight.addEventListener('click', toggleLight);
  }

  resetObjectives() {
    this.collectedCount = 0;
    this.elevatorUnlocked = false;
    this.escaped = false;
    this.elevatorBeaconMat.color.setHex(0xef4444);

    this.keycards.forEach((kc) => {
      kc.collected = false;
      kc.group.visible = true;
    });

    if (this.objMainEl) {
      this.objMainEl.textContent = 'LOCATE OVERRIDE KEYCARDS';
      this.objMainEl.style.color = '#e0f2fe';
    }
    if (this.objCountEl) {
      this.objCountEl.textContent = `KEYCARDS RECOVERED: 0 / ${this.totalKeycards}`;
      this.objCountEl.style.color = '#38bdf8';
    }
  }

  update(dt, elapsedTime, playerPos = null) {
    // 1. Heavy, Lagging Tactical Flashlight Physics
    const handOffset = new THREE.Vector3(0.22, -0.18, -0.15);
    handOffset.applyQuaternion(this.camera.quaternion);
    const desiredPos = this.camera.position.clone().add(handOffset);

    const posLag = Math.min(1, dt * 16);
    const rotLag = Math.min(1, dt * 11);

    this.lightPos.lerp(desiredPos, posLag);
    this.lightQuat.slerp(this.camera.quaternion, rotLag);

    this.flashlight.position.copy(this.lightPos);

    const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.lightQuat);
    this.flashlightTarget.position.copy(this.lightPos).addScaledVector(forwardDir, 10);

    // 2. Battery Drain & Low-Battery Sputter
    if (this.flashlightOn && this.battery > 0) {
      this.battery = Math.max(0, this.battery - 0.7 * dt);

      let outputRatio = 1.0;
      if (this.battery < 20) {
        const sputter = Math.sin(elapsedTime * 37) * Math.cos(elapsedTime * 19);
        outputRatio = sputter > 0.45 ? 0.35 : 0.85;
      }

      this.flashlight.intensity = this.maxIntensity * outputRatio;

      if (this.battery === 0) {
        this.flashlightOn = false;
        this.flashlight.visible = false;
        if (this.btnLight) {
          this.btnLight.classList.remove('active');
          this.btnLight.classList.add('off');
          this.btnLight.innerHTML = 'DEAD';
        }
      }
    }

    if (this.batteryBar) {
      this.batteryBar.style.width = `${this.battery}%`;
      if (this.battery < 20) {
        this.batteryBar.style.backgroundColor = '#ef4444';
        this.batteryBar.style.boxShadow = '0 0 8px #ef4444';
      } else if (this.battery < 45) {
        this.batteryBar.style.backgroundColor = '#f59e0b';
        this.batteryBar.style.boxShadow = '0 0 8px #f59e0b';
      } else {
        this.batteryBar.style.backgroundColor = '#38bdf8';
        this.batteryBar.style.boxShadow = '0 0 8px #38bdf8';
      }
    }

    // 3. Flickering Emergency Lights
    for (let i = 0; i < this.flickerLights.length; i++) {
      const item = this.flickerLights[i];
      const wave =
        Math.sin(elapsedTime * 9.0 + item.seed) *
        Math.sin(elapsedTime * 23.0 + item.seed * 1.7);

      const flickerMult = wave > 0.82 ? 0.15 : 0.92 + wave * 0.08;
      item.light.intensity = item.baseIntensity * flickerMult;
      item.bulbMat.color.copy(item.baseColor).multiplyScalar(flickerMult);
    }

    // 4. Keycard Rotation & Pickup Detection + Elevator Extraction
    for (let i = 0; i < this.keycards.length; i++) {
      const kc = this.keycards[i];
      if (kc.collected) continue;

      kc.group.rotation.y = elapsedTime * 2.2 + kc.id;
      kc.group.position.y = kc.baseY + Math.sin(elapsedTime * 3.0 + kc.id) * 0.08;

      if (playerPos) {
        const dist = Math.hypot(
          playerPos.x - kc.group.position.x,
          playerPos.z - kc.group.position.z
        );

        if (dist < 1.35) {
          kc.collected = true;
          kc.group.visible = false;
          this.collectedCount++;
          if (this.audio) this.audio.playKeycardPickup();

          if (this.collectedCount >= this.totalKeycards) {
            this.elevatorUnlocked = true;
            this.elevatorBeaconMat.color.setHex(0x4ade80);
            if (this.objMainEl) {
              this.objMainEl.textContent = 'RETURN TO EXTRACTION ELEVATOR';
              this.objMainEl.style.color = '#4ade80';
            }
            if (this.objCountEl) {
              this.objCountEl.textContent = 'ELEVATOR POWERED // EXTRACT NOW';
              this.objCountEl.style.color = '#4ade80';
            }
          } else if (this.objCountEl) {
            this.objCountEl.textContent = `KEYCARDS RECOVERED: ${this.collectedCount} / ${this.totalKeycards}`;
          }
        }
      }
    }

    // Check Extraction Elevator Win Trigger (z > 9.6 near gate at z=11.4)
        if (this.elevatorUnlocked && !this.escaped && playerPos) {
      if (Math.abs(playerPos.x) < 2.2 && playerPos.z > 9.6) {
        this.escaped = true;
        this.playEndingVideo();
      }
        }
    
  }
      

  playEndingVideo() {
    const overlay = document.getElementById('outro-video-overlay');
    const video = document.getElementById('outro-video');

    const showWinScreen = () => {
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      if (overlay) overlay.style.display = 'none';

      const escapeOverlay = document.getElementById('escape-overlay');
      if (escapeOverlay) escapeOverlay.style.display = 'flex';
    };

    if (!overlay || !video) {
      showWinScreen();
      return;
    }

    overlay.style.display = 'flex';
    video.currentTime = 0;
    video.muted = false;
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(showWinScreen);
    }
  }
    video.onended = showWinScreen;
  }

