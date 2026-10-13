import assert from 'node:assert/strict'
import { parseSeedInput, seedString } from '../src/game/core/rng'

assert.equal(parseSeedInput(''), null)
assert.equal(parseSeedInput('   '), null)
assert.equal(parseSeedInput('0000-0000'), 0)
assert.equal(parseSeedInput('ffff-FFFF'), 0xffffffff)
assert.equal(parseSeedInput('20261006'), 20261006)
assert.equal(parseSeedInput('4294967295'), 0xffffffff)
for (const value of ['1.5', '-1', '4294967296', '123x', '0000-000', '00000-0000']) assert.equal(parseSeedInput(value), null)
for (const value of [0, 20261006, 0xffffffff]) assert.equal(parseSeedInput(seedString(value)), value)
console.log('seed input checks passed')
