import { wantsDlcs } from '../dlcs'

describe('wantsDlcs', () => {
  test('every DLC unless told otherwise', () => {
    expect(wantsDlcs(undefined)).toBe(true)
    expect(wantsDlcs()).toBe(true)
  })

  test('an empty list means none', () => {
    expect(wantsDlcs([])).toBe(false)
  })

  test('a list means some, so the DLCs come', () => {
    expect(wantsDlcs(['1'])).toBe(true)
  })
})
