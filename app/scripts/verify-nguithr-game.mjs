// Uses the actual App, an isolated headless browser/profile/server, and native GPU skinning.
// Usage: node scripts/verify-nguithr-game.mjs [--classic] [--seed=20261006]
if(process.argv.slice(2).some(a=>!a.startsWith('--')))throw Error('Use --classic / --seed; legacy persistent-browser phases are no longer used')
process.argv.push('--entity-only')
await import('./verify-l1v3-nguithr.mjs')
