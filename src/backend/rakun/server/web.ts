import { existsSync, readFileSync, statSync } from 'fs'
import { extname, join, resolve, sep } from 'path'
import type { WebAccess } from 'common/rakun/web'

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

/** The web sits next to the bundle (rakun/web in a release, build/web in a checkout); `RAKUN_WEB_DIR` points elsewhere */
export function defaultWebDir(): string {
  return process.env.RAKUN_WEB_DIR || join(__dirname, 'web')
}

export const webHeaders = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store'
}

/**
 * The page learns the token and the web mode from its own server. The token is
 * the same for everyone who may load the page (nobody else can read it: CORS and `Host`).
 */
export function withMeta(html: string, token: string, mode: WebAccess): string {
  const meta =
    `<meta name="rakun-token" content="${token}">` +
    `<meta name="rakun-web" content="${mode}">`
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
  token: string,
  mode: WebAccess
): WebFile | undefined {
  const file = fileFor(webDir, urlPath)
  if (!file) return undefined
  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
  const content = readFileSync(file)
  return file.endsWith('.html')
    ? { type, body: withMeta(content.toString('utf-8'), token, mode) }
    : { type, body: content }
}
