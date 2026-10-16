import { logError, LogPrefix } from 'backend/logger'
import {
  cancelItchLogin,
  completeItchLogin
} from '../../storeManagers/itch/login'
import { loginErrorMessage } from '../../storeManagers/itch/user'
import { clearSessionExpired } from '../../storeManagers/session_state'
import { startRefresh } from './refresh'

/** What the browser is told when it comes back from itch.io */
type CallbackReply = { status: number; title: string; message: string }

/**
 * The browser of the user came back from itch.io. No token is needed (a page
 * of another site cannot know the `state` that rakun made up for this login).
 */
export async function itchCallback(
  query: URLSearchParams
): Promise<CallbackReply> {
  const state = query.get('state') ?? undefined
  const code = query.get('code')
  if (query.get('error')) {
    cancelItchLogin(state)
    return {
      status: 400,
      title: 'Login cancelled',
      message: 'itch.io did not authorize rakun. You can close this tab.'
    }
  }
  if (!code)
    return {
      status: 400,
      title: 'Login failed',
      message: 'itch.io did not send a code. You can close this tab.'
    }
  try {
    await completeItchLogin(code, state)
  } catch (error) {
    logError(['itch.io callback failed:', error], LogPrefix.Itch)
    return {
      status: 400,
      title: 'Login failed',
      message: `${loginErrorMessage(error)}. You can close this tab.`
    }
  }
  clearSessionExpired('itch')
  startRefresh('itch')
  return {
    status: 200,
    title: 'Logged in to itch.io',
    message: 'rakun is logged in. You can close this tab.'
  }
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ] as string
  )

/** The page that answers the browser: static, with nothing of the address in it */
export function callbackPage({ title, message }: CallbackReply): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#1b1b1b;color:#eee}main{max-width:28rem;padding:1rem;text-align:center}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body></html>`
}

export const callbackHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY'
}
