import * as THREE from 'three'
import { l4Material } from './l4Materials'

type DetailKind = 'services'|'wallkit'|'printer'|'pantry'|'toilet'|'server'|'archive'|'deskItems'|'blinds'|'boxes'|'chairstack'|'plant'|'whiteboard'
const red = new THREE.MeshLambertMaterial({ color: '#a52b2b' })
const paper = new THREE.MeshLambertMaterial({ color: '#f3f0e5' })
const steel = new THREE.MeshStandardMaterial({ color: '#aeb5b3', metalness: .45, roughness: .42 })
const black = new THREE.MeshLambertMaterial({ color: '#202426' })
const rubber = new THREE.MeshLambertMaterial({ color: '#30383a' })
const blue = new THREE.MeshLambertMaterial({ color: '#586b78' })
const brown = new THREE.MeshLambertMaterial({ color: '#806b55' })

function box(g: THREE.Group, mat: THREE.Material, size: [number, number, number], p: [number, number, number]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat)
  m.position.set(...p); m.castShadow = true; m.receiveShadow = true; g.add(m); return m
}
function cyl(g: THREE.Group, mat: THREE.Material, r: number, h: number, p: [number, number, number], radial = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, radial), mat)
  m.position.set(...p); m.castShadow = true; m.receiveShadow = true; g.add(m); return m
}
function material(surface: Parameters<typeof l4Material>[0]) { return l4Material(surface) }

function services(g: THREE.Group) {
  const ceil = material('ceiling'), frame = material('frame')
  box(g, ceil, [.6, .035, .6], [0, 2.84, 0])
  for (const side of [.48,.36,.24,.12]) { box(g, frame, [side,.012,.022], [0,2.818-(.012*(.48-side)/.12),0]); box(g, frame, [.022,.012,side], [0,2.818-(.012*(.48-side)/.12),0]) }
  cyl(g, paper, .09, .025, [.42, 2.86, .18]); cyl(g, steel, .045, .04, [.22, 2.86, .42]); cyl(g, steel, .055, .035, [-.3, 2.86, .3])
}
function wallkit(g: THREE.Group) {
  const trim = material('trim'), edge = material('edge')
  box(g, paper, [.22,.16,.018], [-.3,.3,.015]); box(g, black, [.035,.025,.02], [-.34,.3,.03]); box(g, black, [.035,.025,.02], [-.26,.3,.03])
  box(g, trim, [.12,.16,.018], [.3,1.15,.015]); box(g, black, [.025,.07,.02], [.3,1.15,.03])
  box(g, edge, [.18,.14,.018], [.0,1.45,.015]); box(g, black, [.04,.025,.02], [.0,1.46,.03])
}
function printer(g: THREE.Group) {
  const body = material('desk'), edge = material('edge')
  box(g, body, [.7, .9, .7], [0,.45,0]); box(g, edge, [.48,.05,.28], [0,.72,.36]); box(g, black, [.38,.025,.14], [0,.64,.36]); box(g, paper, [.38,.03,.2], [0,.77,.22]); box(g, edge, [.6,.05,.6], [0,.93,0])
}
function pantry(g: THREE.Group) {
  const desk = material('desk'), wall = material('wall'), trim = material('trim')
  box(g, desk, [2.2,.75,.65], [0,.375,0]); box(g, wall, [2.2,.08,.7], [0,.86,0])
  for(const x of [-.81,-.27,.27,.81]){box(g,wall,[.525,.64,.018],[x,.40,.337]);box(g,steel,[.13,.018,.027],[x,.68,.359])}
  box(g,steel,[.68,.018,.48],[-.55,.909,.02]);box(g,black,[.56,.01,.35],[-.55,.920,.02]);cyl(g,steel,.025,.28,[-.2,1.05,-.12]);box(g,steel,[.21,.035,.035],[-.29,1.185,-.12])
  cyl(g,steel,.14,.28,[.45,1.05,0],16);cyl(g,black,.12,.018,[.45,1.199,0]);box(g,steel,[.09,.055,.06],[.29,1.10,0]);box(g,black,[.035,.18,.07],[.63,1.05,0]);box(g,black,[.09,.025,.07],[.60,1.14,0]);box(g,black,[.09,.025,.07],[.60,.96,0])
  box(g,trim,[2.0,.55,.32],[0,1.725,-.22]);for(const x of [-.65,0,.65]){box(g,wall,[.63,.5,.018],[x,1.725,-.047]);box(g,steel,[.10,.018,.02],[x,1.52,-.025])}
}
function toilet(g: THREE.Group) {
  box(g,paper,[.42,.5,.19],[0,.64,-.32]);box(g,steel,[.07,.025,.025],[.12,.78,-.21])
  const bowl=new THREE.Mesh(new THREE.CylinderGeometry(.235,.13,.32,16),paper);bowl.position.set(0,.25,.06);bowl.scale.z=1.2;bowl.castShadow=bowl.receiveShadow=true;g.add(bowl)
  const seat=new THREE.Mesh(new THREE.TorusGeometry(.205,.045,6,20),paper);seat.rotation.x=Math.PI/2;seat.scale.y=1.25;seat.position.set(0,.44,.06);seat.castShadow=true;g.add(seat)
  cyl(g,black,.17,.012,[0,.411,.06],16)
  box(g,paper,[.43,.1,.34],[.67,.82,-.28]);box(g,steel,[.30,.02,.23],[.67,.875,-.28]);cyl(g,steel,.025,.24,[.82,.97,-.36]);box(g,steel,[.12,.025,.025],[.77,1.08,-.36]);cyl(g,steel,.035,.75,[.67,.4,-.28])
  box(g,black,[.50,.59,.025],[.67,1.42,-.455]);box(g,steel,[.46,.55,.015],[.67,1.42,-.435])
  const roll=cyl(g,paper,.065,.14,[-.42,.78,-.40]);roll.rotation.z=Math.PI/2
}
function server(g: THREE.Group, seed: number) {
  const frame = material('frame'), edge = material('edge')
  box(g, frame, [.65,1.9,.75],[0,.95,0]); for(let i=0;i<6;i++){box(g, black,[.52,.018,.035],[0,.25+i*.28,.39]); cyl(g, seed%2?red:paper,.018,.018,[.24,.25+i*.28,.42],8)} box(g, edge,[.58,.04,.68],[0,1.9,0])
}
function archive(g: THREE.Group, seed: number) {
  const frame = material('frame'); for(const x of [-.73,.73]) box(g, frame,[.04,1.8,.4],[x,.9,0]); for(let i=0;i<5;i++){box(g, frame,[1.5,.035,.4],[0,.12+i*.34,0]); for(let j=0;j<8;j++) box(g, (i+j+seed)%3===0?blue:(i+j+seed)%3===1?brown:paper,[.1,.26,.28],[-.6+j*.17,.27+i*.34,.03])}
}
function deskItems(g: THREE.Group, seed: number) {
  const desk = material('desk'); box(g, desk,[.18,.06,.15],[-.48,.805,0]);box(g,black,[.17,.025,.045],[-.48,.845,-.035]);box(g,black,[.085,.004,.055],[-.48,.837,.035]); box(g,paper,[.3,.012,.22],[.1,.781,.05]); box(g,paper,[.28,.012,.2],[.1,.793,.05]); cyl(g, black,.055,.15,[.42,.85,0],10); box(g, rubber,[.13,.025,.08],[.35,.787,.2]); if(seed%2) box(g,red,[.01,.12,.01],[.18,.835,.02])
}
function blinds(g: THREE.Group) {
  const edge = material('edge'); for(let i=0;i<12;i++){const m=box(g,edge,[.92,.012,.045],[0,1.75+(i-5.5)*.125,0]);m.rotation.x=.2} for(const x of [-.38,.38]) box(g,black,[.012,1.65,.012],[x,1.75,.04])
}

// ---- v2 abandoned-office clutter (hall/open zones)
const card = new THREE.MeshLambertMaterial({ color: '#9c8b70' }), cardDark = new THREE.MeshLambertMaterial({ color: '#86765c' })
const tape = new THREE.MeshLambertMaterial({ color: '#c9b78c' }), soil = new THREE.MeshLambertMaterial({ color: '#3b3128' })
const deadLeaf = new THREE.MeshLambertMaterial({ color: '#7a7348', side: THREE.DoubleSide }), pot = new THREE.MeshLambertMaterial({ color: '#d8d4c8' })
const r01 = (seed: number, k: number) => { const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v) }
function boxes(g: THREE.Group, seed: number) {
  // archive cartons stacked against each other, one lid ajar, one fallen
  const n = 3 + Math.floor(r01(seed, 1) * 4)
  for (let i = 0; i < n; i++) {
    const stack = i % 3, row = Math.floor(i / 3), w = .46, h = .30, d = .34
    const b = box(g, i % 2 ? card : cardDark, [w, h, d], [-.25 + row * .5 + (r01(seed, i) - .5) * .06, h / 2 + stack * h, (r01(seed, i + 9) - .5) * .1])
    b.rotation.y = (r01(seed, i + 3) - .5) * .25
    box(g, tape, [w + .004, .02, .06], [b.position.x, b.position.y + h / 2 - .005, b.position.z]).rotation.y = b.rotation.y
    if (stack === 2 && r01(seed, 20) > .5) i += 3 - stack
  }
  if (r01(seed, 30) > .5) { const f = box(g, card, [.46, .30, .34], [.55, .17, .35]); f.rotation.set(0, .9, Math.PI / 2) }
  box(g, paper, [.21, .004, .30], [.2, .002, .45]).rotation.y = r01(seed, 31) * 3
}
function chairstack(g: THREE.Group, seed: number) {
  // stacking guest chairs: tubular frame + grey shell, 4–6 high
  const frame = material('frame'), shell = material('chair'), n = 4 + Math.floor(r01(seed, 2) * 3)
  for (let i = 0; i < n; i++) {
    const y = .45 + i * .085
    box(g, shell, [.44, .035, .42], [0, y, 0]); const back = box(g, shell, [.44, .34, .03], [0, y + .21, -.22]); back.rotation.x = -.12
  }
  for (const x of [-.21, .21]) for (const z of [-.19, .19]) box(g, frame, [.022, .45, .022], [x, .225, z])
  for (const x of [-.21, .21]) box(g, frame, [.022, .022, .42], [x, .02, 0])
}
function plant(g: THREE.Group, seed: number) {
  // dead office ficus in a plastic planter
  cyl(g, pot, .19, .42, [0, .21, 0], 16); cyl(g, soil, .175, .02, [0, .415, 0], 16)
  const trunk = cyl(g, brown, .018, .9, [0, .86, 0], 6); trunk.rotation.z = .06
  const leaves = 9 + Math.floor(r01(seed, 3) * 6)
  for (let i = 0; i < leaves; i++) {
    const a = r01(seed, i + 40) * Math.PI * 2, h = .9 + r01(seed, i + 60) * .45, r = .1 + r01(seed, i + 80) * .22
    const l = new THREE.Mesh(new THREE.PlaneGeometry(.09, .16), deadLeaf); l.position.set(Math.cos(a) * r, h, Math.sin(a) * r); l.rotation.set(-.9 - r01(seed, i) * .9, a, 0); g.add(l)
  }
  for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(.09, .16), deadLeaf); l.rotation.x = -Math.PI / 2; l.rotation.z = r01(seed, i + 100) * 6; l.position.set((r01(seed, i + 110) - .5) * .8, .004, (r01(seed, i + 120) - .5) * .8); g.add(l) }
}
function whiteboard(g: THREE.Group, seed: number) {
  // mobile whiteboard, faint ghost marks
  const frame = material('frame'), edge = material('edge')
  box(g, paper, [1.2, .9, .02], [0, 1.35, 0]); box(g, edge, [1.24, .03, .04], [0, 1.81, 0]); box(g, edge, [1.24, .05, .08], [0, .89, .02])
  for (const x of [-.6, .6]) { box(g, frame, [.03, 1.75, .03], [x, .9, 0]); box(g, frame, [.03, .03, .5], [x, .06, 0]); for (const z of [-.22, .22]) cyl(g, rubber, .03, .03, [x, .03, z], 8) }
  for (let i = 0; i < 4; i++) box(g, i % 2 ? blue : red, [.25 + r01(seed, i) * .4, .008, .001], [(r01(seed, i + 5) - .5) * .7, 1.1 + r01(seed, i + 7) * .5, .011]).rotation.z = (r01(seed, i + 9) - .5) * .4
}

export function buildL4OfficeDetail(kind: DetailKind, seed = 0): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'boxes') boxes(g, seed); else if (kind === 'chairstack') chairstack(g, seed); else if (kind === 'plant') plant(g, seed); else if (kind === 'whiteboard') whiteboard(g, seed); else if (kind === 'services') services(g); else if (kind === 'wallkit') wallkit(g); else if (kind === 'printer') printer(g); else if (kind === 'pantry') pantry(g); else if (kind === 'toilet') toilet(g); else if (kind === 'server') server(g, seed); else if (kind === 'archive') archive(g, seed); else if (kind === 'deskItems') deskItems(g, seed); else blinds(g)
  return g
}
