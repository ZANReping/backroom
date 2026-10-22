import * as THREE from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type {Structure} from '../core/types'
import type {TradersAssets} from './tradersMeshes'
import {DressingParts} from './tradersDressingParts'

/** Shared low-poly terminal: inset display, shielded keys and separate cash slots. */
export function buildTradersAtm(s:Structure,assets:TradersAssets){
 const root=new THREE.Group();root.name='traders-bank-atm';root.userData.tradersOwnGeometry=true
 root.position.set(s.x+s.w/2,0,s.y+s.h/2);root.rotation.y=Number(s.data?.deg??0)*Math.PI/180
 const p=new DressingParts(assets),gray='#aab1ad',dark='#25322e',green='#405c50',metal='#8d9893'
 p.box(0,.055,0,1.08,.11,.82,'steel',dark,.018)
 p.box(0,.83,-.035,1.02,1.55,.75,'paint',gray,.035)
 p.box(0,1.82,-.015,1.08,.32,.81,'paint',green,.035)
 p.box(0,1.42,.355,.87,.59,.06,'rubber','#101915',.012)
 p.box(-.09,1.44,.39,.59,.41,.018,'rubber','#101915',.008)
 for(const x of [-.455,.275])p.box(x,1.44,.43,.045,.49,.16,'paint',gray,.01)
 p.box(.365,1.49,.407,.12,.17,.045,'steel',metal,.008)
 p.box(.365,1.51,.435,.083,.018,.009,'rubber','#101915')
 p.box(.365,1.56,.436,.04,.014,.008,'screen','#67a88d')
 p.box(0,1.08,.405,.85,.15,.15,'steel',metal,.016)
 p.box(-.14,1.11,.484,.41,.13,.018,'rubber','#101915',.01)
 for(let row=0;row<4;row++)for(let col=0;col<3;col++){
  p.box(-.27+col*.115,1.16-row*.031,.498,.084,.022,.014,'steel',metal)
 }
 for(const [i,c] of ['#8c4840','#b79b49','#5f8a6a'].entries())p.box(.21,1.16-i*.044,.495,.11,.028,.014,'paint',c,.004)
 for(const [y,w] of [[.86,.65],[.57,.72]]){
  p.box(0,y,.358,w+.10,.12,.06,'steel',metal,.01)
  p.box(0,y,.394,w,.048,.018,'rubber','#101915',.004)
  p.box(0,y-.048,.411,w+.04,.014,.07,'steel',dark,.005)
 }
 p.box(0,.28,.355,.91,.29,.03,'paint',green,.01)
 for(const x of [-.45,.45])for(const y of [.18,.42,1.73])p.cylinder(x,y,.373,.008,.018,'steel',metal)
 p.finish(root)
 const labels:THREE.BufferGeometry[]=[]
 for(const [text,x,y,z,w,h] of [
  ['B.N.T.G. / ATM',0,1.83,.4,.90,.18],
  ['信用点 / CREDIT',-.09,1.55,.402,.49,.067],
  ['存款 / DEPOSIT',-.09,1.44,.402,.49,.067],
  ['取款 / CASH',-.09,1.33,.402,.49,.067],
  ['存款 / DEPOSIT',0,.95,.4,.64,.09],
  ['取款 / CASH',0,.68,.4,.64,.09],
  ['信用点 / CREDIT',0,.28,.38,.77,.12]
 ] as const){
  const g=assets.labelGeometry(text,w,h);g.translate(x,y,z);labels.push(g)
 }
 try{const g=mergeGeometries(labels);if(!g)throw Error('ATM label geometry layout');root.add(new THREE.Mesh(g,assets.material('label','#ffffff',false)))}finally{for(const g of labels)g.dispose()}
 return root
}

