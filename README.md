# PROJECT EREBUS: SUB-LEVEL 9

![Project Erebus: Sub-Level 9](./PROJECT_EREBUS_O9_Poster.png)


> **A zero-dependency, browser-native 3D psychological horror vertical slice built with Three.js, volumetric-style lighting, Web Audio spatial synthesis, and a 4-state Finite State Machine AI.**

🎮 **[PLAY LIVE ON ITCH.IO](https://adityadutta05.itch.io/project-erebus-sub-level-9)** *(Supports Mobile Touch & Desktop)*
🌐 **[PLAY LIVE ON GITHUB PAGES](https://adityadutta05.github.io/project-erebus-sublevel9/)**

## IN GAME GLIMPSES
![PROJECT EREBUS: Sub-Level 9 Gameplay & Cutscenes](./IN%20GAME%20GLIMPSE.jpg)




## Core Engineering & Technical Architecture

Unlike standard 2D canvas games, **Project Erebus** runs a decoupled, modular 3D engine directly in mobile and desktop browsers at 60 FPS without heavy external assets:

```text
index.html (Viewport Lock, HUD & ES Import Map)
 └── main.js (ErebusEngine: ACES Filmic Renderer, Game Loop & Telemetry)
      ├── src/world.js      ──> Procedural PBR Wet Concrete, Exponential Fog & Dynamic Spotlight Shadows
      ├── src/controls.js   ──> Dual-Thumb Virtual Joystick, Smooth Look & AABB Wall Collisions
      ├── src/stalkerAI.js  ──> 4-State Autonomous Entity (DORMANT / PATROL / INVESTIGATE / HUNT)
      └── src/audio.js      ──> Real-Time Web Audio API Synthesizer (3D Spatial Heartbeat & Drones)
```

### Key Technical Highlights
* **Real-Time Lighting & Atmosphere (`src/world.js`):** Uses `THREE.PCFSoftShadowMap`, exponential fog (`FogExp2`), procedural roughness maps for wet concrete reflections, and a battery-constrained spotlight with realistic angular lag.
* **Autonomous Stalker AI (`src/stalkerAI.js`):** Driven by a 4-state Finite State Machine that dynamically reacts to player line-of-sight, flashlight visibility, and sprint footstep noise while navigating facility waypoints with collision avoidance.
* **Zero-Asset Spatial Audio (`src/audio.js`):** Synthesizes industrial ambient drones, rhythmic footsteps, and a stereo-panned heartbeat monitor whose tempo scales mathematically with the Stalker's proximity.
* **Mobile-First Ergonomics (`src/controls.js`):** Features an invisible left-thumb analog movement zone, right-thumb camera look, and live FPS/AI telemetry monitoring.

---

## Controls

| Platform | Move / Sprint | Camera Look | Flashlight |
| :--- | :--- | :--- | :--- |
| **Mobile (Touch)** | Drag **Left Half** of screen | Drag **Right Half** of screen | Tap **BEAM** button |
| **Desktop** | `W A S D` | Drag Mouse | Click **BEAM** button |
