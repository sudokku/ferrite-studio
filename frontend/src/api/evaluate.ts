import type { EpochStats } from './train'

export interface EvaluateResponse {
  epoch_history: EpochStats[]
  best_train_loss: number | null
  best_val_loss: number | null
  best_train_accuracy: number | null
  best_val_accuracy: number | null
  confusion_matrix: number[][] | null
  class_labels: string[] | null
  tab_unlock: number
}

export async function getEvaluate(): Promise<EvaluateResponse> {
  const res = await fetch('/api/evaluate')
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<EvaluateResponse>
}

export function getEvaluateExportUrl(): string {
  return '/api/evaluate/export'
}
