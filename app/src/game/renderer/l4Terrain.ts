import * as THREE from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type {GameMap} from '../world/mapgen'
import type {TerrainRange} from './geometry'
import {l4StyleAt,L4_HEIGHT,l4Cell,l4Origin,l4VoidAt} from '../world/l4Layout'
import {l4Material,l4WorldUV,type L4Surface} from './l4Materials'
export function buildL4Terrain(m:GameMap,g:THREE.Group,range?:TerrainRange){
  const groups=new Map<string,{geos:THREE.BufferGeometry[];surface:L4Surface;style:string}>()
  const add=(geo:THREE.BufferGeometry,surface:L4Surface,style='officehall')=>{
    l4WorldUV(geo,m.inf?.ox??0,m.inf?.oy??0,surface==='floor'?.48:surface==='fabric'?2:1)
    const key=surface+style,rec=groups.get(key)??{geos:[],surface,style};rec.geos.push(geo);groups.set(key,rec)
  }
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,s:L4Surface,v='officehall')=>add(new THREE.BoxGeometry(w,h,d).translate(x,y,z),s,v)
  const floor=(x:number,y:number)=>x>=0&&y>=0&&x<m.w&&y<m.h&&m.tiles[y*m.w+x]===1
  const outside=(x:number,y:number)=>m.inf?l4VoidAt(m.inf.seed,x+m.inf.ox,y+m.inf.oy):!!m.outdoor[y*m.w+x]
  const stairs=m.structures.filter(s=>s.kind==='l4stairs')
  const tiled=m.structures.filter(s=>s.kind==='l4prop'&&['toilet','pantry'].includes(String(s.data?.room))).map(s=>{
    const bx=l4Origin(l4Cell(s.x+(m.inf?.ox??0)))-(m.inf?.ox??0),by=l4Origin(l4Cell(s.y+(m.inf?.oy??0)))-(m.inf?.oy??0)
    return{x:bx+(s.x-bx<10?4:14),y:by+(s.y-by<11?3:12),w:s.x-bx<10?6:5,h:s.y-by<11?8:7}
  })
  for(let y=range?.y0??0;y<(range?.y1??m.h);y++)for(let x=range?.x0??0;x<(range?.x1??m.w);x++){
    // A vertex has one canonical owner, including at chunk boundaries. The
    // analytic world field keeps returns intact as the streaming window moves.
    const corners=[outside(x,y),outside(x+1,y),outside(x,y+1),outside(x+1,y+1)].filter(Boolean).length
    if(corners===1||corners===3){
      box(.22,323,.22,x+1,1.5,y+1,'frame')
      box(.28,.20,.28,x+1,-.10,y+1,'wall')
    }
    const i=y*m.w+x;if(m.outdoor[i])continue
    const style=l4StyleAt(m,x,y),stair=stairs.find(s=>x>=s.x&&x<s.x+s.w&&y>=s.y&&y<s.y+s.h)
    if(floor(x,y)){
      if(m.elev[i]!==4)add(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2).translate(x+.5,0,y+.5),tiled.some(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h)?'tile':'floor',style)
      if(!stair)add(new THREE.PlaneGeometry(1,1).rotateX(Math.PI/2).translate(x+.5,L4_HEIGHT,y+.5),'ceiling',style)
      for(const [dx,dy]of [[1,0],[0,1]])if(floor(x+dx,y+dy)&&l4StyleAt(m,x+dx,y+dy)!==style){
        box(dx?.055:1,.006,dy?.055:1,x+.5+dx*.5,.003,y+.5+dy*.5,'trim')
        box(dx?.14:1,.12,dy?.14:1,x+.5+dx*.5,L4_HEIGHT-.06,y+.5+dy*.5,'edge')
      }
    }else if(m.tiles[i]===2){
      // Only exposed faces; dark vinyl skirting follows the same wall contour.
      for(const [dx,dy,rot]of [[0,1,0],[0,-1,Math.PI],[1,0,Math.PI/2],[-1,0,-Math.PI/2]])if(floor(x+dx,y+dy)||((x+dx<0||x+dx>=m.w||y+dy<0||y+dy>=m.h)&&!outside(x+dx,y+dy))){
        add(new THREE.PlaneGeometry(1,L4_HEIGHT).rotateY(rot).translate(x+.5+dx*.5,L4_HEIGHT/2,y+.5+dy*.5),'wall',style)
        box(dx?.035:1,.11,dy?.035:1,x+.5+dx*.516,.055,y+.5+dy*.516,'trim')
      }
    }
    // Extend the actual coast, above AND below the playable floor. No void floor.
    for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,ny=y+dy
      if(!outside(nx,ny))continue
      if(m.tiles[i]===2)box(dx?.18:1,L4_HEIGHT,dy?.18:1,x+.5+dx*.5,L4_HEIGHT/2,y+.5+dy*.5,'facade')
      for(const [base,top]of [[-160,-.2],[L4_HEIGHT+.2,163]])box(dx?.18:1,top-base,dy?.18:1,x+.5+dx*.5,(base+top)/2,y+.5+dy*.5,'facade')
      box(dx?.24:1,.22,dy?.24:1,x+.5+dx*.5,-.11,y+.5+dy*.5,'wall')
      // Close the slab edge above the ceiling; the upper facade starts at 3.1m.
      box(dx?.24:1,.30,dy?.24:1,x+.5+dx*.5,L4_HEIGHT+.10,y+.5+dy*.5,'wall')
    }
  }
  for(const {geos,surface,style}of groups.values()){
    const merged=mergeGeometries(geos,false);if(merged){const mesh=new THREE.Mesh(merged,l4Material(surface,style));mesh.receiveShadow=true;mesh.castShadow=surface==='wall';g.add(mesh)}
    for(const geo of geos)geo.dispose()
  }
}
