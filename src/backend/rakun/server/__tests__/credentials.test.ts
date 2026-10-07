import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { DEFAULT_PORT, loadOrCreateCredentials } from '../credentials'

describe('loadOrCreateCredentials', () => {
  const newPath = () =>
    join(mkdtempSync(join(tmpdir(), 'rakun-api-')), 'api.json')

  test('creates a private file with a random token and the default port', () => {
    const path = newPath()

    const credentials = loadOrCreateCredentials(path, {})

    expect(credentials.port).toBe(DEFAULT_PORT)
    expect(credentials.token).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual(credentials)
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })

  test('keeps the token across restarts', () => {
    const path = newPath()
    const first = loadOrCreateCredentials(path, {})
    expect(loadOrCreateCredentials(path, {})).toEqual(first)
  })

  test('RAKUN_PORT overrides the stored port and is saved', () => {
    const path = newPath()
    const first = loadOrCreateCredentials(path, {})

    const second = loadOrCreateCredentials(path, { RAKUN_PORT: '18000' })

    expect(second).toEqual({ port: 18000, token: first.token })
    expect(JSON.parse(readFileSync(path, 'utf-8')).port).toBe(18000)
  })

  test('replaces a corrupted file', () => {
    const path = newPath()
    writeFileSync(path, 'not json')
    expect(loadOrCreateCredentials(path, {}).token).toMatch(/^[0-9a-f]{64}$/)
  })
})
