import { timingSafeEqual } from 'crypto'

/** Whether two secrets are the same, in a time that does not tell how much of them matched */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
