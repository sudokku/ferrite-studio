import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Square } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { getTrainStatus, startTraining, stopTraining } from '@/api/train'
import { importModel } from '@/api/userResources'
import { useTrainSSE } from '@/hooks/useSSE'
import { useAuth } from '@/context/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'

type TrainStatus = 'idle' | 'running' | 'done' | 'failed'

function StatusBadge({ status }: { status: TrainStatus }) {
  const variants: Record<TrainStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    idle: 'outline',
    running: 'default',
    done: 'secondary',
    failed: 'destructive',
  }
  return <Badge variant={variants[status]}>{status}</Badge>
}

export function TrainPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const { data } = useQuery({
    queryKey: ['train'],
    queryFn: getTrainStatus,
    refetchInterval: 3000,
  })
  const [streaming, setStreaming] = useState(false)
  const sse = useTrainSSE(streaming)

  // Library save state
  const [libStatus, setLibStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [libError, setLibError] = useState<string | null>(null)

  const startMut = useMutation({
    mutationFn: startTraining,
    onSuccess: (res) => {
      if (!res.error) {
        setStreaming(true)
        setLibStatus('idle')
        void qc.invalidateQueries({ queryKey: ['train'] })
      }
    },
  })

  const stopMut = useMutation({
    mutationFn: stopTraining,
    onSuccess: () => {
      setStreaming(false)
      void qc.invalidateQueries({ queryKey: ['train'] })
      void qc.invalidateQueries({ queryKey: ['evaluate'] })
      void qc.invalidateQueries({ queryKey: ['architect'] })
    },
  })

  // When the SSE stream ends naturally (done/failed), clear the streaming flag
  // and refresh all affected queries so the badge, button, and tab_unlock update.
  useEffect(() => {
    if (sse.status === 'done' || sse.status === 'failed') {
      setStreaming(false)
      void qc.invalidateQueries({ queryKey: ['train'] })
      void qc.invalidateQueries({ queryKey: ['evaluate'] })
      void qc.invalidateQueries({ queryKey: ['architect'] })
    }
  }, [sse.status, qc])

  const isRunning = data?.status === 'running' || streaming
  const chartData = streaming ? sse.epochs : (data?.epoch_history ?? [])
  const lastEpoch = chartData[chartData.length - 1]
  const progress = lastEpoch
    ? Math.round((lastEpoch.epoch / (lastEpoch.total_epochs || 1)) * 100)
    : 0

  const displayStatus: TrainStatus = streaming ? 'running' : (data?.status ?? 'idle')

  // Derive model name from model_path (strip prefix + .json suffix)
  const deriveModelName = (modelPath: string): string => {
    return modelPath
      .replace(/^trained_models\//, '')
      .replace(/\.json$/i, '')
  }

  const handleSaveToLibrary = async () => {
    if (!data?.model_path) return
    setLibStatus('loading')
    setLibError(null)
    try {
      const modelName = deriveModelName(data.model_path)
      // Fetch the model file from the Rust service
      const res = await fetch(`/api/models/${encodeURIComponent(modelName)}/download`)
      if (!res.ok) throw new Error(`Download failed: ${res.statusText}`)
      const blob = await res.blob()
      const file = new File([blob], `${modelName}.json`, { type: 'application/json' })
      await importModel(file, modelName)
      setLibStatus('ok')
    } catch (err) {
      setLibStatus('error')
      setLibError(err instanceof Error ? err.message : 'Failed to save to library')
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Train</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Start a training run and watch loss + accuracy in real time.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={displayStatus} />
          {!isRunning ? (
            <Button
              onClick={() => startMut.mutate()}
              disabled={startMut.isPending}
              className="gap-2"
            >
              <Play className="h-4 w-4" /> Start training
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={() => stopMut.mutate()}
              disabled={stopMut.isPending}
              className="gap-2"
            >
              <Square className="h-4 w-4" /> Stop
            </Button>
          )}
        </div>
      </div>

      {startMut.data?.error && (
        <p className="text-sm text-destructive">{startMut.data.error}</p>
      )}
      {sse.failReason && (
        <p className="text-sm text-destructive">SSE error: {sse.failReason}</p>
      )}

      {isRunning && lastEpoch && (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Epoch {lastEpoch.epoch} / {lastEpoch.total_epochs}
              </span>
              <span className="text-muted-foreground">{progress}%</span>
            </div>
            <Progress value={progress} />
          </CardContent>
        </Card>
      )}

      {chartData.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Loss</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="epoch" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="train_loss"
                    name="Train Loss"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="val_loss"
                    name="Val Loss"
                    dot={false}
                    strokeWidth={2}
                    stroke="#f59e0b"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Accuracy</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="epoch" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 1]} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="train_accuracy"
                    name="Train Acc"
                    dot={false}
                    strokeWidth={2}
                    stroke="#10b981"
                  />
                  <Line
                    type="monotone"
                    dataKey="val_accuracy"
                    name="Val Acc"
                    dot={false}
                    strokeWidth={2}
                    stroke="#6366f1"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}

      {data?.status === 'done' && data.model_path && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-4 space-y-3 text-sm">
            <p className="font-medium text-green-600 dark:text-green-400">Training complete</p>
            <p className="text-muted-foreground">Model saved to: {data.model_path}</p>
            {data.elapsed_total_ms !== null && (
              <p className="text-muted-foreground">
                Total time: {(data.elapsed_total_ms / 1000).toFixed(1)}s
              </p>
            )}
            {/* Save to library — only when signed in */}
            {user !== null && (
              <div className="space-y-1 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={libStatus === 'loading' || libStatus === 'ok'}
                  onClick={() => void handleSaveToLibrary()}
                >
                  {libStatus === 'loading'
                    ? 'Saving to library...'
                    : libStatus === 'ok'
                    ? 'Saved to library'
                    : 'Save to my library'}
                </Button>
                {libStatus === 'error' && libError && (
                  <p className="text-xs text-destructive">{libError}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {data?.status === 'failed' && (
        <Card className="border-destructive/30">
          <CardContent className="pt-4 text-sm text-destructive">
            Training failed: {data.fail_reason}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
