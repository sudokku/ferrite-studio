import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { getArchitect, saveArchitect, type LayerSpec, type SaveArchitectBody } from '@/api/architect'
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

  const handleSave = () => {
    setError(null)
    setSuccess(false)
    const body: SaveArchitectBody = {
      name,
      description,
      input_size: Number(inputSize),
      loss_type: lossType,
      learning_rate: Number(lr),
      batch_size: Number(batchSize),
      epochs: Number(epochs),
      layers,
      input_type:
        inputKind === 'numeric'
          ? { kind: 'numeric' }
          : { kind: inputKind, width: Number(imgWidth), height: Number(imgHeight) },
    }
    mutation.mutate(body)
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
              <Label>Name</Label>
              <Input placeholder="my_model" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
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
            <div className="space-y-2">
              <Label>Input size (features)</Label>
              <Input type="number" value={inputSize} onChange={e => setInputSize(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Input type</Label>
              <Select value={inputKind} onChange={e => setInputKind(e.target.value as InputKind)}>
                {INPUT_KINDS.map(k => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </Select>
            </div>
          </div>
          {inputKind !== 'numeric' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Width</Label>
                <Input type="number" value={imgWidth} onChange={e => setImgWidth(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Height</Label>
                <Input type="number" value={imgHeight} onChange={e => setImgHeight(e.target.value)} />
              </div>
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
            <div key={i} className="flex items-center gap-3 p-3 rounded-md border bg-muted/30">
              <span className="text-xs text-muted-foreground w-5">{i + 1}</span>
              <div className="flex-1 space-y-1">
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
                  className="h-8 text-sm"
                >
                  {ACTIVATIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </Select>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeLayer(i)}
                className="text-destructive hover:text-destructive"
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
            <Label>Loss type</Label>
            <Select value={lossType} onChange={e => setLossType(e.target.value)}>
              {LOSS_TYPES.map(l => <option key={l} value={l}>{l}</option>)}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Learning rate</Label>
            <Input type="number" step="0.001" value={lr} onChange={e => setLr(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Batch size</Label>
            <Input type="number" value={batchSize} onChange={e => setBatchSize(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Epochs</Label>
            <Input type="number" value={epochs} onChange={e => setEpochs(e.target.value)} />
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
    </div>
  )
}
