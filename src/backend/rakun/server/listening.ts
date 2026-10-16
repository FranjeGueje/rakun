/** The port the API is listening on: a login that sends the browser back to rakun needs it */
let port: number | undefined

export const setApiPort = (value: number | undefined) => {
  port = value
}

export const getApiPort = () => port
