import type { NileGameDownloadInfo, NileGameInfo } from 'common/types/nile'

/** `nile list-updates --json`: the ids of the games with an update */
export const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

/** `nile install --info --json`: the size of the download */
export const isDownloadInfo = (value: unknown): value is NileGameDownloadInfo =>
  typeof (value as NileGameDownloadInfo | null)?.download_size === 'number'

/** The parts of a game of nile's library.json that rakun reads without asking */
export const isNileGame = (value: unknown): value is NileGameInfo => {
  const product = (value as NileGameInfo | null)?.product
  return (
    typeof product?.id === 'string' &&
    typeof product.productDetail?.details === 'object' &&
    product.productDetail.details !== null
  )
}
