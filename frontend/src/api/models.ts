export interface ModelSummary {
  name: string
  input_type: { type: string; width?: number; height?: number } | null
  output_labels: string[] | null
}

export async function listModels(): Promise<ModelSummary[]> {
  const res = await fetch('/api/models')
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<ModelSummary[]>
}

export function getModelDownloadUrl(name: string): string {
  return `/api/models/${encodeURIComponent(name)}/download`
}
