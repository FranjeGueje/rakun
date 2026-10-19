import { queueElement, updateElement } from '../queue_element'
import type { GameInfo, InstallParams } from 'common/types'

const gameInfo = {
  app_name: 'g1',
  runner: 'gog',
  install: { install_path: '/games/g1', platform: 'windows' }
} as GameInfo

describe('queueElement', () => {
  test('is queued now and has not started', () => {
    const params = { appName: 'g1', runner: 'gog' } as InstallParams
    const element = queueElement('install', params)

    expect(element).toEqual({
      params,
      type: 'install',
      addToQueueTime: expect.any(Number),
      startTime: 0,
      endTime: 0
    })
  })
})

describe('updateElement', () => {
  test('takes the path and the platform of the install', () => {
    const element = updateElement({ appName: 'g1', runner: 'gog', gameInfo })

    expect(element.type).toBe('update')
    expect(element.params).toEqual({
      appName: 'g1',
      runner: 'gog',
      gameInfo,
      path: '/games/g1',
      platformToInstall: 'windows'
    })
  })
})
