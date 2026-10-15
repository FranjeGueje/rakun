jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  LogPrefix: { Itch: 'Itch' }
}))
jest.mock('../../../storeManagers/itch/login', () => ({
  completeItchLogin: jest.fn(),
  cancelItchLogin: jest.fn()
}))
jest.mock('../../../storeManagers/itch/user', () => ({
  loginErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error)
}))
jest.mock('../refresh', () => ({ startRefresh: jest.fn() }))

import {
  cancelItchLogin,
  completeItchLogin
} from '../../../storeManagers/itch/login'
import { callbackHeaders, callbackPage, itchCallback } from '../login_callback'
import { startRefresh } from '../refresh'

const complete = jest.mocked(completeItchLogin)
const cancel = jest.mocked(cancelItchLogin)
const query = (text: string) => new URLSearchParams(text)

beforeEach(() => jest.clearAllMocks())

describe('itchCallback', () => {
  test('a code with its state logs in and refreshes the library', async () => {
    complete.mockResolvedValue(undefined)

    const reply = await itchCallback(query('code=C&state=S'))

    expect(complete).toHaveBeenCalledWith('C', 'S')
    expect(startRefresh).toHaveBeenCalledWith('itch')
    expect(reply.status).toBe(200)
    expect(reply.title).toBe('Logged in to itch.io')
  })

  test('a refusal forgets the login and logs nobody in', async () => {
    const reply = await itchCallback(query('error=access_denied&state=S'))

    expect(cancel).toHaveBeenCalledWith('S')
    expect(complete).not.toHaveBeenCalled()
    expect(startRefresh).not.toHaveBeenCalled()
    expect(reply).toMatchObject({ status: 400, title: 'Login cancelled' })
  })

  test('a refusal wins over a code that comes with it', async () => {
    await itchCallback(query('error=access_denied&code=C&state=S'))
    expect(complete).not.toHaveBeenCalled()
  })

  test('no code is a failure', async () => {
    const reply = await itchCallback(query('state=S'))
    expect(reply.status).toBe(400)
    expect(complete).not.toHaveBeenCalled()
  })

  test('a state that is not the pending one is a failure and does not refresh', async () => {
    complete.mockRejectedValue(new Error('not the one rakun started'))

    const reply = await itchCallback(query('code=C&state=forged'))

    expect(reply.status).toBe(400)
    expect(reply.message).toContain('not the one rakun started')
    expect(startRefresh).not.toHaveBeenCalled()
  })

  test('a callback with no state at all reaches the check with none', async () => {
    complete.mockRejectedValue(new Error('no'))
    await itchCallback(query('code=C'))
    expect(complete).toHaveBeenCalledWith('C', undefined)
  })
})

describe('callbackPage', () => {
  test('is a page with the title and the message', () => {
    const page = callbackPage({
      status: 200,
      title: 'Done',
      message: 'Close it'
    })
    expect(page).toContain('<h1>Done</h1>')
    expect(page).toContain('<p>Close it</p>')
  })

  test('escapes what it shows, so an error cannot put markup in the page', () => {
    const page = callbackPage({
      status: 400,
      title: 'x',
      message: '<script>alert("1")</script>'
    })
    expect(page).not.toContain('<script>')
    expect(page).toContain('&lt;script&gt;')
  })

  test('is sent with no cache, no referrer and a policy that allows no script', () => {
    expect(callbackHeaders).toMatchObject({
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer'
    })
    expect(callbackHeaders['Content-Security-Policy']).toContain(
      "default-src 'none'"
    )
    expect(callbackHeaders['Content-Security-Policy']).toContain(
      "frame-ancestors 'none'"
    )
    expect(callbackHeaders).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    })
  })
})
