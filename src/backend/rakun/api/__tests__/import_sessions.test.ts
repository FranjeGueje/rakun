import { invokeHandler } from 'backend/ipc'
import { appDataPath, userDataPath } from 'backend/constants/paths'
import { GOGUser } from 'backend/storeManagers/gog/user'
import { NileUser } from 'backend/storeManagers/nile/user'
import { ZoomUser } from 'backend/storeManagers/zoom/user'
import { startRefresh } from '../refresh'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import './../import_sessions'

jest.mock('backend/constants/paths', () => {
  const { mkdtempSync } = jest.requireActual<typeof import('fs')>('fs')
  const { tmpdir } = jest.requireActual<typeof import('os')>('os')
  const root = mkdtempSync(`${tmpdir()}/rakun-sessions-`)
  return {
    appDataPath: root,
    userDataPath: `${root}/rakun`,
    appFolder: `${root}/rakun`,
    toolsPath: `${root}/rakun/tools`
  }
})
jest.mock('../refresh', () => ({ startRefresh: jest.fn() }))
jest.mock('backend/storeManagers/gog/electronStores', () => ({
  configStore: { set: jest.fn() }
}))
jest.mock('backend/storeManagers/gog/user', () => ({
  GOGUser: { getUserDetails: jest.fn(), logout: jest.fn() }
}))
jest.mock('backend/storeManagers/nile/user', () => ({
  NileUser: { getUserData: jest.fn() }
}))
jest.mock('backend/storeManagers/zoom/user', () => ({
  ZoomUser: { getUserDetails: jest.fn(), logout: jest.fn() }
}))

const relic = join(appDataPath, 'relic')
const rakun = userDataPath

const EPIC = 'legendaryConfig/legendary/user.json'
const GOG = 'gog_store/auth.json'
const NILE = 'nile_config/nile/current_user.json'
const NILE_ENC = 'nile_config/nile/device.enc'
const ZOOM = 'zoom_store/.zoom.token'

function write(root: string, file: string, content = 'secret') {
  const path = join(root, file)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

function allFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
}

const run = () => invokeHandler('importSessionsFromRelic')

beforeEach(() => {
  rmSync(relic, { recursive: true, force: true })
  rmSync(rakun, { recursive: true, force: true })
  jest.clearAllMocks()
  jest.mocked(GOGUser.getUserDetails).mockResolvedValue({} as never)
  jest.mocked(NileUser.getUserData).mockReturnValue({} as never)
  jest.mocked(ZoomUser.getUserDetails).mockResolvedValue({} as never)
})

describe('importSessionsFromRelic', () => {
  test('without Relic data every store is missing', async () => {
    expect(await run()).toEqual({
      legendary: 'missing',
      gog: 'missing',
      nile: 'missing',
      zoom: 'missing'
    })
    expect(allFiles(rakun)).toEqual([])
  })

  test('copies each session, the Zoom dotfile included, with private permissions', async () => {
    ;[EPIC, GOG, NILE, NILE_ENC, ZOOM].forEach((file) => write(relic, file))

    expect(await run()).toEqual({
      legendary: 'imported',
      gog: 'imported',
      nile: 'imported',
      zoom: 'imported'
    })
    expect(allFiles(rakun).sort()).toEqual(
      [EPIC, GOG, NILE, NILE_ENC, ZOOM].sort()
    )
    expect(statSync(join(rakun, ZOOM)).mode & 0o777).toBe(0o600)
    expect(startRefresh).toHaveBeenCalledTimes(4)
  })

  test('never copies installed games or library caches', async () => {
    write(relic, NILE)
    write(relic, 'nile_config/nile/installed.json')
    write(relic, 'nile_config/nile/library.json')
    write(relic, 'nile_config/nile/manifests/game')
    write(relic, 'legendaryConfig/legendary/installed.json')
    write(relic, 'gog_store/installed.json')
    write(relic, 'zoom_store/installed.json')

    await run()

    expect(allFiles(rakun)).toEqual([NILE])
  })

  test('does not overwrite a session rakun already has', async () => {
    write(relic, EPIC, 'from relic')
    write(rakun, EPIC, 'mine')

    expect((await run()) as { legendary: string }).toMatchObject({
      legendary: 'already'
    })
    expect(allFiles(rakun)).toEqual([EPIC])
    expect(startRefresh).not.toHaveBeenCalled()
  })

  test('a session the store rejects is discarded', async () => {
    write(relic, GOG)
    write(relic, ZOOM)
    write(relic, NILE)
    jest.mocked(GOGUser.getUserDetails).mockResolvedValue(undefined)
    jest.mocked(ZoomUser.getUserDetails).mockResolvedValue(undefined)
    jest.mocked(NileUser.getUserData).mockReturnValue(undefined)

    expect(await run()).toMatchObject({
      gog: 'invalid',
      zoom: 'invalid',
      nile: 'invalid'
    })
    expect(GOGUser.logout).toHaveBeenCalled()
    expect(ZoomUser.logout).toHaveBeenCalled()
    expect(existsSync(join(rakun, NILE))).toBe(false)
    expect(startRefresh).not.toHaveBeenCalled()
  })

  test('running it twice changes nothing the second time', async () => {
    write(relic, EPIC)
    await run()

    expect(await run()).toMatchObject({ legendary: 'already' })
    expect(startRefresh).toHaveBeenCalledTimes(1)
  })

  test('leaves Relic untouched', async () => {
    write(relic, EPIC)
    await run()

    expect(allFiles(relic)).toEqual([EPIC])
  })
})
