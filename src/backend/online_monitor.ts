import { ConnectivityStatus } from 'common/types'
import { logInfo, LogPrefix } from './logger'
import axios from 'axios'
import EventEmitter from 'node:events'

let status: ConnectivityStatus
let abortController: AbortController
let retryTimer: NodeJS.Timeout
const defaultTimeBetweenRetries = 5
let timeBetweenRetries = defaultTimeBetweenRetries
const connectivityEmitter = new EventEmitter()

// handle setting the status, dispatch events for backend and frontend, and trigger pings
const setStatus = (newStatus: ConnectivityStatus) => {
  logInfo(`Connectivity: ${newStatus}`, LogPrefix.Connection)

  status = newStatus

  // start pinging if needed or cancel pings
  switch (status) {
    case 'check-online':
      pingSites()
      break
    default:
      timeBetweenRetries = defaultTimeBetweenRetries
      if (abortController) {
        abortController.abort()
      }
      if (retryTimer) {
        clearTimeout(retryTimer)
      }
  }

  connectivityEmitter.emit(status)
}

const retry = (seconds: number) => {
  if (retryTimer) {
    clearTimeout(retryTimer)
  }
  retryTimer = setTimeout(pingSites, seconds * 1000)
}

const ping = async (url: string, signal: AbortSignal) => {
  return axios.head(url, {
    timeout: 10000,
    signal,
    headers: { 'Cache-Control': 'no-cache' }
  })
}

const pingSites = () => {
  logInfo(`Pinging external endpoints`, LogPrefix.Connection)
  abortController = new AbortController()

  const ping1 = ping('https://github.com', abortController.signal)
  const ping2 = ping('https://store.epicgames.com', abortController.signal)
  const ping3 = ping('https://gog.com', abortController.signal)
  const ping4 = ping('https://cloudflare-dns.com/', abortController.signal)

  Promise.any([ping1, ping2, ping3, ping4])
    .then(() => {
      setStatus('online')
      abortController.abort() // abort the rest
      timeBetweenRetries = defaultTimeBetweenRetries
    })
    .catch((error) => {
      logInfo('All ping requests failed:', LogPrefix.Connection)
      logInfo(error, LogPrefix.Connection)
      retry(timeBetweenRetries)
      timeBetweenRetries = timeBetweenRetries + defaultTimeBetweenRetries
    })
}

export const initOnlineMonitor = () => {
  // set initial status and ping external sites
  setStatus('check-online')
}

export const onConnectivityChange = (
  callback: (status: ConnectivityStatus) => unknown
) => {
  connectivityEmitter.on('online', () => callback('online'))
  connectivityEmitter.on('offline', () => callback('offline'))
  connectivityEmitter.on('check-online', () => callback('check-online'))
}

export const runOnceWhenOnline = (callback: () => unknown) => {
  if (isOnline()) {
    callback()
  } else {
    connectivityEmitter.once('online', () => callback())
  }
}

export const isOnline = () => status === 'online'
