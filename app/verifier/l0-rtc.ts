// Two independent engine/session clients over real local RTCDataChannels.
// No public signaling service, player save slots, STUN or TURN are required.
export async function verifyLocalRTC(){
 await import('../src/game/world/mapgen');
 const [{Engine},{MpSession},{applyMpEvent},{enterL0Red}]=await Promise.all([import('../src/game/engine'),import('../src/game/net/session'),import('../src/game/net/apply'),import('../src/game/engine/l0State')]);
 const checks:string[]=[],peers:RTCPeerConnection[]=[],sessions:any[]=[];let packets=0,bytes=0;
 const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);checks.push(label)};
 const until=async(fn:()=>boolean)=>{const start=performance.now();while(!fn()){if(performance.now()-start>5000)throw Error('RTC condition timeout');await new Promise(r=>setTimeout(r,30))}};
 class Wire{
  selfId:string;remote='';dc?:RTCDataChannel;handler:any;close:any;parts=new Map<number,string[]>();seq=0;
  constructor(id:string){this.selfId=id}
  onMessage(fn:any){this.handler=fn}onOpen(){}onClose(fn:any){this.close=fn}
  attach(dc:RTCDataChannel,remote:string){this.dc=dc;this.remote=remote;dc.onclose=()=>this.close?.(remote);dc.onmessage=e=>{const [id,i,n,part]=JSON.parse(e.data),arr=this.parts.get(id)??[];arr[i]=part;this.parts.set(id,arr);if(arr.filter(Boolean).length===n){this.parts.delete(id);this.handler?.(remote,JSON.parse(arr.join('')))}}}
  send(_id:string,msg:any){if(this.dc?.readyState!=='open')return;const body=JSON.stringify(msg),id=++this.seq,n=Math.ceil(body.length/12000);for(let i=0;i<n;i++){const frame=JSON.stringify([id,i,n,body.slice(i*12000,(i+1)*12000)]);this.dc.send(frame);packets++;bytes+=new TextEncoder().encode(frame).length}}
  broadcast(msg:any){this.send(this.remote,msg)}connIds(){return[this.remote]}destroy(){this.dc?.close()}
 }
 async function connect(h:Wire,g:Wire){
  const a=new RTCPeerConnection({iceServers:[]}),b=new RTCPeerConnection({iceServers:[]});peers.push(a,b);
  a.onicecandidate=e=>{if(e.candidate)b.addIceCandidate(e.candidate).catch(()=>{})};b.onicecandidate=e=>{if(e.candidate)a.addIceCandidate(e.candidate).catch(()=>{})};
  const d=a.createDataChannel('l0-world',{ordered:true});h.attach(d,g.selfId);b.ondatachannel=e=>g.attach(e.channel,'HOST');
  await a.setLocalDescription(await a.createOffer());await b.setRemoteDescription(a.localDescription!);await b.setLocalDescription(await b.createAnswer());await a.setRemoteDescription(b.localDescription!);await until(()=>d.readyState==='open'&&g.dc?.readyState==='open');
 }
 const code='LOCAL-L0-QA-'+crypto.randomUUID(),hp=new Wire('HOST'),cp=new Wire('guest');
 try{
  await connect(hp,cp);const host=await MpSession.host({name:'RTC host',avatar:{}},hp as never);sessions.push(host);const guest=await MpSession.join(code,{name:'RTC guest',avatar:{}},cp as never);sessions.push(guest);
  await until(()=>host.players.length===2);host.setReady(true);guest.setReady(true);await until(()=>host.players.every(p=>p.ready));check(host.startGame(763),'host starts two RTC clients');await until(()=>guest.started);
  const h=new Engine(),g=new Engine();for(const [eng,session]of [[h,host],[g,guest]]as const){eng.mpSession=session;eng.seed=763;eng.loadLevel(0,{mapSeed:763,firstVisit:false});session.onLocalEvent=e=>applyMpEvent(eng,e);session.tick(eng,0)}await until(()=>host.remotes.get('guest')?.s.level===0);
  guest.sendEvent({t:'dropItem',id:.019,it:'almond',x:16,y:16});await until(()=>h.map!.items.some(i=>i.id===.019));check(true,'shared drop');guest.sendEvent({t:'takeItem',id:.019});await until(()=>!h.map!.items.some(i=>i.id===.019));check(h.map!.inf!.taken.has(.019),'shared pickup ledger');
  host.sendEvent({t:'l0world',seed:763,revisions:{'12,12':2},taken:[.019],chunks:[]});await until(()=>g.map!.inf!.l0!.revisions['12,12']===2);check(true,'authoritative layout revision');
  enterL0Red(g);await until(()=>host.remotes.get('guest')?.s.l0Space?.startsWith('red:')===true);guest.sendEvent({t:'dropItem',id:.029,it:'canned',x:5,y:27});host.sendEvent({t:'dropItem',id:.039,it:'canned',x:5,y:27});await new Promise(r=>setTimeout(r,200));check(!h.map!.items.some(i=>i.id===.029)&&!g.map!.items.some(i=>i.id===.039),'personal red space isolates both directions');
  g.l0Loops=3;guest.leave();await until(()=>host.players.length===1);const cp2=new Wire('reconnected');await connect(hp,cp2);const rejoin=await MpSession.join(code,{name:'RTC guest',avatar:{}},cp2 as never);sessions.push(rejoin);const restored=new Engine();restored.mpSession=rejoin;rejoin.onStart=seed=>restored.newRun(seed,'normal','slot1');await until(()=>!!restored.map);check(restored.map!.inf!.l0!.trapped&&restored.l0Loops===3,'RTC reconnect restores private loop');
  return{transport:'two engine clients, local RTCPeerConnection ordered data channels; no WAN/TURN test',checks,packets,bytes};
 }finally{for(const s of sessions)s.leave();for(const p of peers)p.close();sessionStorage.removeItem('br_mp_token:'+code);sessionStorage.removeItem('br_mp_resume:'+code)}
}
