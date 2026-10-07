import { existsSync, readFileSync, statSync } from 'fs'
import { extname, join, resolve, sep } from 'path'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
}

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'"

export type WebFile = { type: string; body: Buffer | string }

/** A release keeps the web next to the bundle (relicd/web); `RELICD_WEB_DIR` points elsewhere */
export function defaultWebDir(): string {
  return process.env.RELICD_WEB_DIR || join(__dirname, 'web')
}

export const webHeaders = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store'
}

/** The page learns the token from its own server: no other web can read it (CORS) */
export function withToken(html: string, token: string): string {
  const meta = `<meta name="relicd-token" content="${token}">`
  return /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (head) => `${head}${meta}`)
    : `${meta}${html}`
}

/** The file of the web a request path names, only if it is inside the web folder */
function fileFor(webDir: string, urlPath: string): string | undefined {
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return undefined
  }
  if (decoded.includes('\0')) return undefined
  const root = resolve(webDir)
  const file = resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`)
  if (!file.startsWith(root + sep)) return undefined
  return existsSync(file) && statSync(file).isFile() ? file : undefined
}

/** What to answer to `GET <urlPath>` from the web, or `undefined` when it is not there */
export function webFile(
  webDir: string,
  urlPath: string,
  token: string
): WebFile | undefined {
  const file = fileFor(webDir, urlPath)
  if (!file) return undefined
  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
  const content = readFileSync(file)
  return file.endsWith('.html')
    ? { type, body: withToken(content.toString('utf-8'), token) }
    : { type, body: content }
}
