import type { SaveSnapshot } from './save'
import { L11_SPAWNS,l11Hash } from '../world/l11Layout'
export interface MigrationStorage {get(key:string):string|null;set(key:string,value:string):void}
export class L11MigrationBackupError extends Error {constructor(){super('Level 11 旧档备份未能写入并校验；原存档已保留，请释放存储空间后重试。');this.name='L11MigrationBackupError'}}
export const needsL11Migration=(s:SaveSnapshot)=>s.level===115||s.l11World?.version!==2&&(!!s.l11World||s.level===11||(s.visited??[]).some(id=>id===11||id===115))
/** Copy the complete original JSON, verify it, then transform an independent snapshot. */
export function migrateL11Snapshot(raw:string,key:string,store:MigrationStorage):SaveSnapshot {
  const before=JSON.parse(raw) as SaveSnapshot
  if(!needsL11Migration(before))return before
  let hash=0x811c9dc5;for(let i=0;i<raw.length;i++)hash=l11Hash(hash,raw.charCodeAt(i))
  const backup=`${key}_l11_v1_backup_${hash.toString(16)}`
  try{const existing=store.get(backup);if(existing!==null&&existing!==raw)throw new Error('backup collision');if(existing===null)store.set(backup,raw);if(store.get(backup)!==raw)throw new Error('backup verification failed')}catch{throw new L11MigrationBackupError()}
  const next=JSON.parse(raw) as SaveSnapshot,seed=before.l11World?.seed??(before.level===11?before.mapSeed:before.seed+1441)
  next.l11World={version:2,seed,chunks:[],explored:[],taken:[],revisions:{},unloaded:{},marks:[],containers:{}}
  if(next.level===11||next.level===115){
    next.level=11;next.mapSeed=seed;next.mapFirstVisit=false;next.worldPos={...L11_SPAWNS.default};next.outpostReturn=null
    next.player={...next.player,level:11,x:L11_SPAWNS.default.x,y:L11_SPAWNS.default.y,z:0,floor:0,vz:0}
  }
  // Keep every quest, reward, tape, rank, inventory and other level's snapshot untouched.
  return next
}
