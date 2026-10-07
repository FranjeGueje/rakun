import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { detectGeProton, resolveProtonPath } from '../proton'

const base = mkdtempSync(join(tmpdir(), 'compat-'))
afterAll(() => rmSync(base, { recursive: true, force: true }))

describe('detectGeProton', () => {
  test('finds the first folder named like Proton', () => {
    mkdirSync(join(base, 'luxtorpeda'))
    mkdirSync(join(base, 'GE-Proton10-4'))
    writeFileSync(join(base, 'notes.log'), '')
    expect(detectGeProton(base)).toBe(join(base, 'GE-Proton10-4'))
  })

  test('says nothing when there is none, or the folder is not there', () => {
    const empty = mkdtempSync(join(tmpdir(), 'compat-empty-'))
    expect(detectGeProton(empty)).toBe('')
    expect(detectGeProton(join(base, 'missing'))).toBe('')
    rmSync(empty, { recursive: true, force: true })
  })
})

describe('resolveProtonPath', () => {
  test('the saved folder wins', () => {
    expect(resolveProtonPath('/my/proton', base)).toBe('/my/proton')
  })

  test('empty means automatic: it looks for one now, so a GE-Proton installed later is found', () => {
    const later = mkdtempSync(join(tmpdir(), 'compat-later-'))
    expect(resolveProtonPath('', later)).toBe('')
    mkdirSync(join(later, 'GE-Proton'))
    expect(resolveProtonPath('', later)).toBe(join(later, 'GE-Proton'))
    rmSync(later, { recursive: true, force: true })
  })
})
