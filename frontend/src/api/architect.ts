export interface LayerSpec {
  neurons: number
  activation: string
}

export interface InputType {
  type: 'Numeric' | 'ImageGrayscale' | 'ImageRgb'
  width?: number
  height?: number
}

export interface ArchitectSpec {
  name: string
  description?: string
  input_size: number
  loss_type: string
  layers: LayerSpec[]
  metadata?: {
    input_type?: InputType
    output_labels?: string[]
    description?: string
  }
}

export interface Hyperparams {
  learning_rate: number
  batch_size: number
  epochs: number
}

export interface FlashMessage {
  kind: 'success' | 'error'
  text: string
}

export interface ArchitectResponse {
  spec: ArchitectSpec | null
  hyperparams: Hyperparams | null
  tab_unlock: number
  flash: FlashMessage | null
}

export async function getArchitect(): Promise<ArchitectResponse> {
  const res = await fetch('/api/architect')
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<ArchitectResponse>
}

export interface SaveArchitectBody {
  name: string
  description?: string
  input_size: number
  loss_type: string
  learning_rate: number
  batch_size: number
  epochs: number
  layers: LayerSpec[]
  input_type?: { kind: 'numeric' | 'grayscale' | 'rgb'; width?: number; height?: number }
}

export async function saveArchitect(body: SaveArchitectBody): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/architect/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<{ ok: boolean; error?: string }>
}
