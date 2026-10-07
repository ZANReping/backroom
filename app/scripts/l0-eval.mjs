// Read/evaluate the isolated Level 0 verifier; never selects a player's tab.
const pages=await(await fetch('http://127.0.0.1:9235/json/list')).json();
const page=pages.find(p=>p.type==='page'&&p.url.includes('/verifier/l0-remake.html'));
if(!page)throw Error('Open the isolated Level 0 verifier first');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id!==1)return;console.log(JSON.stringify(m.result??m.error,null,2));ws.close()};
ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:process.argv[2],returnByValue:true,awaitPromise:true}}));
