import { PositiveInteger } from './base'

import InstallCommand from './install'
import ListCommand from './list'
import InfoCommand from './info'
import MoveCommand from './move'
import StatusCommand from './status'
import UninstallCommand from './uninstall'
import ImportCommand from './import'
import CleanupCommand from './cleanup'
import AuthCommand from './auth'
import EglSyncCommand from './egl_sync'

interface BaseLegendaryCommand {
  '-v'?: true
  '--debug'?: true
  '-y'?: true
  '--yes'?: true
  '-V'?: true
  '--version'?: true
  '-J'?: true
  '--pretty-json'?: true
  '-A'?: PositiveInteger
  '--api-timeout'?: PositiveInteger
}

export type LegendaryCommand = BaseLegendaryCommand &
  (
    | { subcommand: undefined }
    | InstallCommand
    | ListCommand
    | InfoCommand
    | MoveCommand
    | StatusCommand
    | UninstallCommand
    | ImportCommand
    | CleanupCommand
    | AuthCommand
    | EglSyncCommand
  )
