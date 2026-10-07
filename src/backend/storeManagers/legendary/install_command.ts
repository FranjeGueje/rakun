import { Path } from 'backend/schemas'
import { wantsDlcs } from '../dlcs'
import type InstallCommand from './commands/install'

// `-y` belongs to the base command every subcommand shares
type InstallLegendaryCommand = InstallCommand & { '-y'?: true }
import {
  LegendaryAppName,
  LegendaryPlatform,
  NonEmptyString,
  PositiveInteger
} from './commands/base'

type InstallOptions = {
  appName: LegendaryAppName
  platform: string
  path: string
  installDlcs?: string[]
  sdlList?: string[]
  maxWorkers: number
}

/** The `legendary install` command that installs a game */
export function installCommand(
  options: InstallOptions
): InstallLegendaryCommand {
  const { appName, platform, path, installDlcs, sdlList, maxWorkers } = options

  const command: InstallLegendaryCommand = {
    subcommand: 'install',
    appName,
    '--platform': LegendaryPlatform.parse(platform),
    '--base-path': Path.parse(path),
    '-y': true
  }
  if (wantsDlcs(installDlcs)) command['--with-dlcs'] = true
  else command['--skip-dlcs'] = true
  if (maxWorkers) command['--max-workers'] = PositiveInteger.parse(maxWorkers)
  if (sdlList?.length) {
    command.sdlList = sdlList.map((tag) => NonEmptyString.parse(tag))
  } else command['--skip-sdl'] = true
  return command
}
