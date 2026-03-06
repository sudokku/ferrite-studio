import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { getArchitect, saveArchitect, type LayerSpec, type SaveArchitectBody } from '@/api/architect'
import { saveArchitecture } from '@/api/userResources'
import { useAuth } from '@/context/AuthContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

const ACTIVATIONS = ['sigmoid', 'relu', 'identity', 'softmax', 'tanh', 'leaky_relu', 'elu', 'gelu', 'swish']
const LOSS_TYPES = ['mse', 'cross_entropy', 'bce', 'mae', 'huber']
const INPUT_KINDS = [
  { value: 'numeric', label: 'Numeric' },
  { value: 'grayscale', label: 'Grayscale Image' },
  { value: 'rgb', label: 'RGB Image' },
]

type InputKind = 'numeric' | 'grayscale' | 'rgb'

export function ArchitectPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const { data, isLoading } = useQuery({ queryKey: ['architect'], queryFn: getArchitect })

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [inputSize, setInputSize] = useState('784')
  const [lossType, setLossType] = useState('cross_entropy')
  const [lr, setLr] = useState('0.01')
  const [batchSize, setBatchSize] = useState('32')
  const [epochs, setEpochs] = useState('50')
  const [layers, setLayers] = useState<LayerSpec[]>([
    { neurons: 128, activation: 'relu' },
    { neurons: 10, activation: 'softmax' },
  ])
  const [inputKind, setInputKind] = useState<InputKind>('numeric')
  const [imgWidth, setImgWidth] = useState('28')
  const [imgHeight, setImgHeight] = useState('28')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Library save state (separate from Rust save)
  const [libError, setLibError] = useState<string | null>(null)
  const [libSuccess, setLibSuccess] = useState(false)
  const [libPending, setLibPending] = useState(false)

  // Bug 1: derive input_size from image dimensions when not numeric
  const computedInputSize =
    inputKind === 'numeric'
      ? Number(inputSize)
      : inputKind === 'grayscale'
        ? Number(imgWidth) * Number(imgHeight)
        : Number(imgWidth) * Number(imgHeight) * 3

  const channels = inputKind === 'rgb' ? 3 : 1

  const mutation = useMutation({
    mutationFn: saveArchitect,
    onSuccess: (res) => {
      if (res.error) {
        setError(res.error)
        setSuccess(false)
      } else {
        setSuccess(true)
        setError(null)
        void qc.invalidateQueries({ queryKey: ['architect'] })
      }
    },
  })

  const addLayer = () => setLayers(l => [...l, { neurons: 64, activation: 'relu' }])
  const removeLayer = (i: number) => setLayers(l => l.filter((_, idx) => idx !== i))
  const updateLayer = (i: number, field: keyof LayerSpec, value: string | number) =>
    setLayers(l => l.map((layer, idx) => idx === i ? { ...layer, [field]: value } : layer))

  const buildBody = (): SaveArchitectBody => ({
    name,
    description,
    // Bug 1: use computed size derived from image dimensions
    input_size: computedInputSize,
    loss_type: lossType,
    learning_rate: Number(lr),
    batch_size: Number(batchSize),
    epochs: Number(epochs),
    layers,
    input_type:
      inputKind === 'numeric'
        ? { kind: 'numeric' }
        : { kind: inputKind, width: Number(imgWidth), height: Number(imgHeight) },
  })

  const handleSave = () => {
    setError(null)
    setSuccess(false)
    mutation.mutate(buildBody())
  }

  const handleSaveToLibrary = async () => {
    setLibError(null)
    setLibSuccess(false)
    setLibPending(true)
    try {
      const body = buildBody()
      const libName = name.trim() || 'Untitled'
      await saveArchitecture(libName, body as unknown as Record<string, unknown>)
      setLibSuccess(true)
    } catch (err) {
      setLibError(err instanceof Error ? err.message : 'Failed to save to library')
    } finally {
      setLibPending(false)
    }
  }

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>

  const saved = data?.spec

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Architect</h1>
        <p className="text-muted-foreground text-sm mt-1">Define your neural network architecture and hyperparameters.</p>
      </div>

      {saved && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                Current spec: <span className="text-primary">{saved.name}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {saved.layers.length} layers · input {saved.input_size} · loss {saved.loss_type}
              </p>
            </div>
            <Badge variant="secondary">Saved</Badge>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Model identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              {/* Bug 4: matching id/htmlFor */}
              <Label htmlFor="model-name">Name</Label>
              <Input
                id="model-name"
                placeholder="my_model"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model-description">Description (optional)</Label>
              <Input
                id="model-description"
                placeholder="MNIST classifier"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Input</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Bug 1: only show manual input_size field for numeric mode */}
            {inputKind === 'numeric' && (
              <div className="space-y-2">
                <Label htmlFor="input-size">Input size (features)</Label>
                <Input
                  id="input-size"
                  type="number"
                  value={inputSize}
                  onChange={e => setInputSize(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="input-kind">Input type</Label>
              <Select
                id="input-kind"
                value={inputKind}
                onChange={e => setInputKind(e.target.value as InputKind)}
              >
                {INPUT_KINDS.map(k => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </Select>
            </div>
          </div>
          {inputKind !== 'numeric' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="img-width">Width</Label>
                  <Input
                    id="img-width"
                    type="number"
                    value={imgWidth}
                    onChange={e => setImgWidth(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="img-height">Height</Label>
                  <Input
                    id="img-height"
                    type="number"
                    value={imgHeight}
                    onChange={e => setImgHeight(e.target.value)}
                  />
                </div>
              </div>
              {/* Bug 1: read-only computed value display */}
              <p className="text-sm text-muted-foreground">
                Auto:{' '}
                <span className="font-medium text-foreground">
                  {imgWidth} × {imgHeight} × {channels} = {computedInputSize}
                </span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Layers</CardTitle>
          <CardDescription>
            Add hidden + output layers. Last layer's activation determines the output type.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {layers.map((layer, i) => (
            // Bug 2: give Neurons a fixed narrow width, let Activation take remaining space
            <div key={i} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
              <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}</span>
              <div className="w-24 shrink-0 space-y-1">
                <Label className="text-xs">Neurons</Label>
                <Input
                  type="number"
                  value={layer.neurons}
                  onChange={e => updateLayer(i, 'neurons', Number(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Activation</Label>
                <Select
                  value={layer.activation}
                  onChange={e => updateLayer(i, 'activation', e.target.value)}
                >
                  {ACTIVATIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </Select>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeLayer(i)}
                className="text-destructive hover:text-destructive shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addLayer} className="gap-2">
            <Plus className="h-4 w-4" /> Add layer
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Hyperparameters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            {/* Bug 4: matching id/htmlFor for all hyperparameter fields */}
            <Label htmlFor="loss-type">Loss type</Label>
            <Select id="loss-type" value={lossType} onChange={e => setLossType(e.target.value)}>
              {LOSS_TYPES.map(l => <option key={l} value={l}>{l}</option>)}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="learning-rate">Learning rate</Label>
            <Input
              id="learning-rate"
              type="number"
              step="0.001"
              value={lr}
              onChange={e => setLr(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="batch-size">Batch size</Label>
            <Input
              id="batch-size"
              type="number"
              value={batchSize}
              onChange={e => setBatchSize(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="epochs">Epochs</Label>
            <Input
              id="epochs"
              type="number"
              value={epochs}
              onChange={e => setEpochs(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && (
        <p className="text-sm text-green-600 dark:text-green-400">Architecture saved successfully.</p>
      )}

      <Button onClick={handleSave} disabled={mutation.isPending} className="w-full">
        {mutation.isPending ? 'Saving...' : 'Save architecture'}
      </Button>

      {/* Save to library — only shown when logged in */}
      {user !== null && (
        <div className="space-y-2">
          <Button
            variant="outline"
            onClick={() => void handleSaveToLibrary()}
            disabled={libPending}
            className="w-full"
          >
            {libPending ? 'Saving to library...' : 'Save to my library'}
          </Button>
          {libError && <p className="text-sm text-destructive">{libError}</p>}
          {libSuccess && (
            <p className="text-sm text-green-600 dark:text-green-400">
              Architecture saved to your library.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
