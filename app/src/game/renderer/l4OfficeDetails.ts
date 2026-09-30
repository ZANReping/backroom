import * as THREE from 'three'
import { l4Material } from './l4Materials'

type DetailKind = 'services'|'wallkit'|'printer'|'pantry'|'toilet'|'server'|'archive'|'deskItems'|'blinds'
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

export function buildL4OfficeDetail(kind: DetailKind, seed = 0): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'services') services(g); else if (kind === 'wallkit') wallkit(g); else if (kind === 'printer') printer(g); else if (kind === 'pantry') pantry(g); else if (kind === 'toilet') toilet(g); else if (kind === 'server') server(g, seed); else if (kind === 'archive') archive(g, seed); else if (kind === 'deskItems') deskItems(g, seed); else blinds(g)
  return g
}
