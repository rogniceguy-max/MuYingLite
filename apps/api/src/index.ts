import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import fs from 'node:fs'
import path from 'node:path'
import { ROOT_DIR, UPLOADS_DIR } from './db.js'
import { registerErrorHandler, registerRoutes } from './routes.js'
import { startCollab, stopCollab } from './collab.js'

const HOST = process.env.HOST ?? '0.0.0.0'
const PORT = Number(process.env.PORT ?? 3001)
const COLLAB_PORT = Number(process.env.COLLAB_PORT ?? 1234)
const WEB_DIST = path.join(ROOT_DIR, 'apps', 'web', 'dist')

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
  bodyLimit: 4 * 1024 * 1024,
})

await app.register(cors, { origin: true })
await app.register(multipart, {
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024,
    files: 1,
  },
})

await app.register(fastifyStatic, {
  root: UPLOADS_DIR,
  prefix: '/media/',
  decorateReply: false,
})

registerErrorHandler(app)
await registerRoutes(app)

const hasWebBuild = fs.existsSync(path.join(WEB_DIST, 'index.html'))
if (hasWebBuild) {
  await app.register(fastifyStatic, {
    root: WEB_DIST,
    prefix: '/',
    decorateReply: true,
    wildcard: true,
  })
  app.setNotFoundHandler((request, reply) => {
    const url = request.raw.url ?? ''
    if (url.startsWith('/api') || url.startsWith('/media')) {
      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: '接口不存在',
          details: null,
        },
      })
    }
    return reply.sendFile('index.html')
  })
} else {
  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: {
        code: 'NOT_FOUND',
        message: '资源不存在',
        details: null,
      },
    })
  })
}

await startCollab(COLLAB_PORT)

await app.listen({ host: HOST, port: PORT })
app.log.info(`API:   http://${HOST}:${PORT}`)
app.log.info(`Collab: ws://${HOST}:${COLLAB_PORT}`)
app.log.info(
  hasWebBuild
    ? `Web:   http://${HOST}:${PORT}`
    : 'Web:   请运行 npm run dev -w @film/web（Vite）',
)

let shuttingDown = false
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  app.log.info(`[shutdown] ${signal}`)
  try {
    await app.close()
  } catch (error) {
    app.log.error(error)
  }
  try {
    await stopCollab()
  } catch (error) {
    app.log.error(error)
  }
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
