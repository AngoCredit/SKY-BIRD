/**
 * 3D Cinematic Canvas for SKYBIRD
 * Procedural Three.js scene featuring the original 3D Cyber Bird,
 * progressive altitude sky environments, dynamic aircraft debris explosions,
 * weather systems (rain, lightning), speed lines, and reactive camera motion.
 */

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { AltitudeStage, GameRoundStatus, GraphicQuality } from '../../types';
import { audioManager } from '../../services/audioManager';

interface SkybirdCanvasProps {
  status: GameRoundStatus;
  multiplier: number;
  altitudeStage: AltitudeStage;
  quality: GraphicQuality;
  onCameraShake?: () => void;
}

export const SkybirdCanvas: React.FC<SkybirdCanvasProps> = React.memo(({
  status,
  multiplier,
  altitudeStage,
  quality
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({
    status,
    multiplier,
    altitudeStage,
    quality
  });

  // Keep stateRef fresh for the 60fps render loop
  useEffect(() => {
    stateRef.current = { status, multiplier, altitudeStage, quality };
  }, [status, multiplier, altitudeStage, quality]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // --- 1. SCENE & RENDERER SETUP WITH SAFE WEBGL & 2D FALLBACK ---
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a1128, 0.008);

    const initialWidth = container.clientWidth > 0 ? container.clientWidth : (window.innerWidth || 800);
    const initialHeight = container.clientHeight > 0 ? container.clientHeight : (window.innerHeight || 500);
    const initialAspect = initialHeight > 0 ? initialWidth / initialHeight : 1.77;

    const camera = new THREE.PerspectiveCamera(55, initialAspect, 0.1, 1000);
    camera.position.set(0, 3, 12);

    let renderer: THREE.WebGLRenderer | null = null;
    let fallback2dCanvas: HTMLCanvasElement | null = null;
    let fallbackCtx: CanvasRenderingContext2D | null = null;

    try {
      // Try WebGL with auto quality detection
      const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768;
      renderer = new THREE.WebGLRenderer({
        antialias: !isMobile && quality !== 'LOW',
        alpha: false,
        powerPreference: isMobile ? 'default' : 'high-performance',
        failIfMajorPerformanceCaveat: false
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : (quality === 'HIGH' ? 2 : 1.25)));
      renderer.setSize(initialWidth, initialHeight);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      container.innerHTML = '';
      container.appendChild(renderer.domElement);
    } catch (e) {
      console.warn('[SkybirdCanvas] WebGLRenderer creation failed, using 2D Fallback Engine:', e);
      renderer = null;
      container.innerHTML = '';
      fallback2dCanvas = document.createElement('canvas');
      fallback2dCanvas.width = initialWidth;
      fallback2dCanvas.height = initialHeight;
      fallback2dCanvas.style.width = '100%';
      fallback2dCanvas.style.height = '100%';
      fallbackCtx = fallback2dCanvas.getContext('2d');
      container.appendChild(fallback2dCanvas);
    }

    // --- 2. LIGHTING ---
    const ambientLight = new THREE.AmbientLight(0x406090, 1.2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(15, 30, 20);
    scene.add(dirLight);

    const sunLight = new THREE.PointLight(0x00f0ff, 2.5, 50);
    sunLight.position.set(0, 10, 5);
    scene.add(sunLight);

    // Lightning Flash Light
    const lightningLight = new THREE.PointLight(0xffffff, 0, 120);
    lightningLight.position.set(0, 25, -10);
    scene.add(lightningLight);

    // --- 3. PROCEDURAL 3D CYBER BIRD (ORIGINAL ASSET) ---
    const birdGroup = new THREE.Group();
    scene.add(birdGroup);

    // Bird Main Fuselage / Body
    const bodyGeo = new THREE.ConeGeometry(0.7, 3.2, 6);
    bodyGeo.rotateX(Math.PI / 2);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0f2038,
      roughness: 0.25,
      metalness: 0.85,
      emissive: 0x003366,
      emissiveIntensity: 0.4
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.scale.set(1, 0.65, 1);
    birdGroup.add(bodyMesh);

    // Glowing Cyber Visor
    const visorGeo = new THREE.SphereGeometry(0.38, 16, 12);
    visorGeo.scale(0.9, 0.4, 1.4);
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x00f7ff,
      emissive: 0x00f7ff,
      emissiveIntensity: 2.5,
      roughness: 0.1
    });
    const visorMesh = new THREE.Mesh(visorGeo, visorMat);
    visorMesh.position.set(0, 0.25, 1.1);
    birdGroup.add(visorMesh);

    // Cyber Beak Nose Cone
    const beakGeo = new THREE.ConeGeometry(0.3, 1.1, 4);
    beakGeo.rotateX(Math.PI / 2);
    const beakMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.9,
      roughness: 0.2,
      emissive: 0xd97706,
      emissiveIntensity: 0.8
    });
    const beakMesh = new THREE.Mesh(beakGeo, beakMat);
    beakMesh.position.set(0, 0, 2.0);
    birdGroup.add(beakMesh);

    // Left Wing Blade
    const leftWingGroup = new THREE.Group();
    leftWingGroup.position.set(-0.5, 0.1, 0);
    const wingGeo = new THREE.BoxGeometry(2.4, 0.08, 0.9);
    wingGeo.translate(-1.1, 0, -0.2);
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a,
      metalness: 0.8,
      roughness: 0.3,
      emissive: 0x0284c7,
      emissiveIntensity: 0.5
    });
    const leftWingMesh = new THREE.Mesh(wingGeo, wingMat);
    leftWingGroup.add(leftWingMesh);

    // Wing Neon Edge Trim Left
    const wingTrimGeo = new THREE.BoxGeometry(2.3, 0.04, 0.1);
    wingTrimGeo.translate(-1.1, 0.05, 0.25);
    const neonMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const leftTrim = new THREE.Mesh(wingTrimGeo, neonMat);
    leftWingGroup.add(leftTrim);
    birdGroup.add(leftWingGroup);

    // Right Wing Blade
    const rightWingGroup = new THREE.Group();
    rightWingGroup.position.set(0.5, 0.1, 0);
    const rightWingGeo = new THREE.BoxGeometry(2.4, 0.08, 0.9);
    rightWingGeo.translate(1.1, 0, -0.2);
    const rightWingMesh = new THREE.Mesh(rightWingGeo, wingMat);
    rightWingGroup.add(rightWingMesh);

    // Wing Neon Edge Trim Right
    const rightTrimGeo = new THREE.BoxGeometry(2.3, 0.04, 0.1);
    rightTrimGeo.translate(1.1, 0.05, 0.25);
    const rightTrim = new THREE.Mesh(rightTrimGeo, neonMat);
    rightWingGroup.add(rightTrim);
    birdGroup.add(rightWingGroup);

    // Tail Fins
    const tailGeo = new THREE.BoxGeometry(0.1, 1.1, 1.2);
    tailGeo.rotateX(0.4);
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0x0369a1,
      metalness: 0.9,
      emissive: 0x00ffff,
      emissiveIntensity: 0.6
    });
    const tailMesh = new THREE.Mesh(tailGeo, tailMat);
    tailMesh.position.set(0, 0.6, -1.2);
    birdGroup.add(tailMesh);

    // Twin Plasma Exhaust Thrusters
    const thrusterGeo = new THREE.CylinderGeometry(0.18, 0.24, 0.6, 12);
    thrusterGeo.rotateX(Math.PI / 2);
    const thrusterMat = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.9 });
    const thrusterL = new THREE.Mesh(thrusterGeo, thrusterMat);
    thrusterL.position.set(-0.35, 0, -1.4);
    const thrusterR = new THREE.Mesh(thrusterGeo, thrusterMat);
    thrusterR.position.set(0.35, 0, -1.4);
    birdGroup.add(thrusterL);
    birdGroup.add(thrusterR);

    // Thruster Core Plasma Lights
    const flameGeo = new THREE.ConeGeometry(0.18, 1.4, 8);
    flameGeo.rotateX(-Math.PI / 2);
    flameGeo.translate(0, 0, -0.7);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const flameL = new THREE.Mesh(flameGeo, flameMat);
    flameL.position.set(-0.35, 0, -1.6);
    const flameR = new THREE.Mesh(flameGeo, flameMat);
    flameR.position.set(0.35, 0, -1.6);
    birdGroup.add(flameL);
    birdGroup.add(flameR);

    // --- 4. SPEED LINES & PARTICLES SYSTEM ---
    const particleCount = quality === 'HIGH' ? 800 : 350;
    const speedLineGeo = new THREE.BufferGeometry();
    const speedPos = new Float32Array(particleCount * 3);
    const speedVel = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      speedPos[i * 3] = (Math.random() - 0.5) * 40;
      speedPos[i * 3 + 1] = (Math.random() - 0.5) * 60;
      speedPos[i * 3 + 2] = (Math.random() - 0.5) * 40;
      speedVel[i] = 1.0 + Math.random() * 2.0;
    }
    speedLineGeo.setAttribute('position', new THREE.BufferAttribute(speedPos, 3));

    const speedLineMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.18,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });
    const speedLines = new THREE.Points(speedLineGeo, speedLineMat);
    scene.add(speedLines);

    // Rain Particles for Storm Stages
    const rainCount = quality === 'HIGH' ? 1200 : 400;
    const rainGeo = new THREE.BufferGeometry();
    const rainPos = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rainPos[i * 3] = (Math.random() - 0.5) * 35;
      rainPos[i * 3 + 1] = Math.random() * 40;
      rainPos[i * 3 + 2] = (Math.random() - 0.5) * 35;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 0.22,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending
    });
    const rainParticles = new THREE.Points(rainGeo, rainMat);
    scene.add(rainParticles);

    // Stars / Cosmic Dust
    const starCount = quality === 'HIGH' ? 1500 : 500;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 120;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 120;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 120;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.25,
      transparent: true,
      opacity: 0.1
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // --- 5. VOLUMETRIC CLOUDS ---
    const cloudsGroup = new THREE.Group();
    scene.add(cloudsGroup);

    const cloudGeo = new THREE.DodecahedronGeometry(2.5, 1);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      transparent: true,
      opacity: 0.35,
      flatShading: true
    });

    const cloudMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < 20; i++) {
      const cloud = new THREE.Mesh(cloudGeo, cloudMat);
      cloud.position.set(
        (Math.random() - 0.5) * 50,
        (Math.random() - 0.5) * 60,
        -10 - Math.random() * 20
      );
      const scale = 1.0 + Math.random() * 2.5;
      cloud.scale.set(scale * 1.8, scale * 0.8, scale * 1.2);
      cloudsGroup.add(cloud);
      cloudMeshes.push(cloud);
    }

    // --- 6. AIRCRAFT & EXPLODING DEBRIS SYSTEM ---
    const aircraftGroup = new THREE.Group();
    scene.add(aircraftGroup);

    // Supersonic Fighter Jet
    const jetBodyGeo = new THREE.ConeGeometry(0.8, 5.0, 6);
    jetBodyGeo.rotateX(Math.PI / 2);
    const jetMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.9,
      roughness: 0.2
    });
    const jetMesh = new THREE.Mesh(jetBodyGeo, jetMat);

    const jetWingGeo = new THREE.BoxGeometry(4.2, 0.1, 1.8);
    const jetWings = new THREE.Mesh(jetWingGeo, jetMat);
    jetMesh.add(jetWings);
    aircraftGroup.add(jetMesh);
    aircraftGroup.position.set(-60, 15, -15);
    aircraftGroup.visible = false;

    // Exploding Metallic Debris Fragments
    const debrisGroup = new THREE.Group();
    scene.add(debrisGroup);

    const debrisPieces: { mesh: THREE.Mesh; rotSpeed: THREE.Vector3; velocity: THREE.Vector3 }[] = [];
    const debrisMats = [
      new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0xea580c, emissiveIntensity: 1.2 }),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 })
    ];

    for (let i = 0; i < 18; i++) {
      const dGeo = new THREE.TetrahedronGeometry(0.4 + Math.random() * 0.6);
      const dMesh = new THREE.Mesh(dGeo, debrisMats[i % debrisMats.length]);
      dMesh.visible = false;
      debrisGroup.add(dMesh);
      debrisPieces.push({
        mesh: dMesh,
        rotSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 6
        ),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 12,
          -4 - Math.random() * 8,
          (Math.random() - 0.5) * 12
        )
      });
    }

    // --- 7. ANIMATION STATE & LOOP ---
    let animationFrameId: number;
    let clock = new THREE.Clock();
    let flightY = 0;
    let cameraShakeIntensity = 0;
    let jetSpawnTimer = 0;
    let lightningTimer = 0;
    let isFlapPeak = false; // Prevents audio thrashing across consecutive frames
    let lastStatus: GameRoundStatus = status;

    // Frame-rate independent exponential dampening helper
    // Guarantees identical smooth motion at 30, 60, 120, 144+ FPS
    const damp = (current: number, target: number, lambda: number, delta: number): number => {
      return current + (target - current) * (1 - Math.exp(-lambda * delta));
    };

    const tempFogColor = new THREE.Color();
    const tempBgColor = new THREE.Color();

    const resetRoundScene = () => {
      flightY = 0;
      cameraShakeIntensity = 0;
      jetSpawnTimer = 0;
      lightningTimer = 0;
      isFlapPeak = false;

      // Reset bird transform immediately to origin (prevents camera plunging into black fog)
      birdGroup.position.set(0, 0, 0);
      birdGroup.rotation.set(0, 0, 0);
      leftWingGroup.rotation.set(0, 0, 0);
      rightWingGroup.rotation.set(0, 0, 0);

      // Reset camera
      camera.position.set(0, 3, 12);
      camera.fov = 55;
      camera.updateProjectionMatrix();

      // Reset thruster flames
      flameL.scale.set(0.6, 0.6, 0.6);
      flameR.scale.set(0.6, 0.6, 0.6);
      flameMat.color.setHex(0x06b6d4);

      // Hide exploding debris and extra jet aircraft
      debrisPieces.forEach((p) => {
        p.mesh.visible = false;
      });
      aircraftGroup.visible = false;

      // Immediately reset sky and fog to Stage 1 (Blue Sky)
      const skyFogColor = new THREE.Color(0x0c4a6e);
      const skyBgColor = new THREE.Color(0x075985);
      if (scene.fog) {
        scene.fog.color.copy(skyFogColor);
      }
      scene.background = skyBgColor;
      ambientLight.color.setHex(0x38bdf8);
      sunLight.color.setHex(0x38bdf8);
      rainMat.opacity = 0;
      starMat.opacity = 0.1;
    };

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      try {
        // Cap delta at 50ms (0.05s) to eliminate huge position jumps/teleports on tab switch
        const delta = Math.min(clock.getDelta(), 0.05);
        const elapsedTime = clock.getElapsedTime();
        const { status: curStatus, multiplier: curMult, altitudeStage: curStage } = stateRef.current;

        // Reset scene state immediately whenever transitioning to a new round (prevents black screen lerp bug)
        if (curStatus !== lastStatus) {
          if (curStatus === 'COUNTDOWN' || curStatus === 'WAITING' || (lastStatus === 'CRASHED' && curStatus === 'RUNNING')) {
            resetRoundScene();
          }
          lastStatus = curStatus;
        }

        // 1. Flight Speed & Velocity scaling
        let flightSpeed = 0.5;
        if (curStatus === 'RUNNING') {
          flightSpeed = 1.0 + Math.min(curMult * 0.8, 25.0);
        } else if (curStatus === 'CRASHED') {
          flightSpeed = 0.1;
        }

        flightY += flightSpeed * delta;

        // 2. Bird Dynamics, Flap & Continuous 3D Ascent Trajectory
        if (curStatus === 'RUNNING') {
          const flapRate = 12 + Math.min(curMult * 2, 28);
          const flapAngle = Math.sin(elapsedTime * flapRate) * 0.45;
          leftWingGroup.rotation.z = flapAngle;
          rightWingGroup.rotation.z = -flapAngle;

          // Trigger wing flap sound EXACTLY ONCE per flap stroke peak (prevents CPU audio thrashing)
          if (flapAngle > 0.35) {
            if (!isFlapPeak) {
              isFlapPeak = true;
              const flapInterval = Math.max(160, 340 - curMult * 8);
              try { audioManager.playBirdFlap(flapInterval); } catch {}
            }
          } else if (flapAngle < 0.1) {
            isFlapPeak = false;
          }

          // Smooth 3D Ascent Trajectory & Aerodynamic Pitch/Roll
          const targetBank = Math.sin(elapsedTime * 1.4) * 0.12;
          const targetPitch = -0.12 - Math.min((curMult - 1) * 0.03, 0.35);
          const targetY = Math.sin(elapsedTime * 1.8) * 0.25 + Math.min((curMult - 1) * 0.12, 2.2);
          const targetX = Math.sin(elapsedTime * 1.1) * 0.3;

          // Exponential dampening for buttery 60-120fps motion
          birdGroup.rotation.z = damp(birdGroup.rotation.z, targetBank, 8, delta);
          birdGroup.rotation.x = damp(birdGroup.rotation.x, targetPitch, 8, delta);
          birdGroup.rotation.y = damp(birdGroup.rotation.y, 0, 8, delta);
          birdGroup.position.y = damp(birdGroup.position.y, targetY, 6, delta);
          birdGroup.position.x = damp(birdGroup.position.x, targetX, 6, delta);

          // Plasma Thruster Flame Reactivity (Smoothed)
          const flameScale = 1.0 + Math.min(curMult * 0.12, 2.5);
          flameL.scale.z = damp(flameL.scale.z, flameScale, 10, delta);
          flameR.scale.z = damp(flameR.scale.z, flameScale, 10, delta);

          // Color shift in space
          if (curStage === 'STAGE_6_COSMIC_SPACE') {
            flameMat.color.setHex(0xd946ef); // Magenta plasma
          } else if (curStage === 'STAGE_5_MESOSPHERE') {
            flameMat.color.setHex(0x38bdf8); // Cyan
          } else {
            flameMat.color.setHex(0x06b6d4);
          }
        } else if (curStatus === 'CRASHED') {
          isFlapPeak = false;
          // Crash explosion, intense tumble, camera shockwave & debris launch
          if (birdGroup.position.y > -20) {
            birdGroup.rotation.x += delta * 12;
            birdGroup.rotation.y += delta * 15;
            birdGroup.rotation.z += delta * 8;
            birdGroup.position.y -= delta * 14;
            birdGroup.position.x += Math.sin(elapsedTime * 20) * 0.3;
          }
          
          // Extinguish plasma thrusters on crash
          flameL.scale.set(0.01, 0.01, 0.01);
          flameR.scale.set(0.01, 0.01, 0.01);

          // Trigger crash shockwave explosion & debris shower once on crash
          if (cameraShakeIntensity < 0.8) {
            cameraShakeIntensity = 1.6;
            debrisPieces.forEach((p) => {
              p.mesh.visible = true;
              p.mesh.position.copy(birdGroup.position);
              p.velocity.set(
                (Math.random() - 0.5) * 22,
                (Math.random() - 0.5) * 18,
                (Math.random() - 0.5) * 22
              );
            });
          }
        } else {
          // Idle gentle hover (COUNTDOWN or WAITING)
          isFlapPeak = false;
          leftWingGroup.rotation.z = Math.sin(elapsedTime * 4) * 0.2;
          rightWingGroup.rotation.z = -Math.sin(elapsedTime * 4) * 0.2;
          birdGroup.position.set(0, Math.sin(elapsedTime * 2) * 0.2, 0);
          birdGroup.rotation.set(0, 0, 0);
          cameraShakeIntensity = 0;
          flameL.scale.set(0.6, 0.6, 0.6);
          flameR.scale.set(0.6, 0.6, 0.6);
        }

        // 3. Sky & Atmosphere Transitions based on Altitude Stage
        // Force STAGE_1_BLUE_SKY during COUNTDOWN & WAITING so initial sky is always bright blue
        const effectiveStage = (curStatus === 'COUNTDOWN' || curStatus === 'WAITING') ? 'STAGE_1_BLUE_SKY' : curStage;

        let targetFogColor = 0x0c4a6e;
        let targetBgColor = 0x075985;
        let rainAlpha = 0;
        let starsAlpha = 0.1;

        switch (effectiveStage) {
          case 'STAGE_1_BLUE_SKY':
            targetFogColor = 0x0c4a6e;
            targetBgColor = 0x075985;
            ambientLight.color.setHex(0x38bdf8);
            sunLight.color.setHex(0x38bdf8);
            break;
          case 'STAGE_2_HIGH_CLOUDS':
            targetFogColor = 0x0e3a63;
            targetBgColor = 0x0f2c4a;
            ambientLight.color.setHex(0x67e8f9);
            break;
          case 'STAGE_3_RAIN_LIGHTNING':
            targetFogColor = 0x091424;
            targetBgColor = 0x050c18;
            rainAlpha = 0.75;
            ambientLight.color.setHex(0x1e3a8a);
            break;
          case 'STAGE_4_STORM_DEBRIS':
            targetFogColor = 0x110e24;
            targetBgColor = 0x090514;
            rainAlpha = 0.9;
            ambientLight.color.setHex(0x4c1d95);
            break;
          case 'STAGE_5_MESOSPHERE':
            targetFogColor = 0x060614;
            targetBgColor = 0x02020a;
            starsAlpha = 0.7;
            ambientLight.color.setHex(0x6366f1);
            break;
          case 'STAGE_6_COSMIC_SPACE':
            targetFogColor = 0x020108;
            targetBgColor = 0x000000;
            starsAlpha = 1.0;
            ambientLight.color.setHex(0xa855f7);
            break;
        }

        if (scene.fog) {
          tempFogColor.setHex(targetFogColor);
          scene.fog.color.lerp(tempFogColor, damp(0, 1, 3, delta));
        }
        tempBgColor.setHex(targetBgColor);
        scene.background = tempBgColor;

        rainMat.opacity = damp(rainMat.opacity, rainAlpha, 3, delta);
        starMat.opacity = damp(starMat.opacity, starsAlpha, 3, delta);

        // 4. Lightning Flares in Storm Stages
        if (curStage === 'STAGE_3_RAIN_LIGHTNING' || curStage === 'STAGE_4_STORM_DEBRIS') {
          lightningTimer -= delta;
          if (lightningTimer <= 0) {
            lightningLight.intensity = 8.0;
            lightningLight.position.set((Math.random() - 0.5) * 40, 20 + Math.random() * 20, -10);
            cameraShakeIntensity = Math.max(cameraShakeIntensity, 0.4);
            lightningTimer = 2.0 + Math.random() * 3.5;
            try { audioManager.playThunder(); } catch {}
          } else {
            lightningLight.intensity = damp(lightningLight.intensity, 0, 8, delta);
          }
        } else {
          lightningLight.intensity = 0;
        }

        // 5. Aircraft Flyby & Explosion Debris in Storm / High Altitude
        if (curStatus === 'RUNNING' && (curStage === 'STAGE_4_STORM_DEBRIS' || curMult >= 4.5)) {
          jetSpawnTimer -= delta;
          if (jetSpawnTimer <= 0 && !aircraftGroup.visible) {
            aircraftGroup.visible = true;
            aircraftGroup.position.set(40, 5 + Math.random() * 10, -12);
            aircraftGroup.rotation.y = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
            jetSpawnTimer = 4.0 + Math.random() * 5.0;
          }

          if (aircraftGroup.visible) {
            aircraftGroup.position.x -= delta * 45;
            // Mid-air explosion trigger near center
            if (aircraftGroup.position.x < 5 && aircraftGroup.position.x > -5) {
              aircraftGroup.visible = false;
              cameraShakeIntensity = 0.8;
              try { audioManager.playAircraftExplosion(); } catch {}

              // Spawn debris shower
              debrisPieces.forEach((p) => {
                p.mesh.visible = true;
                p.mesh.position.copy(aircraftGroup.position);
                p.velocity.set(
                  (Math.random() - 0.5) * 16,
                  -5 - Math.random() * 10,
                  (Math.random() - 0.5) * 16
                );
              });
            }
          }
        }

        // Animate Debris Pieces
        debrisPieces.forEach((p) => {
          if (p.mesh.visible) {
            p.mesh.position.addScaledVector(p.velocity, delta);
            p.mesh.rotation.x += p.rotSpeed.x * delta;
            p.mesh.rotation.y += p.rotSpeed.y * delta;
            if (p.mesh.position.y < -30) {
              p.mesh.visible = false;
            }
          }
        });

        // 6. Speed lines & Stars Drift
        const speedPositions = speedLineGeo.attributes.position.array as Float32Array;
        for (let i = 0; i < particleCount; i++) {
          speedPositions[i * 3 + 1] -= speedVel[i] * flightSpeed * delta * 8;
          if (speedPositions[i * 3 + 1] < -30) {
            speedPositions[i * 3 + 1] = 30;
            speedPositions[i * 3] = (Math.random() - 0.5) * 40;
            speedPositions[i * 3 + 2] = (Math.random() - 0.5) * 40;
          }
        }
        speedLineGeo.attributes.position.needsUpdate = true;

        // 7. Clouds Vertical Scrolling
        cloudMeshes.forEach((cloud) => {
          cloud.position.y -= flightSpeed * delta * 2.5;
          if (cloud.position.y < -35) {
            cloud.position.y = 35;
            cloud.position.x = (Math.random() - 0.5) * 50;
          }
        });

        // 8. Dynamic Camera Tracking & Speed FOV (Dampened for 60-120fps)
        if (curStatus === 'RUNNING') {
          const targetFov = 55 + Math.min(curMult * 1.5, 20);
          camera.fov = damp(camera.fov, targetFov, 3, delta);
          camera.updateProjectionMatrix();

          // Camera follow & shake
          let shakeX = 0, shakeY = 0;
          if (cameraShakeIntensity > 0) {
            shakeX = (Math.random() - 0.5) * cameraShakeIntensity;
            shakeY = (Math.random() - 0.5) * cameraShakeIntensity;
            cameraShakeIntensity = Math.max(0, cameraShakeIntensity - delta * 2.0);
          }

          camera.position.x = damp(camera.position.x, shakeX + Math.sin(elapsedTime) * 0.3, 5, delta);
          camera.position.y = damp(camera.position.y, 3 + birdGroup.position.y * 0.4 + shakeY, 5, delta);
        } else {
          camera.fov = damp(camera.fov, 55, 3, delta);
          camera.updateProjectionMatrix();
          camera.position.set(0, 3, 12);
        }

        if (renderer) {
          renderer.render(scene, camera);
        } else if (fallbackCtx && fallback2dCanvas) {
          // Lightweight 2D canvas fallback for ultra-low WebGL mobile hardware
          const ctx = fallbackCtx;
          const cw = fallback2dCanvas.width;
          const ch = fallback2dCanvas.height;

          ctx.fillStyle = '#050c18';
          ctx.fillRect(0, 0, cw, ch);

          // Flight Sky Gradient
          const grad = ctx.createLinearGradient(0, 0, 0, ch);
          grad.addColorStop(0, curStage === 'STAGE_6_COSMIC_SPACE' ? '#020108' : '#0369a1');
          grad.addColorStop(1, '#05070d');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, cw, ch);

          // Draw 2D Cyber Jet icon flying upwards
          ctx.save();
          const planeX = cw * 0.4 + Math.sin(elapsedTime * 2) * 15;
          const planeY = curStatus === 'RUNNING' 
            ? Math.max(ch * 0.2, ch * 0.65 - Math.min((curMult - 1) * 30, ch * 0.4))
            : ch * 0.6 + Math.sin(elapsedTime * 3) * 8;

          ctx.translate(planeX, planeY);
          if (curStatus === 'RUNNING') {
            ctx.rotate(-0.2);
          } else if (curStatus === 'CRASHED') {
            ctx.rotate(elapsedTime * 6);
          }

          // Jet Body
          ctx.fillStyle = '#00f7ff';
          ctx.beginPath();
          ctx.moveTo(30, 0);
          ctx.lineTo(-20, -15);
          ctx.lineTo(-10, 0);
          ctx.lineTo(-20, 15);
          ctx.closePath();
          ctx.fill();

          // Thruster Flame
          if (curStatus === 'RUNNING') {
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.moveTo(-10, 0);
            ctx.lineTo(-35 - Math.random() * 15, -6);
            ctx.lineTo(-35 - Math.random() * 15, 6);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }
      } catch (renderError) {
        console.warn('[SkybirdCanvas] Game render loop warning:', renderError);
      }
    };

    animate();

    // --- 8. RESIZE HANDLER ---
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth > 0 ? container.clientWidth : window.innerWidth;
      const h = container.clientHeight > 0 ? container.clientHeight : window.innerHeight;
      if (h > 0 && w > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        if (renderer) {
          renderer.setSize(w, h);
        }
        if (fallback2dCanvas) {
          fallback2dCanvas.width = w;
          fallback2dCanvas.height = h;
        }
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      if (renderer) {
        renderer.dispose();
      }
      scene.clear();
    };
  }, [quality]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden select-none bg-[#05070D]"
    />
  );
});

SkybirdCanvas.displayName = 'SkybirdCanvas';

