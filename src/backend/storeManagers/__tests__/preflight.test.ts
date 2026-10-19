import { showDialogBoxModalAuto } from 'backend/dialog/dialog'
import { libraryManagerMap } from 'backend/storeManagers'
import { isRefused } from '../preflight'
import { clearSessionExpired, markSessionExpired } from '../session_state'

jest.mock('backend/dialog/dialog', () => ({
  showDialogBoxModalAuto: jest.fn()
}))
jest.mock('backend/logger')
jest.mock('backend/storeManagers', () => ({ libraryManagerMap: {} }))

const libraries = libraryManagerMap as Record<string, unknown>

beforeEach(() => {
  jest.mocked(showDialogBoxModalAuto).mockReset()
  clearSessionExpired('gog')
})

describe('isRefused', () => {
  test('a store with no preflight lets everything start', async () => {
    libraries['zoom'] = {}

    expect(await isRefused('zoom', 'install', 'g1')).toBe(false)
    expect(showDialogBoxModalAuto).not.toHaveBeenCalled()
  })

  test('a store that gives a reason refuses, and the reason is shown', async () => {
    const preflight = jest.fn().mockResolvedValue('Servers are down')
    libraries['legendary'] = { preflight }

    expect(await isRefused('legendary', 'update', 'g1')).toBe(true)
    expect(preflight).toHaveBeenCalledWith('update', 'g1')
    expect(showDialogBoxModalAuto).toHaveBeenCalledWith({
      title: 'Warning',
      message: 'Servers are down',
      type: 'ERROR'
    })
  })

  test('a store that has no objection lets it start, without a warning', async () => {
    libraries['gog'] = { preflight: jest.fn().mockResolvedValue(undefined) }

    expect(await isRefused('gog', 'install', 'g1')).toBe(false)
    expect(showDialogBoxModalAuto).not.toHaveBeenCalled()
  })
})

describe('isRefused with a session the store refused', () => {
  test.each(['install', 'update', 'repair'] as const)(
    '%s is refused, with the reason in a warning, and the store is not even asked',
    async (op) => {
      const preflight = jest.fn()
      libraries['gog'] = { preflight }
      markSessionExpired('gog')

      expect(await isRefused('gog', op, 'g1')).toBe(true)
      expect(showDialogBoxModalAuto).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('session has expired')
        })
      )
      expect(preflight).not.toHaveBeenCalled()
    }
  )

  test('importing a game that is already on the disk needs no session', async () => {
    libraries['gog'] = {}
    markSessionExpired('gog')

    expect(await isRefused('gog', 'import', 'g1')).toBe(false)
  })

  test('another store is not affected', async () => {
    libraries['zoom'] = {}
    markSessionExpired('gog')

    expect(await isRefused('zoom', 'install', 'g1')).toBe(false)
  })

  test('repair does not ask the store for a preflight', async () => {
    const preflight = jest.fn().mockResolvedValue('Servers are down')
    libraries['legendary'] = { preflight }

    expect(await isRefused('legendary', 'repair', 'g1')).toBe(false)
    expect(preflight).not.toHaveBeenCalled()
  })
})
