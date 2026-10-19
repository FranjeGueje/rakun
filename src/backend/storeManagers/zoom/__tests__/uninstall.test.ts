jest.mock('backend/logger', () => ({
  logDebug: jest.fn(),
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Zoom: 'Zoom' }
}))

jest.mock('../stores', () => ({
  installedGamesStore: { get: jest.fn(), set: jest.fn() },
  libraryStore: { get: jest.fn(), set: jest.fn() }
}))

jest.mock('backend/utils', () => ({
  sendFrontendMessage: jest.fn()
}))

jest.mock('../../index', () => ({
  libraryManagerMap: {
    zoom: { refreshInstalled: jest.fn() }
  }
}))

import type { GameInfo } from 'common/types'
import ZoomGame from '../games'
import { installedGamesStore, libraryStore } from '../stores'
import { libraryManagerMap } from '../../index'

const installedStore = jest.mocked(installedGamesStore)
const savedLibrary = jest.mocked(libraryStore)

describe('ZoomGame.uninstall', () => {
  const appName = 'test-zoom-game'
  let game: ZoomGame

  beforeEach(() => {
    jest.clearAllMocks()
    game = new ZoomGame(appName)
    game.getGameInfo = jest.fn().mockReturnValue({
      app_name: appName,
      runner: 'zoom',
      is_installed: true,
      install: { install_path: '/nowhere/zoom-game' }
    })
    savedLibrary.get.mockReturnValue([
      { app_name: appName, is_installed: true },
      { app_name: 'other', is_installed: true }
    ] as GameInfo[])
  })

  it('removes the game from the list and from the saved library', async () => {
    installedStore.get.mockReturnValue([
      { appName, install_path: '/nowhere/zoom-game' },
      { appName: 'other', install_path: '/nowhere/other' }
    ])

    const result = await game.uninstall()

    expect(result.stderr).toBe('')
    expect(installedStore.set).toHaveBeenCalledWith('installed', [
      { appName: 'other', install_path: '/nowhere/other' }
    ])
    expect(libraryManagerMap['zoom'].refreshInstalled).toHaveBeenCalled()
    const [, saved] = savedLibrary.set.mock.calls[0]
    expect(saved).toEqual([
      {
        app_name: appName,
        runner: 'zoom',
        is_installed: false,
        install: { is_dlc: false }
      },
      { app_name: 'other', is_installed: true }
    ])
  })

  it('clears a stale mark instead of failing when the list does not have the game', async () => {
    installedStore.get.mockReturnValue([])

    await expect(game.uninstall()).resolves.toEqual({
      stdout: 'Uninstalled',
      stderr: ''
    })
    const [, saved] = savedLibrary.set.mock.calls[0]
    expect(saved).toContainEqual(
      expect.objectContaining({ app_name: appName, is_installed: false })
    )
  })
})
