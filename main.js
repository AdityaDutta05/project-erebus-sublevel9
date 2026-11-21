import * as THREE from 'three';
import { SubLevelWorld } from './src/world.js';
import { PlayerController } from './src/controls.js';
import { StalkerAI } from './src/stalkerAI.js';
import { SpatialAudioEngine } from './src/audio.js';

class ErebusEngine {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.fpsElement = document.getElementById('fps-counter');

    this._initRenderer();
    this._initScene();

    this.audio = new SpatialAudioEngine();
    this.world = new SubLevelWorld(this.scene, this.camera, this.audio);
    this.player = new PlayerController(this.camera, this.canvas, this.world.colliders);
    this.stalker = new StalkerAI(this.scene, this.world, this.player);

    this.clock = new THREE.Clock();
    this.frames = 0;
    this.fpsTimer = 0;
    this.isRunning = false;

    this._bindBootSequence();
    this._bindResetButtons();
    this._bindResize();

    this.renderer.render(this.scene, this.camera);
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      68,
      window.innerWidth / window.innerHeight,
      0.1,
      45
    );
  }

  _bindBootSequence() {
    const bootScreen = document.getElementById('boot-screen');
    const btnDeploy = document.getElementById('btn-deploy');

    if (btnDeploy && bootScreen) {
      btnDeploy.addEventListener('click', () => {
        this.audio.init();
        this.audio.playClick(1100);
        bootScreen.style.display = 'none';
        this.isRunning = true;
        this.clock.start();

        if (document.documentElement.requestFullscreen && 'ontouchstart' in window) {
          document.documentElement.requestFullscreen().catch(() => {});
        }

        this._animate();
      });
    }
  }

  _resetSimulation() {
    this.player.position.set(0, this.player.eyeHeight, 6);
    this.player.targetYaw = 0;
    this.player.targetPitch = 0;
    this.player.stamina = 100;

    this.world.battery = 100;
    this.world.flashlightOn = true;
    this.world.flashlight.visible = true;
    this.world.resetObjectives();

    this.stalker.reset();

    const captureOverlay = document.getElementById('capture-overlay');
    const escapeOverlay = document.getElementById('escape-overlay');
    if (captureOverlay) captureOverlay.style.display = 'none';
    if (escapeOverlay) escapeOverlay.style.display = 'none';
  }

  _bindResetButtons() {
    const btnRespawn = document.getElementById('btn-respawn');
    const btnReplay = document.getElementById('btn-replay');

    if (btnRespawn) {
      btnRespawn.addEventListener('click', () => this._resetSimulation());
    }
    if (btnReplay) {
      btnReplay.addEventListener('click', () => this._resetSimulation());
    }
  }

  _bindResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  _animate() {
    if (!this.isRunning) return;
    requestAnimationFrame(() => this._animate());

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsedTime = this.clock.elapsedTime;

    const halted = this.stalker.playerCaught || this.world.escaped;

    if (!halted) {
      this.player.update(dt);
      this.stalker.update(dt, elapsedTime);
      this.audio.update(dt, this.player, this.stalker);
    }

    this.world.update(dt, elapsedTime, this.player.position);

    this.renderer.render(this.scene, this.camera);

    this.frames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      const fps = Math.round(this.frames / this.fpsTimer);
      if (this.fpsElement) {
        this.fpsElement.textContent = `SYS: ${fps} FPS`;
        this.fpsElement.style.color = fps >= 50 ? '#4ade80' : fps >= 30 ? '#facc15' : '#f87171';
      }
      this.frames = 0;
      this.fpsTimer = 0;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new ErebusEngine();
});
