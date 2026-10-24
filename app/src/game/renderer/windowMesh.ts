// [window] 重制「窗户」Entity 2（backrooms-wiki-cn entity-2）——阶段 1 建模
// 三种窗型随层级（概率替换该层的普通窗户，外观沿用该层窗户）：
//   l2   Level 2 维修通道：锈蚀钢格工业窗，3×4 夹丝玻璃格，部分磨砂/缺失，边缘糊着撕裂的纸（参考附图 3）
//   l4   Level 4 废弃办公室：与 l4Meshes glasswin 同尺寸的灰白推拉窗 + 半拉卷帘 + 窗下暖气片（参考附图 1）
//   l601 Level 601 图书馆：深窗洞的双扇平开木窗 + 宽窗台 + 铸铁暖气片（参考附图 2）
// 三态：occupied 附影（窗内有暗化模糊、竖向拖影的人形，清晰度 uSil 随时间衰减、吞噬后升高）
//       newborn 新生态（无人形，景色更亮、更「熟悉」，缓慢呼吸）
//       dying   衰亡态（窗框碎裂漂移，窗内是层层嵌套、错位的碎窗框隧道 + 噪点，参考附图 4）
// 窗外景观全部在着色器里：漩涡笔触 + 竖向模糊拉丝；调色板由「观察者种子」决定——联机时每个客户端用自己的种子，
// 同一扇窗不同人看到不同的风景（维基：影像由观察者感知投射）。景观层带视差，看起来像窗后真有空间。
// 手臂（参考附图 5）：纯黑、毛边、极长的手臂，从玻璃里长出来；刚性关节层级（肩→肘→腕→指），阶段 2 做动画。
// 坐标：原点在墙面、贴地；玻璃朝 +Z；z<0 在墙体内（被墙遮住，所以手臂看起来是从玻璃里长出来的）。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ownImportedModel } from './importedModelResources'
import { litMaterial, getMaterialMode } from './shared'

export type WindowStyle = 'l2' | 'l4' | 'l601'
export type WindowState = 'occupied' | 'newborn' | 'dying'
export interface WindowOpts { style?: WindowStyle; state?: WindowState; seed?: number; viewerSeed?: number; silhouette?: number; silHeight?: number; decay?: number }

/** 各窗型的玻璃区（窗洞内净尺寸）与窗框参数，机制层（抓取距离、生成贴墙）也读这张表 */
export const WINDOW_STYLE = {
  l2: { w: 0.92, h: 1.32, cy: 1.45, depth: 0.07, grid: [3, 4], frame: '#4a3a2e', frame2: '#2f2a26', paper: 1 },
  l4: { w: 0.94, h: 1.72, cy: 1.755, depth: 0.1, grid: [1, 2], frame: '#c9c7c0', frame2: '#9d9b94', paper: 0 },
  l601: { w: 1.18, h: 1.66, cy: 1.78, depth: 0.16, grid: [2, 1], frame: '#cfd8cf', frame2: '#a9b5ab', paper: 0 },
} as const

// ---------- 程序贴图（小尺寸 canvas，模块级缓存） ----------
const texCache = new Map<string, THREE.Texture>()
function canvasTex(key: string, n: number, draw: (g: CanvasRenderingContext2D, n: number) => void): THREE.Texture {
  const hit = texCache.get(key); if (hit) return hit
  const c = document.createElement('canvas'); c.width = c.height = n
  const g = c.getContext('2d')!; draw(g, n)
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace
  texCache.set(key, t); return t
}
let rs = 1
const rnd = () => { rs = (rs * 16807) % 2147483647; return (rs - 1) / 2147483646 }
/** 漆面 / 锈蚀 / 木纹：底色 + 斑驳 + 划痕 */
function paintTex(kind: 'rust' | 'paint' | 'plaster' | 'iron') {
  return canvasTex('win-' + kind, 128, (g, n) => {
    rs = kind.length * 977
    const base = { rust: [74, 58, 46], paint: [205, 203, 196], plaster: [214, 210, 196], iron: [222, 218, 206] }[kind]
    const img = g.createImageData(n, n)
    for (let i = 0; i < n * n; i++) {
      const x = i % n, y = (i / n) | 0
      const blot = Math.sin(x * 0.11 + Math.sin(y * 0.07) * 3) * Math.cos(y * 0.09 + x * 0.02) * 0.5 + 0.5
      const k = 0.86 + rnd() * 0.12 - (kind === 'rust' ? blot * 0.25 : blot * 0.06)
      const r = kind === 'rust' && blot > 0.72 ? [138, 74, 36] : base
      img.data[i * 4] = r[0] * k; img.data[i * 4 + 1] = r[1] * k; img.data[i * 4 + 2] = r[2] * k; img.data[i * 4 + 3] = 255
    }
    g.putImageData(img, 0, 0)
    g.globalAlpha = 0.35; g.strokeStyle = kind === 'rust' ? '#1c1410' : '#6b675f'
    for (let s = 0; s < 18; s++) { g.beginPath(); const x = rnd() * n, y = rnd() * n; g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 30, y + rnd() * 40); g.stroke() }
  })
}
const matCache = new Map<string, THREE.Material>()
function frameMat(kind: 'rust' | 'paint' | 'plaster' | 'iron', color: string, rough = 0.85, metal = 0) {
  const k = getMaterialMode() + kind + color; const hit = matCache.get(k); if (hit) return hit
  const m = litMaterial({ color, map: paintTex(kind), roughness: rough, metalness: metal })
  matCache.set(k, m); return m
}

export const windowTexturesReady = () => ['win-rust', 'win-paint', 'win-plaster', 'win-iron', 'win-fur'].every(k => texCache.has(k))
export function* prepareWindowTextures(): Generator<void, void, unknown> {
  for (const kind of ['rust', 'paint', 'plaster', 'iron'] as const) { paintTex(kind); yield }
  armMaterial(); yield
}
// ---------- 几何工具 ----------
type Piece = THREE.BufferGeometry
const bx = (w: number, h: number, d: number, x: number, y: number, z: number, rz = 0, ry = 0): Piece => {
  const g = new THREE.BoxGeometry(w, h, d)
  if (rz || ry) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, ry, rz)))
  g.translate(x, y, z); return g
}
const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z' = 'y', seg = 10): Piece => {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg)
  if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2)
  g.translate(x, y, z); return g
}
/** 合并同材质零件；dying 时每个零件按种子错位、倾斜（碎裂漂移），返回单个网格 */
function meshOf(pieces: Piece[], mat: THREE.Material, shatter = 0, seed = 1): THREE.Mesh {
  if (shatter > 0) {
    rs = seed * 131 + pieces.length
    for (const p of pieces) {
      p.computeBoundingBox(); const c = new THREE.Vector3(); p.boundingBox!.getCenter(c)
      const m = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z)
      m.premultiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler((rnd() - 0.5) * 0.25 * shatter, (rnd() - 0.5) * 0.3 * shatter, (rnd() - 0.5) * 0.28 * shatter)))
      m.premultiply(new THREE.Matrix4().makeTranslation(c.x + (rnd() - 0.5) * 0.06 * shatter, c.y + (rnd() - 0.5) * 0.05 * shatter, c.z + rnd() * 0.1 * shatter))
      p.applyMatrix4(m)
    }
  }
  const nonIndexed = pieces.map((p) => (p.index ? p.toNonIndexed() : p))
  for (const p of nonIndexed) for (const k of Object.keys(p.attributes)) if (!['position', 'normal', 'uv'].includes(k)) p.deleteAttribute(k)
  const mesh = new THREE.Mesh(mergeGeometries(nonIndexed), mat)
  const unique = new Set([...pieces, ...nonIndexed]); for (const p of unique) if (p !== mesh.geometry) p.dispose()
  mesh.castShadow = true; mesh.receiveShadow = true
  return mesh
}

// ---------- 窗外景观着色器 ----------
const NOISE = /* glsl */`
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*vn(p);p=p*2.03+vec2(17.1,9.7);a*=.5;}return s;}
`
const SCENERY_VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
varying vec2 vUv; varying vec3 vView;
void main(){
  vUv=uv;
  vec4 mvPosition=modelViewMatrix*vec4(position,1.);
  // 物体空间视线（玻璃平面 = XY，朝 +Z），供视差
  vec3 camObj=(inverse(modelMatrix)*vec4(cameraPosition,1.)).xyz;
  vView=normalize(position-camObj);
  gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
}`
const SCENERY_FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform float uTime,uSeed,uSil,uSilH,uSilX,uState,uDecay,uLure,uAspect,uPaper,uBright,uBeckon,uSilScale,uArmHide,uVanish;
uniform vec2 uGrid;
varying vec2 vUv; varying vec3 vView;
${NOISE}
vec3 pal(float id,float y,float n){
  // 四组「似曾相识」的景色：秋林蓝天 / 黄田远树 / 阴天街道 / 夏日河岸
  vec3 sky,mid,gnd;
  if(id<1.){sky=vec3(.5,.66,.88);mid=vec3(.74,.36,.18);gnd=vec3(.82,.52,.22);}
  else if(id<2.){sky=vec3(.78,.78,.66);mid=vec3(.52,.56,.28);gnd=vec3(.88,.8,.26);}
  else if(id<3.){sky=vec3(.66,.7,.74);mid=vec3(.5,.58,.48);gnd=vec3(.5,.5,.52);}
  else{sky=vec3(.5,.74,.86);mid=vec3(.36,.6,.34);gnd=vec3(.52,.66,.68);}
  float hz=.42+n*.18;
  vec3 c=mix(gnd,mid,smoothstep(hz-.22,hz-.02,y));
  return mix(c,sky,smoothstep(hz+.05,hz+.3,y+n*.2));
}
float box2(vec2 p,vec2 b){vec2 d=abs(p)-b;return length(max(d,0.))+min(max(d.x,d.y),0.);}
float silSdf(vec2 p,float h,float beck){
  // 人形剪影（以脚底为原点，单位 = 玻璃高）：头 / 颈肩 / 躯干 / 两臂下垂
  float head=length((p-vec2(0.,h*.875))*vec2(1.,.82))-h*.068;
  float neck=box2(p-vec2(0.,h*.79),vec2(h*.03,h*.04));
  vec2 ps=p-vec2(0.,h*.72); ps.y*=1.8;
  float sh=length(ps*vec2(1.,1.))-h*.135;
  // 躯干上宽下窄，越往下越淡出（拖影）
  float wT=mix(.07,.12,smoothstep(.1,.7,p.y/h))*h;
  float torso=box2(p-vec2(0.,h*.42),vec2(wT,h*.3))-h*.02;
  float armL=box2((p-vec2(-h*.135,h*.47))*mat2(.996,.09,-.09,.996),vec2(h*.026,h*.25))-h*.02;
  // 右臂：绕肩点抬起招手（beck 0..1 抬臂角度），uArmHide 时这条臂已伸出窗外，剪影里不画
  vec2 sp=p-vec2(h*.14,h*.7); float an=-.09+beck*2.3; mat2 R=mat2(cos(an),-sin(an),sin(an),cos(an));
  vec2 ua=R*sp; float armR=box2(ua-vec2(0.,-h*.12),vec2(h*.026,h*.12))-h*.02;
  vec2 ea=ua-vec2(0.,-h*.24); float an2=beck*(1.1+.5*sin(uTime*7.)); ea=mat2(cos(an2),-sin(an2),sin(an2),cos(an2))*ea;
  armR=min(armR,box2(ea-vec2(0.,-h*.11),vec2(h*.022,h*.11))-h*.018);
  armR+=uArmHide*1.;
  float k=h*.03; // 平滑并集，避免方块拼接感
  float d=min(head,neck);
  float a=sh,b=torso; float hh=clamp(.5+.5*(b-a)/k,0.,1.); d=min(d,mix(b,a,hh)-k*hh*(1.-hh));
  a=armL; b=d; hh=clamp(.5+.5*(b-a)/k,0.,1.); d=mix(b,a,hh)-k*hh*(1.-hh);
  a=armR; b=d; hh=clamp(.5+.5*(b-a)/k,0.,1.); d=mix(b,a,hh)-k*hh*(1.-hh);
  return d;
}
void main(){
  vec2 uv=vUv;
  vec2 q=vec2((uv.x-.5)*uAspect,uv.y);
  float t=uTime;
  // 视差：远景层随视线偏移，看起来窗后有纵深
  vec2 par=vView.xy/max(.25,-vView.z);
  vec2 pFar=q-par*.22;
  float id=floor(mod(uSeed,4.));
  // 竖向拉丝的笔触场 + 漩涡等高线（附图 2 的指纹状涡纹）
  vec2 sp=pFar*vec2(3.2,1.1)+vec2(uSeed*7.3,0.);
  vec2 w=vec2(fbm(sp+t*.03),fbm(sp+vec2(5.2,1.3)-t*.02));
  float n=fbm(sp*vec2(1.,.35)+w*1.6);
  vec3 col=pal(id,uv.y-par.y*.15,n-.5);
  col*=.82+.36*fbm(vec2(pFar.x*14.,pFar.y*2.)+w*3.);
  float swirl=fbm(pFar*2.4+w*.9+uSeed);
  float lines=smoothstep(.82,1.,abs(sin(swirl*58.)));
  col=mix(col,vec3(.9,.92,.95),lines*.28*smoothstep(.35,.75,uv.y));
  // 新生态：更亮、更暖、缓慢呼吸
  if(uState>.5&&uState<1.5){vec3 v=pow(col,vec3(1.35))*vec3(1.25,1.12,.95);col=mix(col,v,.75+.15*sin(t*.6));}
  // 人形（附影态）：竖向滴落拖影 + 边缘弥散
  if(uSil>.001){
    vec2 ps=pFar*.9+par*.08; ps.x-=uSilX*uAspect;
    float drip=(fbm(vec2(ps.x*26.,t*.05))-.5)*.1*(1.-uv.y);
    vec2 pp=vec2(ps.x,ps.y+.04-drip);
    pp=(pp-vec2(0.,uSilH*.92))/uSilScale+vec2(0.,uSilH*.92); // 以头顶为轴放大：贴近玻璃时身体向下溢出画面
    float d=silSdf(pp,uSilH,uBeckon)+(fbm(pp*18.+t*.1)-.5)*.05;
    float blur=.012+.08*(1.-uSil);
    float a=(1.-smoothstep(-blur,blur,d))*uSil;
    float streak=smoothstep(.0,.5,fbm(vec2(ps.x*40.,ps.y*2.)))*(1.-smoothstep(-blur,.12,d));
    a=max(a,streak*.45*uSil*step(pp.y,uSilH*.5));
    // 双重叠影（种子为奇数时出现第二个更淡的人形）
    if(mod(uSeed,2.)>.5){float d2=silSdf(pp-vec2(uSilH*.32,-.03),uSilH*.92,0.);a=max(a,(1.-smoothstep(-blur*1.6,blur*1.6,d2))*uSil*.42);}
    col=mix(col,col*.03+vec3(.008,.01,.014),clamp(a*1.15,0.,1.));
  }
  // 衰亡态：层层嵌套、错位的碎窗框隧道（附图 4）+ 灰蓝色调 + 噪点
  if(uState>1.5){
    vec3 dc=vec3(.66,.7,.78)+.12*fbm(q*6.);
    vec2 c=q-vec2(0.,.52);
    float fr=0.,dep=0.,sh2=0.;
    for(int i=0;i<6;i++){
      float fi=float(i),s=pow(.72,fi),a=(h21(vec2(fi,uSeed))-.5)*.9+sin(t*.2+fi)*.05*uDecay;
      vec2 r=mat2(cos(a),-sin(a),sin(a),cos(a))*(c-par*.06*fi+vec2((h21(vec2(fi,3.))-.5)*.08,0.));
      float bb=box2(r,vec2(.36*uAspect,.46)*s);
      float b=abs(bb)-.035*s;
      float shade=.55+.45*fbm(r*20.+fi);
      fr=max(fr,(1.-smoothstep(0.,.006,b))*shade*(1.-fi*.1));
      dep+=step(bb,-.035*s);
      sh2=max(sh2,(1.-smoothstep(0.,.03*s,bb+.035*s))*step(bb,-.035*s)*step(0.,r.y)*.0+(1.-smoothstep(0.,.025*s,abs(bb+.05*s)))*.5);
    }
    vec3 inner=mix(dc,col*.7,.35)*(1.-dep*.09);
    inner*=1.-sh2*.55;
    inner=mix(inner,vec3(.88,.9,.94),fr*.9);
    // 碎片化：块状错位
    vec2 cell=floor(q*vec2(7.,9.)+fbm(q*3.)*2.);
    inner*=.88+.24*h21(cell+uSeed);
    col=mix(col,inner,uDecay);
    col+=(h21(uv*vec2(733.,911.)+fract(t*13.))-.5)*.16*uDecay;
  }
  // 窗格：L2 夹丝玻璃部分磨砂/发白（附图 3），四周糊着撕裂的纸
  vec2 cellUv=uv*uGrid; vec2 ci=floor(cellUv);
  float hc=h21(ci+uSeed*.01+3.1);
  if(uGrid.x*uGrid.y>4.){
    float frost=step(.68,hc)*(.5+.4*fbm(cellUv*vec2(9.,5.)));
    float lum=dot(col,vec3(.3,.59,.11));
    col=mix(col,(vec3(.86,.88,.86)+.08*fbm(uv*40.))*(.25+.75*smoothstep(.05,.5,lum)),frost*.85);
    vec2 cf=fract(cellUv)-.5; float wire=step(.48,fract((cf.x+cf.y)*14.))*step(fract((cf.x-cf.y)*14.),.06);
    col=mix(col,col*.6,wire*.35);
  }
  if(uPaper>.5){
    float edge=min(min(uv.x,1.-uv.x)*uAspect,min(uv.y,1.-uv.y));
    float tear=.03+.05*fbm(vec2((uv.x+uv.y)*22.,2.));
    float paper=1.-smoothstep(tear,tear+.006,edge);
    paper=max(paper,step(1.-.05-.09*fbm(vec2(uv.x*7.,1.)),uv.y)); // 顶部一条残纸
    col=mix(col,vec3(.83,.8,.72)*(.85+.2*fbm(uv*30.)),paper);
  }
  // 诱引：靠近时窗内景色微微提亮、泛暖（阶段 2/3 驱动）
  col*=uBright*(1.+uLure*.35);
  // 消失：噪声溶解，露出后面的墙
  if(uVanish>0.){float vn2=fbm(uv*vec2(6.,9.)+3.);if(vn2<uVanish*1.1-.05)discard;col=mix(col,vec3(.9,.92,.95),smoothstep(uVanish*1.1-.05,uVanish*1.1+.03,vn2)*(1.-smoothstep(uVanish*1.1+.03,uVanish*1.1+.08,vn2))*step(.01,uVanish));}
  gl_FragColor=vec4(col,1.);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`

export function sceneryMaterial(opts: { aspect: number; grid: readonly [number, number] | readonly number[]; paper: number; viewerSeed: number; state: WindowState; silhouette: number; silHeight: number; decay: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uSeed: { value: opts.viewerSeed }, uSil: { value: opts.silhouette }, uSilH: { value: opts.silHeight }, uSilX: { value: 0 },
      uState: { value: opts.state === 'occupied' ? 0 : opts.state === 'newborn' ? 1 : 2 }, uDecay: { value: opts.decay }, uLure: { value: 0 }, uBeckon: { value: 0 }, uSilScale: { value: 1 }, uArmHide: { value: 0 }, uVanish: { value: 0 },
      uAspect: { value: opts.aspect }, uPaper: { value: opts.paper }, uBright: { value: 1 }, uGrid: { value: new THREE.Vector2(opts.grid[0], opts.grid[1]) },
    }]),
    vertexShader: SCENERY_VERT, fragmentShader: SCENERY_FRAG, fog: true,
  })
}

// ---------- 玻璃（反光 + 污渍；衰亡态有裂纹） ----------
function glassMat(cracked: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uCrack: { value: cracked }, uOpacity: { value: 1 } },
    vertexShader: `varying vec2 vUv;varying vec3 vN;varying vec3 vV;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `uniform float uCrack,uOpacity;varying vec2 vUv;varying vec3 vN;varying vec3 vV;${NOISE}
      void main(){float fr=pow(1.-max(dot(vN,vV),0.),3.);
        float streak=smoothstep(.6,1.,sin((vUv.x*1.4+vUv.y)*9.))*.12;
        float dirt=fbm(vUv*vec2(8.,14.))*.12+smoothstep(.25,0.,vUv.y)*.1;
        vec2 c=vUv-vec2(.62,.58);float ang=atan(c.y,c.x);float rad=length(c);
        float crack=uCrack*(smoothstep(.985,1.,abs(sin(ang*7.+fbm(c*6.)*3.)))*step(rad,.55)+smoothstep(.012,0.,abs(fract(rad*9.+fbm(c*5.))-.5)-.47)*.6*step(rad,.4));
        float a=clamp(fr*.35+streak*.35+dirt*.55+crack*.6,0.,.7);
        gl_FragColor=vec4(mix(vec3(.82,.86,.9),vec3(.3,.28,.24),dirt*3.)+crack*.2,a*uOpacity);}`,
  })
}

// ---------- 三种窗框 ----------
function buildFrame(style: WindowStyle, shatter: number, seed: number): THREE.Group {
  const S = WINDOW_STYLE[style], g = new THREE.Group(); g.name = 'frame'
  const { w, h, cy } = S, y0 = cy - h / 2, y1 = cy + h / 2
  const main: Piece[] = [], second: Piece[] = [], extra: Piece[] = []
  if (style === 'l2') {
    // 锈蚀角钢外框 + 3×4 钢格窗棂 + 窗台角钢 + 四颗膨胀螺栓
    const f = 0.055
    main.push(bx(w + f * 2, f, 0.06, 0, y1 + f / 2, 0.03), bx(w + f * 2, f, 0.07, 0, y0 - f / 2, 0.035), bx(f, h, 0.06, -w / 2 - f / 2, cy, 0.03), bx(f, h, 0.06, w / 2 + f / 2, cy, 0.03))
    for (let i = 1; i < 3; i++) second.push(bx(0.022, h, 0.035, -w / 2 + (w * i) / 3, cy, 0.045))
    for (let j = 1; j < 4; j++) second.push(bx(w, 0.022, 0.035, 0, y0 + (h * j) / 4, 0.045))
    second.push(bx(w + 0.16, 0.035, 0.12, 0, y0 - f - 0.017, 0.06)) // 窗台角钢
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) extra.push(cyl(0.012, 0.012, 0.03, x * (w / 2 + f / 2), y > 0 ? y1 + f / 2 : y0 - f / 2, 0.065, 'z', 6))
    g.add(meshOf(main, frameMat('rust', S.frame, 0.7, 0.35), shatter, seed), meshOf([...second, ...extra], frameMat('rust', S.frame2, 0.75, 0.3), shatter, seed + 1))
  } else if (style === 'l4') {
    // 与 l4Meshes glasswin 同尺寸：灰白铝框 + 推拉窗中梁 + 半拉卷帘 + 窗下暖气片
    const f = 0.045
    main.push(bx(w + f * 2, f, 0.1, 0, y1 + f / 2, 0.05), bx(w + f * 2, 0.06, 0.16, 0, y0 - 0.03, 0.08), bx(f, h, 0.1, -w / 2 - f / 2, cy, 0.05), bx(f, h, 0.1, w / 2 + f / 2, cy, 0.05))
    main.push(bx(w, 0.05, 0.07, 0, cy + 0.05, 0.06), bx(w, 0.03, 0.05, 0, cy + 0.01, 0.035)) // 上下扇交接的中梁
    main.push(bx(0.02, h / 2 - 0.05, 0.04, -w / 2 + 0.01, y0 + h / 4, 0.07), bx(0.02, h / 2 - 0.05, 0.04, w / 2 - 0.01, y0 + h / 4, 0.07))
    // 卷帘：卷筒 + 帘布（拉下约 1/3）+ 拉杆 + 拉绳环
    const shade = 0.32 + (seed % 3) * 0.08
    second.push(cyl(0.028, 0.028, w + 0.04, 0, y1 - 0.02, 0.12, 'x', 12), bx(w - 0.02, h * shade, 0.006, 0, y1 - 0.04 - (h * shade) / 2, 0.118), bx(w - 0.04, 0.022, 0.018, 0, y1 - 0.04 - h * shade, 0.12))
    extra.push(cyl(0.004, 0.004, 0.09, 0, y1 - 0.04 - h * shade - 0.05, 0.125, 'y', 5), new THREE.TorusGeometry(0.012, 0.003, 4, 10).translate(0, y1 - 0.04 - h * shade - 0.1, 0.125))
    // 窗下铸铁暖气片（9 片 + 进出水管）
    const rx0 = -0.38, n = 9, ry = 0.36
    for (let i = 0; i < n; i++) extra.push(bx(0.062, 0.56, 0.12, rx0 + i * 0.095, ry, 0.11))
    extra.push(cyl(0.018, 0.018, 0.86, 0, ry + 0.24, 0.11, 'x', 8), cyl(0.018, 0.018, 0.86, 0, ry - 0.24, 0.11, 'x', 8), cyl(0.014, 0.014, 0.08, 0.47, ry - 0.24, 0.07, 'z', 6))
    g.add(meshOf(main, frameMat('paint', S.frame, 0.6, 0.2), shatter, seed))
    g.add(meshOf(second, litMaterial({ color: '#d8d3c4', roughness: 0.95, side: THREE.DoubleSide }), shatter, seed + 1))
    g.add(meshOf(extra, frameMat('iron', '#bdb8aa', 0.7, 0.2), 0, seed + 2))
  } else {
    // 图书馆深窗洞：石膏窗套（侧/顶内衬 + 宽窗台）+ 漆木平开双扇 + 中梃 + 铸铁暖气片
    const f = 0.06, d = S.depth
    second.push(bx(0.12, h + 0.16, d + 0.12, -w / 2 - 0.06, cy, (d + 0.12) / 2 - 0.06), bx(0.12, h + 0.16, d + 0.12, w / 2 + 0.06, cy, (d + 0.12) / 2 - 0.06), bx(w + 0.24, 0.1, d + 0.12, 0, y1 + 0.05, (d + 0.12) / 2 - 0.06))
    second.push(bx(w + 0.5, 0.05, d + 0.22, 0, y0 - 0.06, (d + 0.22) / 2 - 0.06)) // 宽窗台
    main.push(bx(w, f, 0.06, 0, y1 - f / 2, 0.035), bx(w, f, 0.07, 0, y0 + f / 2, 0.04), bx(f, h, 0.06, -w / 2 + f / 2, cy, 0.035), bx(f, h, 0.06, w / 2 - f / 2, cy, 0.035), bx(0.07, h, 0.075, 0, cy, 0.045))
    for (const sx of [-1, 1]) { // 两扇的扇框（略内收）+ 把手
      main.push(bx(0.028, h - f * 2, 0.045, sx * (w / 2 - f - 0.014), cy, 0.05), bx(w / 2 - f - 0.04, 0.03, 0.045, sx * (w / 4 - 0.005), y1 - f - 0.015, 0.05), bx(w / 2 - f - 0.04, 0.03, 0.045, sx * (w / 4 - 0.005), y0 + f + 0.015, 0.05))
      extra.push(bx(0.016, 0.1, 0.02, sx * 0.055, cy - 0.04, 0.09))
    }
    const rx0 = -0.3, n = 7, ry = 0.44
    for (let i = 0; i < n; i++) extra.push(cyl(0.035, 0.035, 0.6, rx0 + i * 0.1, ry, 0.12, 'y', 10), bx(0.07, 0.62, 0.04, rx0 + i * 0.1, ry, 0.12))
    extra.push(cyl(0.02, 0.02, 0.74, 0, ry + 0.31, 0.12, 'x', 8), cyl(0.02, 0.02, 0.74, 0, ry - 0.31, 0.12, 'x', 8))
    for (const sx of [-1, 1]) extra.push(cyl(0.022, 0.03, 0.12, sx * 0.31, ry - 0.39, 0.12, 'y', 8), cyl(0.014, 0.014, 0.28, sx * 0.42, ry - 0.31, 0.12, 'x', 6))
    g.add(meshOf(main, frameMat('paint', S.frame, 0.55, 0.05), shatter, seed))
    g.add(meshOf(second, frameMat('plaster', '#d8d2c0', 0.95), shatter * 0.25, seed + 1))
    g.add(meshOf(extra, frameMat('iron', '#e2ddd0', 0.6, 0.15), 0, seed + 2))
  }
  return g
}

// ---------- 手臂 ----------
/** 毛边黑色材质：fresnel 边缘泛灰 + 竖向毛流噪声 */
let armMatCache: THREE.MeshStandardMaterial | null = null
function armMaterial(): THREE.MeshStandardMaterial {
  if (armMatCache) return armMatCache
  const fur = canvasTex('win-fur', 128, (g, n) => {
    rs = 4242; g.fillStyle = '#0c0b0b'; g.fillRect(0, 0, n, n)
    for (let i = 0; i < 900; i++) { const x = rnd() * n, y = rnd() * n, l = 4 + rnd() * 10; g.strokeStyle = `rgba(${40 + rnd() * 30},${36 + rnd() * 26},${34 + rnd() * 24},${0.4 + rnd() * 0.5})`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 2, y + l); g.stroke() }
  })
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', map: fur, roughness: 1, metalness: 0 })
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vViewPosition))),2.2);
      gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.16,.15,.14),rim*.55);`)
  }
  armMatCache = m; return m
}
/** 凹凸不平的锥形肢段（顶点噪声 = 毛乎乎、不规则的轮廓），沿 +Z 延伸 len */
function limb(r0: number, r1: number, len: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, len, 12, 8, true)
  g.rotateX(Math.PI / 2); g.translate(0, 0, len / 2)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const k = 1 + 0.16 * Math.sin(z * 23 + seed) * Math.cos(Math.atan2(y, x) * 5 + z * 7) + 0.06 * Math.sin(z * 61 + x * 40)
    p.setXY(i, x * k, y * k * 0.92)
  }
  g.computeVertexNormals(); return g
}
export interface WindowArmJoints { root: THREE.Object3D; shoulder: THREE.Object3D; elbow: THREE.Object3D; wrist: THREE.Object3D; fingers: THREE.Object3D[][]; thumb: THREE.Object3D[] }
export function buildWindowArm(scale = 1): THREE.Group & { userData: { joints: WindowArmJoints } } {
  const mat = armMaterial()
  const root = new THREE.Group(); root.name = 'arm'
  const shoulder = new THREE.Object3D(); root.add(shoulder)
  const up = new THREE.Mesh(limb(0.13, 0.09, 0.95, 1), mat); shoulder.add(up)
  const elbow = new THREE.Object3D(); elbow.position.z = 0.93; shoulder.add(elbow)
  elbow.add(new THREE.Mesh(new THREE.SphereGeometry(0.098, 10, 8), mat))
  const fore = new THREE.Mesh(limb(0.095, 0.068, 0.9, 2), mat); elbow.add(fore)
  const wrist = new THREE.Object3D(); wrist.position.z = 0.88; elbow.add(wrist)
  // 手掌：偏大、方钝（附图 5 的拳形）
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.17, 3, 2, 3), mat); palm.position.z = 0.085
  { const p = palm.geometry.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * (1 - 0.25 * (p.getX(i) / 0.075) ** 2)); palm.geometry.computeVertexNormals() }
  wrist.add(palm)
  const fingers: THREE.Object3D[][] = []
  for (let f = 0; f < 4; f++) {
    const chain: THREE.Object3D[] = []; let parent: THREE.Object3D = wrist
    const base = new THREE.Object3D(); base.position.set(-0.054 + f * 0.036, 0, 0.17); parent.add(base); parent = base
    const L = [0.055, 0.042, 0.034].map((l) => l * (f === 0 || f === 3 ? 0.88 : 1))
    for (let s = 0; s < 3; s++) {
      const j = s === 0 ? base : new THREE.Object3D(); if (s) { j.position.z = L[s - 1]; parent.add(j) }
      j.add(new THREE.Mesh(limb(0.017 - s * 0.002, 0.015 - s * 0.002, L[s], f * 3 + s), mat))
      chain.push(j); parent = j
    }
    fingers.push(chain)
  }
  const thumb: THREE.Object3D[] = []
  { const b = new THREE.Object3D(); b.position.set(0.075, -0.01, 0.06); b.rotation.set(0, 0.7, 0); wrist.add(b); let parent: THREE.Object3D = b
    for (let s = 0; s < 2; s++) { const j = s ? new THREE.Object3D() : b; if (s) { j.position.z = 0.05; parent.add(j) }; j.add(new THREE.Mesh(limb(0.02, 0.017, 0.05, 20 + s), mat)); thumb.push(j); parent = j } }
  root.scale.setScalar(scale)
  root.traverse((o: any) => { if (o.isMesh) o.castShadow = true })
  const out = root as THREE.Group & { userData: { joints: WindowArmJoints } }
  out.userData.joints = { root, shoulder, elbow, wrist, fingers, thumb }
  return out
}
/** 手臂静态姿势：reach 0=完全缩在墙内，1=伸出约 1.9m；grip 0 张开 → 1 握拳；bend 肘弯 */
export function poseWindowArm(arm: THREE.Object3D, reach: number, grip: number, bend = 0.25, aimY = 0): void {
  const j = (arm.userData as { joints: WindowArmJoints }).joints
  j.shoulder.position.z = -1.9 + reach * 1.9
  j.shoulder.rotation.set(-aimY, 0, 0)
  j.elbow.rotation.set(bend * 0.6, 0, 0)
  j.wrist.rotation.set(-bend * 0.3 + grip * 0.15, 0, 0)
  for (const ch of j.fingers) ch.forEach((s, i) => { s.rotation.x = grip * (i === 0 ? 1.25 : 1.4) + 0.08 })
  j.thumb.forEach((s, i) => { s.rotation.x = grip * (i ? 0.9 : 0.4) })
}

// ---------- 总装 ----------
export function buildWindowEntity(opts: WindowOpts = {}): THREE.Group {
  const style = opts.style ?? 'l601', state = opts.state ?? 'occupied', seed = opts.seed ?? 1
  const S = WINDOW_STYLE[style]
  const decay = opts.decay ?? (state === 'dying' ? 1 : 0)
  const grp = new THREE.Group(); grp.userData.entityType = 'windowent'; grp.userData.windowStyle = style; grp.userData.windowState = state
  const frame = buildFrame(style, state === 'dying' ? decay : 0, seed); grp.add(frame)
  const scenery = sceneryMaterial({
    aspect: S.w / S.h, grid: S.grid, paper: S.paper, viewerSeed: opts.viewerSeed ?? seed, state,
    silhouette: state === 'occupied' ? opts.silhouette ?? 0.85 : 0, silHeight: opts.silHeight ?? (style === 'l2' ? 0.9 : 0.86), decay,
  })
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h), scenery); pane.position.set(0, S.cy, 0.012); pane.name = 'scenery'
  pane.userData.noCastShadow = true; pane.castShadow = false; grp.add(pane)
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h), glassMat(state === 'dying' ? 1 : 0)); glass.position.set(0, S.cy, 0.03); glass.renderOrder = 2; grp.add(glass)
  // 衰亡态：窗前悬停的碎玻璃片（缓慢自转，阶段 2 动画）
  if (state === 'dying') {
    rs = seed * 71
    const shards = new THREE.Group(); shards.name = 'shards'
    const sm = litMaterial({ color: '#cdd6df', roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    for (let i = 0; i < 14; i++) {
      const sz = 0.04 + rnd() * 0.09
      const tri = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, sz, rnd() * sz * 0.6, 0, rnd() * sz * 0.7, sz * (0.8 + rnd()), 0], 3))
      tri.center(); tri.computeVertexNormals(); tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2))
      const m = new THREE.Mesh(tri, sm)
      m.position.set((rnd() - 0.5) * S.w * 1.3, S.cy + (rnd() - 0.5) * S.h, 0.08 + rnd() * 0.35)
      m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3)
      m.userData.base = { p: m.position.clone(), r: m.rotation.clone(), ph: rnd() * 6.28, sp: 0.3 + rnd() * 0.6 }
      shards.add(m)
    }
    grp.add(shards)
  }
  // 手臂：从玻璃中心略偏下伸出，默认完全缩在墙内（不可见）
  const arm = buildWindowArm(style === 'l2' ? 0.92 : 1); arm.position.set(0, S.cy - 0.12, 0); arm.visible = false; grp.add(arm)
  poseWindowArm(arm, 0, 0)
  grp.userData.window = { style, state, frame, pane, glass, arm, scenery, uniforms: scenery.uniforms, shards: grp.getObjectByName('shards') ?? null, frameRest: frame.children.map((c) => ({ p: c.position.clone(), r: c.rotation.clone() })), glassW: S.w, glassH: S.h, cy: S.cy }
  ownImportedModel(grp)
  const w = grp.userData.window as { scenery: THREE.ShaderMaterial; pane: THREE.Mesh; uniforms: Record<string, THREE.IUniform> }
  w.scenery = w.pane.material as THREE.ShaderMaterial; w.uniforms = (w.pane.material as THREE.ShaderMaterial).uniforms
  return grp
}

/** 每帧：推进景观时间（窗内的笔触缓慢流动） */
export function tickWindowEntity(g: THREE.Object3D, t: number): void {
  const w = g.userData.window as { uniforms: Record<string, THREE.IUniform> } | undefined
  if (w) w.uniforms.uTime.value = t
}

// ---------- 普通窗户（同层窗型，供 L2 / L601 结构渲染用；被 Entity 2 占据时实体模型叠在它前面） ----------
let ordinaryPaneMat: Record<string, THREE.Material> = {}
/** 普通窗户：同一套窗框（不碎），玻璃后是平淡的暗色（L2 维修通道窗外一片漆黑）/ 灰白雾（L601 图书馆外什么都没有） */
export function buildOrdinaryWindow(style: WindowStyle, seed = 1): THREE.Group {
  const S = WINDOW_STYLE[style]
  const g = new THREE.Group(); g.userData.ordinaryWindow = style
  g.add(buildFrame(style, 0, seed))
  const mat = ordinaryPaneMat[getMaterialMode() + style] ??= style === 'l2'
    ? litMaterial({ color: '#0d1013', roughness: 0.35, metalness: 0.2 })
    : new THREE.MeshBasicMaterial({ color: style === 'l601' ? '#c9ccc6' : '#9aa3a8', fog: true })
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h), mat); pane.position.set(0, S.cy, 0.012); g.add(pane)
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h), glassMat(0)); glass.position.set(0, S.cy, 0.03); glass.renderOrder = 2; g.add(glass)
  return ownImportedModel(g)
}
