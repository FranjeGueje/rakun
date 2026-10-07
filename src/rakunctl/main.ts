import { createInterface } from 'node:readline/promises'
import { runCli } from './cli'

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await rl.question(question)).trim()
  } finally {
    rl.close()
  }
}

runCli(process.argv.slice(2), { log: console.log, ask }).catch(
  (error: unknown) => {
    console.error(
      `rakunctl: ${error instanceof Error ? error.message : String(error)}`
    )
    process.exit(1)
  }
)
