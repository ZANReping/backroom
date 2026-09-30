import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { GameMap } from '../world/mapgen'
import { tallCeilH } from '../world/mapgen'
import type { TerrainRange } from './geometry'
import { l5Material, l5WorldUV, type L5Surface } from './l5Materials'
import { l5CorridorAt } from '../world/infiniteL5'

const unitBox=new THREE.BoxGeometry(1,1,1)
const unitEgg=new THREE.SphereGeometry(1,8,6)
/** Millwork follows actual wall faces. Every segment belongs to one floor tile. */
export function* buildL5Architecture(m: GameMap, height: number, root: THREE.Group, range?: TerrainRange) {
  const buckets = new Map<L5Surface, THREE.BufferGeometry[]>(), ox = m.inf?.ox ?? 0, oy = m.inf?.oy ?? 0
  const add = (geo: THREE.BufferGeometry, surface: L5Surface, uv = true) => {
    if (uv) l5WorldUV(geo, ox, oy, surface==='goldPaper'?.85:surface==='whitePaint'?1.7:surface === 'damask' ? .7 : .5)
    const gs = buckets.get(surface) ?? []; gs.push(geo); buckets.set(surface, gs)
  }
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, s: L5Surface) => add(unitBox.clone().scale(w,h,d).translate(x, y, z), s)
  const floor = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[y * m.w + x] === 1
  const wall = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[y * m.w + x] !== 1
  const mod = (n: number, d: number) => ((n % d) + d) % d
  const portals=new Set(m.structures.filter(s=>s.kind==='hoteldoor'||s.data?.profile==='portal').map(s=>`${s.x},${s.y}`))
  for(const e of m.exits)if(['darkwooddoor','elevatorshaft'].includes(e.def.kind))portals.add(`${Math.floor(e.x)},${Math.floor(e.y)}`)
  const recesses=new Map<string,string>()
  for(const e of m.exits)if(e.def.kind==='boilerdeep')for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
    const x=Math.floor(e.x),y=Math.floor(e.y)
    if(wall(x+dx,y+dy)){recesses.set(`${x},${y}`,`${dx},${dy}`);break}
  }
  try {
  for (let y = range?.y0 ?? 0; y < (range?.y1 ?? m.h); y++) {
    yield
    for (let x = range?.x0 ?? 0; x < (range?.x1 ?? m.w); x++) {
      if(x%8===0)yield
      if (!floor(x,y)) continue
      const tint = m.tint[y*m.w+x], hall = tint === 61 || tint === 62, plain = tint === 60, ornate = tint === 21
      const nest=tint===68,ballroom=tint===63,dining=tint===64,service=tint===25,boiler=tint===24||tint===67,guest=tint===65||tint===66,gym=tint===26,pool=tint===23
      if (!hall && !plain && !ornate && !ballroom && !dining && !service && !boiler && !guest && !gym && !pool && !nest) continue
      const H = m.ceiling[y*m.w+x] ? tallCeilH(m, height) : height, wx = x+ox, wy = y+oy
      if(service){
        for(const o of [-.5,0]){box(1,.018,.015,x+.5,H-.024,y+.5+o,'steel');box(.015,.018,1,x+.5+o,H-.024,y+.5,'steel')}
      }
      if(ballroom||dining){
        // Shallow coffer grids, stepped borders and recessed cream ceiling fields.
        for(const alongX of [true,false])if(mod(alongX?wy:wx,6)===0){
          box(alongX?1:.42,.24,alongX?.42:1,x+.5,H-.14,y+.5,'wood')
          for(const side of [-1,1])box(alongX?1:.07,.055,alongX?.07:1,x+.5+(alongX?0:side*.27),H-.15,y+.5+(alongX?side*.27:0),'ballroomPanel')
        }
      }
      if(boiler){
        // Both axes continue through intersections, at separate heights. Neighbours share
        // exactly the same open-ended tube surface; caps only occur at actual room walls.
        for(const alongX of [true,false])if(mod(alongX?wy:wx,alongX?3:4)===0){
          const height=H-(alongX?.32:.78)
          const pipe=new THREE.CylinderGeometry(.19,.19,1,10,1,true)
          pipe.rotateZ(alongX?Math.PI/2:0);if(!alongX)pipe.rotateX(Math.PI/2)
          pipe.translate(x+.5,height,y+.5);add(pipe,'insulation')
          if(mod(alongX?wx:wy,3)===0){
            const strap=new THREE.CylinderGeometry(.202,.202,.042,10,1,true)
            strap.rotateZ(alongX?Math.PI/2:0);if(!alongX)strap.rotateX(Math.PI/2)
            strap.translate(x+.5,height,y+.5);add(strap,'steel')
          }
          for(const sign of [-1,1])if(!floor(x+(alongX?sign:0),y+(alongX?0:sign))){
            const cap=new THREE.CircleGeometry(.19,10)
            if(alongX)cap.rotateY(sign*Math.PI/2);else if(sign<0)cap.rotateY(Math.PI)
            cap.translate(x+.5+(alongX?sign*.5:0),height,y+.5+(alongX?0:sign*.5));add(cap,'steel')
          }
        }
        if(mod(wy,3)===1)box(1,.09,.075,x+.5,H-.58,y+.5,'rust')
      }
      if (ornate) {
        const c = l5CorridorAt(m.inf?.seed ?? 0, wx, wy)
        // Deep transverse cream soffits, with two raised fillets, as in photo 3.
        if (mod(c.axis === 'y' ? wy : wx, 4) === 0) {
          const alongX = c.axis === 'y'
          box(alongX?1:.36,.30,alongX?.36:1,x+.5,H-.15,y+.5,'ceiling')
          for (const offset of [-.2,.2]) box(alongX?1:.045,.095,alongX?.045:1,x+.5+(alongX?0:offset),H-.055,y+.5+(alongX?offset:0),'ivory')
        }
      }
      if (hall && mod(wx,2) === 0) {
        box(.14,.13,1,x+.5,H-.07,y+.5,'wood')
        for (const side of [-1,1]) box(.025,.028,1,x+.5+side*.085,H-.12,y+.5,'gold')
      }
      for (const [dx,dy,rot] of [[1,0,Math.PI/2],[-1,0,-Math.PI/2],[0,1,0],[0,-1,Math.PI]]) {
        if (!wall(x+dx,y+dy)) continue
        const X=x+.5+dx*.493,Z=y+.5+dy*.493, axis=dx?wy:wx
        // Local +Z points into the room. Backing stays in the existing collision wall.
        const a = rot+Math.PI
        const part=(w:number,h:number,d:number,u:number,v:number,out:number,s:L5Surface,uv=true)=>{
          const geo=unitBox.clone().scale(w,h,d).translate(u,v,out)
          // Mitred returns close inner/outer corners at every trim depth, including
          // negative coordinates and chunk seams, instead of overlapping square ends.
          if(w===1&&u===0){
            const p=geo.getAttribute('position'),tx=Math.round(Math.cos(a)),ty=-Math.round(Math.sin(a))
            for(const sign of [-1,1]){
              const inner=wall(x+tx*sign,y+ty*sign),outer=!inner&&!wall(x+dx+tx*sign,y+dy+ty*sign)
              if(inner||outer)for(let i=0;i<p.count;i++)if(p.getX(i)*sign>.49)
                p.setX(i,sign*(.5+(inner?-1:1)*(.007+p.getZ(i))))
            }
            geo.computeVertexNormals()
          }
          geo.rotateY(a).translate(X,0,Z)
          add(geo,s,uv)
        }
        const finish:L5Surface=nest?'flesh':boiler?'brick':service||plain?'whitePaint':ballroom?'ballroomPanel':hall?'damask':'goldPaper'
        if(recesses.get(`${x},${y}`)===`${dx},${dy}`){
          for(const sign of [-1,1])part(.055,H,.025,sign*.4775,H/2,.018,finish)
          part(.89,H-2.40,.025,0,(H+2.40)/2,.018,finish)
          continue
        }
        if(portals.has(`${x},${y}`)){
          // Door reveals never carry chair rails, skirting or pilasters into the jamb.
          part(1,H,.014,0,H/2,0,finish);continue
        }
        if(nest){
          part(1,H,.025,0,H/2,.018,'flesh')
          // Upper organic mantle and amber brood clusters, stable across chunk edges.
          for(let n=0;n<3;n++){
            const u=(n-1)*.32,Y=H-.23-(mod(axis+n,3))*.11
            const geo=unitEgg.clone().scale(.23,.23,.14).translate(u,Y,.075).rotateY(a).translate(X,0,Z)
            add(geo,'flesh',false)
          }
          for(let n=0;n<16;n++){
            const u=-.43+(n%8)*.122,Y=H-.12-Math.floor(n/8)*.073-(mod(axis+n,3))*.023
            const geo=unitEgg.clone().scale(.019,.026,.020).translate(u,Y,.19).rotateY(a).translate(X,0,Z)
            add(geo,'egg',false)
          }
          if(wall(x+dy,y+dx)||wall(x-dy,y-dx))for(let n=0;n<10;n++){
            const geo=unitEgg.clone().scale(.021,.028,.022).translate(.37,.3+n*.18,.10).rotateY(a).translate(X,0,Z)
            add(geo,'egg',false)
          }
          continue
        }
        if(service){
          part(1,H,.018,0,H/2,.012,'whitePaint')
          part(1,1.37,.028,0,.705,.035,'steel')
          part(1,.12,.065,0,.99,.066,'blackSteel');part(1,.10,.04,0,.40,.062,'wood')
          part(.024,1.38,.016,-.49,.70,.056,'blackSteel')
          part(1,.065,.052,0,.035,.06,'steel');continue
        }
        if(boiler){
          part(1,H,.025,0,H/2,.018,'brick')
          part(1,.10,.08,0,.055,.06,'blackSteel')
          if(mod(axis,3)===1){
            part(.048,H-.14,.075,0,(H-.14)/2,.16,'blackSteel')
            part(1,.045,.24,0,H-.72,.13,'steel')
          }
          continue
        }
        if(ballroom||dining||guest||gym||pool){
          part(1,H,.018,0,H/2,.012,pool?'poolTile':ballroom?'ballroomPanel':guest?'goldPaper':'whitePaint')
          part(1,.13,.05,0,.065,.039,ballroom?'ballroomPanel':'wood')
          part(1,.065,.065,0,1.05,.040,ballroom?'ivory':'wood')
          part(1,.09,.17,0,H-.07,.07,'ivory');part(1,.055,.23,0,H-.16,.08,'ballroomPanel')
          if(!pool){
            part(1,.77,.025,0,.57,.032,ballroom?'ballroomPanel':'wood')
            if(mod(axis,3)===0){
              part(.16,H-.24,.08,0,(H-.24)/2,.062,ballroom?'ivory':'wood')
              for(const side of [-1,1])part(.023,H-.4,.016,side*.061,(H-.4)/2+.1,.111,'gold')
            }
            if(ballroom){part(1,.034,.05,0,.29,.065,'ivory');part(1,.025,.047,0,2.6,.065,'ivory')}
          }
          continue
        }
        part(1,.17,.065,0,.085,.027,plain?'ivory':hall?'wood':'ivory')
        part(1,.035,.083,0,.185,.035,plain?'ivory':hall?'gold':'ivory')
        for(const [h,d,Y] of [[.13,.08,H-.07],[.065,.14,H-.15],[.05,.19,H-.205]]) part(1,h,d,0,Y,d/2,'ivory')
        if (plain) { part(1,H-.22,.016,0,(H-.22)/2+.21,.009,'whitePaint'); continue }
        if (hall) {
          part(1,.73,.035,0,.56,.012,'wood')
          part(1,.055,.07,0,.94,.03,'gold')
          part(1,H-1.65,.022,0,(H-.65+.98)/2,.012,'damask')
          part(1,.4,.045,0,H-.43,.015,'frieze',false)
          if(mod(axis,3)===0){part(.10,H-.9,.07,0,(H-.9)/2,.045,'wood');part(.023,H-.95,.022,0,(H-.95)/2,.089,'gold')}
        } else {
          part(1,H-.22,.014,0,(H-.22)/2+.21,.011,'goldPaper')
          // A complete panel is emitted only when its neighbours are walls, never across an opening.
          if(mod(axis,3)===1 && wall(x+dx+(dx?0:-1),y+dy+(dx?-1:0)) && wall(x+dx+(dx?0:1),y+dy+(dx?1:0))) {
            part(1.64,2.30,.024,0,1.57,.020,'redPanel')
            for(const s of [-1,1]) {part(.065,2.43,.067,s*.865,1.57,.050,'ivory');part(.015,2.35,.02,s*.81,1.57,.086,'gold')}
            for(const Y of [.355,2.785]) {part(1.8,.065,.067,0,Y,.05,'ivory');part(1.67,.014,.02,0,Y+(Y<1?.047:-.047),.086,'gold')}
          }
          if(mod(axis,4)===0) {
            part(.32,.34,.23,0,H-.42,.10,'ivory')
            for(let j=0;j<4;j++) part(.27-j*.04,.05,.19-j*.03,0,H-.61-j*.045,.075-j*.008,'ivory')
            part(1,.15,.04,0,H-.37,.023,'ceiling')
          }
        }
      }
    }
  }
  for (const [s,geos] of buckets) {
    for(let i=0;i<geos.length;i+=384){
      yield
      const merged=mergeGeometries(geos.slice(i,i+384),false)
      if(merged){const mesh=new THREE.Mesh(merged,l5Material(s));mesh.name=`l5-${s}-millwork`;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh)}
    }
  }
  } finally {for(const geos of buckets.values())for(const geo of geos)geo.dispose()}
}
