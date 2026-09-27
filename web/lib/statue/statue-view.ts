/**
 * Rendu de la statue (three.js), chargé à la demande par `StatueCard`.
 *
 * Le modèle (`public/statue/statue-v2.glb`) porte la zone musculaire de chaque sommet (attribut
 * `_ZONE`, ordre de `STATUE_ZONES`). Chaque zone a un matériau (bronze, marbre, argent, or) et des
 * veines du matériau suivant, plus ou moins denses selon l'avancée vers le palier. Les parts de
 * chaque matériau sont lissées sur quelques anneaux de voisins : une zone en bronze voisine d'une
 * zone en or passe directement de l'un à l'autre, sans bandes intermédiaires. Le logo de la
 * ceinture est relevé sur les images de face et de dos (`logo-v1.png`, R = face, G = dos) et
 * reprojeté avec le calage de chaque image. La statue tourne sur le centre de son socle ; un glissé
 * horizontal prend la main, avec de l'inertie.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){float a=0.5,s=0.0;for(int i=0;i<5;i++){s+=a*snoise(p);p*=2.02;a*=0.5;}return s;}
`;

/** Calage des images d'origine (1675 × 2000) : pixels = (±x·s + tx, −y·s + ty), dos en miroir. */
const LOGO = { box: [640, 900, 420, 130], front: [1827.68, 789.85, 1061.63], back: [1840.96, 913.14, 1070.63] } as const;

/** État d'une zone pour le rendu : matériau 0..3 (bronze, marbre, argent, or) et densité des veines. */
export interface StatueZoneLook {
  state: number;
  veins: number;
}

type Adjacency = { start: Uint32Array; nbr: Uint32Array };

function adjacencyOf(geometry: THREE.BufferGeometry): Adjacency {
  const cached = geometry.userData.adjacency as Adjacency | undefined;
  if (cached) return cached;
  const count = geometry.getAttribute("position").count;
  const index = geometry.index!.array;
  const degree = new Uint32Array(count);
  for (let i = 0; i < index.length; i += 1) degree[index[i]] += 2;
  const start = new Uint32Array(count + 1);
  for (let i = 0; i < count; i += 1) start[i + 1] = start[i] + degree[i];
  const fill = start.slice(0, count);
  const nbr = new Uint32Array(start[count]);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    nbr[fill[a]++] = b; nbr[fill[a]++] = c;
    nbr[fill[b]++] = a; nbr[fill[b]++] = c;
    nbr[fill[c]++] = a; nbr[fill[c]++] = b;
  }
  geometry.userData.adjacency = { start, nbr };
  return geometry.userData.adjacency as Adjacency;
}

/** Lisse un attribut à 4 composantes sur `rings` anneaux de voisins. */
function smooth4(values: Float32Array, { start, nbr }: Adjacency, rings: number): Float32Array {
  let value = values;
  const count = start.length - 1;
  for (let r = 0; r < rings; r += 1) {
    const next = new Float32Array(value.length);
    for (let i = 0; i < count; i += 1) {
      const n = start[i + 1] - start[i];
      for (let c = 0; c < 4; c += 1) {
        let sum = 0;
        for (let k = start[i]; k < start[i + 1]; k += 1) sum += value[nbr[k] * 4 + c];
        next[i * 4 + c] = n ? 0.5 * value[i * 4 + c] + 0.5 * (sum / n) : value[i * 4 + c];
      }
    }
    value = next;
  }
  return value;
}

/** Parts des quatre matériaux (`look`) et des veines du matériau suivant (`veins`), par sommet. */
function applyLooks(geometry: THREE.BufferGeometry, looks: readonly StatueZoneLook[]) {
  const zone = geometry.getAttribute("_zone"); // entrelacé (pas de 4 octets) : lu par getX
  const count = zone.count;
  const look = new Float32Array(count * 4);
  const veins = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    const entry = looks[zone.getX(i)] ?? { state: 1, veins: 0 };
    const state = Math.max(0, Math.min(3, Math.round(entry.state)));
    look[i * 4 + state] = 1;
    if (state < 3) veins[i * 4 + state + 1] = entry.veins;
  }
  const adjacency = adjacencyOf(geometry);
  geometry.setAttribute("look", new THREE.BufferAttribute(smooth4(look, adjacency, 4), 4));
  geometry.setAttribute("veins", new THREE.BufferAttribute(smooth4(veins, adjacency, 4), 4));
}

function statueMaterial(logo: THREE.Texture, toOriginal: THREE.Matrix4): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.18 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uLogo: { value: logo },
      uLogoBox: { value: new THREE.Vector4(...LOGO.box) },
      uCalFront: { value: new THREE.Vector3(...LOGO.front) },
      uCalBack: { value: new THREE.Vector3(...LOGO.back) },
      uToOriginal: { value: toOriginal },
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec4 look;\nattribute vec4 veins;\nuniform mat4 uToOriginal;\nvarying vec4 vLook;\nvarying vec4 vVeins;\nvarying vec3 vObj;\nvarying vec3 vOrig;\nvarying vec3 vOrigN;"
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvLook = look;\nvVeins = veins;\nvObj = position;\nvOrig = (uToOriginal * vec4(position, 1.0)).xyz;\nvOrigN = normalize(mat3(uToOriginal) * objectNormal);"
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec4 vLook;
varying vec4 vVeins;
varying vec3 vObj;
varying vec3 vOrig;
varying vec3 vOrigN;
uniform sampler2D uLogo;
uniform vec4 uLogoBox;
uniform vec3 uCalFront;
uniform vec3 uCalBack;
${NOISE}
float gRough; float gMetal; float gMarble; float gLogo;
float logoAt(vec3 cal, float mirror, float channel) {
  vec2 px = vec2(mirror * vOrig.x * cal.x + cal.y, -vOrig.y * cal.x + cal.z);
  vec2 uv = (px - uLogoBox.xy) / uLogoBox.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  vec4 t = texture2D(uLogo, uv);
  return (channel < 0.5 ? t.r : t.g) * smoothstep(0.3, 0.7, mirror * normalize(vOrigN).z);
}
vec3 bumpNormal(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = normalize(dFdx(surf_pos)); vec3 vSigmaY = normalize(dFdy(surf_pos)); vec3 vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN); vec3 R2 = cross(vN, vSigmaX); float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2); return normalize(abs(fDet) * surf_norm - vGrad);
}
// Couleur (x) et rugosité (w) des quatre matériaux : bronze, marbre, argent, or.
vec4 materialOf(int k, vec3 marble, float patina) {
  if (k == 0) return vec4(vec3(0.25, 0.14, 0.075) * (0.7 + 0.45 * patina), 0.42 + 0.16 * patina);
  if (k == 1) return vec4(marble, 0.3);
  if (k == 2) return vec4(0.80, 0.82, 0.85, 0.13);
  return vec4(1.0, 0.66, 0.2, 0.19);
}`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        // Marbre : veines grises, lignes de niveau zéro d'un bruit déformé, épaisseur tenue à l'écran.
        float n1 = fbm(vObj * 3.0 + vec3(fbm(vObj * 1.6), fbm(vObj * 1.6 + 5.2), fbm(vObj * 1.6 + 9.7)) * 1.2);
        float core = 1.0 - smoothstep(0.006, 0.006 + fwidth(n1) * 1.5, abs(n1));
        float halo = 1.0 - smoothstep(0.0, 0.07, abs(n1));
        float along = smoothstep(-0.25, 0.35, fbm(vObj * 1.2 + 20.0));
        float n2 = fbm(vObj * 9.0 + 7.3 + n1 * 1.4);
        float fine = (1.0 - smoothstep(0.004, 0.004 + fwidth(n2) * 1.5, abs(n2))) * smoothstep(0.1, 0.5, fbm(vObj * 2.0 + 40.0));
        float greyVeins = max(max(core * mix(0.35, 1.0, along), fine * 0.45), halo * along * 0.22);
        vec3 marble = mix(vec3(0.90, 0.89, 0.87) * (0.965 + 0.04 * fbm(vObj * 2.6 + 11.0)), vec3(0.40, 0.40, 0.41), greyVeins * 0.85);
        float patina = fbm(vObj * 4.0 + 2.0) * 0.5 + 0.5;

        // Matériau de la zone : parts lissées, resserrées pour une frontière nette mais douce.
        vec4 w = vLook * vLook * vLook;
        w /= max(1e-4, w.x + w.y + w.z + w.w);
        vec4 m0 = materialOf(0, marble, patina), m1 = materialOf(1, marble, patina);
        vec4 m2 = materialOf(2, marble, patina), m3 = materialOf(3, marble, patina);
        vec4 base = w.x * m0 + w.y * m1 + w.z * m2 + w.w * m3;
        float baseMetal = w.x + w.z + w.w;

        // Veines du palier suivant : un réseau qui se dévoile avec l'avancée (0 : rien, 1 : partout).
        float amount = vVeins.x + vVeins.y + vVeins.z + vVeins.w;
        vec4 vw = vVeins / max(1e-4, amount);
        float n3 = fbm(vObj * 3.6 + 13.0 + vec3(fbm(vObj * 1.4 + 3.0)) * 1.3);
        float line = 1.0 - smoothstep(0.010, 0.010 + fwidth(n3) * 1.5, abs(n3));
        float reveal = fbm(vObj * 1.3 + 31.0) * 0.6 + 0.5;
        float mask = line * smoothstep(reveal - 0.06, reveal + 0.06, amount * 1.08);
        vec4 veinMat = vw.x * m0 + vw.y * m1 + vw.z * m2 + vw.w * m3;
        float veinMetal = vw.x + vw.z + vw.w;

        vec4 mixed = mix(base, veinMat, mask);
        gRough = mixed.w;
        gMetal = mix(baseMetal, veinMetal, mask);
        gMarble = mix(w.y, vw.y, mask);
        gLogo = max(logoAt(uCalFront, 1.0, 0.0), logoAt(uCalBack, -1.0, 1.0));
        diffuseColor.rgb = mixed.rgb * (1.0 - 0.45 * gLogo);`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = gRough;`
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
        metalnessFactor = gMetal;`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        float hgt = -gLogo * 0.0011;
        normal = bumpNormal(-vViewPosition, normal, vec2(dFdx(hgt), dFdy(hgt)), faceDirection);`
      )
      // Vernis seulement sur le marbre ; les métaux reflètent davantage la pièce autour d'eux.
      .replace(
        "#include <lights_physical_fragment>",
        `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoat *= gMarble;
        #endif`
      )
      .replace(
        "#include <lights_fragment_maps>",
        `#include <lights_fragment_maps>
        #if defined( RE_IndirectSpecular )
          radiance *= mix(1.0, 2.6, gMetal);
        #endif`
      );
  };
  return material;
}

export interface StatueView {
  setLooks: (looks: readonly StatueZoneLook[]) => void;
  /** Oriente la statue (radians), pour une vue fixe. */
  setAngle: (angle: number) => void;
  /** Suspend le rendu hors écran ou onglet caché. */
  setActive: (active: boolean) => void;
  dispose: () => void;
}

/** Centre du socle (x, z) : milieu des sommets du bas de la statue, dans le repère de la scène. */
function pedestalCenter(mesh: THREE.Mesh, box: THREE.Box3): THREE.Vector2 {
  const position = mesh.geometry.getAttribute("position");
  const point = new THREE.Vector3();
  const limit = box.min.y + (box.max.y - box.min.y) * 0.03;
  const low = new THREE.Box3();
  for (let i = 0; i < position.count; i += 1) {
    point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    if (point.y <= limit) low.expandByPoint(point);
  }
  return low.isEmpty() ? new THREE.Vector2(0, 0) : new THREE.Vector2((low.min.x + low.max.x) / 2, (low.min.z + low.max.z) / 2);
}

export async function mountStatue(
  container: HTMLElement,
  { url, logoUrl, looks, autorotate = 0.18 }: { url: string; logoUrl: string; looks: readonly StatueZoneLook[]; autorotate?: number }
): Promise<StatueView> {
  const [gltf, logo] = await Promise.all([
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url),
    new THREE.TextureLoader().loadAsync(logoUrl),
  ]);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.3;
  const key = new THREE.DirectionalLight(0xfff0dc, 1.55);
  key.position.set(1.6, 2.6, 1.8);
  const fill = new THREE.DirectionalLight(0xe8eeff, 0.4);
  fill.position.set(-1.8, 0.6, 1.6);
  const rim = new THREE.DirectionalLight(0xdce6ff, 1.2);
  rim.position.set(-2.4, 1.6, -1.8);
  scene.add(key, fill, rim);

  logo.flipY = false;
  logo.anisotropy = renderer.capabilities.getMaxAnisotropy();
  let mesh: THREE.Mesh | null = null;
  gltf.scene.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) mesh = object as THREE.Mesh;
  });
  if (!mesh) throw new Error("statue : aucun maillage dans le modèle");
  const statue: THREE.Mesh = mesh;
  const geometry = statue.geometry;
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  gltf.scene.updateMatrixWorld(true); // avant recentrage : repère des images
  const material = statueMaterial(logo, statue.matrixWorld.clone());
  statue.material = material;
  applyLooks(geometry, looks);

  // Pivot au centre du socle (et non de la boîte englobante, que la couronne levée décale).
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());
  const base = pedestalCenter(statue, box);
  gltf.scene.position.set(-base.x, -(box.min.y + box.max.y) / 2, -base.y);
  const pivot = new THREE.Group();
  pivot.add(gltf.scene);
  scene.add(pivot);

  const camera = new THREE.PerspectiveCamera(24, 1, 0.01, 50);
  const distance = (size.y * 0.56) / Math.tan(THREE.MathUtils.degToRad(12));
  camera.position.set(0, size.y * 0.04, distance);
  camera.lookAt(0, 0, 0);

  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.touchAction = "pan-y";
  container.appendChild(canvas);
  const resize = () => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Portrait étroit : on recule pour garder la couronne dans le cadre.
    camera.position.z = distance * Math.max(1, 0.62 / camera.aspect);
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  let angle = 0;
  let velocity = 0;
  let dragging = false;
  let lastX = 0;
  let idleSince = performance.now();
  const onDown = (event: PointerEvent) => {
    dragging = true;
    lastX = event.clientX;
    velocity = 0;
    canvas.setPointerCapture(event.pointerId);
  };
  const onMove = (event: PointerEvent) => {
    if (!dragging) return;
    const step = ((event.clientX - lastX) / Math.max(1, container.clientWidth)) * Math.PI * 1.6;
    lastX = event.clientX;
    angle += step;
    velocity = step * 60;
  };
  const onUp = () => {
    dragging = false;
    idleSince = performance.now();
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  let frame = 0;
  let previous = performance.now();
  let running = false;
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - previous) / 1000);
    previous = now;
    if (!dragging) {
      velocity *= Math.pow(0.04, dt); // inertie après le lâcher
      const resume = Math.min(1, Math.max(0, (now - idleSince - 1500) / 1500));
      angle += (velocity + autorotate * resume) * dt;
    }
    pivot.rotation.y = angle;
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  };
  const setActive = (active: boolean) => {
    if (active === running) return;
    running = active;
    if (active) {
      previous = performance.now();
      frame = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(frame);
    }
  };
  setActive(true);

  return {
    setLooks: (next) => {
      applyLooks(geometry, next);
      if (!running) renderer.render(scene, camera);
    },
    setActive,
    setAngle: (next) => {
      angle = next;
      velocity = 0;
      pivot.rotation.y = angle;
      renderer.render(scene, camera);
    },
    dispose: () => {
      setActive(false);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      geometry.dispose();
      material.dispose();
      logo.dispose();
      environment.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
