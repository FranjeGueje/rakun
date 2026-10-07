import type { StoreInfo } from 'common/relic/stores'
import type { Api } from './client'
import { CliError } from './client'

export type Ctx = {
  api: Api
  /** The stores relicd supports, asked once and only when needed */
  stores: () => Promise<StoreInfo[]>
  json: boolean
  log: (line: string) => void
  ask: (question: string) => Promise<string>
}

export type Options = {
  path?: string
  lang?: string
  wait: boolean
  installed: boolean
}

export type Command = (ctx: Ctx, args: string[], opts: Options) => Promise<void>

/** Prints the value as JSON with --json, otherwise the text made from it */
export function show<T>(ctx: Ctx, value: T, text: (value: T) => string): void {
  ctx.log(ctx.json ? JSON.stringify(value, null, 2) : text(value))
}

export function requireArg(
  args: string[],
  index: number,
  name: string
): string {
  const value = args[index]
  if (!value) throw new CliError(`Falta el argumento <${name}>`)
  return value
}
