/**
 * Runs the Netlify Functions on a plain Node server (port 8787) for local work without the Netlify
 * CLI, e.g. offline or in CI. Vite proxies /api to it (see vite.config.ts). Usage:
 *   npx tsx --env-file=.env scripts/local-api.ts
 */
import { createServer } from 'node:http'
import generate from '../netlify/functions/generate.mts'
import plan from '../netlify/functions/plan.mts'

const routes: Record<string, (req: Request) => Promise<Response>> = { '/api/plan': plan, '/api/generate': generate }

createServer(async (req, res) => {
  const fn = routes[req.url?.split('?')[0] ?? '']
  if (!fn) {
    res.writeHead(404).end()
    return
  }
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const request = new Request(`http://localhost${req.url}`, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
  })
  const response = await fn(request)
  res.writeHead(response.status, Object.fromEntries(response.headers))
  res.end(Buffer.from(await response.arrayBuffer()))
}).listen(8787, '127.0.0.1', () => console.log('Local API on http://127.0.0.1:8787'))
