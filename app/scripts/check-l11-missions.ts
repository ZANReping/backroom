import { MEG_ACTIVE_PROMOTION_COUNTS, MEG_MISSIONS, MEG_PAUSED_MISSION_IDS, MEG_PROMOTION_COUNTS, isPausedMegMission } from '../src/game/content/megMissions'

const expected = ['city-lesson', 'suburban-margin', 'harvest-caution', 'shelter-chain', 'unfinished-atlas']
if (expected.length !== MEG_PAUSED_MISSION_IDS.size || expected.some(id => !isPausedMegMission(id))) throw new Error('paused mission set is incomplete')
if (MEG_MISSIONS.filter(m => isPausedMegMission(m.id)).length !== expected.length) throw new Error('paused IDs do not match mission catalog')
if (MEG_ACTIVE_PROMOTION_COUNTS.join(',') !== '2,5,9,11') throw new Error('MEG promotion thresholds are incorrect')
if (MEG_PROMOTION_COUNTS.join(',') !== '2,5,9,13') throw new Error('other faction thresholds were changed')
console.log(`L11 missions OK: ${expected.length} paused, ${MEG_MISSIONS.length - expected.length} active, MEG=${MEG_ACTIVE_PROMOTION_COUNTS.join('/')} other=${MEG_PROMOTION_COUNTS.join('/')}`)
