import { libraryManagerMap } from '../../storeManagers'

async function getLegendaryVersion(): Promise<string> {
  const { stdout, error, abort } = await libraryManagerMap[
    'legendary'
  ].runRunnerCommand(
    {
      subcommand: undefined,
      '--version': true
    },
    {
      abortId: 'legendary-version'
    }
  )

  if (error ?? abort) return 'invalid'

  const matches = stdout.match(/([\d.]+)/)
  const version = matches?.[1]
  if (!version) return 'invalid'
  return `v${version}`
}

async function getGogdlVersion(): Promise<string> {
  const { stdout, error } = await libraryManagerMap['gog'].runRunnerCommand(
    ['--version'],
    {
      abortId: 'gogdl-version'
    }
  )

  if (error) return 'invalid'

  const trimmed = stdout.trim()
  if (!trimmed) return 'invalid'
  return trimmed
}

async function getNileVersion(): Promise<string> {
  const { stdout, error } = await libraryManagerMap['nile'].runRunnerCommand(
    ['--version'],
    {
      abortId: 'nile-version'
    }
  )

  if (error) return 'invalid'

  const trimmed = stdout.trim()
  if (!trimmed) return 'invalid'
  return trimmed
}

export { getLegendaryVersion, getGogdlVersion, getNileVersion }
