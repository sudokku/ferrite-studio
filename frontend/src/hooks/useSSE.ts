import { useEffect, useRef, useState } from 'react'
import type { EpochStats } from '@/api/train'

export type SSEStatus = 'idle' | 'connecting' | 'streaming' | 'done' | 'failed'

export interface SSEState {
  status: SSEStatus
  epochs: EpochStats[]
  donePayload: {
    model_path: string
    elapsed_total_ms: number
    epochs_completed?: number
    epoch_reached?: number
  } | null
  failReason: string | null
}

export function useTrainSSE(enabled: boolean) {
  const [state, setState] = useState<SSEState>({
    status: 'idle',
    epochs: [],
    donePayload: null,
    failReason: null,
  })
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!enabled) return

    setState(s => ({ ...s, status: 'connecting' }))
    const es = new EventSource('/api/train/events')
    esRef.current = es

    es.addEventListener('epoch', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as EpochStats
      setState(s => ({ ...s, status: 'streaming', epochs: [...s.epochs, data] }))
    })

    es.addEventListener('done', (e) => {
      setState(s => ({
        ...s,
        status: 'done',
        donePayload: JSON.parse((e as MessageEvent).data) as SSEState['donePayload'],
      }))
      es.close()
    })

    es.addEventListener('stopped', (e) => {
      setState(s => ({
        ...s,
        status: 'done',
        donePayload: JSON.parse((e as MessageEvent).data) as SSEState['donePayload'],
      }))
      es.close()
    })

    es.addEventListener('failed', (e) => {
      const { reason } = JSON.parse((e as MessageEvent).data) as { reason: string }
      setState(s => ({ ...s, status: 'failed', failReason: reason }))
      es.close()
    })

    es.onerror = () => {
      setState(s =>
        s.status === 'streaming'
          ? s
          : { ...s, status: 'failed', failReason: 'Connection lost' }
      )
      es.close()
    }

    return () => {
      es.close()
    }
  }, [enabled])

  return state
}
