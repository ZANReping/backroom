import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const app=fileURLToPath(new URL('../',import.meta.url)),root=path.join(app,'reports/npc-face-alignment')
const json=p=>JSON.parse(readFileSync(p,'utf8')),hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex')
const before=json(path.join(root,'before/result.json')),after=json(path.join(root,'final/result.json'))
const beforeUV=json(path.join(root,'before/uv-metrics.json')),afterUV=json(path.join(root,'after/uv-metrics.json'))
assert(before.ok&&after.ok,'Both browser runs must pass')
assert(afterUV.rows.every(row=>{const old=beforeUV.rows.find(r=>r.id===row.id);return old&&old.triangles===row.triangles&&old.draws===row.draws}),'No extra geometry or draws')
const imported=json(path.join(app,'reports/npc-faces-v6/import.json')).copied
const originals=imported.filter(r=>r.path.startsWith('public/textures/npc-retro/named/')||r.path.startsWith('art-source/npc-retro/named/'))
assert(originals.every(r=>hash(path.join(app,r.path))===r.sha256),'Original named face images must be preserved')
const manualIdentical=hash(path.join(root,'before/hand-authored.png'))===hash(path.join(root,'final/hand-authored.png'))
assert(manualIdentical,'Hand-authored NPC rendering unchanged')
const summary={named:afterUV.named,previewModels:after.models.length,checks:afterUV.checks,originalAssetsUnchanged:originals.length,manualIdentical,
 before:{maxRollDegrees:beforeUV.maxRollDegrees,maxCenterError:beforeUV.maxCenterError,maxEyeHeightError:beforeUV.maxEyeHeightError,memory:before.memory},
 after:{maxRollDegrees:afterUV.maxRollDegrees,maxCenterError:afterUV.maxCenterError,maxEyeHeightError:afterUV.maxEyeHeightError,memory:after.memory},
 game:after.game.map(row=>({mode:row.mode,draws:row.stats.draws,triangles:row.stats.triangles,memory:row.stats.memory})),errors:after.errors.length,cleanup:after.cleanup}
writeFileSync(path.join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n')
const pair=(label,file)=>`<section><h2>${label}</h2><div class="pair">${['before','final'].map((dir,i)=>`<figure><figcaption>${i?'修正后':'修正前'}</figcaption><a href="${dir}/${file}.png"><img loading="lazy" src="${dir}/${file}.png" alt="${label} ${i?'后':'前'}"></a></figure>`).join('')}</div></section>`
writeFileSync(path.join(root,'comparison.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>固定 NPC 面部对齐</title><style>body{margin:0;background:#242925;color:#eee;font:16px/1.6 system-ui}main{max-width:1800px;margin:auto;padding:24px}a{color:#c7e0cf}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}figure{margin:0}figcaption{padding:8px}img{display:block;width:100%;height:auto}.photos img{max-width:240px}.photos{display:flex;gap:16px;flex-wrap:wrap}@media(max-width:800px){.pair{grid-template-columns:1fr}}</style><main><h1>固定 NPC 面部 UV 对齐</h1><p>91 张专属脸逐张校准；像素、模型与配饰保持原样。<a href="README.md">验收与复现</a> · <a href="summary.json">数据</a></p>
${pair('倾斜明显的四人','strong-roll')}${pair('常见人物与眼镜','common')}${pair('不同肤色与头型','varied')}${pair('侧向查看','angled')}${pair('四个手工人物保持原样','hand-authored')}
<h2>证件照</h2><div class="photos">${['alpha_mara','alpha_sanya','northup','alpha_melody','lan','nightingale','faust','irene'].map(id=>`<figure><figcaption>${id}</figcaption><div class="pair">${['before','final'].map(dir=>`<a href="${dir}/portrait-${id}.png"><img src="${dir}/portrait-${id}.png" alt="${id} ${dir}"></a>`).join('')}</div></figure>`).join('')}</div>
${pair('实际 Alpha 场景：真实光影','game-realistic')}${pair('实际 Alpha 场景：经典光影','game-classic')}
<h2>95 个固定人形配置</h2>${Array.from({length:12},(_,i)=>pair('目录 '+(i+1),'frontal-'+String(i).padStart(2,'0'))).join('')}</main></html>`)
console.log(JSON.stringify({...summary,before:undefined,after:undefined},null,2))
