import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { FlaskConical, Upload } from 'lucide-react'
import { getTestModels, runInference, importModel, type InferResult, type ModelInfo } from '@/api/test'
import { getTrainStatus } from '@/api/train'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

// ──────────────────── Canvas Draw Component ────────────────────

interface CanvasDrawProps {
  onData: (blob: Blob) => void
}

function CanvasDraw({ onData }: CanvasDrawProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, 280, 280)
  }, [])

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const src = 'touches' in e ? e.touches[0] : e
    return {
      x: src.clientX - rect.left,
      y: src.clientY - rect.top,
    }
  }

  const drawAt = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.arc(x, y, 10, 0, Math.PI * 2)
    ctx.fillStyle = 'white'
    ctx.fill()
  }

  const clear = () => {
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, 280, 280)
  }

  const submit = () => {
    canvasRef.current!.toBlob(blob => blob && onData(blob), 'image/png')
  }

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        width={280}
        height={280}
        className="rounded-md border border-border cursor-crosshair touch-none"
        onMouseDown={e => { drawing.current = true; drawAt(e) }}
        onMouseMove={drawAt}
        onMouseUp={() => { drawing.current = false }}
        onMouseLeave={() => { drawing.current = false }}
        onTouchStart={e => { drawing.current = true; drawAt(e) }}
        onTouchMove={drawAt}
        onTouchEnd={() => { drawing.current = false }}
      />
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={clear}>Clear</Button>
        <Button size="sm" onClick={submit}>Run inference</Button>
      </div>
    </div>
  )
}

// ──────────────────── Result Card ────────────────────

function ResultCard({ result }: { result: InferResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FlaskConical className="h-4 w-4" />
          Result
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {result.prediction != null && (
          <div className="text-center py-4">
            <p className="text-6xl font-bold text-primary">{result.prediction}</p>
            {result.confidence != null && (
              <p className="text-sm text-muted-foreground mt-1">
                {(result.confidence * 100).toFixed(1)}% confidence
              </p>
            )}
          </div>
        )}
        {result.all_scores && result.all_scores.length > 0 && (
          <div className="space-y-1">
            {result.all_scores.slice(0, 10).map(s => (
              <div key={s.label} className="flex items-center gap-2">
                <span className="text-xs w-6 text-right text-muted-foreground">{s.label}</span>
                <div className="flex-1 bg-muted rounded-full h-1.5">
                  <div
                    className="bg-primary h-1.5 rounded-full transition-all"
                    style={{ width: `${s.score * 100}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-12 text-right">
                  {(s.score * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        )}
        {result.raw_values && (
          <div className="font-mono text-xs text-muted-foreground break-all">
            [{result.raw_values.map(v => v.toFixed(4)).join(', ')}]
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ──────────────────── Main TestPage ────────────────────

type ManualMode = 'numeric' | 'grayscale' | 'rgb'

function resolveAutoMode(info: ModelInfo | null): ManualMode | null {
  if (!info?.input_type) return null
  switch (info.input_type.type) {
    case 'ImageGrayscale': return 'grayscale'
    case 'ImageRgb': return 'rgb'
    case 'Numeric': return 'numeric'
    default: return null
  }
}

export function TestPage() {
  const [selectedModel, setSelectedModel] = useState<string | undefined>()

  // Bug 5: pre-populate model from the session's last training run
  const { data: trainData } = useQuery({
    queryKey: ['train'],
    queryFn: getTrainStatus,
    staleTime: 5_000,
  })

  useEffect(() => {
    if (selectedModel === undefined && trainData?.model_path) {
      const name = trainData.model_path
        .replace(/^trained_models\//, '')
        .replace(/\.json$/i, '')
      setSelectedModel(name)
    }
  }, [trainData?.model_path, selectedModel])

  const { data } = useQuery({
    queryKey: ['test', selectedModel],
    queryFn: () => getTestModels(selectedModel),
  })

  const modelInfo: ModelInfo | null = data?.model_info ?? null
  const inputType = modelInfo?.input_type
  const autoMode = resolveAutoMode(modelInfo)

  const [manualMode, setManualMode] = useState<ManualMode>('numeric')
  const [drawMode, setDrawMode] = useState<'upload' | 'draw'>('upload')
  const [numericInputs, setNumericInputs] = useState('')
  const [manualWidth, setManualWidth] = useState('28')
  const [manualHeight, setManualHeight] = useState('28')
  const fileRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<InferResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const effectiveMode: ManualMode = autoMode ?? manualMode

  const inferMut = useMutation({
    mutationFn: runInference,
    onSuccess: r => { setResult(r); setError(null) },
    onError: (e: Error) => setError(e.message),
  })

  const importMut = useMutation({
    mutationFn: (f: File) => importModel(f),
    onSuccess: res => {
      if (res.error) setError(res.error)
      else if (res.name) setSelectedModel(res.name)
    },
    onError: (e: Error) => setError(e.message),
  })

  const buildForm = (imageBlob?: Blob): FormData => {
    const form = new FormData()
    form.append('model', selectedModel ?? '')
    form.append('input_mode', effectiveMode)

    if (effectiveMode === 'numeric') {
      form.append('inputs', numericInputs)
    } else {
      const w = inputType && 'width' in inputType && inputType.width != null
        ? String(inputType.width)
        : manualWidth
      const h = inputType && 'height' in inputType && inputType.height != null
        ? String(inputType.height)
        : manualHeight
      form.append('input_width', w)
      form.append('input_height', h)
      if (imageBlob) {
        form.append('image_file', imageBlob, 'draw.png')
      } else if (fileRef.current?.files?.[0]) {
        form.append('image_file', fileRef.current.files[0])
      }
    }
    return form
  }

  const handleSubmit = () => inferMut.mutate(buildForm())
  const handleCanvasData = (blob: Blob) => inferMut.mutate(buildForm(blob))

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Test</h1>
          <p className="text-muted-foreground text-sm mt-1">Run inference against a trained model.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept=".json"
            ref={importRef}
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) importMut.mutate(f)
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => importRef.current?.click()}
            className="gap-2"
          >
            <Upload className="h-4 w-4" /> Import model
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Model selection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select
            value={selectedModel ?? ''}
            onChange={e => setSelectedModel(e.target.value || undefined)}
          >
            <option value="">— select a model —</option>
            {data?.models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
          {modelInfo && (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">input: {modelInfo.input_size}</Badge>
              <Badge variant="outline">output: {modelInfo.output_size}</Badge>
              {inputType && <Badge variant="secondary">{inputType.type}</Badge>}
              {inputType && 'width' in inputType && inputType.width != null && (
                <Badge variant="outline">{inputType.width}x{inputType.height}</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedModel && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Input</CardTitle>
            {/* Manual mode selector when input_type is null */}
            {!autoMode && (
              <div className="flex gap-2 mt-2">
                {(['numeric', 'grayscale', 'rgb'] as ManualMode[]).map(m => (
                  <Button
                    key={m}
                    size="sm"
                    variant={manualMode === m ? 'default' : 'outline'}
                    onClick={() => setManualMode(m)}
                  >
                    {m === 'numeric' ? 'Numeric' : m === 'grayscale' ? 'Grayscale' : 'RGB'}
                  </Button>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Numeric mode */}
            {effectiveMode === 'numeric' && (
              <>
                <div className="space-y-2">
                  <Label>Inputs (comma-separated floats)</Label>
                  <Textarea
                    placeholder="0.0, 0.5, 1.0, ..."
                    value={numericInputs}
                    onChange={e => setNumericInputs(e.target.value)}
                    rows={3}
                  />
                </div>
                <Button onClick={handleSubmit} disabled={inferMut.isPending}>
                  {inferMut.isPending ? 'Running...' : 'Run inference'}
                </Button>
              </>
            )}

            {/* Grayscale image mode */}
            {effectiveMode === 'grayscale' && (
              <>
                {/* Draw/Upload toggle only for auto-detected grayscale */}
                {autoMode === 'grayscale' && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={drawMode === 'upload' ? 'default' : 'outline'}
                      onClick={() => setDrawMode('upload')}
                    >
                      Upload
                    </Button>
                    <Button
                      size="sm"
                      variant={drawMode === 'draw' ? 'default' : 'outline'}
                      onClick={() => setDrawMode('draw')}
                    >
                      Draw
                    </Button>
                  </div>
                )}
                {/* Dimensions for manual mode */}
                {!autoMode && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Width</Label>
                      <Input
                        type="number"
                        value={manualWidth}
                        onChange={e => setManualWidth(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Height</Label>
                      <Input
                        type="number"
                        value={manualHeight}
                        onChange={e => setManualHeight(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                {(drawMode === 'upload' || !autoMode) && (
                  <>
                    <Input type="file" accept="image/*" ref={fileRef} />
                    <Button onClick={handleSubmit} disabled={inferMut.isPending}>
                      {inferMut.isPending ? 'Running...' : 'Run inference'}
                    </Button>
                  </>
                )}
                {drawMode === 'draw' && autoMode === 'grayscale' && (
                  <CanvasDraw onData={handleCanvasData} />
                )}
              </>
            )}

            {/* RGB image mode */}
            {effectiveMode === 'rgb' && (
              <>
                {!autoMode && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Width</Label>
                      <Input
                        type="number"
                        value={manualWidth}
                        onChange={e => setManualWidth(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Height</Label>
                      <Input
                        type="number"
                        value={manualHeight}
                        onChange={e => setManualHeight(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                <Input type="file" accept="image/*" ref={fileRef} />
                <Button onClick={handleSubmit} disabled={inferMut.isPending}>
                  {inferMut.isPending ? 'Running...' : 'Run inference'}
                </Button>
              </>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      {result && <ResultCard result={result} />}
    </div>
  )
}
