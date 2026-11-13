/**
 * 고급 재질용 «스튜디오» 환경 + 표면 질감 텍스처 — 가챠 기계(2026-10-07 사용자 요청 «플라스틱이나 여러 요소들의 질감이 고급스럽게»).
 *
 * 왜 RoomEnvironment 로는 싸 보였나: 그것은 회색 상자 몇 개뿐이라 유리·크롬·금속에 비칠 «모양»이 없다. 실제 제품 사진이 고급스러운 것은
 * ①반사에 또렷한 밝은 창·띠 조명이 맺히고 ②모서리가 그 빛을 받아 선으로 빛나고 ③표면마다 미세한 결(유리의 먼지, 도장의 귤껍질, 금속의 헤어라인)이 있어서다.
 * 여기서는 ①을 환경 장면(소프트박스·세로 띠 조명·창살 있는 창·따뜻한 바닥 반사)으로, ③을 캔버스로 만든 작은 텍스처로 만든다.
 *
 * 전부 캔버스·기본 도형이라 받아 올 파일이 없다(HDR 파일은 수 MB). 결과 텍스처는 호출하는 쪽이 dispose 한다.
 */
import * as THREE from 'three';

/** PMREM 으로 구운 스튜디오 환경 — 반사 전용(배경으로는 쓰지 않는다) */
export function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const env = new THREE.Scene();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const keep = <T extends THREE.BufferGeometry | THREE.Material>(x: T) => { (x instanceof THREE.Material ? mats : geos).push(x as never); return x; };

  // 둘레 — 위는 서늘한 하늘빛, 아래는 따뜻한 바닥(금속 아래쪽이 따뜻하게 받친다)
  const dome = new THREE.Mesh(keep(new THREE.SphereGeometry(20, 32, 16)), keep(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {},
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP;
      void main(){
        float h = vP.y;
        // 화면이 밝은 파스텔이라 둘레도 밝게 — 어두우면 하얀 래커가 회색으로, 황동이 갈색으로 보인다(첫 스크린샷)
        vec3 sky = mix(vec3(0.86,0.84,0.90), vec3(0.95,0.96,1.0), smoothstep(0.0, 0.9, h));
        vec3 ground = mix(vec3(0.72,0.62,0.58), vec3(0.38,0.32,0.34), smoothstep(0.0, -0.8, h));
        gl_FragColor = vec4(h > 0.0 ? sky : ground, 1.0);
      }`,
  })));
  env.add(dome);

  const light = (w: number, h: number, intensity: number, color = '#ffffff') =>
    new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })));
  const place = (m: THREE.Mesh, x: number, y: number, z: number) => { m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); return m; };

  // ⚠️ 카메라가 정면에서 보므로 앞을 향한 면(유리·황동 판·래커)은 «기계 앞쪽»을 비춘다 — 주 조명은 앞에 둔다.
  // 위 앞 소프트박스 — 유리 윗부분·래커에 넓은 하이라이트(아래로 갈수록 어두워지는 제품 사진의 띠)
  place(light(12, 4.5, 2.4), 0, 8, 11);
  // 창살 있는 창(카메라 바로 왼쪽 위) — 평평한 유리는 «거의 정면 뒤»만 비추므로 창을 시야각 안(±15°)에 둔다.
  // 멀리 옆에 두면 유리에는 끝내 안 맺힌다(첫 시도). 사진 속 유리 구의 건물 반사 같은 또렷한 형태가 된다.
  const win = new THREE.Group();
  win.add(light(4.6, 3.3, 3.0, '#eef4ff'));
  for (let i = -1; i <= 1; i += 1) {
    const bar = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.12, 3.5)), keep(new THREE.MeshBasicMaterial({ color: '#2a2733', side: THREE.DoubleSide })));
    bar.position.set(i * 1.5, 0, 0.02);
    win.add(bar);
  }
  const rail = new THREE.Mesh(keep(new THREE.PlaneGeometry(4.8, 0.12)), keep(new THREE.MeshBasicMaterial({ color: '#2a2733', side: THREE.DoubleSide })));
  rail.position.z = 0.02;
  win.add(rail);
  // 평면 유리는 «카메라에서 본 기울기» 만큼만 옆을 비춘다(시야 28° → ±0.1). 창을 그 안(x −0.1, y +0.05)에.
  win.position.set(-1.3, 0.7, 12);
  win.lookAt(0, 0, 0);
  env.add(win);
  // 세로 띠 조명 둘(좌우, 약간 앞) — 둥근 모서리·크롬 띠에 가는 빛 선
  place(light(0.8, 12, 4.5), -11, 2, 3);
  place(light(0.8, 12, 3.6, '#fff4e6'), 11, 1, 4);
  // 카메라 아래 앞의 따뜻한 판 — 정면을 향한 황동 판이 «금빛»으로 밝아지는 자리(없으면 갈색으로 보인다)
  place(light(6, 2.6, 1.9, '#ffe6bf'), 1.2, 0.2, 12);
  // 오른쪽 앞의 어두운 깃발 — 금속은 밝은 곳과 어두운 곳을 함께 비춰야 금속으로 읽힌다(크롬 고리가 회색 판처럼 보이던 이유)
  const flag = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.2, 7)), keep(new THREE.MeshBasicMaterial({ color: '#3a3342', side: THREE.DoubleSide })));
  place(flag, 4.6, 2, 11);
  // 따뜻한 바닥 반사(아래 앞) — 금빛 부품의 아래쪽이 살아난다
  place(light(14, 3, 1.1, '#ffd7a8'), 0, -6, 8);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  geos.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
  return tex;
}

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, g: c.getContext('2d', { willReadFrequently: true })! };
}

/** 높이 맵(회색) → 법선 맵 */
function toNormal(src: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const n = src.width;
  const h = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, n, n).data;
  const { c, g } = canvas(n);
  const out = g.createImageData(n, n);
  const at = (x: number, y: number) => h[(((y + n) % n) * n + ((x + n) % n)) * 4] / 255;
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * n + x) * 4;
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 도장면의 «귤껍질» — 래커 겉칠(clearcoat)에만 아주 약하게. 이게 없으면 플라스틱이 거울처럼 매끈해 장난감 같다 */
export function orangePeelNormal(): THREE.CanvasTexture {
  const { c, g } = canvas(256);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 256, 256);
  const r = seeded(29);
  for (let i = 0; i < 1400; i += 1) {
    const x = r() * 256, y = r() * 256, rad = 2 + r() * 6;
    const rg = g.createRadialGradient(x, y, 0, x, y, rad);
    const v = r() < 0.5 ? 255 : 0;
    rg.addColorStop(0, `rgba(${v},${v},${v},0.18)`);
    rg.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = rg;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const t = toNormal(c, 2.2);
  t.repeat.set(3, 3);
  return t;
}

/** 금속의 헤어라인(가로 결) — 거칠기 맵. 반사가 결 방향으로 살짝 번져 «깎은 황동»처럼 보인다 */
export function brushedRoughness(): THREE.CanvasTexture {
  const { c, g } = canvas(256);
  g.fillStyle = 'rgb(56,56,56)';
  g.fillRect(0, 0, 256, 256);
  const r = seeded(7);
  // 결의 대비를 크게(거칠기 0.05~0.4) — 약하면 정면 판이 한 덩어리 노란 칠로 읽힌다
  for (let i = 0; i < 1400; i += 1) {
    const v = 14 + Math.floor(r() * 110);
    g.fillStyle = `rgba(${v},${v},${v},0.7)`;
    g.fillRect(r() * 256 - 40, r() * 256, 30 + r() * 160, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 유리의 미세한 먼지·물자국 — 투명 판 위에 아주 옅게 겹친다(사진 속 유리 구의 반짝이는 점들) */
export function glassDust(): THREE.CanvasTexture {
  const { c, g } = canvas(512);
  const r = seeded(91);
  for (let i = 0; i < 2600; i += 1) {
    const x = r() * 512, y = r() * 512;
    const s = r() < 0.92 ? 0.6 + r() * 0.8 : 1.4 + r() * 1.4;
    const bright = r() < 0.7;
    g.fillStyle = bright ? `rgba(255,255,255,${0.25 + r() * 0.55})` : `rgba(40,36,60,${0.12 + r() * 0.25})`;
    g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
  }
  // 옅은 물자국 몇 줄
  for (let i = 0; i < 14; i += 1) {
    const x = r() * 512, y = r() * 512, len = 30 + r() * 90;
    g.strokeStyle = `rgba(255,255,255,${0.04 + r() * 0.06})`;
    g.lineWidth = 2 + r() * 4;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len * 0.4, y + len * 0.2, x + len, y + len * 0.1); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
