import { invokeHandler, onFrontendMessage } from 'backend/ipc'
import { downloadHelpers } from 'backend/rakun/helpers/download'
import { currentHelpers, helpersLayout } from 'backend/rakun/helpers/locations'
import './../helpers'

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn()
}))
jest.mock('backend/rakun/helpers/download', () => ({
  downloadHelpers: jest.fn()
}))
jest.mock('backend/rakun/helpers/locations', () => ({
  currentHelpers: jest.fn(),
  helpersLayout: jest.fn()
}))

const mockedDownload = jest.mocked(downloadHelpers)
const mockedCurrent = jest.mocked(currentHelpers)

const state = [
  { helper: 'legendary', pinned: '0.21.1', installed: '', state: 'missing' }
] as never

function messages() {
  const seen: [string, unknown[]][] = []
  const stop = onFrontendMessage((channel, args) => seen.push([channel, args]))
  return { seen, stop }
}

describe('getHelpers', () => {
  test('answers what is installed', async () => {
    mockedCurrent.mockReturnValue(state)

    expect(await invokeHandler('getHelpers')).toEqual(state)
  })
})

describe('updateHelpers', () => {
  // The config resets the mocks before each test: what they answer is set here
  beforeEach(() => {
    mockedCurrent.mockReturnValue(state)
    jest
      .mocked(helpersLayout)
      .mockReturnValue({ binRoot: '/bin', winRoot: '/win' })
  })

  test('downloads, forwards what it says as events and ends with done', async () => {
    mockedDownload.mockImplementation((_layout, options) => {
      options?.onProgress?.('Downloading legendary 0.21.1')
      return Promise.resolve([])
    })
    const { seen, stop } = messages()

    const result = await invokeHandler('updateHelpers', {})
    stop()

    expect(result).toEqual({ helpers: state, failures: [] })
    expect(seen).toEqual([
      ['helpersProgress', ['Downloading legendary 0.21.1']],
      ['helpersProgress', ['done']]
    ])
    expect(mockedDownload).toHaveBeenCalledWith(
      { binRoot: '/bin', winRoot: '/win' },
      expect.objectContaining({ latest: false })
    )
  })

  test('--latest is passed on, and what failed is answered', async () => {
    mockedDownload.mockResolvedValue([{ helper: 'nile', error: 'HTTP 404' }])

    const result = await invokeHandler('updateHelpers', { latest: true })

    expect(mockedDownload).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ latest: true })
    )
    expect(result).toMatchObject({
      failures: [{ helper: 'nile', error: 'HTTP 404' }]
    })
  })

  test('a second request while it downloads joins the first', async () => {
    let finish: (value: never[]) => void = () => undefined
    mockedDownload.mockReturnValue(new Promise((resolve) => (finish = resolve)))

    const first = invokeHandler('updateHelpers', {})
    const second = invokeHandler('updateHelpers', {})
    finish([])
    await Promise.all([first, second])

    expect(mockedDownload).toHaveBeenCalledTimes(1)
  })
})
