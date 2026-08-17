import { readdir } from 'node:fs/promises'
import path from 'node:path'

const MAX_VERCEL_FUNCTIONS = 12
const API_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'])

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(absolute))
    else files.push(absolute)
  }
  return files
}

const root = process.cwd()
const apiRoot = path.join(root, 'api')
const functionFiles = (await walk(apiRoot))
  .filter((file) => API_EXTENSIONS.has(path.extname(file)))
  .filter((file) => !/\.(?:test|spec)\.[^.]+$/i.test(file) && !file.endsWith('.d.ts'))
  .map((file) => path.relative(root, file).split(path.sep).join('/'))
  .sort()

console.log(`[vercel-functions] ${functionFiles.length}/${MAX_VERCEL_FUNCTIONS}`)
for (const file of functionFiles) console.log(`- ${file}`)

if (functionFiles.length > MAX_VERCEL_FUNCTIONS) {
  console.error(
    `Vercel function limit exceeded: ${functionFiles.length} found, ` +
      `${MAX_VERCEL_FUNCTIONS} allowed. Consolidate routes before deploying.`,
  )
  process.exitCode = 1
}
