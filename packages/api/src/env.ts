const DEFAULT_API_PORT = 3001;

export function getApiPort(): number {
  const port = Number(process.env.API_PORT ?? DEFAULT_API_PORT);

  if (!Number.isInteger(port) || port <= 0) {
    return DEFAULT_API_PORT;
  }

  return port;
}
