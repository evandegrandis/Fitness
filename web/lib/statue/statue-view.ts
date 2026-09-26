/**
 * Rendu de la statue de marbre (three.js), chargé à la demande par `StatueCard`.
 *
 * Le modèle (`public/statue/statue-v1.glb`) porte la zone musculaire de chaque sommet (attribut
 * `_ZONE`, ordre de `STATUE_ZONES`). Chaque zone a un état 0..3 : pierre brute, marbre taillé,
 * marbre poli, veines d'or ; l'état est lissé sur quelques anneaux de voisins pour que le passage
 * d'une zone à l'autre soit progressif. Le logo de la ceinture est relevé sur les images de face et
 * de dos (`logo-v1.png`, R = face, G = dos) et reprojeté avec le calage de chaque image.
 * Rotation lente continue ; un glissé horizontal prend la main, avec de l'inertie.
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

/** Niveau par sommet : état de sa zone, lissé sur quelques anneaux de voisins. */
function vertexLevels(geometry: THREE.BufferGeometry, levels: readonly number[], rings = 5): Float32Array {
  const zone = geometry.getAttribute("_zone"); // entrelacé (pas de 4 octets) : lu par getX
  const count = zone.count;
  let value = new Float32Array(count);
  for (let i = 0; i < count; i += 1) value[i] = levels[zone.getX(i)] ?? 2;
  let adjacency = geometry.userData.adjacency as { start: Uint32Array; nbr: Uint32Array } | undefined;
  if (!adjacency) {
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
    adjacency = { start, nbr };
    geometry.userData.adjacency = adjacency;
  }
  const { start, nbr } = adjacency;
  for (let r = 0; r < rings; r += 1) {
    const next = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      let sum = 0;
      for (let k = start[i]; k < start[i + 1]; k += 1) sum += value[nbr[k]];
      const n = start[i + 1] - start[i];
      next[i] = n ? 0.5 * value[i] + 0.5 * (sum / n) : value[i];
    }
    value = next;
  }
  return value;
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
        "#include <common>\nattribute float level;\nuniform mat4 uToOriginal;\nvarying float vLevel;\nvarying vec3 vObj;\nvarying vec3 vOrig;\nvarying vec3 vOrigN;"
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvLevel = level;\nvObj = position;\nvOrig = (uToOriginal * vec4(position, 1.0)).xyz;\nvOrigN = normalize(mat3(uToOriginal) * objectNormal);"
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying float vLevel;
varying vec3 vObj;
varying vec3 vOrig;
varying vec3 vOrigN;
uniform sampler2D uLogo;
uniform vec4 uLogoBox;
uniform vec3 uCalFront;
uniform vec3 uCalBack;
${NOISE}
float gLevel; float gVein; float gGrain; float gLogo;
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
}`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        gLevel = vLevel;
        // Veines : lignes de niveau zéro d'un bruit déformé (longues courbes continues, comme le vrai
        // marbre), épaisseur tenue à l'écran par fwidth, avec un halo diffus ; leur intensité varie
        // le long du tracé pour qu'elles apparaissent et s'effacent au lieu de quadriller la surface.
        float n1 = fbm(vObj * 3.0 + vec3(fbm(vObj * 1.6), fbm(vObj * 1.6 + 5.2), fbm(vObj * 1.6 + 9.7)) * 1.2);
        float gold3 = smoothstep(2.5, 3.0, gLevel);
        float core = 1.0 - smoothstep(0.006 + 0.008 * gold3, 0.006 + 0.008 * gold3 + fwidth(n1) * 1.5, abs(n1));
        float halo = 1.0 - smoothstep(0.0, 0.07, abs(n1));
        float along = smoothstep(-0.25, 0.35, fbm(vObj * 1.2 + 20.0));
        float v1 = core * mix(0.35, 1.0, along);
        float n2 = fbm(vObj * 9.0 + 7.3 + n1 * 1.4);
        float v2 = (1.0 - smoothstep(0.004, 0.004 + fwidth(n2) * 1.5, abs(n2))) * smoothstep(0.1, 0.5, fbm(vObj * 2.0 + 40.0));
        gVein = core * mix(0.5, 1.0, along);
        float cloud = fbm(vObj * 2.6 + 11.0);
        gGrain = fbm(vObj * 140.0);
        float grime = fbm(vObj * 7.0 + 3.0);
        vec3 stone = vec3(0.29, 0.275, 0.25) * (0.78 + 0.22 * gGrain) * (0.9 + 0.12 * grime);
        vec3 honed = vec3(0.62, 0.605, 0.58) * (0.96 + 0.05 * cloud);
        vec3 polished = vec3(0.90, 0.89, 0.87) * (0.965 + 0.04 * cloud);
        vec3 grey = vec3(0.40, 0.40, 0.41);
        vec3 gold = vec3(0.95, 0.70, 0.28);
        float veins = max(max(v1, v2 * 0.45), halo * along * 0.22);
        vec3 c = stone;
        c = mix(c, mix(honed, grey, veins * 0.3), smoothstep(0.5, 1.5, gLevel));
        c = mix(c, mix(polished, grey, veins * 0.85), smoothstep(1.5, 2.5, gLevel));
        c = mix(c, mix(mix(polished * vec3(1.0, 0.975, 0.93), grey, v2 * 0.35), gold, max(v1, v2 * 0.6)), gold3);   // ivoire chaud, veines d'or
        gLogo = max(logoAt(uCalFront, 1.0, 0.0), logoAt(uCalBack, -1.0, 1.0));
        c *= 1.0 - 0.45 * gLogo;
        diffuseColor.rgb = c;`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.95 - 0.08 * gGrain, 0.7, smoothstep(0.5, 1.5, gLevel));
        roughnessFactor = mix(roughnessFactor, 0.3, smoothstep(1.5, 2.5, gLevel));
        roughnessFactor = mix(roughnessFactor, mix(0.24, 0.28, gVein), gold3);`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        float rough = 1.0 - smoothstep(0.3, 1.6, gLevel);
        float hgt = (fbm(vObj * 220.0) * 0.6 + fbm(vObj * 60.0) * 0.4) * 0.0009 * rough - gLogo * 0.0011;
        normal = bumpNormal(-vViewPosition, normal, vec2(dFdx(hgt), dFdy(hgt)), faceDirection);`
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
        metalnessFactor = gVein * gold3;`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.55, 0.36, 0.1) * 0.35 * gVein * smoothstep(2.5, 3.0, gLevel);`
      )
      // Vernis seulement sur le marbre poli : la pierre brute et le marbre taillé restent mats.
      .replace(
        "#include <lights_physical_fragment>",
        `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoat *= smoothstep(1.5, 2.5, gLevel);
        #endif`
      );
  };
  return material;
}

export interface StatueView {
  setLevels: (levels: readonly number[]) => void;
  /** Suspend le rendu hors écran ou onglet caché. */
  setActive: (active: boolean) => void;
  dispose: () => void;
}

export async function mountStatue(
  container: HTMLElement,
  { url, logoUrl, levels, autorotate = 0.18 }: { url: string; logoUrl: string; levels: readonly number[]; autorotate?: number }
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
  const applyLevels = (next: readonly number[]) => geometry.setAttribute("level", new THREE.BufferAttribute(vertexLevels(geometry, next), 1));
  applyLevels(levels);

  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());
  gltf.scene.position.sub(box.getCenter(new THREE.Vector3()));
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
    setLevels: (next) => {
      applyLevels(next);
      if (!running) renderer.render(scene, camera);
    },
    setActive,
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
