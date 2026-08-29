import dotenv from 'dotenv'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const serverRoot = fileURLToPath(new URL('..', import.meta.url))
export const envFilePath = join(serverRoot, '.env')

if (!existsSync(envFilePath)) {
  console.warn(
    'server/.env not found. Copy server/.env.example to server/.env and configure your environment variables.',
  )
}

dotenv.config({ path: envFilePath })
