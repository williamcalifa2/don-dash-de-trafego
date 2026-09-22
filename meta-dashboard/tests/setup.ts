// Rede real proibida nos testes: qualquer fetch global não simulado falha.
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL) => {
  throw new Error(`Teste tentou usar a rede real: ${String(input)}`)
}) as typeof fetch
void realFetch
