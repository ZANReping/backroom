import type {GameSettings} from '../../components/SettingsModal'
export const GRAPHICS_KEYS=['grain','vcrFx','vcrStrength','vcrScanlines','shake','headBob','realWater','renderResolution','renderScale','dynamicRes','dynamicResTarget','maxPixelRatio','sceneLightLimit','chunkBudgetMs','loadingBudgetMs','hudRefreshRate','textureQuality','detailDistance','wallOcclusion','particleDensity','shadowUpdateRate','cameraFov','shadows','fogOfWar','fogScale','darknessBoost','farLights','lightMode','shadowQuality','sunShadows','lightShadows','ambientOcclusion','bloomStrength','reflectivity','bloomFx','exposure','eyeAdaptation','grainStrength','scanlineStrength','vignetteStrength','colorGrade'] as const
export type GraphicsValues=Pick<GameSettings,typeof GRAPHICS_KEYS[number]>
export type CustomGraphicsPreset={id:string;name:string;values:GraphicsValues}
const KEY='br_graphics_presets_v1'
export function graphicsSnapshot(settings:GameSettings):GraphicsValues{
 return Object.fromEntries(GRAPHICS_KEYS.map(k=>[k,settings[k]])) as GraphicsValues
}
export function graphicsEqual(settings:GameSettings,values:GraphicsValues){return GRAPHICS_KEYS.every(k=>settings[k]===values[k])}
export function completeGraphicsPreset(defaults:GameSettings,values:Partial<GameSettings>){return graphicsSnapshot({...defaults,...values})}
const choices:Partial<Record<keyof GraphicsValues,readonly unknown[]>>={renderResolution:['native','720p','480p_retro','320p_ps1'],dynamicResTarget:[30,45,60],sceneLightLimit:[8,12,16,24,48],hudRefreshRate:[4,8,12],textureQuality:[0,1,2],shadowUpdateRate:[0,1,2],lightMode:['classic','realistic'],shadowQuality:[0,1,2],lightShadows:[0,1,2,4],ambientOcclusion:[0,1,2],colorGrade:['neutral','liminal','cold','bleached']}
const ranges:Partial<Record<keyof GraphicsValues,[number,number]>>={renderScale:[50,100],maxPixelRatio:[.75,2],chunkBudgetMs:[1,6],loadingBudgetMs:[1,8],detailDistance:[50,150],cameraFov:[60,90],fogScale:[50,200],exposure:[50,200]}
export function parseGraphicsPresets(raw:string|null,defaults:GameSettings):CustomGraphicsPreset[]{
 try{
  const list=JSON.parse(raw??'[]');if(!Array.isArray(list))return[]
  return list.slice(0,6).flatMap((p:unknown)=>{
   if(!p||typeof p!=='object')return[]
   const v=p as CustomGraphicsPreset;if(typeof v.id!=='string'||typeof v.name!=='string'||!v.name.trim()||!v.values)return[]
   const values=graphicsSnapshot(defaults)
   for(const k of GRAPHICS_KEYS){const value=v.values[k],base=defaults[k];if(typeof value!==typeof base)continue
    if(choices[k]&&!choices[k]!.includes(value))continue
    if(typeof value==='number'){const [min,max]=ranges[k]??[0,100];if(!Number.isFinite(value)||value<min||value>max)continue}
    Object.assign(values,{[k]:value})
   }
   return[{id:v.id.slice(0,64),name:v.name.trim().slice(0,24),values}]
  }).filter((p,i,a)=>a.findIndex(v=>v.id===p.id)===i)
 }catch{return[]}
}
export function loadGraphicsPresets(defaults:GameSettings){try{return parseGraphicsPresets(localStorage.getItem(KEY),defaults)}catch{return[]}}
export function saveGraphicsPresets(presets:CustomGraphicsPreset[]){try{localStorage.setItem(KEY,JSON.stringify(presets.slice(0,6)));return true}catch{return false}}
