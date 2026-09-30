import assert from 'node:assert/strict'
import { connectionOptions, validateIceServers } from '../src/game/net/connectionConfig'

Object.assign(globalThis, { location: new URL('https://www.bilibilitoy.com/toy/game/version/index.html?room=AB23') })
let config: unknown = { iceServers: [] }
let credentials: unknown = []
const calls: string[] = []
globalThis.fetch = async (input) => {
  const url = String(input); calls.push(url)
  return new Response(JSON.stringify(url.includes('multiplayer.json') ? config : credentials), { status: 200 })
}
assert.throws(() => validateIceServers([{ urls: 'https://not-turn.test' }]))
assert.throws(() => validateIceServers([{ urls: 'turns:turn.test:443' }]))
const direct = await connectionOptions()
assert.equal(direct.config?.iceTransportPolicy, 'all')
assert.equal(calls[0], 'https://www.bilibilitoy.com/toy/game/version/multiplayer.json')
assert.ok(direct.config?.iceServers?.every(s => String(s.urls).startsWith('stun:')))
config = { iceServers: [], relayOnly: true }
await assert.rejects(connectionOptions(), /尚未配置 TURN/)
config = { iceServers: [], iceServersEndpoint: 'https://relay.example/credentials', relayOnly: true }
credentials = { iceServers: [{ urls: ['turns:relay.example:443?transport=tcp'], username: 'short-lived-user', credential: 'test' }] }
const first = await connectionOptions()
assert.equal(first.config?.iceTransportPolicy, 'relay')
assert.equal(first.config?.iceServers?.[0].username, 'short-lived-user')
credentials = [{ urls: 'turn:relay.example:3478', username: 'refreshed-user', credential: 'test2' }]
const second = await connectionOptions()
assert.equal(second.config?.iceServers?.[0].username, 'refreshed-user', 'credentials must refresh between connections')
credentials = []
await assert.rejects(connectionOptions(), /无法取得中继凭据/)
config = { iceServers: [], iceServersEndpoint: 'http://relay.example/credentials' }
await assert.rejects(connectionOptions(), /HTTPS/)
console.log('PASS: Toy iframe relative config, ICE validation, no false TURN fallback, relay-only, credential refresh and endpoint validation')
