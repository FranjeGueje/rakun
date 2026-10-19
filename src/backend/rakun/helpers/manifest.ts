/**
 * The helper binaries rakun runs: which versions it was tested with, where each
 * comes from and what files it leaves behind. Only data and pure functions:
 * where the files go is a `Layout`, so that the daemon and the script that makes
 * the tarball (meta/downloadHelperBinaries.ts) share all of it.
 */

export type HelperName =
  | 'legendary'
  | 'gogdl'
  | 'nile'
  | 'comet'
  | 'epic-integration'
  | 'umu'
  | 'butler'

export type Arch = 'x64' | 'arm64'

/** `bin`: the tools of this machine; `win`: what runs inside the prefixes (`C:\Launchers\bin`) */
export type Root = 'bin' | 'win'

/** Where each root is: in the product they are two folders apart, in the source tree one tree */
export type Layout = { binRoot: string; winRoot: string }

export const HELPERS: HelperName[] = [
  'legendary',
  'gogdl',
  'nile',
  'comet',
  'epic-integration',
  'umu',
  'butler'
]

/** The versions rakun was tested with. A new one is a change of rakun */
export const RELEASE_TAGS: Record<HelperName, string> = {
  legendary: '0.21.1',
  gogdl: 'v1.3.0',
  nile: 'v1.2.0',
  comet: 'v0.3.2',
  'epic-integration': 'v0.4',
  // NOTE: umu-launcher tags have no `v` prefix
  umu: '1.4.4',
  // itch's butler comes from their own server, not GitHub
  butler: '15.32.0'
}

/** GitHub repos the helpers come from. butler is not on GitHub */
export const REPOS: Partial<Record<HelperName, string>> = {
  legendary: 'legendary-gl/legendary',
  gogdl: 'Heroic-Games-Launcher/heroic-gogdl',
  nile: 'imLinguin/nile',
  comet: 'imLinguin/comet',
  'epic-integration': 'BananaWorks07/heroic-epic-integration',
  umu: 'Open-Wine-Components/umu-launcher'
}

/**
 * `file`: saved as `target`. `zip`: unpacked into the win root. `tar`: unpacked
 * into the bin root (its own `umu/` folder comes inside).
 */
export type Asset = {
  helper: HelperName
  /** The name of the file in the release of `tag` */
  asset: (tag: string) => string
  kind: 'file' | 'zip' | 'tar'
  root: Root
  /** Relative to the root: where the file goes (`file`) or the folder the archive is unpacked into (`zip`) */
  target?: string
  /** Only the binaries of this architecture (Windows ones: always x64) */
  arch?: Arch
  /** Of the asset of the tag in RELEASE_TAGS: nothing else can be checked */
  sha256?: string
}

const fixed = (name: string) => () => name

export const ASSETS: Asset[] = [
  {
    helper: 'legendary',
    asset: fixed('legendary_linux_x64'),
    kind: 'file',
    root: 'bin',
    arch: 'x64',
    target: 'x64/linux/legendary',
    sha256: 'dbed33bbe96031e65858233e4badf0a1d401bb6cb0cc995d1237cf3a0c826a45'
  },
  {
    helper: 'legendary',
    asset: fixed('legendary_linux_arm64'),
    kind: 'file',
    root: 'bin',
    arch: 'arm64',
    target: 'arm64/linux/legendary',
    sha256: 'e901cb52ada10d5cef6ffb2a0985099958124457bfb455a571023d1e042143d9'
  },
  {
    helper: 'legendary',
    asset: fixed('legendary_windows_x64.exe'),
    kind: 'file',
    root: 'win',
    target: 'legendary.exe',
    sha256: '6be77857dc0a6dd33ea7442ce8b5291944ec6da53757f81ca95b57ce794baf5b'
  },
  {
    helper: 'gogdl',
    asset: fixed('gogdl_linux_x86_64'),
    kind: 'file',
    root: 'bin',
    arch: 'x64',
    target: 'x64/linux/gogdl',
    sha256: 'cba013d42767c808237c437335ab1d56f58405d07e8f37b3324d264ea5c49655'
  },
  {
    helper: 'gogdl',
    asset: fixed('gogdl_linux_arm64'),
    kind: 'file',
    root: 'bin',
    arch: 'arm64',
    target: 'arm64/linux/gogdl',
    sha256: 'c49e1519146523ec94f33e2d21eedcc9a167004d7da218621e6d5fb84a7a0f4c'
  },
  {
    helper: 'gogdl',
    asset: fixed('gogdl_windows_x86_64.exe'),
    kind: 'file',
    root: 'win',
    target: 'gogdl.exe',
    sha256: '69ea54467371803f681d6c39805992e3a4b8ddccb44ac8a1de7b1e3c80deaeec'
  },
  {
    helper: 'nile',
    asset: fixed('nile_linux_x86_64'),
    kind: 'file',
    root: 'bin',
    arch: 'x64',
    target: 'x64/linux/nile',
    sha256: 'd73519514df9d52c50c6feec629373cc3a0d9504e087b6c7372a8ca8a95e7bfe'
  },
  {
    helper: 'nile',
    asset: fixed('nile_linux_arm64'),
    kind: 'file',
    root: 'bin',
    arch: 'arm64',
    target: 'arm64/linux/nile',
    sha256: '197859c629c47e4e4d7ed1d2a290b7bef1e778f891ff8ca42ba65dbb020ba751'
  },
  {
    helper: 'nile',
    asset: fixed('nile_windows_x86_64.exe'),
    kind: 'file',
    root: 'win',
    target: 'nile.exe',
    sha256: '6531790c59f78cea4a8743bf0582d5afda7fb887f5c143391d7339ad0f42ab88'
  },
  {
    // Only the Windows build: it runs inside the game's prefix
    helper: 'comet',
    asset: fixed('comet-x86_64-pc-windows-msvc.exe'),
    kind: 'file',
    root: 'win',
    target: 'comet.exe',
    sha256: '181f9a3644eabbdf396037de135583e92cf4a08029be30c9ee4e2479ff11ae8c'
  },
  {
    // GalaxyCommunication.exe and update-permissions.exe (the zip has more files, unused)
    helper: 'comet',
    asset: fixed('dummy-service.zip'),
    kind: 'zip',
    root: 'win',
    sha256: '7fc5facd1fce4d516cd3ce527e7e4dbe0bfd17649cea805e8ea7c37d4ba58d9a'
  },
  {
    helper: 'epic-integration',
    asset: fixed('EpicGamesLauncher.exe'),
    kind: 'file',
    root: 'win',
    target: 'EpicGamesLauncher.exe',
    sha256: '1feb21e21e19cbb34e881791c8f2557769f59231e46850915d49a6d0c1ce4583'
  },
  {
    helper: 'umu',
    asset: (tag) => `umu-launcher-${tag}-zipapp.tar`,
    kind: 'tar',
    root: 'bin',
    sha256: 'eb590691841f7fad3fc3ad8fd5db4ccb87849fe7948e62b28ece7a4ee48cc851'
  },
  {
    // `asset` is the broth channel; the zip holds butler, 7z.so and libc7zip.so, which must stay together
    helper: 'butler',
    asset: fixed('linux-amd64'),
    kind: 'zip',
    root: 'bin',
    arch: 'x64',
    target: 'x64/linux/butler',
    sha256: '2335971394ef6596f95ded0833e85ee28755e13761716ef4c91d6b11f69162f5'
  },
  {
    helper: 'butler',
    asset: fixed('linux-arm64'),
    kind: 'zip',
    root: 'bin',
    arch: 'arm64',
    target: 'arm64/linux/butler',
    sha256: '4f2da37785fd9cbc15052427490e4e4f5cd735a019f21554d6273fa9a3490152'
  }
]

type Expected = { root: Root; file: string }

/** The files that tell a helper is there, for the tools of `arch` */
export function expectedFiles(helper: HelperName, arch: Arch): Expected[] {
  const bin = (file: string): Expected => ({ root: 'bin', file })
  const win = (file: string): Expected => ({ root: 'win', file })
  switch (helper) {
    case 'legendary':
      return [bin(`${arch}/linux/legendary`), win('legendary.exe')]
    case 'gogdl':
      return [bin(`${arch}/linux/gogdl`), win('gogdl.exe')]
    case 'nile':
      return [bin(`${arch}/linux/nile`), win('nile.exe')]
    case 'comet':
      return [
        win('comet.exe'),
        win('GalaxyCommunication.exe'),
        win('update-permissions.exe')
      ]
    case 'epic-integration':
      return [win('EpicGamesLauncher.exe')]
    case 'umu':
      return [bin('umu/umu-run')]
    case 'butler':
      // The program loads the two libraries from next to itself: without them it starts and then fails
      return ['butler', '7z.so', 'libc7zip.so'].map((file) =>
        bin(`${arch}/linux/butler/${file}`)
      )
  }
}

/** The assets of a helper that a machine with these architectures needs */
export function assetsOf(helper: HelperName, arches: Arch[]): Asset[] {
  return ASSETS.filter(
    (asset) =>
      asset.helper === helper && (!asset.arch || arches.includes(asset.arch))
  )
}

export function releaseUrl(
  helper: HelperName,
  tag: string,
  asset: Asset
): string {
  if (helper === 'butler')
    return `https://broth.itch.zone/butler/${asset.asset(tag)}/${tag}/archive/default`
  return `https://github.com/${REPOS[helper]}/releases/download/${tag}/${asset.asset(tag)}`
}
