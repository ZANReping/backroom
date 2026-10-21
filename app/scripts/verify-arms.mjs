import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const child=spawn(process.execPath,[fileURLToPath(new URL('./verify-arms-game.mjs',import.meta.url)),'--visual-only',...process.argv.slice(2)],{stdio:'inherit',windowsHide:true})
child.on('error',error=>{console.error(error);process.exitCode=1});child.on('exit',code=>{process.exitCode=code??1})
