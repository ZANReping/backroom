import http from 'node:http'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {existsSync,createReadStream,statSync} from 'node:fs'
const app=fileURLToPath(new URL('../',import.meta.url)),port=Number(process.argv[2]),profile=process.argv[3],roots=[path.join(app,'.cache/entry-speed-20261029/cold-dist'),path.join(app,'public')]
if(!Number.isInteger(port)||!profile)throw Error('Owned QA port/profile required')
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg','.gz':'application/gzip'}
http.createServer((req,res)=>{try{let pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);if(pathname==='/')pathname='/verifier/entry-cold.html';for(const root of roots){const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)||!existsSync(file)||!statSync(file).isFile())continue;res.setHeader('Content-Type',types[path.extname(file)]??'application/octet-stream');res.setHeader('Cache-Control','no-store');createReadStream(file).pipe(res);return}res.writeHead(404);res.end('Not found')}catch{res.writeHead(400);res.end('Invalid request')}}).listen(port,'127.0.0.1',()=>console.log('Production cold-entry server '+port))
