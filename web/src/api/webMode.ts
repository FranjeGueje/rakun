/** rakun tells the page how the web was opened (a `<meta>` it adds to the page): `local`, `network` or `off` */
export function readWebMode(): string | null {
  return (
    document.querySelector('meta[name="rakun-web"]')?.getAttribute('content') ??
    null
  )
}

/**
 * Open to the network, rakun only answers some channels to its own machine
 * (settings, folders, downloading the helper binaries…): a button for one of
 * them would only end in an error.
 */
export const isNetworkWeb = (): boolean => readWebMode() === 'network'
