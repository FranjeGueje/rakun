/** @jest-environment node */
import { createBridge, poster } from '../bridge'
import type { WebLink } from '../link'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

describe('poster', () => {
  test('posts the arguments to the channel with the token', async () => {
    const fetchFn = jest.fn().mockResolvedValue(json({ result: [1] }))
    const post = poster('tok', fetchFn)

    expect(await post('getLibrary', ['gog'])).toEqual([1])
    expect(fetchFn).toHaveBeenCalledWith('/api/getLibrary', {
      method: 'POST',
      headers: { 'x-rakun-token': 'tok', 'content-type': 'application/json' },
      body: '{"args":["gog"]}'
    })
  })

  test('an error answer becomes an exception with rakun’s reason', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(json({ error: 'Unknown store' }, 500))
    const post = poster('tok', fetchFn)
    await expect(post('logout', ['x'])).rejects.toThrow('Unknown store')
  })
})

describe('createBridge', () => {
  const link = {
    connection: 'online',
    onEvent: jest.fn(),
    onConnection: jest.fn()
  } as unknown as WebLink
  const make = (post = jest.fn().mockResolvedValue(null)) => ({
    post,
    bridge: createBridge(link, post)
  })

  test('call goes to the API with its arguments', async () => {
    const { bridge, post } = make(jest.fn().mockResolvedValue(['x']))
    expect(await bridge.call('getLibrary', 'all')).toEqual(['x'])
    expect(post).toHaveBeenCalledWith('getLibrary', ['all'])
  })

  test('setSetting posts the key and value and answers the reason of a refusal', async () => {
    const { bridge, post } = make()
    expect(await bridge.setSetting('language', 'fr')).toEqual({ ok: true })
    expect(post).toHaveBeenCalledWith('setSetting', [
      { key: 'language', value: 'fr' }
    ])

    const refused = make(jest.fn().mockRejectedValue(new Error('not a folder')))
    expect(await refused.bridge.setSetting('protonPath', '/x')).toEqual({
      ok: false,
      error: 'not a folder'
    })
  })

  test('the pasted login asks for the info and submits what was pasted', async () => {
    const info = { runner: 'gog', url: 'https://login', instructions: 'Log in' }
    const post = jest
      .fn()
      .mockResolvedValueOnce(info)
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: 'No login code' })
    const { bridge } = make(post)

    expect(await bridge.login?.info('gog')).toEqual(info)
    expect(post).toHaveBeenLastCalledWith('getLoginInfo', ['gog'])
    expect(await bridge.login?.submit('gog', 'https://end?code=1')).toEqual({
      ok: true
    })
    expect(post).toHaveBeenLastCalledWith('submitLogin', [
      'gog',
      'https://end?code=1'
    ])
    expect(await bridge.login?.submit('gog', '')).toEqual({
      ok: false,
      error: 'No login code'
    })
  })
})
