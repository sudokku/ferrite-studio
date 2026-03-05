export interface ModelInfo {
  name: string
  input_type: { type: 'Numeric' | 'ImageGrayscale' | 'ImageRgb'; width?: number; height?: number } | null
  output_labels: string[] | null
  input_size: number
  output_size: number
}

export interface TestResponse {
  models: string[]
  selected: string | null
  model_info: ModelInfo | null
  tab_unlock: number
}

export async function getTestModels(model?: string): Promise<TestResponse> {
  const url = model ? `/api/test?model=${encodeURIComponent(model)}` : '/api/test'
  const res = await fetch(url)
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<TestResponse>
}

export interface ScoreEntry {
  label: string
  score: number
}

export interface InferResult {
  result_type: 'softmax' | 'sigmoid' | 'raw'
  prediction: string | null
  confidence: number | null
  all_scores: ScoreEntry[] | null
  raw_values: number[] | null
}

export async function runInference(form: FormData): Promise<InferResult> {
  const res = await fetch('/api/test/infer', { method: 'POST', body: form })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<InferResult>
}

export async function importModel(file: File): Promise<{ ok: boolean; name?: string; error?: string }> {
  const form = new FormData()
  form.append('model_file', file)
  const res = await fetch('/api/test/import-model', { method: 'POST', body: form })
  return res.json() as Promise<{ ok: boolean; name?: string; error?: string }>
}
