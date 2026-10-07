import path from 'path'

/**
 * Values that went through a check, told apart from a plain string or number by
 * the compiler: a `Path` cannot be passed where a `NonEmptyString` is expected.
 */
export type Brand<T, Name extends string> = T & { readonly __brand: Name }

export type Schema<T> = { parse: (value: unknown) => T }

/** `parse` gives the value back as `T`, or throws if `isValid` says no */
export function schema<T>(
  name: string,
  isValid: (value: unknown) => boolean
): Schema<T> {
  return {
    parse(value) {
      if (!isValid(value)) throw new Error(`Invalid ${name}: ${String(value)}`)
      return value as T
    }
  }
}

export const isPath = (value: unknown) =>
  typeof value === 'string' && path.parse(value).root !== ''

export type Path = Brand<string, 'Path'>
export const Path = schema<Path>('Path', isPath)
