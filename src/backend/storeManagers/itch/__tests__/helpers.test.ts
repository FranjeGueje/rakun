import { mkdtempSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { ItchGame, ItchUpload } from 'common/types/itch'
import { parseHandshake } from '../butlerd'
import { installLocationFor } from '../install_location'
import {
  folderNameOf,
  itchToGameInfo,
  pickUpload,
  uniqueGames
} from '../library_info'
import { formatEta, toInstallProgress } from '../progress'

const game: ItchGame = {
  id: 7,
  url: 'https://dev.itch.io/cool',
  title: 'Cool: The Game?',
  coverUrl: 'https://img/cover.png',
  platforms: { windows: 'all', linux: 'all' },
  user: { username: 'dev', displayName: 'The Dev' }
}

describe('itchToGameInfo', () => {
  test('maps the game with its id as the app name', () => {
    const info = itchToGameInfo(game)
    expect(info).toMatchObject({
      runner: 'itch',
      app_name: '7',
      title: 'Cool: The Game?',
      art_cover: 'https://img/cover.png',
      developer: 'The Dev',
      store_url: 'https://dev.itch.io/cool',
      is_installed: false,
      is_windows_native: true,
      is_linux_native: true,
      is_mac_native: false
    })
  })

  test('folder name drops what a file system dislikes, or falls back to the id', () => {
    expect(folderNameOf(game)).toBe('Cool The Game')
    expect(folderNameOf({ ...game, title: '???' })).toBe('7')
  })
})

describe('uniqueGames', () => {
  test('keeps each game once, the first one found', () => {
    const owned = { ...game, id: 1, title: 'Owned' }
    const collected = [
      { ...game, id: 1, title: 'Again' },
      { ...game, id: 2 }
    ]
    expect(uniqueGames([[owned], collected]).map((g) => g.title)).toEqual([
      'Owned',
      game.title
    ])
  })
})

describe('pickUpload', () => {
  const upload = (id: number, extra: Partial<ItchUpload>): ItchUpload => ({
    id,
    ...extra
  })

  test('takes the main file of the platform before extras', () => {
    const uploads = [
      upload(1, { type: 'soundtrack', platforms: { windows: 'all' } }),
      upload(2, { type: 'default', platforms: { windows: 'all' } }),
      upload(3, { type: 'default', platforms: { linux: 'all' } })
    ]
    expect(pickUpload(uploads, 'windows')?.id).toBe(2)
    expect(pickUpload(uploads, 'linux')?.id).toBe(3)
  })

  test('falls back to any upload of the platform, and to none', () => {
    const uploads = [upload(1, { type: 'demo', platforms: { linux: 'all' } })]
    expect(pickUpload(uploads, 'linux')?.id).toBe(1)
    expect(pickUpload(uploads, 'windows')).toBeUndefined()
  })
})

describe('progress', () => {
  test('formats the time left as HH:MM:SS', () => {
    expect(formatEta(0)).toBe('00:00:00')
    expect(formatEta(3725)).toBe('01:02:05')
  })

  test('turns butler progress (0 to 1) into a percentage and MB/s', () => {
    expect(
      toInstallProgress({ progress: 0.256, eta: 61, bps: 2 * 1024 * 1024 })
    ).toMatchObject({ percent: 25.6, eta: '00:01:01', downSpeed: 2 })
  })
})

describe('parseHandshake', () => {
  const line = JSON.stringify({
    type: 'butlerd/listen-notification',
    secret: 's3cret',
    tcp: { address: '127.0.0.1:1234' }
  })

  test('reads the address and the secret', () => {
    expect(parseHandshake(line)).toEqual({
      type: 'butlerd/listen-notification',
      secret: 's3cret',
      tcp: { address: '127.0.0.1:1234' }
    })
  })

  test('ignores logs and anything that is not JSON', () => {
    expect(parseHandshake('{"type":"log","message":"hi"}')).toBeUndefined()
    expect(parseHandshake('not json')).toBeUndefined()
  })
})

describe('installLocationFor', () => {
  const games = join(mkdtempSync(join(tmpdir(), 'itch-')), 'games')
  const butlerdWith = (locations: { id: string; path: string }[]) => {
    const call = jest.fn((method: string) =>
      Promise.resolve(
        method === 'Install.Locations.List'
          ? { installLocations: locations }
          : { installLocation: { id: 'new', path: games } }
      )
    )
    return { call } as unknown as Parameters<typeof installLocationFor>[0] & {
      call: jest.Mock
    }
  }

  test('reuses the location of that folder', async () => {
    const butlerd = butlerdWith([{ id: 'known', path: games }])
    expect(await installLocationFor(butlerd, games)).toBe('known')
    expect(butlerd.call).not.toHaveBeenCalledWith(
      'Install.Locations.Add',
      expect.anything()
    )
  })

  test('adds the folder when butler does not know it', async () => {
    const butlerd = butlerdWith([])
    expect(await installLocationFor(butlerd, `${games}/`)).toBe('new')
    expect(butlerd.call).toHaveBeenCalledWith('Install.Locations.Add', {
      path: games
    })
  })

  test('creates the folder: butler only registers one that exists', async () => {
    const folder = join(mkdtempSync(join(tmpdir(), 'itch-')), 'Games', 'Rakun')
    await installLocationFor(butlerdWith([]), folder)
    expect(existsSync(folder)).toBe(true)
  })
})
