import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { dirSync } from '../../../__tests__/tmp_dir'
import thirdParty from '../thirdParty'

const dir = dirSync()
const file = join(dir.name, 'third-party-installed.json')

jest.mock('backend/logger', () => ({
  LogPrefix: { Legendary: 'Legendary' },
  logWarning: jest.fn(),
  logError: jest.fn()
}))
jest.mock('../constants', () => ({
  get thirdPartyInstalled() {
    return file
  }
}))

const read = () => JSON.parse(readFileSync(file, 'utf-8')) as string[][]

beforeEach(() => writeFileSync(file, '[]'))
afterAll(() => dir.removeCallback())

describe('third-party installed games', () => {
  test('installing the same game twice leaves one entry', async () => {
    await thirdParty.addInstalledGame('ea1', 'Windows')
    await thirdParty.addInstalledGame('ea1', 'Windows')
    await thirdParty.addInstalledGame('ea2', 'Windows')

    expect(read()).toEqual([
      ['ea1', 'Windows'],
      ['ea2', 'Windows']
    ])
  })

  test('removing a game removes every copy a previous version left', async () => {
    writeFileSync(
      file,
      JSON.stringify([
        ['ea1', 'Windows'],
        ['ea2', 'Windows'],
        ['ea1', 'Windows']
      ])
    )

    await thirdParty.removeInstalledGame('ea1')

    expect(read()).toEqual([['ea2', 'Windows']])
  })

  test('removing a game that is not there does not remove another one', async () => {
    writeFileSync(file, JSON.stringify([['ea1', 'Windows']]))

    await thirdParty.removeInstalledGame('nope')

    expect(read()).toEqual([['ea1', 'Windows']])
  })
})
