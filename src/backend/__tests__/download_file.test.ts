import { createServer, Server } from 'http'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { dirSync } from './tmp_dir'
import { downloadFile } from '../utils'

jest.mock('../logger')
jest.mock('../dialog/dialog')

let server: Server
let baseUrl: string
const dir = dirSync()

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/ok') return void res.end('contenido')
    res.destroy()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  baseUrl = `http://127.0.0.1:${typeof address === 'object' ? address?.port : 0}`
})

afterAll(() => {
  server.close()
  dir.removeCallback()
})

describe('downloadFile', () => {
  test('saves the file, replacing the one that was there', async () => {
    const dest = join(dir.name, 'ok.txt')
    writeFileSync(dest, 'viejo')

    await downloadFile({ url: `${baseUrl}/ok`, dest })

    expect(readFileSync(dest, 'utf-8')).toBe('contenido')
  })

  test('throws and leaves no partial file when the download fails', async () => {
    const dest = join(dir.name, 'fail.txt')

    await expect(
      downloadFile({ url: `${baseUrl}/fail`, dest })
    ).rejects.toThrow('Download failed')
    expect(existsSync(dest)).toBe(false)
  })
})
