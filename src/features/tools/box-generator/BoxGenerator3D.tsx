import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { Download } from 'lucide-react';
import { boxModelLabels, buildBoxPanels, buildPanelOutline, formatBoxLength, getBoxPanelThicknessMm, resolveBoxDimensions, type BoxPanel, type BoxPanelArtwork, type BoxProject } from './boxModel';

interface BoxGenerator3DProps {
  project: BoxProject;
  resetToken: number;
  explosion?: number;
  /** 0 starts with all panels separated; 1 completes the assembly sequence. */
  assemblyProgress?: number;
  onPanelSelect?: (panelId: BoxPanel['id']) => void;
}

const assemblyOrder: BoxPanel['id'][] = ['base', 'back', 'left', 'right', 'front', 'lid'];

function clamp01(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function easeInOut(value: number) {
  return value * value * (3 - 2 * value);
}

function createStudioEnvironment(preset: BoxProject['lightingPreset']) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (context) {
    const tones = preset === 'warm'
      ? { sky: '#54483a', center: '#f5d9a6', floor: '#6b5942', softbox: '#fff0cc' }
      : preset === 'cool'
        ? { sky: '#39485e', center: '#dbe8ff', floor: '#46566f', softbox: '#f2f8ff' }
        : { sky: '#434958', center: '#f2eadb', floor: '#626c7d', softbox: '#fffaf0' };
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, tones.sky);
    gradient.addColorStop(0.48, tones.center);
    gradient.addColorStop(1, tones.floor);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (const [x, y, radius] of [[0.18, 0.28, 0.19], [0.79, 0.34, 0.24], [0.5, 0.12, 0.14]] as const) {
      const halo = context.createRadialGradient(x * canvas.width, y * canvas.height, 0, x * canvas.width, y * canvas.height, radius * canvas.width);
      halo.addColorStop(0, `${tones.softbox}b8`);
      halo.addColorStop(0.28, `${tones.softbox}55`);
      halo.addColorStop(1, `${tones.softbox}00`);
      context.fillStyle = halo;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface SceneRuntime {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  boxGroup: THREE.Group;
  host: HTMLDivElement;
  resizeObserver: ResizeObserver;
  environmentTexture: THREE.CanvasTexture;
  scheduleFrame: () => void;
  setSize: () => void;
}

interface XRSelectEventTarget {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

const panelArtworkState = new WeakMap<THREE.Object3D, { image: HTMLImageElement; ready: Promise<void>; finish: () => void }>();

function addPanel(
  group: THREE.Group,
  panel: BoxPanel,
  project: BoxProject,
  position: [number, number, number],
  rotation: [number, number, number],
  artwork: BoxPanelArtwork | undefined,
  scheduleFrame: () => void,
) {
  // The cut path is the source for both the exported 2D panel and its 3D preview.
  const points = buildPanelOutline(panel, project);
  const shape = new THREE.Shape();
  points.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, point.y);
    else shape.lineTo(point.x, point.y);
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: panel.thicknessMm, steps: 1, bevelEnabled: false });
  const faceColor = new THREE.Color(project.previewColor);
  const mesh = new THREE.Mesh(geometry, [
    new THREE.MeshStandardMaterial({ color: faceColor, roughness: 0.76, metalness: 0.015, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: faceColor.clone().multiplyScalar(0.72), roughness: 0.82, metalness: 0.015 }),
  ]);
  const part = new THREE.Group();
  part.name = panel.id;
  part.userData.panelId = panel.id;
  part.position.set(...position);
  part.userData.basePosition = part.position.clone();
  part.userData.explosionDirection = new THREE.Vector3(...panel.assembly.explosionDirection);
  part.rotation.set(...rotation);
  part.add(mesh);
  if (artwork) {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const width = Math.max(...xs) - minX;
    const height = Math.max(...ys) - minY;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const overlay = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
    );
    overlay.position.set(minX + width / 2, minY + height / 2, panel.thicknessMm + 0.02);
    overlay.userData.isPanelArtwork = true;
    part.add(overlay);
    const image = new Image();
    let finishArtworkLoad = () => {};
    const artworkReady = new Promise<void>((resolve) => {
      finishArtworkLoad = resolve;
      image.onload = () => {
        const context = canvas.getContext('2d');
        if (context) {
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.beginPath();
          points.forEach((point, index) => {
            const x = ((point.x - minX) / width) * canvas.width;
            const y = ((point.y - minY) / height) * canvas.height;
            if (index === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          });
          context.closePath();
          context.clip();
          context.drawImage(image, artwork.x * canvas.width, artwork.y * canvas.height, artwork.width * canvas.width, artwork.height * canvas.height);
          texture.needsUpdate = true;
          scheduleFrame();
        }
        resolve();
      };
      image.onerror = () => resolve();
    });
    panelArtworkState.set(overlay, { image, ready: artworkReady, finish: finishArtworkLoad });
    image.src = artwork.dataUrl;
  }
  part.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: '#292117', transparent: true, opacity: 0.72 }),
  ));
  group.add(part);
}

function disposePanelObjects(group: THREE.Group) {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
    object.traverse((child) => {
      const artworkState = panelArtworkState.get(child);
      if (artworkState) {
        artworkState.image.onload = null;
        artworkState.image.onerror = null;
        artworkState.image.src = '';
        artworkState.finish();
        panelArtworkState.delete(child);
      }
    });
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose();
      material.dispose();
    });
  });
}

export function BoxGenerator3D({ project, resetToken, explosion = 0, assemblyProgress, onPanelSelect }: BoxGenerator3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const arOverlayRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<SceneRuntime | null>(null);
  const arStartRef = useRef<(() => Promise<void>) | null>(null);
  const activeSessionRef = useRef<XRSession | null>(null);
  const previousScaleRef = useRef<number | null>(null);
  const previousResetTokenRef = useRef(resetToken);
  const [renderError, setRenderError] = useState('');
  const [arNotice, setArNotice] = useState('');
  const [arAvailability, setArAvailability] = useState<'checking' | 'supported' | 'unsupported'>('checking');
  const [arSessionActive, setArSessionActive] = useState(false);
  const onPanelSelectRef = useRef(onPanelSelect);
  onPanelSelectRef.current = onPanelSelect;

  const exportArModel = async () => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    setArNotice('');
    try {
      const ready: Promise<void>[] = [];
      runtime.boxGroup.traverse((object) => {
        const imageReady = panelArtworkState.get(object)?.ready;
        if (imageReady) ready.push(imageReady);
      });
      await Promise.all(ready);
      const model = new THREE.Group();
      runtime.boxGroup.children.forEach((part) => {
        const clone = part.clone(true);
        clone.traverse((object) => {
          delete object.userData.basePosition;
          delete object.userData.panelId;
        });
        const basePosition = part.userData.basePosition as THREE.Vector3 | undefined;
        if (basePosition) clone.position.copy(basePosition);
        model.add(clone);
      });
      model.scale.setScalar(0.001);
      const safeTitle = project.title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'caja';
      new GLTFExporter().parse(model, (result) => {
        if (!(result instanceof ArrayBuffer)) {
          setRenderError('No se pudo preparar el archivo GLB.');
          return;
        }
        const url = URL.createObjectURL(new Blob([result], { type: 'model/gltf-binary' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `${safeTitle}-ar-1-1.glb`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setArNotice('Modelo GLB listo a escala real; ábrelo en un visor compatible con AR.');
      }, (error) => {
        setRenderError(error instanceof Error ? error.message : 'No se pudo exportar el modelo 3D.');
      }, { binary: true, onlyVisible: true });
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : 'No se pudo preparar el modelo para exportarlo.');
    }
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let frame = 0;
    let disposed = false;
    let resizeObserver: ResizeObserver;
    let renderer: THREE.WebGLRenderer;
    let controls: OrbitControls;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let boxGroup: THREE.Group;
    let grid: THREE.GridHelper;
    let reticle: THREE.Group;
    let controller: THREE.Group;
    let hitTestSource: XRHitTestSource | null = null;
    let sessionEndHandler: (() => void) | null = null;
    let originalBoxPosition: THREE.Vector3 | null = null;
    let originalBoxQuaternion: THREE.Quaternion | null = null;
    let originalBoxScale: THREE.Vector3 | null = null;
    let originalBoxVisible = true;
    let originalGridVisible = true;
    let originalControlsEnabled = true;
    let originalCameraNear = 0.1;
    let originalCameraFar = 8000;
    let wasPlaced = false;
    let selectPanel: ((event: MouseEvent) => void) | undefined;
    let placeBoxAtReticle: (() => void) | null = null;
    let exitSession: (session: XRSession) => Promise<void> = async () => {};
    let runtimeDisposed = false;

    const disposeScene = () => {
      if (runtimeDisposed) return;
      runtimeDisposed = true;
      runtimeRef.current?.resizeObserver.disconnect();
      runtimeRef.current?.controls.removeEventListener('change', runtimeRef.current.scheduleFrame);
      if (selectPanel) runtimeRef.current?.renderer.domElement.removeEventListener('dblclick', selectPanel);
      if (controller && placeBoxAtReticle) (controller as unknown as XRSelectEventTarget).removeEventListener('select', placeBoxAtReticle as EventListener);
      runtimeRef.current?.controls.dispose();
      if (runtimeRef.current) disposePanelObjects(runtimeRef.current.boxGroup);
      reticle?.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => material.dispose());
        }
      });
      runtimeRef.current?.environmentTexture.dispose();
      runtimeRef.current?.renderer.dispose();
      runtimeRef.current?.renderer.domElement.remove();
      runtimeRef.current = null;
      arStartRef.current = null;
    };

    try {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(34, 1, 0.1, 8000);
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.className = 'box-generator__canvas';
      host.appendChild(renderer.domElement);

      const environmentTexture = createStudioEnvironment(project.lightingPreset);
      scene.environment = environmentTexture;
      scene.environmentIntensity = 0.65;

      const ambientLight = new THREE.HemisphereLight('#fff7e6', '#6c7487', 2.2);
      ambientLight.name = 'box-ambient-light';
      scene.add(ambientLight);
      const keyLight = new THREE.DirectionalLight('#fff5d9', 3.0);
      keyLight.name = 'box-key-light';
      keyLight.position.set(-220, 340, 270);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight('#a8c8ff', 1.15);
      fillLight.name = 'box-fill-light';
      fillLight.position.set(230, 120, -260);
      scene.add(fillLight);
      grid = new THREE.GridHelper(1200, 40, '#536078', '#30394e');
      grid.position.y = -0.8;
      const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
      gridMaterials.forEach((material) => {
        material.transparent = true;
        material.opacity = 0.22;
      });
      scene.add(grid);
      boxGroup = new THREE.Group();
      scene.add(boxGroup);
      reticle = new THREE.Group();
      reticle.name = 'box-ar-hit-test-reticle';
      reticle.matrixAutoUpdate = false;
      reticle.visible = false;
      reticle.add(new THREE.Mesh(
        new THREE.RingGeometry(0.10, 0.14, 32),
        new THREE.MeshBasicMaterial({ color: '#8ce6d5', side: THREE.DoubleSide, transparent: true, opacity: 0.95 }),
      ));
      reticle.children[0].rotation.x = -Math.PI / 2;
      scene.add(reticle);
      controller = renderer.xr.getController(0);
      scene.add(controller);

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = !reducedMotion;
      controls.dampingFactor = 0.09;
      controls.enablePan = true;
      controls.minPolarAngle = 0.15;
      controls.maxPolarAngle = Math.PI * 0.48;

      const render = () => {
        if (!disposed && !renderer.xr.isPresenting) renderer.render(scene, camera);
      };
      const scheduleFrame = () => {
        if (!disposed && !renderer.xr.isPresenting && frame === 0) frame = window.requestAnimationFrame(animate);
      };
      const animate = () => {
        frame = 0;
        if (disposed || renderer.xr.isPresenting) return;
        const moving = controls.update();
        render();
        if (moving) scheduleFrame();
      };
      controls.addEventListener('change', scheduleFrame);
      selectPanel = (event: MouseEvent) => {
        const bounds = renderer.domElement.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0) return;
        const pointer = new THREE.Vector2(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(boxGroup.children, true).find((intersection) => {
          let current: THREE.Object3D | null = intersection.object;
          while (current && current !== boxGroup) {
            if (current.userData.panelId) return true;
            current = current.parent;
          }
          return false;
        });
        if (!hit) return;
        let current: THREE.Object3D | null = hit.object;
        while (current && current !== boxGroup) {
          const panelId = current.userData.panelId as BoxPanel['id'] | undefined;
          if (panelId) { onPanelSelectRef.current?.(panelId); return; }
          current = current.parent;
        }
      };
      renderer.domElement.addEventListener('dblclick', selectPanel);

      const setSize = () => {
        if (disposed || renderer.xr.isPresenting) return;
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        render();
      };
      resizeObserver = new ResizeObserver(setSize);
      resizeObserver.observe(host);
      runtimeRef.current = { scene, camera, renderer, controls, boxGroup, host, resizeObserver, environmentTexture, scheduleFrame, setSize };
      placeBoxAtReticle = () => {
        if (wasPlaced || !reticle.visible || !boxGroup) return;
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        reticle.matrix.decompose(position, quaternion, new THREE.Vector3());
        boxGroup.position.copy(position);
        boxGroup.quaternion.copy(quaternion);
        boxGroup.visible = true;
        reticle.visible = false;
        wasPlaced = true;
        if (!disposed) setArNotice('Caja colocada a escala real. Usa el control del navegador para cerrar la sesión AR.');
      };
      (controller as unknown as XRSelectEventTarget).addEventListener('select', placeBoxAtReticle as EventListener);

      exitSession = async (session: XRSession) => {
        if (sessionEndHandler) session.removeEventListener('end', sessionEndHandler);
        sessionEndHandler = null;
        if (activeSessionRef.current === session) activeSessionRef.current = null;
        hitTestSource?.cancel();
        hitTestSource = null;
        renderer.setAnimationLoop(null);
        renderer.xr.enabled = false;
        controls.enabled = originalControlsEnabled;
        grid.visible = originalGridVisible;
        reticle.visible = false;
        if (originalBoxPosition) boxGroup.position.copy(originalBoxPosition);
        if (originalBoxQuaternion) boxGroup.quaternion.copy(originalBoxQuaternion);
        if (originalBoxScale) boxGroup.scale.copy(originalBoxScale);
        boxGroup.visible = originalBoxVisible;
        camera.near = originalCameraNear;
        camera.far = originalCameraFar;
        camera.updateProjectionMatrix();
        if (!disposed) {
          setArSessionActive(false);
          runtimeRef.current?.setSize();
          runtimeRef.current?.scheduleFrame();
        }
      };

      arStartRef.current = async () => {
        const xr = navigator.xr;
        const overlay = arOverlayRef.current;
        if (!window.isSecureContext || !xr || !overlay) {
          setArNotice('AR requiere una conexión HTTPS segura y un navegador compatible. Puedes descargar el GLB.');
          return;
        }
        if (activeSessionRef.current) return;
        setRenderError('');
        setArNotice('Solicitando acceso a la cámara y sensores…');
        try {
          // requestSession is called directly from the user's button gesture.
          const session = await xr.requestSession('immersive-ar', {
            requiredFeatures: ['hit-test'],
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: overlay },
          });
          activeSessionRef.current = session;
          originalBoxPosition = boxGroup.position.clone();
          originalBoxQuaternion = boxGroup.quaternion.clone();
          originalBoxScale = boxGroup.scale.clone();
          originalBoxVisible = boxGroup.visible;
          originalGridVisible = grid.visible;
          originalControlsEnabled = controls.enabled;
          originalCameraNear = camera.near;
          originalCameraFar = camera.far;
          wasPlaced = false;
          boxGroup.children.forEach((part) => {
            const basePosition = part.userData.basePosition as THREE.Vector3 | undefined;
            if (basePosition) part.position.copy(basePosition);
          });
          boxGroup.scale.setScalar(0.001);
          boxGroup.visible = false;
          controls.enabled = false;
          grid.visible = false;
          camera.near = 0.01;
          camera.far = 100;
          camera.updateProjectionMatrix();
          renderer.xr.enabled = true;
          renderer.xr.setReferenceSpaceType('local');
          sessionEndHandler = () => { void exitSession(session); };
          session.addEventListener('end', sessionEndHandler, { once: true });
          await renderer.xr.setSession(session);
          const viewerSpace = await session.requestReferenceSpace('viewer');
          hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
          if (activeSessionRef.current !== session) {
            hitTestSource.cancel();
            hitTestSource = null;
            return;
          }
          renderer.setAnimationLoop((_time, xrFrame) => {
            if (xrFrame && hitTestSource) {
              const referenceSpace = renderer.xr.getReferenceSpace();
              const hit = referenceSpace ? xrFrame.getHitTestResults(hitTestSource)[0] : undefined;
              const pose = hit && referenceSpace ? hit.getPose(referenceSpace) : null;
              if (pose) {
                reticle.matrix.fromArray(pose.transform.matrix);
                reticle.matrixWorldNeedsUpdate = true;
                reticle.visible = !wasPlaced;
              } else if (!wasPlaced) {
                reticle.visible = false;
              }
            }
            renderer.render(scene, camera);
          });
          setArSessionActive(true);
          setArNotice('Mueve el teléfono para encontrar una superficie y toca la pantalla para colocar la caja a escala 1:1.');
        } catch (error) {
          const session = activeSessionRef.current;
          if (session) {
            try { await session.end(); } catch { /* Session may already have ended. */ }
            if (activeSessionRef.current === session) await exitSession(session);
          } else {
            renderer.xr.enabled = false;
            setArSessionActive(false);
          }
          setArNotice(error instanceof Error ? `No se pudo iniciar AR: ${error.message}. Descarga el GLB como alternativa.` : 'No se pudo iniciar AR en este navegador. Descarga el GLB como alternativa.');
        }
      };

      const xr = navigator.xr;
      if (!window.isSecureContext || !xr) {
        setArAvailability('unsupported');
        setArNotice('AR en navegador requiere HTTPS y soporte del dispositivo; el GLB sigue disponible.');
      } else {
        void xr.isSessionSupported('immersive-ar').then((supported) => {
          if (!disposed) setArAvailability(supported ? 'supported' : 'unsupported');
        }).catch(() => { if (!disposed) setArAvailability('unsupported'); });
      }
      setRenderError('');
      setSize();
    } catch {
      setArAvailability('unsupported');
      setRenderError('No se pudo activar la vista 3D en este navegador. Puedes continuar con el plano de corte.');
    }

    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      const session = activeSessionRef.current;
      if (session) {
        session.addEventListener('end', disposeScene, { once: true });
        void session.end().catch(disposeScene);
      } else {
        disposeScene();
      }
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    const { scene, camera, controls, boxGroup } = runtime;
    const presets = {
      studio: { sky: '#fff7e6', ground: '#6c7487', key: '#fff5d9', fill: '#a8c8ff', keyPower: 3, fillPower: 1.15, environment: 0.65 },
      warm: { sky: '#fff0d0', ground: '#76563d', key: '#ffc875', fill: '#ffab7d', keyPower: 2.8, fillPower: 1.35, environment: 0.8 },
      cool: { sky: '#d9e8ff', ground: '#4a556f', key: '#e2f1ff', fill: '#7eb8ff', keyPower: 2.8, fillPower: 1.4, environment: 0.72 },
    } as const;
    const preset = presets[project.lightingPreset];
    runtime.environmentTexture.dispose();
    runtime.environmentTexture = createStudioEnvironment(project.lightingPreset);
    scene.environment = runtime.environmentTexture;
    const ambientLight = scene.getObjectByName('box-ambient-light');
    const keyLight = scene.getObjectByName('box-key-light');
    const fillLight = scene.getObjectByName('box-fill-light');
    if (ambientLight instanceof THREE.HemisphereLight) {
      ambientLight.color.set(preset.sky);
      ambientLight.groundColor.set(preset.ground);
    }
    if (keyLight instanceof THREE.DirectionalLight) { keyLight.color.set(preset.key); keyLight.intensity = preset.keyPower; }
    if (fillLight instanceof THREE.DirectionalLight) { fillLight.color.set(preset.fill); fillLight.intensity = preset.fillPower; }
    scene.environmentIntensity = preset.environment;
    disposePanelObjects(boxGroup);
    boxGroup.clear();
    const dimensions = resolveBoxDimensions(project);
    const { outside, baseWidth, baseDepth } = dimensions;
    const panelThickness = {
      front: getBoxPanelThicknessMm(project, 'front'),
      back: getBoxPanelThicknessMm(project, 'back'),
      left: getBoxPanelThicknessMm(project, 'left'),
      right: getBoxPanelThicknessMm(project, 'right'),
    };
    const insideCenterX = (panelThickness.left - panelThickness.right) / 2;
    const insideCenterZ = (panelThickness.back - panelThickness.front) / 2;
    const insideLeftX = -outside.width / 2 + panelThickness.left;
    const insideRightX = outside.width / 2 - panelThickness.right;
    const frontInsideZ = outside.depth / 2 - panelThickness.front;
    const backInsideZ = -outside.depth / 2 + panelThickness.back;
    const panels = buildBoxPanels(project);
    for (const panel of panels) {
      const [assemblyX, assemblyY, assemblyZ] = panel.assembly.positionMm;
      let position: [number, number, number] = [assemblyX + insideCenterX, assemblyY, assemblyZ + insideCenterZ];
      switch (panel.id) {
        case 'base':
          position = [insideCenterX - baseWidth / 2, assemblyY, insideCenterZ + baseDepth / 2];
          break;
        case 'front':
          position = [insideLeftX, assemblyY, frontInsideZ];
          break;
        case 'back':
          position = [insideRightX, assemblyY, backInsideZ];
          break;
        case 'left':
          position = [insideLeftX, assemblyY, assemblyZ];
          break;
        case 'right':
          position = [insideRightX, assemblyY, assemblyZ];
          break;
      }
      // Keep model-specific hinges, sliding lids, guides, and dividers from the
      // shared assembly data; translate those local placements for asymmetric walls.
      addPanel(boxGroup, panel, project, position, panel.assembly.rotationRad, project.artworkByPanel[panel.id], runtime.scheduleFrame);
    }

    if (runtime.renderer.xr.isPresenting) {
      runtime.scheduleFrame();
      return;
    }

    const scale = Math.max(outside.width, outside.height, outside.depth, 30);
    const target = new THREE.Vector3(0, outside.height / 2, 0);
    const previousScale = previousScaleRef.current;
    const shouldResetView = previousScale === null || previousResetTokenRef.current !== resetToken;
    if (shouldResetView) {
      camera.position.set(scale * 1.38, scale * 1.1, scale * 1.72);
    } else {
      const offset = camera.position.clone().sub(controls.target).multiplyScalar(scale / previousScale);
      camera.position.copy(target.clone().add(offset));
    }
    camera.near = Math.max(0.1, scale / 1500);
    camera.far = Math.max(8000, scale * 18);
    camera.updateProjectionMatrix();
    controls.target.copy(target);
    controls.minDistance = scale * 0.62;
    controls.maxDistance = scale * 6;
    controls.update();
    previousScaleRef.current = scale;
    previousResetTokenRef.current = resetToken;
    runtime.setSize();
  }, [project, resetToken]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (runtime.renderer.xr.isPresenting) return;

    const { outside } = resolveBoxDimensions(project);
    const baseScale = Math.max(outside.width, outside.height, outside.depth, 30);
    const fullSpread = baseScale * 0.42;
    const assembling = assemblyProgress !== undefined;
    const progress = assembling && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 1
      : clamp01(assemblyProgress ?? 1, 1);
    const panelCount = runtime.boxGroup.children.length;
    const stagger = panelCount > 1 ? 0.5 / (panelCount - 1) : 0;
    let largestOffset = 0;
    const presentPanelIds = runtime.boxGroup.children.map((part) => part.userData.panelId as BoxPanel['id']);
    const panelOrder = [
      ...assemblyOrder.filter((id) => presentPanelIds.includes(id)),
      ...presentPanelIds.filter((id) => !assemblyOrder.includes(id)),
    ];

    runtime.boxGroup.children.forEach((part) => {
      const panelId = part.userData.panelId as BoxPanel['id'];
      const basePosition = part.userData.basePosition as THREE.Vector3;
      const direction = part.userData.explosionDirection as THREE.Vector3 | undefined;
      if (!basePosition || !direction) return;
      const order = panelOrder.indexOf(panelId);
      const localProgress = clamp01((progress - Math.max(0, order) * stagger) / 0.5, 1);
      const offsetFactor = assembling ? 1 - easeInOut(localProgress) : clamp01(explosion, 0);
      const offset = fullSpread * offsetFactor;
      largestOffset = Math.max(largestOffset, offset);
      part.position.set(
        basePosition.x + direction.x * offset,
        basePosition.y + direction.y * offset,
        basePosition.z + direction.z * offset,
      );
    });

    const scale = baseScale + largestOffset * 2;
    const previousScale = previousScaleRef.current ?? baseScale;
    const target = new THREE.Vector3(0, outside.height / 2, 0);
    const offset = runtime.camera.position.clone().sub(runtime.controls.target).multiplyScalar(scale / previousScale);
    runtime.camera.position.copy(target.clone().add(offset));
    runtime.camera.near = Math.max(0.1, scale / 1500);
    runtime.camera.far = Math.max(8000, scale * 18);
    runtime.camera.updateProjectionMatrix();
    runtime.controls.target.copy(target);
    runtime.controls.minDistance = scale * 0.62;
    runtime.controls.maxDistance = scale * 6;
    runtime.controls.update();
    previousScaleRef.current = scale;
    runtime.setSize();
  }, [assemblyProgress, explosion, project, resetToken]);

  const resolved = resolveBoxDimensions(project);
  const stopArSession = () => {
    const session = activeSessionRef.current;
    if (session) void session.end().catch(() => setArNotice('No se pudo cerrar la sesión AR desde la página. Usa el control del navegador.'));
  };
  return (
    <div
      className="box-generator__viewer3d"
      ref={hostRef}
      role="region"
      aria-label={`Vista 3D de ${boxModelLabels[project.modelType]}, ${project.closure === 'open' ? 'abierta' : 'cerrada'}, medidas interiores ${formatBoxLength(resolved.inside.width, project.unit)} por ${formatBoxLength(resolved.inside.height, project.unit)} por ${formatBoxLength(resolved.inside.depth, project.unit)}.${assemblyProgress !== undefined && assemblyProgress < 1 ? ' Secuencia de armado en curso.' : assemblyProgress === undefined && explosion > 0.01 ? ' Piezas separadas para inspeccionar los encastres.' : ''} Arrastra para girar y usa la rueda o el gesto de pinza para acercar.`}
    >
      <div
        ref={arOverlayRef}
        style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}
        aria-label="Controles de realidad aumentada"
      >
        <button type="button" className="box-generator__ar-export" style={{ top: 12, pointerEvents: 'auto' }} onClick={exportArModel} aria-label="Descargar modelo GLB a escala real para un visor de realidad aumentada"><Download size={14} /> Modelo AR · GLB</button>
        {arSessionActive ? (
          <button type="button" className="box-generator__ar-export" style={{ top: 54, pointerEvents: 'auto' }} onClick={stopArSession} aria-label="Salir de la sesión de realidad aumentada">Salir de AR</button>
        ) : (
          <button
            type="button"
            className="box-generator__ar-export"
            style={{ top: 54, pointerEvents: 'auto' }}
            onClick={() => { void arStartRef.current?.(); }}
            disabled={arAvailability !== 'supported'}
            aria-label={arAvailability === 'supported' ? 'Iniciar realidad aumentada con colocación a escala real' : 'Realidad aumentada no disponible en este navegador o dispositivo'}
            title={arAvailability === 'supported' ? 'Encuentra una superficie y coloca la caja a escala 1:1' : 'Requiere HTTPS, WebXR immersive-ar y soporte hit-test'}
          >
            {arAvailability === 'checking' ? 'Comprobando AR…' : arAvailability === 'supported' ? 'Iniciar AR · 1:1' : 'AR no disponible'}
          </button>
        )}
        {arNotice && <div className="box-generator__ar-notice" style={{ top: 96, pointerEvents: 'none' }} role="status">{arNotice}</div>}
      </div>
      {renderError && <div className="box-generator__webgl-error" role="status">{renderError}</div>}
    </div>
  );
}
