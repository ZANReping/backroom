import * as THREE from 'three'

const textures = new Map<number, THREE.CanvasTexture>()
const materials = new Map<number, THREE.MeshStandardMaterial>()
const frame = new THREE.MeshStandardMaterial({ color: '#323432', roughness: .95 })
const ink = '#46545a'

function canvasFor(variant: number): THREE.CanvasTexture {
  const old = textures.get(variant); if (old) return old
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(512, 384) : document.createElement('canvas')
  canvas.width = 512; canvas.height = 384
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  ctx.fillStyle = '#e9e7de'; ctx.fillRect(0, 0, 512, 384)
  ctx.strokeStyle = ink; ctx.fillStyle = '#849398'; ctx.lineWidth = 5
  if (variant === 0) {
    // A financial-report layout built entirely from anonymous marks and data shapes.
    ctx.fillStyle='#52666c';ctx.fillRect(34,30,190,10);ctx.fillStyle='#adb2ad';ctx.fillRect(34,53,128,4)
    ctx.lineWidth=1.2;ctx.strokeStyle='#bcc1ba'
    for(let y=108;y<=320;y+=42){ctx.beginPath();ctx.moveTo(40,y);ctx.lineTo(310,y);ctx.stroke()}
    ctx.fillStyle='#849b9e'
    for(let i=0;i<8;i++){const height=[78,95,70,126,138,119,161,147][i];ctx.fillRect(49+i*32,320-height,17,height)}
    ctx.strokeStyle='#a56555';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(49,239);ctx.lineTo(98,226);ctx.lineTo(145,251);ctx.lineTo(190,188);ctx.lineTo(233,173);ctx.lineTo(289,184);ctx.stroke()
    ctx.fillStyle='#697a7a';ctx.fillRect(340,95,136,18);ctx.strokeStyle='#a5ada7';ctx.lineWidth=1
    for(let y=114;y<=322;y+=26){ctx.beginPath();ctx.moveTo(340,y);ctx.lineTo(476,y);ctx.stroke()}
    for(let x=340;x<=476;x+=34){ctx.beginPath();ctx.moveTo(x,114);ctx.lineTo(x,322);ctx.stroke()}
    ctx.fillStyle='#7c8984'
    for(let row=0;row<8;row++)for(let col=0;col<4;col++)ctx.fillRect(346+col*34,124+row*26,8+(row*7+col*3)%15,3)
  } else if (variant === 1) {
    ctx.fillStyle = '#c7a16a'; ctx.fillRect(20, 20, 472, 344)
    for (const [x, y, w, h] of [[45,55,170,105],[280,52,180,120],[58,210,155,112],[260,205,200,128]] as number[][]) {
      ctx.fillStyle = '#f1eee3'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#9a9b91'; ctx.strokeRect(x, y, w, h)
      ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x+18,y+h-22); ctx.lineTo(x+w*.45,y+h*.55); ctx.lineTo(x+w-20,y+25); ctx.stroke()
      ctx.fillStyle = '#ae625a'; ctx.beginPath(); ctx.arc(x+w/2, y+10, 7, 0, Math.PI*2); ctx.fill()
    }
  } else {
    ctx.strokeStyle = ink; ctx.lineWidth = 6
    for (const [x, y, w, h] of [[45,45,170,125],[275,45,185,90],[65,220,135,105],[255,175,205,145]] as number[][]) ctx.strokeRect(x, y, w, h)
    ctx.beginPath(); ctx.moveTo(215, 100); ctx.lineTo(275, 90); ctx.lineTo(355, 175); ctx.lineTo(255, 245); ctx.lineTo(200, 280); ctx.stroke()
    ctx.fillStyle = '#a45a52'; for (const [x,y] of [[215,100],[275,90],[355,175],[255,245],[200,280]] as number[][]) { ctx.beginPath(); ctx.arc(x,y,9,0,Math.PI*2); ctx.fill() }
  }
  const tex = new THREE.CanvasTexture(canvas as unknown as HTMLCanvasElement); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true; textures.set(variant, tex); return tex
}

export function buildL4WallDecor(seed = 0): THREE.Group {
  const g = new THREE.Group(), variant = ((seed % 3) + 3) % 3, tex = canvasFor(variant)
  let mat = materials.get(variant)
  if(!mat){mat=new THREE.MeshStandardMaterial({map:tex,roughness:.95});materials.set(variant,mat)}
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.34, 1.0), mat); panel.position.set(0, 1.55, .0225); panel.castShadow = true; panel.receiveShadow = true; g.add(panel)
  for (const [x, y, sx, sy] of [[-.685,1.55,.03,1.06],[.685,1.55,.03,1.06],[0,2.065,1.4,.03],[0,1.035,1.4,.03]] as number[][]) { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, .045), frame); m.position.set(x,y,.0225); m.castShadow = true; m.receiveShadow = true; g.add(m) }
  return g
}
