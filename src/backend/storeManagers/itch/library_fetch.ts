import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { ItchGame } from 'common/types/itch'
import { ButlerdError, type Butlerd } from './butlerd'

/** itch.io refuses a call because the token has no permission for it (an OAuth login cannot read a collection) */
const lacksPermission = (error: unknown) =>
  error instanceof ButlerdError && /does not permit/.test(error.message)

type Page<T> = { items?: T[]; nextCursor?: string }

/** Every item of a list butler gives a page at a time; the first page is asked fresh, not from its cache */
async function allPages<T>(
  fetchPage: (cursor: string | undefined, fresh: boolean) => Promise<Page<T>>
): Promise<T[]> {
  const items: T[] = []
  let cursor: string | undefined
  let first = true
  do {
    const page = await fetchPage(cursor, first)
    items.push(...(page.items ?? []))
    cursor = page.nextCursor
    first = false
  } while (cursor)
  return items
}

/** The games the user owns or has claimed: the ones with a download key */
export async function fetchOwnedGames(
  butlerd: Butlerd,
  profileId: number
): Promise<ItchGame[]> {
  const keys = await allPages<{ game: ItchGame }>((cursor, fresh) =>
    butlerd.call('Fetch.ProfileOwnedKeys', { profileId, cursor, fresh })
  )
  return keys.map(({ game }) => game)
}

/**
 * The games in the user's collections. A game there is not owned, but a free
 * one installs all the same. A collection that fails is left out, not the rest.
 */
export async function fetchCollectionGames(
  butlerd: Butlerd,
  profileId: number
): Promise<ItchGame[]> {
  const collections = await allPages<{ id: number; title?: string }>(
    (cursor, fresh) =>
      butlerd.call('Fetch.ProfileCollections', { profileId, cursor, fresh })
  )
  const games: ItchGame[] = []
  for (const { id, title } of collections) {
    try {
      const entries = await allPages<{ game: ItchGame }>((cursor, fresh) =>
        butlerd.call('Fetch.Collection.Games', {
          profileId,
          collectionId: id,
          cursor,
          fresh
        })
      )
      games.push(...entries.map(({ game }) => game))
    } catch (error) {
      if (lacksPermission(error)) {
        // Every collection would say the same: only a full API key reads them
        logInfo(
          'The games of the collections are not read: this login cannot (log in with an API key to have them)',
          LogPrefix.Itch
        )
        break
      }
      logWarning(
        [`Could not read the collection "${title ?? id}":`, error],
        LogPrefix.Itch
      )
    }
  }
  return games
}
