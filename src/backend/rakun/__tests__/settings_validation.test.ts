import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { AppSettings } from 'common/types'
import { validateSetting, validateSettings } from '../settings_validation'

const current = {
  autoUpdateGames: true,
  defaultInstallPath: '/games',
  language: 'en',
  maxWorkers: 0,
  protonPath: '',
  altGogdlBin: ''
} as AppSettings

const check = (key: string, value: unknown) =>
  validateSetting(key, value, current)

describe('validateSetting', () => {
  test('refuses unknown keys and values of another type', () => {
    expect(() => check('nope', 1)).toThrow('desconocido')
    expect(() => check('autoUpdateGames', 'yes')).toThrow('boolean')
    expect(() => check('maxWorkers', '2')).toThrow('number')
  })

  test('language has to be one of the supported ones', () => {
    expect(() => check('language', 'es')).not.toThrow()
    expect(() => check('language', 'xx')).toThrow('no soportado')
  })

  test('maxWorkers is an integer from 0 up to the CPUs', () => {
    expect(() => check('maxWorkers', 1)).not.toThrow()
    expect(() => check('maxWorkers', 1.5)).toThrow('entero')
    expect(() => check('maxWorkers', -1)).toThrow('entero')
    expect(() => check('maxWorkers', 99999)).toThrow('entero')
  })

  test('the install path has to be absolute', () => {
    expect(() => check('defaultInstallPath', '/mnt/sd')).not.toThrow()
    expect(() => check('defaultInstallPath', 'sd/games')).toThrow('absoluta')
  })

  test('protonPath is empty or a folder with the proton script', () => {
    const proton = mkdtempSync(join(tmpdir(), 'rakun-proton-'))
    expect(() => check('protonPath', '')).not.toThrow()
    expect(() => check('protonPath', proton)).toThrow('Proton')
    writeFileSync(join(proton, 'proton'), '')
    expect(() => check('protonPath', proton)).not.toThrow()
    expect(() => check('protonPath', '/tmp/nada-aqui')).toThrow('Proton')
  })

  test('binary paths are empty or exist', () => {
    expect(() => check('altGogdlBin', '')).not.toThrow()
    expect(() => check('altGogdlBin', '/tmp/nada-aqui')).toThrow('no existe')
  })

  test('validateSettings checks every key', () => {
    expect(() =>
      validateSettings({ language: 'es', maxWorkers: -3 }, current)
    ).toThrow('entero')
  })
})
