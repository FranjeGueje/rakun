import { join } from 'path'
import { mkdtempSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { Butlerd, ButlerdError, type ButlerdOptions } from '../butlerd'

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Itch: 'Itch' }
}))

const FAKE = join(__dirname, 'fixtures', 'fake_butler.js')
const started: Butlerd[] = []

/** The fake daemon, behaving as `mode` says (see the fixture) */
async function start(mode = '', options: ButlerdOptions = {}) {
  const folder = mkdtempSync(join(tmpdir(), 'butlerd-test-'))
  const client = await Butlerd.start(
    process.execPath,
    join(folder, 'x', 'b.db'),
    {
      binaryArgs: [FAKE],
      env: { ...process.env, FAKE_BUTLER: mode },
      ...options
    }
  )
  started.push(client)
  return { client, folder }
}

afterEach(() => {
  started.splice(0).forEach((client) => client.stop())
})

describe('Butlerd.start', () => {
  test('starts the daemon, connects and authenticates', async () => {
    const { client } = await start()
    expect(await client.call('Any.Thing', { a: 1 })).toEqual({
      echo: 'Any.Thing',
      params: { a: 1 }
    })
  })

  test('the folder of its database is for this user only', async () => {
    const { folder } = await start()
    expect(statSync(join(folder, 'x')).mode & 0o777).toBe(0o700)
  })

  test('gives up when butler never says where it listens, with a clear message', async () => {
    await expect(start('silent', { handshakeMs: 300 })).rejects.toThrow(
      'did not say where it listens'
    )
  })

  test('says what butler wrote when it dies before it is ready', async () => {
    await expect(start('noisy')).rejects.toThrow(
      /exited \(3\).*database is locked/
    )
  })

  test('fails when the binary does not exist', async () => {
    await expect(
      Butlerd.start('/nonexistent/butler', join(tmpdir(), 'nope', 'b.db'))
    ).rejects.toThrow()
  })
})

describe('call', () => {
  test('an error of butlerd is a ButlerdError with its code', async () => {
    const { client } = await start()
    // The fake answers Meta.Authenticate with an error for a wrong secret
    await expect(
      client.call('Meta.Authenticate', { secret: 'wrong' })
    ).rejects.toMatchObject({ code: 1, message: 'bad secret' })
    await expect(
      client.call('Meta.Authenticate', { secret: 'wrong' })
    ).rejects.toBeInstanceOf(ButlerdError)
  })

  test('a call that is never answered fails after the time limit', async () => {
    const { client } = await start('', { callMs: 200 })
    await expect(client.call('Hang.Forever')).rejects.toThrow(
      /did not answer Hang\.Forever/
    )
  })

  test('an operation has no time limit', async () => {
    const { client } = await start('', { callMs: 100 })
    const performing = client.call('Install.Perform', { id: 'x' })
    await new Promise((resolve) => setTimeout(resolve, 400))
    // Answered long after the limit of the other calls
    expect(await performing).toMatchObject({ echo: 'Install.Perform' })
  })

  test('a line that is not JSON is ignored and the answer still arrives', async () => {
    const { client } = await start('garbage')
    expect(await client.call('Any.Thing')).toMatchObject({ echo: 'Any.Thing' })
  })

  test('butlerd asking something is answered with a refusal, and the call goes on', async () => {
    const { client } = await start()
    expect(await client.call('Ask.Back')).toMatchObject({ echo: 'Ask.Back' })
  })
})

describe('notifications', () => {
  test('a listener hears them and can stop listening', async () => {
    const { client } = await start()
    const heard = jest.fn()
    const stop = client.on('Progress', heard)

    await client.call('Notify.Me')
    expect(heard).toHaveBeenCalledWith({ progress: 0.5 })

    stop()
    await client.call('Notify.Me')
    expect(heard).toHaveBeenCalledTimes(1)
  })

  test('a listener that throws does not stop the others nor the answer', async () => {
    const { client } = await start()
    const other = jest.fn()
    client.on('Progress', () => {
      throw new Error('boom')
    })
    client.on('Progress', other)

    await expect(client.call('Notify.Me')).resolves.toEqual({})
    expect(other).toHaveBeenCalled()
  })
})

describe('when the daemon goes away', () => {
  test('the calls waiting fail, the next ones fail at once, and onClose is told', async () => {
    const onClose = jest.fn()
    const { client } = await start('', { onClose })

    await expect(client.call('Close.Me')).rejects.toThrow('butlerd closed')
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(onClose).toHaveBeenCalledTimes(1)
    await expect(client.call('Any.Thing')).rejects.toThrow('not running')
  })

  test('stop ends the client for good', async () => {
    const { client } = await start()
    client.stop()
    await expect(client.call('Any.Thing')).rejects.toThrow('not running')
  })
})
