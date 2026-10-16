import { l11CityPlan, clearL11PlanCache } from './l11Layout'

// Cartography reconstructs only stable planning data, never props, loot or live chunks.
self.onmessage=({data}:{data:{key:string;seed:number;mx:number;my:number}})=>{
  try {
    const plan=l11CityPlan(data.seed,data.mx,data.my)
    self.postMessage({key:data.key,plan})
  } catch(error) {
    self.postMessage({key:data.key,error:String(error)})
  } finally { clearL11PlanCache() }
}
