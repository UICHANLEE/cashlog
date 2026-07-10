import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const baseUrl = (
  process.env.PRODUCT_ANALYZER_URL ||
  process.env.PRODUCT_ANALYZER_PROXY_TARGET ||
  process.env.CATAI_DEV_PROXY_TARGET ||
  'http://127.0.0.1:8010'
).replace(/\/$/, '')

const analyzeUrl = baseUrl.endsWith('/analyze-image') ? baseUrl : `${baseUrl}/analyze-image`
const healthUrl = process.env.PRODUCT_ANALYZER_HEALTH_URL || new URL('/health', analyzeUrl).toString()
const samplePath = process.argv[2] || process.env.PRODUCT_ANALYZER_SAMPLE_IMAGE

async function readJson(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

const healthResponse = await fetch(healthUrl)
const health = await readJson(healthResponse)

if (!healthResponse.ok) {
  console.error(JSON.stringify({ step: 'health', status: healthResponse.status, body: health }, null, 2))
  process.exit(1)
}

const result = {
  health,
  analyze: null,
}

if (samplePath) {
  const image = await readFile(samplePath)
  const form = new FormData()
  form.append('image', new Blob([image], { type: 'image/jpeg' }), basename(samplePath))

  const analyzeResponse = await fetch(analyzeUrl, {
    method: 'POST',
    body: form,
  })
  const analyze = await readJson(analyzeResponse)

  if (!analyzeResponse.ok || analyze.success !== true) {
    console.error(JSON.stringify({ step: 'analyze', status: analyzeResponse.status, body: analyze }, null, 2))
    process.exit(1)
  }

  result.analyze = {
    recommended_category: analyze.recommended_category,
    confidence: analyze.confidence,
    engine: analyze.engine,
    model: analyze.model,
    item_count: Array.isArray(analyze.items) ? analyze.items.length : 0,
  }
}

console.log(JSON.stringify(result, null, 2))
