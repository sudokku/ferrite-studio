export interface EpochStats {
  epoch: number
  total_epochs: number
  train_loss: number
  val_loss: number
  train_accuracy: number
  val_accuracy: number
  elapsed_ms: number
}

export interface TrainResponse {
  status: 'idle' | 'running' | 'done' | 'failed'
  total_epochs: number | null
  model_path: string | null
  elapsed_total_ms: number | null
  was_stopped: boolean | null
  fail_reason: string | null
  epoch_history: EpochStats[]
  spec_name: string | null
  tab_unlock: number
}

export async function getTrainStatus(): Promise<TrainResponse> {
  const res = await fetch('/api/train')
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<TrainResponse>
}

export async function startTraining(): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch('/api/train/start', { method: 'POST' })
  return res.json() as Promise<{ ok?: boolean; error?: string }>
}

export async function stopTraining(): Promise<{ ok: boolean }> {
  const res = await fetch('/api/train/stop', { method: 'POST' })
  return res.json() as Promise<{ ok: boolean }>
}
