export interface PreviewRow {
  inputs: number[]
  labels: number[]
}

export interface DatasetResponse {
  loaded: boolean
  source_name: string | null
  feature_count: number | null
  label_count: number | null
  total_rows: number | null
  train_rows: number | null
  val_rows: number | null
  val_split_pct: number | null
  preview_rows: PreviewRow[] | null
  tab_unlock: number
  error: string | null
}

export async function getDataset(): Promise<DatasetResponse> {
  const res = await fetch('/api/dataset')
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<DatasetResponse>
}

export async function uploadCsv(file: File, valSplit = 10, labelCols = 1): Promise<DatasetResponse> {
  const form = new FormData()
  form.append('dataset', file)
  form.append('val_split', String(valSplit))
  form.append('label_cols', String(labelCols))
  const res = await fetch('/api/dataset/upload', { method: 'POST', body: form })
  return res.json() as Promise<DatasetResponse>
}

export async function uploadIdx(images: File, labels: File, valSplit = 10): Promise<DatasetResponse> {
  const form = new FormData()
  form.append('images_file', images)
  form.append('labels_file', labels)
  form.append('val_split', String(valSplit))
  const res = await fetch('/api/dataset/upload-idx', { method: 'POST', body: form })
  return res.json() as Promise<DatasetResponse>
}

export async function loadBuiltin(name: 'xor' | 'circles' | 'blobs', valSplit = 20): Promise<DatasetResponse> {
  const res = await fetch('/api/dataset/builtin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, val_split: valSplit }),
  })
  return res.json() as Promise<DatasetResponse>
}
