import { showDialogBoxModalAuto } from 'backend/dialog/dialog'
import { libraryManagerMap } from 'backend/storeManagers'
import { isRefused } from '../preflight'

jest.mock('backend/dialog/dialog', () => ({
  showDialogBoxModalAuto: jest.fn()
}))
jest.mock('backend/storeManagers', () => ({ libraryManagerMap: {} }))

const libraries = libraryManagerMap as Record<string, unknown>

beforeEach(() => {
  jest.mocked(showDialogBoxModalAuto).mockReset()
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
