import { safeEqual } from '../safe_equal'

describe('safeEqual', () => {
  test('the same text is equal', () => {
    expect(safeEqual('a-token', 'a-token')).toBe(true)
  })

  test('another text, or one of another length, is not', () => {
    expect(safeEqual('a-token', 'b-token')).toBe(false)
    expect(safeEqual('a-token', 'a-token-longer')).toBe(false)
    expect(safeEqual('', 'a')).toBe(false)
  })
})
