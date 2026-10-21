import * as THREE from 'three'
/**
 * v3 faction signage. Every outpost / faction draws its plates in its own trade dress instead of the old
 * flat "cream rectangle + sans text" placard. All art is procedural canvas (no external assets), drawn into
 * any rectangle so it also fills existing sign atlases (Alpha panels, B.N.T.G. trade cells).
 *
 *  meg        M.E.G. bases (Alpha/Gemma/Omega/Beta/空巢/家政): olive enamel steel, stencil caps, triangle crest, rivets, rust
 *  bntg       B.N.T.G. trade houses: bottle-green enamel shop fascia, brass double rule, gilt serif, scale crest
 *  ariane     Ariane / 希波克拉底-1: white enamel clinic plate, lilac band, staff-and-serpent mark
 *  tom        Tom 的餐馆: hand-painted plank board, red script with cream outline, coffee cup, nails
 *  argos      丰饶角 / Argos: carved ochre timber placard, burnt lettering, horn-of-plenty mark
 *  brc        B.R.C.: blue-grey acrylic wayfinding plate, white type, square logo
 *  jerry      鹉主杰瑞: sun-faded yellow painted board, green brush letters, feather
 *  industrial generic backrooms enamel plate (road/door signs): black enamel, rounded, screws, chips, grime
 *  brass      hotel / room plaques: brushed brass, engraved letters
 *  hazard     warning plate: yellow, black border and triangle
 */
export type SignStyle='meg'|'bntg'|'ariane'|'tom'|'argos'|'brc'|'jerry'|'industrial'|'brass'|'hazard'
const CJK="'Microsoft YaHei','PingFang SC','Noto Sans CJK SC','Noto Sans SC','Source Han Sans SC',sans-serif"
const SERIF_CJK="'Songti SC','SimSun','Noto Serif CJK SC','Noto Serif SC',serif"
const FONT:Record<SignStyle,string>={
 meg:`'Stencil','Stencil Std','Impact','Arial Black',${CJK}`,
 bntg:`'Didot','Bodoni MT','Georgia','Times New Roman',${SERIF_CJK}`,
 ariane:`'Helvetica Neue','Segoe UI','Arial',${CJK}`,
 tom:`'Brush Script MT','Segoe Script','Lucida Handwriting','KaiTi','STKaiti',cursive`,
 argos:`'Trajan Pro','Palatino Linotype','Book Antiqua','Georgia',${SERIF_CJK}`,
 brc:`'DIN Alternate','Bahnschrift','Segoe UI','Arial',${CJK}`,
 jerry:`'Marker Felt','Comic Sans MS','Segoe Print','KaiTi',cursive`,
 industrial:`'DIN Condensed','Bahnschrift Condensed','Arial Narrow','Arial',${CJK}`,
 brass:`'Copperplate','Copperplate Gothic Light','Georgia',${SERIF_CJK}`,
 hazard:`'Impact','Arial Black',${CJK}`,
}
/** Which plate a faction / outpost id wears. */
export function signStyleFor(key:string|undefined):SignStyle{
 const k=(key??'').toLowerCase()
 if(/meg|alpha|gamma|gemma|omega|beta|101|106|109|110|113|115|空巢|家政/.test(k))return 'meg'
 if(/bntg|trade|102|107|商人|存储/.test(k))return 'bntg'
 if(/ariane|hippo|103|希波|medical/.test(k))return 'ariane'
 if(/tom|diner|104|餐馆/.test(k))return 'tom'
 if(/argos|cornucopia|116|丰饶/.test(k))return 'argos'
 if(/brc/.test(k))return 'brc'
 if(/jerry/.test(k))return 'jerry'
 if(/hotel|111|brass|gold/.test(k))return 'brass'
 if(/hazard|warn/.test(k))return 'hazard'
 return 'industrial'
}
function rng(seed:number){let s=seed>>>0||1;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296}}
function hashStr(t:string){let h=2166136261;for(const ch of t)h=Math.imul(h^ch.charCodeAt(0),16777619);return h>>>0}
function round(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
function fit(c:CanvasRenderingContext2D,text:string,font:string,weight:string,max:number,size:number){let s=size;do{c.font=`${weight} ${s}px ${font}`;s-=1}while(c.measureText(text).width>max&&s>8);return s+1}
function speckle(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:()=>number,n:number,col:string,a:number,sz:number){
 c.save();c.fillStyle=col;for(let i=0;i<n;i++){c.globalAlpha=a*(.3+r()*.7);const s=sz*(.3+r());c.fillRect(x+r()*w,y+r()*h,s,s*(.5+r()))}c.restore()
}
function streaks(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:()=>number,n:number,col:string,a:number){
 c.save();for(let i=0;i<n;i++){const sx=x+r()*w,len=h*(.15+r()*.55),g=c.createLinearGradient(0,y,0,y+len);g.addColorStop(0,col);g.addColorStop(1,'rgba(0,0,0,0)');c.globalAlpha=a*(.4+r()*.6);c.fillStyle=g;c.fillRect(sx,y+r()*h*.2,1+r()*w*.012,len)}c.restore()
}
function rivet(c:CanvasRenderingContext2D,x:number,y:number,r:number,base:string){
 const g=c.createRadialGradient(x-r*.35,y-r*.35,r*.1,x,y,r);g.addColorStop(0,'rgba(255,255,255,.55)');g.addColorStop(.45,base);g.addColorStop(1,'rgba(0,0,0,.55)')
 c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill()
}
function screw(c:CanvasRenderingContext2D,x:number,y:number,r:number){rivet(c,x,y,r,'#9a9a92');c.strokeStyle='rgba(30,30,30,.7)';c.lineWidth=Math.max(1,r*.25);c.beginPath();c.moveTo(x-r*.6,y-r*.2);c.lineTo(x+r*.6,y+r*.2);c.stroke()}
/** Stencil caps: draw, then cut the classic bridges through closed counters. */
function stencilText(c:CanvasRenderingContext2D,text:string,cx:number,cy:number,size:number,font:string,ink:string,bg:string){
 c.font=`900 ${size}px ${font}`;c.textAlign='left';c.textBaseline='middle'
 const total=c.measureText(text).width;let x=cx-total/2
 for(const ch of text){const w=c.measureText(ch).width;c.fillStyle=ink;c.fillText(ch,x,cy)
  if(/[OQDBPR0689AUGC]/.test(ch)){c.fillStyle=bg;const bw=Math.max(2,size*.07);c.fillRect(x+w/2-bw/2,cy-size*.52,bw,size*.24);c.fillRect(x+w/2-bw/2,cy+size*.26,bw,size*.24)}
  x+=w}
}
function lines2(text:string):[string,string|undefined]{
 const t=text.trim();for(const sep of [' / ',' · ','｜',' | ']){const i=t.indexOf(sep);if(i>0)return [t.slice(0,i).trim(),t.slice(i+sep.length).trim()]}
 return [t,undefined]
}
/** Draw one plate into (x,y,w,h) of an existing canvas. `sub` overrides the auto split of "A / B". */
export function drawFactionSign(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,style:SignStyle,text:string,sub?:string){
 const r=rng(hashStr(style+text)),font=FONT[style];let [main,second]=lines2(text);if(sub!==undefined)second=sub
 const s=Math.min(w,h)
 c.save();c.beginPath();c.rect(x,y,w,h);c.clip()
 const midY=second?y+h*.42:y+h*.52,subY=y+h*.76
 if(style==='meg'){
  const bg='#59614c';const g=c.createLinearGradient(x,y,x,y+h);g.addColorStop(0,'#666e57');g.addColorStop(1,'#4c5341');c.fillStyle=g;c.fillRect(x,y,w,h)
  speckle(c,x,y,w,h,r,Math.floor(w*h/400),'#2e3327',.25,s*.02)
  // hazard foot band
  const band=h*.12;c.save();c.beginPath();c.rect(x,y+h-band,w,band);c.clip();c.fillStyle='#d1a536';c.fillRect(x,y+h-band,w,band);c.fillStyle='#1e1f1a';for(let k=-band;k<w+band;k+=band*1.4){c.beginPath();c.moveTo(x+k,y+h);c.lineTo(x+k+band*.7,y+h);c.lineTo(x+k+band*1.4,y+h-band);c.lineTo(x+k+band*.7,y+h-band);c.fill()}c.restore()
  // crest: triangle in a ring
  const cr=h*.27,cx=x+cr+h*.13,cy=y+h*.44
  c.strokeStyle='#e3dcc0';c.lineWidth=s*.035;c.beginPath();c.arc(cx,cy,cr,0,Math.PI*2);c.stroke()
  c.fillStyle='#e3dcc0';c.beginPath();c.moveTo(cx,cy-cr*.62);c.lineTo(cx+cr*.56,cy+cr*.38);c.lineTo(cx-cr*.56,cy+cr*.38);c.closePath();c.fill()
  c.fillStyle=bg;c.beginPath();c.moveTo(cx,cy-cr*.22);c.lineTo(cx+cr*.24,cy+cr*.22);c.lineTo(cx-cr*.24,cy+cr*.22);c.closePath();c.fill()
  const tx=x+(cx-x)*2+ (w-(cx-x)*2)/2-w*.01,tw=w-(cx-x)*2-w*.05
  const size=fit(c,main.toUpperCase(),font,'900',tw,h*(second?.3:.4))
  stencilText(c,main.toUpperCase(),tx,midY-h*.03,size,font,'#ebe4c8',bg)
  if(second){const ss=fit(c,second,font,'700',tw,h*.15);c.font=`700 ${ss}px ${font}`;c.textAlign='center';c.fillStyle='#d4cdb0';c.fillText(second,tx,subY-h*.06)}
  c.font=`700 ${Math.max(8,h*.07)}px ${font}`;c.textAlign='left';c.fillStyle='rgba(227,220,192,.8)';c.fillText('M.E.G.',cx-cr*.9,cy+cr+h*.09)
  streaks(c,x,y+h*.08,w,h*.8,r,Math.floor(w/45),'rgba(110,62,28,.65)',.55)
  for(let i=0;i<Math.floor(w/80);i++){c.fillStyle=`rgba(${120+r()*40|0},${70+r()*20|0},${35},${.35+r()*.4})`;c.beginPath();c.ellipse(x+r()*w,y+r()*h,s*.02*(1+r()),s*.012*(1+r()),r()*3,0,Math.PI*2);c.fill()}
  const rv=s*.035;for(const [px,py] of [[x+rv*1.8,y+rv*1.8],[x+w-rv*1.8,y+rv*1.8],[x+rv*1.8,y+h-band-rv*1.6],[x+w-rv*1.8,y+h-band-rv*1.6]])rivet(c,px,py,rv,'#6e7560')
  c.strokeStyle='rgba(20,22,16,.6)';c.lineWidth=s*.02;c.strokeRect(x+1,y+1,w-2,h-2)
 }else if(style==='bntg'){
  const g=c.createLinearGradient(x,y,x,y+h);g.addColorStop(0,'#1f4a3b');g.addColorStop(.5,'#173d31');g.addColorStop(1,'#10302a');c.fillStyle=g;c.fillRect(x,y,w,h)
  speckle(c,x,y,w,h,r,Math.floor(w*h/700),'#0a1c16',.25,s*.015)
  const gold=c.createLinearGradient(x,y,x,y+h);gold.addColorStop(0,'#f3dc94');gold.addColorStop(.45,'#c99a3b');gold.addColorStop(.55,'#a87a28');gold.addColorStop(1,'#e8c870')
  c.strokeStyle=gold;c.lineWidth=s*.04;c.strokeRect(x+s*.05,y+s*.05,w-s*.1,h-s*.1);c.lineWidth=s*.012;c.strokeRect(x+s*.11,y+s*.11,w-s*.22,h-s*.22)
  // scales crest
  const cx=x+h*.5,cy=y+h*.5,cr=h*.24;c.strokeStyle=gold;c.fillStyle=gold;c.lineWidth=s*.018
  c.beginPath();c.moveTo(cx,cy-cr);c.lineTo(cx,cy+cr*.9);c.moveTo(cx-cr,cy-cr*.6);c.lineTo(cx+cr,cy-cr*.6);c.moveTo(cx-cr*.5,cy+cr*.9);c.lineTo(cx+cr*.5,cy+cr*.9);c.stroke()
  for(const sx of [-1,1]){c.beginPath();c.moveTo(cx+sx*cr,cy-cr*.6);c.lineTo(cx+sx*cr*1.3,cy+cr*.15);c.lineTo(cx+sx*cr*.7,cy+cr*.15);c.closePath();c.stroke();c.beginPath();c.arc(cx+sx*cr,cy+cr*.15,cr*.32,0,Math.PI);c.fill()}
  const tx=x+h+(w-h)/2-w*.02,tw=w-h*1.3
  const size=fit(c,main,font,'700',tw,h*(second?.34:.44));c.font=`700 ${size}px ${font}`;c.textAlign='center';c.textBaseline='middle'
  c.fillStyle='rgba(0,0,0,.55)';c.fillText(main,tx+size*.04,midY+size*.05);c.fillStyle=gold;c.fillText(main,tx,midY)
  if(second){const ss=fit(c,second,font,'400',tw,h*.15);c.font=`italic 400 ${ss}px ${font}`;c.fillStyle='#d8c98f';c.fillText(second,tx,subY)}
  c.font=`700 ${Math.max(8,h*.065)}px ${font}`;c.fillStyle='rgba(232,200,112,.75)';c.fillText('B.N.T.G.',cx,y+h*.86)
  for(let i=0;i<Math.floor(w/90);i++){c.fillStyle='rgba(200,190,160,.35)';c.beginPath();c.ellipse(x+r()*w,y+r()*h,s*.012,s*.008,r()*3,0,Math.PI*2);c.fill()}
 }else if(style==='ariane'){
  c.fillStyle='#f1f0ea';c.fillRect(x,y,w,h);const yel=c.createRadialGradient(x+w*.5,y+h*.5,s*.2,x+w*.5,y+h*.5,Math.max(w,h)*.75);yel.addColorStop(0,'rgba(0,0,0,0)');yel.addColorStop(1,'rgba(150,130,60,.25)');c.fillStyle=yel;c.fillRect(x,y,w,h)
  const bw=h*.9;c.fillStyle='#8a78c8';c.fillRect(x,y,bw,h);c.fillStyle='#6c5aa8';c.fillRect(x+bw,y,h*.06,h)
  // staff and serpent
  const cx=x+bw/2,top=y+h*.16,bot=y+h*.84;c.strokeStyle='#f6f3ff';c.lineWidth=s*.05;c.lineCap='round';c.beginPath();c.moveTo(cx,top);c.lineTo(cx,bot);c.stroke()
  c.lineWidth=s*.03;c.beginPath();for(let i=0;i<=40;i++){const t=i/40,yy=bot-(bot-top)*t*.9,xx=cx+Math.sin(t*Math.PI*3.2)*bw*.22;if(i)c.lineTo(xx,yy);else c.moveTo(xx,yy)}c.stroke()
  c.fillStyle='#f6f3ff';c.beginPath();c.ellipse(cx+Math.sin(.9*Math.PI*3.2)*bw*.22,top+h*.03,s*.045,s*.03,0,0,Math.PI*2);c.fill()
  const tx=x+bw+(w-bw)/2,tw=w-bw-w*.06
  const size=fit(c,main,font,'600',tw,h*(second?.32:.42));c.font=`600 ${size}px ${font}`;c.textAlign='center';c.textBaseline='middle';c.fillStyle='#2f2a5c';c.fillText(main,tx,midY)
  if(second){c.fillStyle='#8a78c8';c.fillRect(tx-tw*.35,y+h*.6,tw*.7,Math.max(1,h*.012));const ss=fit(c,second,font,'400',tw,h*.14);c.font=`400 ${ss}px ${font}`;c.fillStyle='#5a548a';c.fillText(second,tx,subY)}
  for(const [px,py] of [[x+w-s*.06,y+s*.06],[x+w-s*.06,y+h-s*.06]])screw(c,px,py,s*.025)
  speckle(c,x,y,w,h,r,Math.floor(w*h/1500),'#6a6250',.18,s*.012)
  c.strokeStyle='rgba(60,55,90,.35)';c.lineWidth=s*.012;c.strokeRect(x+1,y+1,w-2,h-2)
 }else if(style==='tom'){
  const n=Math.max(2,Math.round(h/(s*.34)));const ph=h/n
  for(let i=0;i<n;i++){const base=[186,150,108],v=r()*24-12;c.fillStyle=`rgb(${base[0]+v|0},${base[1]+v|0},${base[2]+v*.6|0})`;c.fillRect(x,y+i*ph,w,ph)
   c.strokeStyle='rgba(90,58,30,.28)';c.lineWidth=1;for(let k=0;k<ph/3;k++){const yy=y+i*ph+r()*ph;c.beginPath();c.moveTo(x,yy);c.bezierCurveTo(x+w*.3,yy+r()*6-3,x+w*.6,yy+r()*6-3,x+w,yy+r()*4-2);c.stroke()}
   c.fillStyle='rgba(60,35,15,.6)';c.fillRect(x,y+i*ph,w,Math.max(1,ph*.03))}
  c.fillStyle='rgba(245,236,214,.55)';round(c,x+w*.03,y+h*.08,w*.94,h*.84,s*.08);c.fill()
  // coffee cup
  const cx=x+w*.1,cy=y+h*.5,cr=Math.min(h*.2,w*.06);c.fillStyle='#b4302a';c.beginPath();c.moveTo(cx-cr,cy-cr*.6);c.lineTo(cx+cr,cy-cr*.6);c.lineTo(cx+cr*.75,cy+cr);c.lineTo(cx-cr*.75,cy+cr);c.closePath();c.fill()
  c.strokeStyle='#b4302a';c.lineWidth=s*.025;c.beginPath();c.arc(cx+cr*1.05,cy,cr*.4,-1.3,1.3);c.stroke()
  c.strokeStyle='rgba(120,90,70,.7)';c.lineWidth=s*.012;for(const dx of [-.4,0,.4]){c.beginPath();c.moveTo(cx+dx*cr,cy-cr*.9);c.bezierCurveTo(cx+dx*cr+cr*.3,cy-cr*1.3,cx+dx*cr-cr*.3,cy-cr*1.6,cx+dx*cr,cy-cr*2);c.stroke()}
  const tx=x+w*.55,tw=w*.76
  const size=fit(c,main,font,'700',tw,h*(second?.42:.55));c.font=`italic 700 ${size}px ${font}`;c.textAlign='center';c.textBaseline='middle'
  c.lineJoin='round';c.lineWidth=size*.16;c.strokeStyle='#f5ecd6';c.strokeText(main,tx,midY);c.fillStyle='#a8261f';c.fillText(main,tx,midY)
  if(second){const ss=fit(c,second,font,'400',tw,h*.17);c.font=`400 ${ss}px ${font}`;c.fillStyle='#3d2a1c';c.fillText(second,tx,subY)}
  for(let i=0;i<n;i++)for(const px of [x+s*.05,x+w-s*.05])rivet(c,px,y+i*ph+ph/2,s*.018,'#4a4038')
  speckle(c,x,y,w,h,r,Math.floor(w*h/900),'#5a3d22',.2,s*.015)
 }else if(style==='argos'){
  const g=c.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,'#b88a46');g.addColorStop(1,'#946a30');c.fillStyle=g;round(c,x,y,w,h,s*.12);c.fill()
  c.strokeStyle='rgba(80,48,18,.3)';c.lineWidth=1;for(let k=0;k<h/2;k++){const yy=y+r()*h;c.beginPath();c.moveTo(x,yy);c.bezierCurveTo(x+w*.33,yy+r()*8-4,x+w*.66,yy+r()*8-4,x+w,yy);c.stroke()}
  c.strokeStyle='#5b3814';c.lineWidth=s*.03;round(c,x+s*.07,y+s*.07,w-s*.14,h-s*.14,s*.08);c.stroke()
  // horn of plenty
  const cx=x+h*.55,cy=y+h*.52,cr=h*.3;c.fillStyle='#5b3814';c.beginPath();c.moveTo(cx-cr*1.1,cy+cr*.7);c.quadraticCurveTo(cx-cr*.2,cy+cr*.9,cx+cr*.6,cy-cr*.2);c.lineTo(cx+cr*.9,cy-cr*.9);c.lineTo(cx+cr*.15,cy-cr*.55);c.quadraticCurveTo(cx-cr*.3,cy+cr*.35,cx-cr*1.1,cy+cr*.7);c.fill()
  c.fillStyle='#3e7a3a';for(const [dx,dy] of [[.75,-.95],[.45,-1.05],[1.05,-.6]]){c.beginPath();c.arc(cx+dx*cr,cy+dy*cr,cr*.2,0,Math.PI*2);c.fill()}
  c.fillStyle='#a33a22';c.beginPath();c.arc(cx+cr*.95,cy-cr*1.12,cr*.18,0,Math.PI*2);c.fill()
  const tx=x+h+(w-h)/2-w*.02,tw=w-h*1.25
  const size=fit(c,main,font,'700',tw,h*(second?.32:.42));c.font=`700 ${size}px ${font}`;c.textAlign='center';c.textBaseline='middle'
  c.fillStyle='rgba(255,230,180,.35)';c.fillText(main,tx+1,midY+size*.05);c.fillStyle='#3d220a';c.fillText(main,tx,midY)
  if(second){const ss=fit(c,second,font,'400',tw,h*.15);c.font=`400 ${ss}px ${font}`;c.fillStyle='#4e2e10';c.fillText(second,tx,subY)}
 }else if(style==='brc'){
  const g=c.createLinearGradient(x,y,x,y+h);g.addColorStop(0,'#3c5a72');g.addColorStop(1,'#2b4458');c.fillStyle=g;round(c,x,y,w,h,s*.08);c.fill()
  c.fillStyle='rgba(255,255,255,.08)';c.fillRect(x,y,w,h*.42)
  const bx=x+h*.18,bs=h*.5;c.fillStyle='#e9eef2';c.fillRect(bx,y+(h-bs)/2,bs,bs);c.fillStyle='#3c5a72';c.font=`800 ${bs*.32}px ${font}`;c.textAlign='center';c.textBaseline='middle';c.fillText('BRC',bx+bs/2,y+h/2)
  const tx=bx+bs+(w-bx+x-bs)/2,tw=w-bs-h*.5
  const size=fit(c,main,font,'600',tw,h*(second?.32:.42));c.font=`600 ${size}px ${font}`;c.fillStyle='#f2f5f7';c.fillText(main,tx,midY)
  if(second){const ss=fit(c,second,font,'400',tw,h*.15);c.font=`400 ${ss}px ${font}`;c.fillStyle='#b9c9d6';c.fillText(second,tx,subY)}
  for(const [px,py] of [[x+s*.06,y+s*.06],[x+w-s*.06,y+s*.06],[x+s*.06,y+h-s*.06],[x+w-s*.06,y+h-s*.06]])screw(c,px,py,s*.022)
 }else if(style==='jerry'){
  c.fillStyle='#d9b84a';c.fillRect(x,y,w,h);speckle(c,x,y,w,h,r,Math.floor(w*h/300),'#f2e3a4',.3,s*.03)
  c.strokeStyle='#2f7d43';c.lineWidth=s*.04;c.strokeRect(x+s*.06,y+s*.06,w-s*.12,h-s*.12)
  const size=fit(c,main,font,'700',w*.8,h*(second?.38:.5));c.font=`700 ${size}px ${font}`;c.textAlign='center';c.textBaseline='middle';c.fillStyle='#246b36';c.fillText(main,x+w/2,midY)
  if(second){const ss=fit(c,second,font,'400',w*.8,h*.16);c.font=`400 ${ss}px ${font}`;c.fillStyle='#8a3b1c';c.fillText(second,x+w/2,subY)}
 }else if(style==='brass'){
  const g=c.createLinearGradient(x,y,x,y+h);g.addColorStop(0,'#e2c47a');g.addColorStop(.5,'#b48a3e');g.addColorStop(1,'#d8b664');c.fillStyle=g;c.fillRect(x,y,w,h)
  c.globalAlpha=.18;c.strokeStyle='#fff3cc';for(let k=0;k<h;k+=2){c.beginPath();c.moveTo(x,y+k+r());c.lineTo(x+w,y+k+r());c.stroke()}c.globalAlpha=1
  c.strokeStyle='#6a4a18';c.lineWidth=s*.035;c.strokeRect(x+s*.06,y+s*.06,w-s*.12,h-s*.12)
  const size=fit(c,main,font,'700',w*.84,h*(second?.38:.5));c.font=`700 ${size}px ${font}`;c.textAlign='center';c.textBaseline='middle'
  c.fillStyle='rgba(255,240,200,.7)';c.fillText(main,x+w/2+1,midY+1.5);c.fillStyle='#3a2608';c.fillText(main,x+w/2,midY)
  if(second){const ss=fit(c,second,font,'400',w*.84,h*.16);c.font=`400 ${ss}px ${font}`;c.fillStyle='#4a320c';c.fillText(second,x+w/2,subY)}
  for(const px of [x+s*.1,x+w-s*.1])screw(c,px,y+h/2,s*.04)
 }else if(style==='hazard'){
  c.fillStyle='#e4b823';c.fillRect(x,y,w,h);c.strokeStyle='#161616';c.lineWidth=s*.06;c.strokeRect(x+s*.06,y+s*.06,w-s*.12,h-s*.12)
  const cx=x+h*.55,cy=y+h*.52,cr=h*.33;c.fillStyle='#161616';c.beginPath();c.moveTo(cx,cy-cr);c.lineTo(cx+cr*1.1,cy+cr*.8);c.lineTo(cx-cr*1.1,cy+cr*.8);c.closePath();c.fill()
  c.fillStyle='#e4b823';c.beginPath();c.moveTo(cx,cy-cr*.62);c.lineTo(cx+cr*.78,cy+cr*.6);c.lineTo(cx-cr*.78,cy+cr*.6);c.closePath();c.fill()
  c.fillStyle='#161616';c.fillRect(cx-cr*.08,cy-cr*.3,cr*.16,cr*.55);c.fillRect(cx-cr*.08,cy+cr*.33,cr*.16,cr*.14)
  const tx=x+h*1.1+(w-h*1.1)/2-w*.02,tw=w-h*1.3
  const size=fit(c,main,font,'900',tw,h*(second?.34:.44));c.font=`900 ${size}px ${font}`;c.textAlign='center';c.textBaseline='middle';c.fillStyle='#161616';c.fillText(main,tx,midY)
  if(second){const ss=fit(c,second,font,'700',tw,h*.15);c.font=`700 ${ss}px ${font}`;c.fillText(second,tx,subY)}
  speckle(c,x,y,w,h,r,Math.floor(w*h/500),'#5a4a20',.25,s*.02)
 }else{ // industrial enamel
  c.fillStyle='#1d2124';round(c,x,y,w,h,s*.1);c.fill()
  const g=c.createLinearGradient(x,y,x,y+h);g.addColorStop(0,'rgba(255,255,255,.07)');g.addColorStop(1,'rgba(0,0,0,.15)');c.fillStyle=g;c.fill()
  c.strokeStyle='#d9d7cc';c.lineWidth=s*.03;round(c,x+s*.07,y+s*.07,w-s*.14,h-s*.14,s*.06);c.stroke()
  const size=fit(c,main,font,'700',w*.8,h*(second?.36:.48));c.font=`700 ${size}px ${font}`;c.textAlign='center';c.textBaseline='middle';c.fillStyle='#ecebe2';c.fillText(main,x+w/2,midY)
  if(second){const ss=fit(c,second,font,'400',w*.8,h*.16);c.font=`400 ${ss}px ${font}`;c.fillStyle='#b9b8ae';c.fillText(second,x+w/2,subY)}
  for(let i=0;i<Math.floor(w/60);i++){const px=x+r()*w,py=r()<.5?y+r()*h*.15:y+h-r()*h*.15;c.fillStyle='#8a8676';c.beginPath();c.ellipse(px,py,s*.03*(.4+r()),s*.02*(.4+r()),r()*3,0,Math.PI*2);c.fill();c.fillStyle='rgba(120,70,30,.6)';c.beginPath();c.arc(px,py,s*.012,0,Math.PI*2);c.fill()}
  streaks(c,x,y+h*.1,w,h*.9,r,Math.floor(w/70),'rgba(90,70,50,.6)',.35)
  for(const px of [x+s*.12,x+w-s*.12])screw(c,px,y+h/2,s*.035)
 }
 c.restore()
}
const cache=new Map<string,THREE.CanvasTexture>()
/** Cached standalone texture for a plate with pixel aspect w:h (long side 1024 px). */
export function factionSignTexture(style:SignStyle,text:string,aspect=3.2,sub?:string):THREE.CanvasTexture{
 const key=`${style}|${text}|${aspect.toFixed(2)}|${sub??''}`,hit=cache.get(key);if(hit)return hit
 const W=aspect>=1?1024:Math.round(1024*aspect),H=aspect>=1?Math.round(1024/aspect):1024
 const cv=document.createElement('canvas');cv.width=W;cv.height=H;drawFactionSign(cv.getContext('2d')!,0,0,W,H,style,text,sub)
 const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;t.name=`sign:${style}`;t.userData.sharedSign=true
 if(cache.size>256){const k=cache.keys().next().value!;cache.get(k)!.dispose();cache.delete(k)}
 cache.set(key,t);return t
}
/** Portrait high-voltage plate (warningsign): yellow enamel, black triangle with bolt, bilingual text, number tag. */
export function highVoltageTexture(no='07'):THREE.CanvasTexture{
 const key='hv|'+no,hit=cache.get(key);if(hit)return hit
 const W=512,H=640,cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d')!,r=rng(hashStr(key))
 c.fillStyle='#e2bd2a';round(c,0,0,W,H,36);c.fill();c.strokeStyle='#151515';c.lineWidth=18;round(c,22,22,W-44,H-44,24);c.stroke()
 const cx=W/2,cy=230,R=150;c.fillStyle='#151515';c.beginPath();c.moveTo(cx,cy-R);c.lineTo(cx+R*1.12,cy+R*.82);c.lineTo(cx-R*1.12,cy+R*.82);c.closePath();c.fill()
 c.fillStyle='#e2bd2a';c.beginPath();c.moveTo(cx,cy-R*.66);c.lineTo(cx+R*.84,cy+R*.64);c.lineTo(cx-R*.84,cy+R*.64);c.closePath();c.fill()
 c.fillStyle='#151515';c.beginPath();c.moveTo(cx+14,cy-70);c.lineTo(cx-34,cy+18);c.lineTo(cx+2,cy+14);c.lineTo(cx-18,cy+86);c.lineTo(cx+40,cy-6);c.lineTo(cx+4,cy-2);c.lineTo(cx+30,cy-70);c.closePath();c.fill()
 c.textAlign='center';c.textBaseline='middle';c.fillStyle='#151515';c.font=`900 70px ${FONT.hazard}`;c.fillText('高压危险',cx,440,W-90);c.font=`800 40px ${FONT.hazard}`;c.fillText('DANGER · HIGH VOLTAGE',cx,505,W-90)
 c.fillStyle='#f1ede2';c.fillRect(cx-70,545,140,52);c.fillStyle='#151515';c.font=`700 34px ${FONT.industrial}`;c.fillText('HV-'+no,cx,572)
 speckle(c,0,0,W,H,r,500,'#5a4a20',.3,10);streaks(c,0,40,W,H-40,r,10,'rgba(110,62,28,.7)',.5)
 for(const [px,py] of [[52,52],[W-52,52],[52,H-52],[W-52,H-52]])screw(c,px,py,12)
 const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;cache.set(key,t);return t
}
