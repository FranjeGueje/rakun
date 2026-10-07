/**
 * The lists of installed games that relicd keeps itself (GOG, Zoom). An entry is
 * identified by its `appName`: it must appear once, however many times the game
 * is installed over itself, and removing it must remove all of it.
 */
type Entry = { appName?: string }

/** The list with `entry` in the place of the one of that game, or at the end */
export function upsertInstalled<T extends Entry>(list: T[], entry: T): T[] {
  const index = list.findIndex((item) => item.appName === entry.appName)
  const others = list.filter((item) => item.appName !== entry.appName)
  if (index === -1) return [...others, entry]
  return [...others.slice(0, index), entry, ...others.slice(index)]
}

export function removeInstalled<T extends Entry>(
  list: T[],
  appName: string
): T[] {
  return list.filter((item) => item.appName !== appName)
}

/** One entry per game (the last one wins): heals files written before this */
export function uniqueInstalled<T extends Entry>(list: T[]): T[] {
  const last = new Map<string, T>()
  list.forEach((item) => item.appName && last.set(item.appName, item))
  return list.filter((item) => item.appName && last.get(item.appName) === item)
}

/** Whether the list had to be fixed (so it is worth writing back) */
export function hasDuplicates(list: Entry[]): boolean {
  return uniqueInstalled(list).length !== list.length
}
