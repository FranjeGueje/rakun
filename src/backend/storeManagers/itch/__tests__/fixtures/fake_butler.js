// A stand-in for `butler daemon` for the tests: it says where it listens and answers a few
// JSON-RPC calls over TCP. FAKE_BUTLER chooses how it misbehaves:
//   (nothing)  works          silent    never says where it listens
//   garbage    sends a line that is not JSON before each answer
//   closes     closes the socket when asked for `Close.Me`
//   hang       never answers `Hang.Forever`
//   noisy      writes to stderr and exits before it is ready
const net = require('net')
const mode = process.env.FAKE_BUTLER || ''
const SECRET = 'fake-secret'

if (mode === 'noisy') {
  process.stderr.write('database is locked\n')
  process.exit(3)
}

const server = net.createServer((socket) => {
  let buffer = ''
  const reply = (id, result) =>
    socket.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
  socket.on('data', (chunk) => {
    buffer += chunk
    let at
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at)
      buffer = buffer.slice(at + 1)
      const { id, method, params } = JSON.parse(line)
      if (mode === 'garbage') socket.write('this is not json\n')
      if (method === 'Meta.Authenticate')
        return params.secret === SECRET
          ? reply(id, { ok: true })
          : socket.write(
              JSON.stringify({
                jsonrpc: '2.0',
                id,
                error: { code: 1, message: 'bad secret' }
              }) + '\n'
            )
      if (method === 'Hang.Forever') continue
      if (method === 'Close.Me') return socket.destroy()
      if (method === 'Notify.Me') {
        socket.write(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'Progress',
            params: { progress: 0.5 }
          }) + '\n'
        )
        reply(id, {})
        continue
      }
      if (method === 'Ask.Back')
        socket.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 900,
            method: 'PickManifestAction',
            params: {}
          }) + '\n'
        )
      reply(id, { echo: method, params })
    }
  })
})

server.listen(0, '127.0.0.1', () => {
  if (mode === 'silent') return
  const { port } = server.address()
  console.log(JSON.stringify({ type: 'log', message: 'starting' }))
  console.log(
    JSON.stringify({
      type: 'butlerd/listen-notification',
      secret: SECRET,
      tcp: { address: `127.0.0.1:${port}` }
    })
  )
})
process.on('SIGTERM', () => process.exit(0))
