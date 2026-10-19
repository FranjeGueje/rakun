// What rakun counts on from legendary, gogdl and nile, checked against what the
// version it is pinned to really printed (src/.../helper_fixtures, captured with
// scripts/capture-helper-fixtures.sh in cases that need no login). When a helper
// is bumped in manifest.ts and nobody captured it again, this fails on purpose:
// the parsers were written for another output.
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { RELEASE_TAGS } from 'backend/rakun/helpers/manifest'
import { exitFailure } from '../helper_result'
import { parseHelperJson } from '../helper_output'
import { nileRefusedToken } from '../nile/refused_token'
import { isStringList } from '../nile/output'

jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

type Capture = {
  helper: string
  case: string
  args: string[]
  exit: number
  stdout: string
  stderr: string
}

const FIXTURES = join(__dirname, 'helper_fixtures')
const HELPERS = ['legendary', 'gogdl', 'nile'] as const

const fixtureDir = (helper: (typeof HELPERS)[number]) =>
  join(FIXTURES, `${helper}-${RELEASE_TAGS[helper]}`)

function capture(helper: (typeof HELPERS)[number], name: string): Capture {
  return JSON.parse(
    readFileSync(join(fixtureDir(helper), `${name}.json`), 'utf8')
  )
}

describe('the output of the pinned helpers is captured', () => {
  test.each(HELPERS)(
    '%s has fixtures for the version in manifest.ts',
    (helper) => {
      if (!existsSync(fixtureDir(helper)))
        throw new Error(
          `${helper} is pinned to ${RELEASE_TAGS[helper]} and has no fixtures: run scripts/capture-helper-fixtures.sh and read the diff`
        )
    }
  )

  test.each(HELPERS)(
    '%s: nothing of another version is left behind',
    (helper) => {
      const others = readdirSync(FIXTURES).filter(
        (dir) =>
          dir.startsWith(`${helper}-`) &&
          dir !== `${helper}-${RELEASE_TAGS[helper]}`
      )
      if (others.length)
        throw new Error(
          `delete the fixtures of the old version: ${others.join(', ')}`
        )
    }
  )
})

describe('what rakun reads from legendary', () => {
  test('--version prints the version it is pinned to', () => {
    expect(capture('legendary', 'version').stdout).toContain(
      `"${RELEASE_TAGS.legendary}"`
    )
  })

  test('with no session `install` fails with code 1 and says «No saved credentials» (the exit code and the words rakun uses)', () => {
    const run = capture('legendary', 'install-no-session')

    expect(run.exit).toBe(1)
    expect(`${run.stdout}${run.stderr}`).toContain('No saved credentials')
    expect(exitFailure({ ...run, code: run.exit })).toContain('code 1')
  })
})

describe('what rakun reads from gogdl', () => {
  test('--version prints the version it is pinned to', () => {
    expect(capture('gogdl', 'version').stdout.trim()).toBe(
      RELEASE_TAGS.gogdl.replace(/^v/, '')
    )
  })

  test('`auth` with no session prints «null» and ends with 0: that is how it says it has no credentials', () => {
    const run = capture('gogdl', 'auth-no-session')

    expect(run.exit).toBe(0)
    expect(run.stdout.trim()).toBe('null')
  })

  test('a download that cannot proceed ends with a code other than 0, which is what rakun reads', () => {
    const run = capture('gogdl', 'download-no-session')

    expect(run.exit).not.toBe(0)
    expect(exitFailure({ ...run, code: run.exit })).toBeDefined()
  })
})

describe('what rakun reads from nile', () => {
  test('--version prints the version it is pinned to', () => {
    expect(capture('nile', 'version').stdout).toContain(
      RELEASE_TAGS.nile.replace(/^v/, '')
    )
  })

  test('`list-updates --json` with nothing installed prints an empty list rakun accepts', () => {
    const run = capture('nile', 'list-updates-nothing-installed')

    expect(run.exit).toBe(0)
    expect(
      parseHelperJson('nile', 'list-updates --json', run.stdout, isStringList)
    ).toEqual([])
  })

  test('an install that cannot go on ends with a code other than 0', () => {
    const run = capture('nile', 'install-no-session')

    expect(run.exit).not.toBe(0)
    expect(exitFailure({ ...run, code: run.exit })).toBeDefined()
  })

  test('none of what nile printed in these cases is taken for a refused token', () => {
    for (const name of [
      'install-no-session',
      'list-updates-nothing-installed'
    ]) {
      const run = capture('nile', name)
      expect(nileRefusedToken(`${run.stdout}\n${run.stderr}`)).toBe(false)
    }
  })
})
