// Merge reviewed v81 text hunks into the current workspace, preserving other edits.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const app=fileURLToPath(new URL('../',import.meta.url)),stage=path.join(app,'.cache/shrimp-v81-import'),out=path.join(app,'reports/shrimp-v81')
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),lf=s=>s.replace(/\r\n/g,'\n')
const patch=lf(readFileSync(path.join(stage,'backroom-shrimp-v81-incremental-vs-e4a3d6f.patch'),'utf8'))
const files=[]
const singlePlayer=s=>s
 .replace("      if (e.netId !== undefined && eng.mpSession && !eng.mpSession.isHost) { eng.msg('联机中只有房主能活抓旱虾——可以把它打下来带走。', 'system'); return }\n",'')
 .replace('；联机客人端照常落成物品','')
 .replace("s.type === 'liveshrimp' && !(eng.mpSession?.started && !eng.mpSession.isHost)","s.type === 'liveshrimp'")
 .replace('；不入存档/联机','；不入存档')
for(const block of patch.split(/(?=^diff --git )/m)){
 if(!block.startsWith('diff --git ')||block.includes('new file mode')||block.includes('GIT binary patch'))continue
 const name=block.match(/^\+\+\+ b\/app\/(.+)$/m)?.[1];if(!name)continue
 const file=path.resolve(app,name);if(!file.startsWith(app)||!existsSync(file))throw Error('Missing current target '+name)
 const raw=readFileSync(file,'utf8');let text=lf(raw),changes=0
 for(const hunk of block.split(/^@@[^\n]*\n/m).slice(1)){
  let old='',next=''
  for(const line of hunk.split('\n')){const prefix=line[0];if(![' ','+','-'].includes(prefix))continue;if(prefix!=='+' )old+=line.slice(1)+'\n';if(prefix!=='-')next+=line.slice(1)+'\n'}
  next=singlePlayer(next)
  if(text.includes(next))continue
  const at=text.indexOf(old);if(at<0||text.indexOf(old,at+1)>=0)throw Error('Ambiguous or changed hunk in '+name+' at '+old.slice(0,80))
  text=text.slice(0,at)+next+text.slice(at+old.length);changes++
 }
 files.push({name,file,text:raw.includes('\r\n')?text.replace(/\n/g,'\r\n'):text,changes,before:hash(file)})
}
const fresh=[]
for(const name of ['src/game/engine/shrimpAI.ts','scripts/check-shrimp.ts']){
 const source=path.join(stage,'overlay/app',name),target=path.join(app,name);let text=lf(readFileSync(source,'utf8'))
 if(name.endsWith('shrimpAI.ts'))text=text
  .replace('// 运行时状态保存在 e.sh（不入存档/联机；联机仅房主运行本 AI，分裂出的新个体由房主快照同步到客人端）。','// 运行时状态保存在 e.sh（不入存档）。')
  .replace('，且不是联机客人端','')
  .replace('  if (eng.mpSession?.started && !eng.mpSession.isHost) return false\n','')
 else text=text
  .replace('    mpSession: null as any, inv, invCap: 10,','    inv, invCap: 10,')
  .replace('  w3.eng.mpSession = { started: true, isHost: false }\n','')
  .replace("  ok(!canSplit(w3.eng, g), '联机客人端不运行分裂（由房主权威生成）')\n",'')
 if(existsSync(target)&&lf(readFileSync(target,'utf8'))!==text)throw Error('New file already modified: '+name)
 fresh.push({name,source,target,text})
}
// All hunks are validated before the first write.
for(const f of files)writeFileSync(f.file,f.text)
for(const f of fresh){mkdirSync(path.dirname(f.target),{recursive:true});writeFileSync(f.target,f.text)}
mkdirSync(out,{recursive:true})
writeFileSync(path.join(out,'import.json'),JSON.stringify({zip:'C:/Users/ZANRe/Downloads/backroom-shrimp-v81.zip',zipSha256:'d52f9258f60d5f1c5bcf366100a08b07b2e6a269e95c272af3638cbe15576733',baseline:'.cache/shrimp-v81-baseline',text:files.map(f=>({path:f.name,hunks:f.changes,before:f.before,after:hash(f.file)})),newFiles:fresh.map(f=>({path:f.name,source:hash(f.source),after:hash(f.target)})),scope:'Reviewed incremental hunks only; package multiplayer additions omitted under the project freeze.'},null,2)+'\n')
console.log(JSON.stringify({merged:files.length,hunks:files.reduce((n,f)=>n+f.changes,0),newFiles:fresh.length}))
