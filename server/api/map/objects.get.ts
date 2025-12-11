import { promises as fs } from 'fs'
import { join } from 'path'
import { createError } from 'h3'

const objectsPath = join(process.cwd(), 'server', 'data', 'map_objects.json')

export default defineEventHandler(async () => {
  try {
    const raw = await fs.readFile(objectsPath, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Unable to load map objects'
    })
  }
})