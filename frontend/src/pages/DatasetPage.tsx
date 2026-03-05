import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { getDataset, uploadCsv, uploadIdx, loadBuiltin, type DatasetResponse } from '@/api/dataset'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

type Mode = 'csv' | 'idx' | 'builtin'
type BuiltinName = 'xor' | 'circles' | 'blobs'

export function DatasetPage() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['dataset'], queryFn: getDataset })

  const [mode, setMode] = useState<Mode>('csv')
  const [valSplit, setValSplit] = useState('10')
  const [labelCols, setLabelCols] = useState('1')
  const [builtin, setBuiltin] = useState<BuiltinName>('xor')
  const [error, setError] = useState<string | null>(null)
  const [showLargeFileHint, setShowLargeFileHint] = useState(false)

  const csvRef = useRef<HTMLInputElement>(null)
  const imgRef = useRef<HTMLInputElement>(null)
  const lblRef = useRef<HTMLInputElement>(null)

  const mutation = useMutation({
    mutationFn: async (): Promise<DatasetResponse> => {
      if (mode === 'csv') {
        const file = csvRef.current?.files?.[0]
        if (!file) throw new Error('Select a CSV file')
        return uploadCsv(file, Number(valSplit), Number(labelCols))
      } else if (mode === 'idx') {
        const img = imgRef.current?.files?.[0]
        const lbl = lblRef.current?.files?.[0]
        if (!img || !lbl) throw new Error('Select both IDX files')
        return uploadIdx(img, lbl, Number(valSplit))
      } else {
        return loadBuiltin(builtin, Number(valSplit))
      }
    },
    onSuccess: (res) => {
      if (res.error) setError(res.error)
      else {
        setError(null)
        void qc.invalidateQueries({ queryKey: ['dataset'] })
        void qc.invalidateQueries({ queryKey: ['architect'] })
      }
    },
    onError: (e: Error) => setError(e.message),
  })

  // Show a "large file" hint after 2 s of pending upload so the user knows
  // the request is still in progress and does not click again.
  useEffect(() => {
    if (!mutation.isPending) {
      setShowLargeFileHint(false)
      return
    }
    const timer = window.setTimeout(() => setShowLargeFileHint(true), 2_000)
    return () => window.clearTimeout(timer)
  }, [mutation.isPending])

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dataset</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Upload a CSV, IDX binary files, or load a built-in toy dataset.
        </p>
      </div>

      {data?.loaded && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">{data.source_name}</p>
              <Badge variant="secondary">Loaded</Badge>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm text-muted-foreground">
              <span>{data.total_rows?.toLocaleString()} rows</span>
              <span>{data.feature_count} features</span>
              <span>{data.label_count} labels</span>
              <span>{data.train_rows?.toLocaleString()} train</span>
              <span>{data.val_rows?.toLocaleString()} val</span>
              <span>val split {data.val_split_pct}%</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Load dataset</CardTitle>
          <div className="flex gap-2 mt-2">
            {(['csv', 'idx', 'builtin'] as Mode[]).map(m => (
              <Button key={m} variant={mode === m ? 'default' : 'outline'} size="sm" onClick={() => setMode(m)}>
                {m === 'csv' ? 'CSV' : m === 'idx' ? 'IDX Binary' : 'Built-in'}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === 'csv' && (
            <>
              <div className="space-y-2">
                <Label>CSV file</Label>
                <Input type="file" accept=".csv" ref={csvRef} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Validation split (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="50"
                    value={valSplit}
                    onChange={e => setValSplit(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Label columns (from right)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={labelCols}
                    onChange={e => setLabelCols(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {mode === 'idx' && (
            <>
              <div className="space-y-2">
                <Label>Images file (IDX3)</Label>
                <Input type="file" ref={imgRef} />
              </div>
              <div className="space-y-2">
                <Label>Labels file (IDX1)</Label>
                <Input type="file" ref={lblRef} />
              </div>
              <div className="space-y-2">
                <Label>Validation split (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="50"
                  value={valSplit}
                  onChange={e => setValSplit(e.target.value)}
                />
              </div>
            </>
          )}

          {mode === 'builtin' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Dataset</Label>
                <Select value={builtin} onChange={e => setBuiltin(e.target.value as BuiltinName)}>
                  <option value="xor">XOR</option>
                  <option value="circles">Circles</option>
                  <option value="blobs">Blobs</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Validation split (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="50"
                  value={valSplit}
                  onChange={e => setValSplit(e.target.value)}
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {showLargeFileHint && (
            <p className="text-sm text-muted-foreground">
              Uploading large file, this may take a moment...
            </p>
          )}

          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="w-full gap-2">
            <Upload className="h-4 w-4" />
            {mutation.isPending ? 'Loading...' : 'Load dataset'}
          </Button>
        </CardContent>
      </Card>

      {data?.preview_rows && data.preview_rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Preview (first {data.preview_rows.length} rows)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto text-xs font-mono">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1 pr-4 text-muted-foreground">Inputs (first 8)</th>
                    <th className="text-left py-1 text-muted-foreground">Labels</th>
                  </tr>
                </thead>
                <tbody>
                  {data.preview_rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td className="py-1 pr-4">
                        [{row.inputs.slice(0, 8).map(v => v.toFixed(3)).join(', ')}
                        {row.inputs.length > 8 ? ', ...' : ''}]
                      </td>
                      <td className="py-1">[{row.labels.map(v => v.toFixed(1)).join(', ')}]</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
