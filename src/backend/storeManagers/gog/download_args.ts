import type { GogInstallPlatform } from 'common/types/gog'

type DownloadArgs = {
  appName: string
  platform: GogInstallPlatform
  path: string
  supportPath: string
  installDlcs?: string[]
  /** A real language code: gogdl cannot parse anything else */
  language: string
  build?: string
  branch?: string
  maxWorkers: number
  branchPassword: string
}

/** The command line of `gogdl download` that installs a game */
export function downloadArgs(options: DownloadArgs): string[] {
  const { appName, platform, path, supportPath, installDlcs, language } =
    options
  const { build, branch, maxWorkers, branchPassword } = options

  return [
    'download',
    appName,
    '--platform',
    platform,
    '--path',
    path,
    '--support',
    supportPath,
    ...(installDlcs?.length
      ? ['--with-dlcs', '--dlcs', installDlcs.join(',')]
      : ['--skip-dlcs']),
    '--lang',
    language,
    ...(build ? ['--build', build] : []),
    ...(branch ? ['--branch', branch] : []),
    ...(maxWorkers ? ['--max-workers', `${maxWorkers}`] : []),
    ...(branchPassword ? ['--password', branchPassword] : [])
  ]
}
