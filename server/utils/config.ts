import { promises as fs } from 'fs'
import { join } from 'path'

export type AppConfig = {
  admin?: {
    username: string
    passwordHash: string
  }
  palworld?: {
    host: string
    port: number
    password: string
  }
}

const configPath = join(process.cwd(), 'server', 'data', 'config.json')

async function ensureFile() {
  try {
    await fs.mkdir(join(process.cwd(), 'server', 'data'), { recursive: true })
  } catch {
    // ignore
  }
}

export async function readConfig(): Promise<AppConfig> {
  await ensureFile()
  try {
    const raw = await fs.readFile(configPath, 'utf-8')
    return JSON.parse(raw) as AppConfig
  } catch {
    return {}
  }
}

export async function writeConfig(config: AppConfig) {
  await ensureFile()
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

