import {preview} from 'vite'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const app=fileURLToPath(new URL('../',import.meta.url)),port=Number(process.argv[2])
if(!Number.isInteger(port)||!process.argv[3])throw Error('Expected owned QA port and profile directory')
const buildDir=process.env.ENTRY_QA_BUILD_DIR
const output=buildDir?path.resolve(app,buildDir):undefined
if(output&&!output.startsWith(path.resolve(app)+path.sep))throw Error('QA output must be inside app')
const server=await preview({root:app,configFile:path.join(app,'vite.config.ts'),...(output?{build:{outDir:output}}:{}),preview:{host:'127.0.0.1',port,strictPort:true}})
server.printUrls()
