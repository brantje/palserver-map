import { promises as fs } from 'fs'
import { join } from 'path'
import { createError } from 'h3'

const objectsPath = join(process.cwd(), 'server', 'data', 'map_objects.json')

let cachedObjects: any[] | null = null
let cachedMtimeMs: number | null = null

export default defineEventHandler(async () => {
  try {
    // Simple cache to avoid re-reading/parsing a large JSON file on every request.
    const stat = await fs.stat(objectsPath)
    if (cachedObjects && cachedMtimeMs === stat.mtimeMs) {
      return cachedObjects
    }

    const raw = await fs.readFile(objectsPath, 'utf-8')
    const data = JSON.parse(raw)
    const all = Array.isArray(data) ? data : []
    const next = all.filter((item: any) => item.type !== 'pal')
    cachedObjects = next
    cachedMtimeMs = stat.mtimeMs
    return next
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Unable to load map objects'
    })
  }
})