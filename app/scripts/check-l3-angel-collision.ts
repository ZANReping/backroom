import { l3AngelCollision } from '../src/game/world/l3AngelCollision'
import {structColliders,setStructModelColliders} from '../src/game/world/mapgen'

const base = { kind: 'angelstatue', x: 10, y: 20, w: 3, h: 1, solid: true, data: {} } as any
const boxes = l3AngelCollision(base)
const blocked=(x:number,z:number,h:number)=>boxes.some(b=>x>=b.x0&&x<=b.x1&&z>=b.y0&&z<=b.y1&&h>=(b.bottom??0)&&h<=b.top)
if(!blocked(11.5,20.5,.1))throw new Error('circular base centre must be filled')
for(let i=0;i<32;i++){
 const a=i*Math.PI/16
 if(!blocked(11.5+Math.cos(a)*.60,20.5+Math.sin(a)*.60,.1))throw new Error('base perimeter hole')
}
if(blocked(12.9,20.2,1.5)||blocked(10.1,20.2,1.5))throw new Error('air wall below wings')
if(!blocked(11.5,20.5,4.05))throw new Error('head collision missing')
if(!blocked(12.9,20.08,4.10))throw new Error('high wing collision missing')
if (!boxes.some(b => b.bottom === 0 && b.top > 1)) throw new Error('base plinth collision missing')
if (!boxes.some(b => (b.bottom ?? 0) > 2.4 && b.top > 3.5)) throw new Error('high wing collision missing')
if (boxes.slice(10).some(b => (b.bottom ?? 0) < 2.8)) throw new Error('wing underside air gap is blocked')
const rotated = l3AngelCollision({ ...base, data: { deg: 90 } })
const moved = l3AngelCollision({ ...base, x: 14, y: 26 })
const wingCenter = (b: typeof boxes[number]) => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]
const originalWing = wingCenter(boxes[10]), rotatedWing = wingCenter(rotated[10])
if(Math.abs(rotatedWing[0]-(11.5+originalWing[1]-20.5))>.001||Math.abs(rotatedWing[1]-(20.5-originalWing[0]+11.5))>.001)throw new Error('rotation must match Three.js positive Y direction')
if (Math.abs(moved[0].x0 - boxes[0].x0 - 4) > .001 || Math.abs(moved[0].y0 - boxes[0].y0 - 6) > .001) throw new Error('translation mismatch')
if (boxes.some(b => b.stand)) throw new Error('angel colliders must not be standable')
// Generic merged-mesh registration must never replace the segmented collider.
setStructModelColliders(base,[{x0:-2,y0:-1,x1:2,y1:1,bottom:0,top:5,stand:false}])
if(JSON.stringify(structColliders(base))!==JSON.stringify(boxes))throw new Error('rendered merged bounds overrode angel collision')
console.log(JSON.stringify({ boxes: boxes.length, base: true, undersideWalkable: true, highWings: true, rotation: true, translation: true }))
