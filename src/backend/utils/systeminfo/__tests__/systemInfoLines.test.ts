import type { SystemInformation } from '../index'
import { systemInfoLines } from '../index'

jest.mock('../gpu', () => ({ getGpuInfo: jest.fn() }))
jest.mock('../memory', () => ({ getMemoryInfo: jest.fn() }))
jest.mock('../osInfo', () => ({ getOsInfo: jest.fn() }))
jest.mock('../steamDeck', () => ({ getSteamDeckInfo: jest.fn() }))
jest.mock('../rakunVersion', () => ({ getRakunVersion: jest.fn() }))
jest.mock('../../helperBinaries', () => ({
  getGogdlVersion: jest.fn(),
  getLegendaryVersion: jest.fn(),
  getNileVersion: jest.fn()
}))

const info = (deck: SystemInformation['steamDeckInfo']): SystemInformation => ({
  CPU: { model: 'Some CPU', cores: 8 },
  memory: {
    used: 1024,
    total: 2048,
    usedFormatted: '1 KB',
    totalFormatted: '2 KB'
  },
  GPUs: [
    {
      deviceId: '1',
      vendorId: '2',
      vendorString: 'ACME',
      deviceString: 'Card',
      driverVersion: 'amdgpu'
    }
  ],
  OS: { platform: 'linux', name: 'Linux', version: '7.0' },
  steamDeckInfo: deck,
  softwareInUse: {
    rakunVersion: '0.1.0',
    legendaryVersion: 'v0.21.1',
    gogdlVersion: '1.3.0',
    nileVersion: '1.2.0'
  }
})

describe('systemInfoLines', () => {
  test('gives the software versions one line each', () => {
    const lines = systemInfoLines(info({ isDeck: false }))
    expect(lines.slice(lines.indexOf('Software Versions:'))).toEqual([
      'Software Versions:',
      '  Rakun: 0.1.0',
      '  Legendary: v0.21.1',
      '  gogdl: 1.3.0',
      '  Nile: 1.2.0'
    ])
  })

  test('has no line with a newline in it, so every one gets the log prefix', () => {
    const lines = systemInfoLines(
      info({ isDeck: true, model: 'OLED', mode: 'desktop' })
    )
    expect(lines.some((line) => line.includes('\n'))).toBe(false)
  })

  test('says nothing about what the system is not', () => {
    const text = systemInfoLines(info({ isDeck: false })).join('\n')
    expect(text).not.toMatch(/Steam Deck|AppImage/)
  })

  test('says it when the system is a Steam Deck', () => {
    expect(
      systemInfoLines(info({ isDeck: true, model: 'OLED', mode: 'game' }))
    ).toContain('The current system is a Steam Deck (model: OLED) in game mode')
  })
})
