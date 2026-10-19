import { execFileSync } from 'child_process'
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  statSync,
  symlinkSync,
  writeFileSync,
  readFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  parseCandidates,
  pickCandidate,
  startScriptText,
  writeStartScript
} from '../executable'

const candidate = (path: string) => ({ path, flavor: 'linux', size: 1 })

describe('pickCandidate', () => {
  test('takes the first one butler ranks', () => {
    expect(
      pickCandidate([candidate('game/run'), candidate('other')])?.path
    ).toBe('game/run')
  })

  test('skips an installer when there is anything else', () => {
    expect(
      pickCandidate([candidate('Setup.exe'), candidate('Game.exe')])?.path
    ).toBe('Game.exe')
    expect(pickCandidate([candidate('Game/unins000.exe')])?.path).toBe(
      'Game/unins000.exe'
    )
  })

  test('skips installers, uninstallers and crash reporters by their whole name', () => {
    for (const name of [
      'Setup.exe',
      'setup.exe',
      'Installer.exe',
      'unins000.exe',
      'ControllerCompanion.Setup.exe',
      'My Game Setup.exe',
      'dxsetup.exe',
      'vc_redist.x64.exe',
      'UnityCrashHandler64.exe'
    ])
      expect(
        pickCandidate([candidate(name), candidate('game/Game.exe')])?.path
      ).toBe('game/Game.exe')
  })

  test('a game whose name only starts like an installer is still a game', () => {
    for (const name of [
      'Installer Simulator.exe',
      'Crash Bandicoot/game.exe',
      'Setup Wizard Adventures.exe',
      'Redeemer.exe',
      'Setup/Game.exe'
    ])
      expect(
        pickCandidate([candidate(name), candidate('other.exe')])?.path
      ).toBe(name)
  })

  test('has nothing to take when there is nothing', () => {
    expect(pickCandidate([])).toBeUndefined()
  })
})

describe('parseCandidates', () => {
  const log = '{"level":"info","message":"done","type":"log"}'

  test('reads the candidates of the result line, among logs', () => {
    const result = JSON.stringify({
      type: 'result',
      value: { candidates: [candidate('a/b')] }
    })
    expect(parseCandidates(`${log}\n${result}\n`)).toEqual([candidate('a/b')])
  })

  test('is empty for a null list, no result or garbage', () => {
    const none = JSON.stringify({ type: 'result', value: { candidates: null } })
    expect(parseCandidates(none)).toEqual([])
    expect(parseCandidates(log)).toEqual([])
    expect(parseCandidates('not json')).toEqual([])
  })
})

describe('start.sh', () => {
  test('goes to the folder of the executable and runs it', () => {
    expect(startScriptText('game/run')).toBe(
      `#!/bin/sh\ncd "$(dirname "$0")"/'game' || exit 1\nexec ./'run' "$@"\n`
    )
    expect(startScriptText('run')).toContain('cd "$(dirname "$0")" ||')
  })

  test('really runs the executable from its own folder, names with quotes included', () => {
    const folder = mkdtempSync(join(tmpdir(), 'itch-start-'))
    const dir = join(folder, "it's a game")
    mkdirSync(dir)
    writeFileSync(join(dir, 'run'), '#!/bin/sh\necho "$PWD|$1"\n')

    writeStartScript(folder, "it's a game/run")

    expect(statSync(join(folder, 'start.sh')).mode & 0o111).not.toBe(0)
    expect(readFileSync(join(folder, 'start.sh'), 'utf-8')).toContain('exec ./')
    const out = execFileSync(join(folder, 'start.sh'), ['arg']).toString()
    expect(out.trim()).toMatch(/it's a game\|arg$/)
  })

  test('a start.sh that came as a link to a file of yours is replaced, not written through', () => {
    const folder = mkdtempSync(join(tmpdir(), 'itch-start-'))
    const mine = join(mkdtempSync(join(tmpdir(), 'itch-mine-')), 'bashrc')
    writeFileSync(mine, 'my precious file')
    writeFileSync(join(folder, 'run'), '#!/bin/sh\n')
    symlinkSync(mine, join(folder, 'start.sh'))

    writeStartScript(folder, 'run')

    expect(readFileSync(mine, 'utf-8')).toBe('my precious file')
    expect(lstatSync(join(folder, 'start.sh')).isSymbolicLink()).toBe(false)
    expect(readFileSync(join(folder, 'start.sh'), 'utf-8')).toContain('exec ./')
  })

  test('an executable that is a link out of the install is refused, and left alone', () => {
    const folder = mkdtempSync(join(tmpdir(), 'itch-start-'))
    const outside = join(mkdtempSync(join(tmpdir(), 'itch-out-')), 'secret')
    writeFileSync(outside, 'data')
    chmodSync(outside, 0o600)
    symlinkSync(outside, join(folder, 'run'))

    expect(() => writeStartScript(folder, 'run')).toThrow(
      'leads out of the install folder'
    )
    expect(statSync(outside).mode & 0o777).toBe(0o600)
  })
})
