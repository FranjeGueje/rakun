import { webLines } from '../web'
import { fakeCtx, opts } from './helpers'
import { status } from '../commands/accounts'

describe('webLines', () => {
  const lan = ['192.168.1.20']

  test('local says where the web is, and nothing else', () => {
    expect(webLines('local', 17370, lan)).toEqual([
      'Web: http://127.0.0.1:17370'
    ])
  })

  test('off says it is off', () => {
    expect(webLines('off', 17370, lan)).toEqual(['Web: disabled'])
  })

  test('network lists the addresses and warns that it has no protection', () => {
    const lines = webLines('network', 17370, lan)
    expect(lines[0]).toContain('http://192.168.1.20:17370')
    expect(lines[0]).toContain('http://127.0.0.1:17370')
    expect(lines[1]).toMatch(/WITHOUT protection/)
    expect(lines[1]).toMatch(/home use only/)
  })

  test('a rakun that does not say (an older one) adds no line', () => {
    expect(webLines(undefined, 17370, lan)).toEqual([])
  })
})

describe('status', () => {
  test('warns when the web is open to the network', async () => {
    const { ctx, lines } = fakeCtx(
      {
        getAccounts: {
          legendary: { loggedIn: false },
          gog: { loggedIn: false },
          nile: { loggedIn: false },
          zoom: { loggedIn: false }
        },
        getDMQueueInformation: { elements: [] }
      },
      [],
      false,
      'network'
    )
    await status(ctx, [], opts)
    expect(lines.join('\n')).toMatch(/WITHOUT protection/)
  })
})
