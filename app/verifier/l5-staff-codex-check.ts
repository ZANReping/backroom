import { entityPortraitStats } from '../src/components/entityPortrait'
import { L5_STAFF } from '../src/game/content/l5Staff'

const sleep = (ms = 60) => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(test: () => unknown, label: string) {
  const deadline = performance.now() + 65000
  while (performance.now() < deadline) {
    if (test()) return
    await sleep()
  }
  throw Error('Timeout: ' + label)
}
const button = (name: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === name)
const click = (target: HTMLElement | null | undefined) => {
  if (!target) throw Error('Missing UI action')
  target.click()
}

export function mount(app: { engine: import('../src/game/engine').Engine; memory: Map<string, string> }) {
  const checks: string[] = [], types = L5_STAFF.map(s => s.id)
  const portraits = () => [...document.querySelectorAll<HTMLElement>('.hl-staff [data-staff-avatar]')]
  const ok = (test: unknown, message: string) => {
    if (!test) throw Error(message)
    checks.push(message)
  }
  const setEncounters = (counts: Record<string, number>) => app.memory.set('br_codex_seen', JSON.stringify(counts))
  const archive = (type: string) => document.querySelector<HTMLElement>(`[data-entity-preview="${type}"]`)
  async function backToList() {
    if (button('← 返回图鉴')) click(button('← 返回图鉴'))
    await waitFor(() => !document.querySelector('[data-entity-preview]'), 'back to codex')
  }
  async function openStaff(type: string) {
    await backToList()
    click(document.querySelector<HTMLElement>(`[data-entity-card="${type}"]`))
    await waitFor(() => document.querySelector(`[data-staff-file="${type}"]`), type + ' dossier')
    const file = document.querySelector<HTMLElement>(`[data-staff-file="${type}"]`)!
    await waitFor(() => file.querySelector('[data-staff-avatar][data-state=ready]'), type + ' photo')
    file.scrollIntoView({ block: 'start' })
    await sleep(390)
    return file
  }
  return {
    async lockedLedger() {
      app.engine.hotelBook.met = []
      app.engine.hotelBook.firstEntry ||= Date.now()
      await waitFor(() => button('团体'), 'game codex')
      click(button('团体')); await waitFor(() => button('翻开登记簿'), 'ledger entry')
      click(button('翻开登记簿')); await waitFor(() => button('员工名录'), 'ledger tab')
      click(button('员工名录')); await waitFor(() => portraits().length === types.length, 'locked roster')
      ok(portraits().every(p => p.dataset.state === 'locked'), 'All seven unencountered employees stay concealed')
      ok(entityPortraitStats().builds === 0, 'Locked roster does not build employee models')
    },
    async unlockedLedger() {
      app.engine.hotelBook.met = types
      click(button('登记卡')); await waitFor(() => !portraits().length, 'ledger tab changed')
      click(button('员工名录'))
      await waitFor(() => portraits().length === types.length && portraits().every(p => p.dataset.state === 'ready'), 'seven rendered portraits')
      const images = portraits().map(p => p.querySelector('img')!)
      await Promise.all(images.map(i => i.decode()))
      ok(images.every(i => i.naturalWidth === 116 && i.naturalHeight === 148), 'All seven 116×148 staff photos decode')
      ok(new Set(images.map(i => i.src)).size === types.length, 'All employees have distinct photos')
      ok(images.every(i => {
        const { width, height } = i.getBoundingClientRect()
        return width > 20 && Math.abs(width / height - 116 / 148) < .035 && getComputedStyle(i).objectFit === 'cover'
      }), 'Rendered roster photos keep their proportions in full-height cards')
      const sheet = document.createElement('canvas'); sheet.width = 132 * types.length; sheet.height = 180
      const g = sheet.getContext('2d')!; g.fillStyle = '#201b13'; g.fillRect(0, 0, sheet.width, sheet.height)
      images.forEach((img, i) => { g.drawImage(img, i * 132 + 8, 6); g.fillStyle = '#e8d9b0'; g.font = '15px serif'; g.fillText(L5_STAFF[i].name, i * 132 + 8, 172) })
      const builds = entityPortraitStats().builds
      click(button('登记卡')); await waitFor(() => !portraits().length, 'leave roster')
      click(button('员工名录')); await waitFor(() => portraits().length === types.length && portraits().every(p => p.dataset.state === 'ready'), 'reopen roster')
      ok(entityPortraitStats().builds === builds && builds === 7, 'Reopening the roster reuses all seven photos')
      return { photoSheet: sheet.toDataURL('image/png'), stats: entityPortraitStats() }
    },
    async entityList() {
      click(button('← 返回团体列表'))
      setEncounters({ beast: 1, greeter: 3, chef: 6, jazz: 6, maid: 6, concierge: 6, bellhop: 6 })
      click([...document.querySelectorAll<HTMLElement>('.codex-cat')].find(b => b.textContent?.trim() === '实体'))
      await waitFor(() => document.querySelector('[data-entity-card=beast]'), 'entity cards')
    },
    async dossier(type: string, locks: number) {
      const file = await openStaff(type), content = file.textContent ?? ''
      ok(file.querySelectorAll('.mcf-locked').length === locks, type + ' encounter tiers')
      ok(!!file.querySelector('.mcf-stats'), type + ' live hotel records')
      if (type === 'beast' && locks === 0) ok(content.includes('婉拒会扣 8 点理智') && content.includes('15 分钟内') && content.includes('12 分钟内'), 'Beast dossier matches live refusal penalty and contract times')
      return { type, locks }
    },
    async fullBeast() {
      setEncounters({ beast: 6, greeter: 3, chef: 6, jazz: 6 })
      return this.dossier('beast', 0)
    },
    async archiveCycle() {
      const figure = archive('beast')!
      figure.scrollIntoView({ block: 'center' })
      await waitFor(() => figure.dataset.state === 'ready', 'M.E.G. model view zero')
      const original = figure.querySelector('img')!.src
      click(figure.querySelector('button'))
      await waitFor(() => figure.dataset.state === 'ready' && figure.dataset.view === '1', 'next model angle')
      ok(figure.querySelector('img')!.src !== original, 'Existing full-size archive preview still cycles')
      ok(document.querySelector('[data-staff-avatar=beast]')?.getAttribute('data-state') === 'ready', 'Changing archive angle preserves the staff photo')
    },
    async mobile() {
      const file = await openStaff('chef')
      const sheet = file.querySelector('.mcf-staff-sheet')!
      ok(sheet.scrollWidth <= sheet.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1, 'Touch landscape has no dossier overflow')
      return { viewport: [innerWidth, innerHeight] }
    },
    async finish() {
      click(document.querySelector<HTMLElement>('.wb-head [aria-label="关闭"]'))
      await waitFor(() => !entityPortraitStats().active && !entityPortraitStats().studio, 'preview studio releases GPU context')
      ok(!document.querySelector('[data-staff-file]'), 'Closing the codex unmounts the dossier')
      return { checks, stats: entityPortraitStats() }
    },
  }
}
