import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Download, Upload } from 'lucide-react'
import {
  listArchitectures,
  listModels,
  deleteArchitecture,
  deleteUserModel,
  importModel,
  getModelDownloadUrl,
  type SavedArchitecture,
  type SavedModel,
} from '@/api/userResources'
import { saveArchitect, type SaveArchitectBody } from '@/api/architect'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function ArchitectureCard({
  arch,
  onDelete,
}: {
  arch: SavedArchitecture
  onDelete: () => void
}) {
  const qc = useQueryClient()
  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deletePending, setDeletePending] = useState(false)

  const handleLoad = async () => {
    setLoadStatus('loading')
    try {
      // Cast the saved spec to SaveArchitectBody and push it to the Rust workspace
      const result = await saveArchitect(arch.spec as unknown as SaveArchitectBody)
      if (result.error) {
        setLoadStatus('error')
      } else {
        setLoadStatus('ok')
        void qc.invalidateQueries({ queryKey: ['architect'] })
      }
    } catch {
      setLoadStatus('error')
    }
  }

  const handleDelete = async () => {
    setDeletePending(true)
    try {
      await deleteArchitecture(arch.id)
      onDelete()
    } catch {
      setDeletePending(false)
      setDeleteConfirm(false)
    }
  }

  return (
    <div className="flex items-start justify-between p-4 rounded-md border bg-muted/20">
      <div className="space-y-1 min-w-0 flex-1">
        <p className="font-medium text-sm truncate">{arch.name}</p>
        <p className="text-xs text-muted-foreground">{formatDate(arch.created_at)}</p>
        {loadStatus === 'ok' && (
          <p className="text-xs text-green-600 dark:text-green-400">Loaded into workspace.</p>
        )}
        {loadStatus === 'error' && (
          <p className="text-xs text-destructive">Failed to load.</p>
        )}
      </div>
      <div className="flex items-center gap-2 ml-3 shrink-0">
        <Button
          size="sm"
          variant="outline"
          onClick={handleLoad}
          disabled={loadStatus === 'loading'}
        >
          {loadStatus === 'loading' ? 'Loading...' : 'Load'}
        </Button>
        {!deleteConfirm ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDeleteConfirm(true)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={deletePending}
            >
              {deletePending ? '...' : 'Confirm'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleteConfirm(false)}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function ModelCard({
  model,
  onDelete,
}: {
  model: SavedModel
  onDelete: () => void
}) {
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deletePending, setDeletePending] = useState(false)

  const handleDelete = async () => {
    setDeletePending(true)
    try {
      await deleteUserModel(model.id)
      onDelete()
    } catch {
      setDeletePending(false)
      setDeleteConfirm(false)
    }
  }

  return (
    <div className="flex items-start justify-between p-4 rounded-md border bg-muted/20">
      <div className="space-y-1 min-w-0 flex-1">
        <p className="font-medium text-sm truncate">{model.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatBytes(model.file_size_bytes)} · {formatDate(model.created_at)}
        </p>
      </div>
      <div className="flex items-center gap-2 ml-3 shrink-0">
        <a
          href={getModelDownloadUrl(model.id)}
          download
          className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-3 border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <Download className="h-4 w-4" />
        </a>
        {!deleteConfirm ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDeleteConfirm(true)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={deletePending}
            >
              {deletePending ? '...' : 'Confirm'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleteConfirm(false)}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export function LibraryPage() {
  const qc = useQueryClient()

  const { data: archs, isLoading: archsLoading } = useQuery({
    queryKey: ['user-architectures'],
    queryFn: listArchitectures,
  })

  const { data: models, isLoading: modelsLoading } = useQuery({
    queryKey: ['user-models'],
    queryFn: listModels,
  })

  // Import model mutation
  const importMut = useMutation({
    mutationFn: ({ file, name }: { file: File; name: string }) => importModel(file, name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['user-models'] })
    },
  })

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const name = file.name.replace(/\.json$/i, '')
    importMut.mutate({ file, name })
    // Reset the input so the same file can be re-imported if needed
    e.target.value = ''
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Library</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your saved architectures and trained models.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Architectures */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Architectures</CardTitle>
              {archs && (
                <Badge variant="secondary">{archs.length}</Badge>
              )}
            </div>
            <CardDescription>
              Saved network specs. &quot;Load&quot; pushes the spec back into the active workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {archsLoading && (
              <p className="text-sm text-muted-foreground">Loading...</p>
            )}
            {archs && archs.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No saved architectures yet. Use &quot;Save to my library&quot; on the Architect page.
              </p>
            )}
            {archs?.map((arch) => (
              <ArchitectureCard
                key={arch.id}
                arch={arch}
                onDelete={() => void qc.invalidateQueries({ queryKey: ['user-architectures'] })}
              />
            ))}
          </CardContent>
        </Card>

        {/* Models */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Models</CardTitle>
              {models && (
                <Badge variant="secondary">{models.length}</Badge>
              )}
            </div>
            <CardDescription>
              Trained model files stored in your library.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {modelsLoading && (
              <p className="text-sm text-muted-foreground">Loading...</p>
            )}
            {models && models.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No models yet. Save one from the Train page after training completes.
              </p>
            )}
            {models?.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                onDelete={() => void qc.invalidateQueries({ queryKey: ['user-models'] })}
              />
            ))}

            {/* Manual import */}
            <div className="pt-2 border-t">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImport}
                />
                <span className="inline-flex items-center gap-2 rounded-md text-sm font-medium h-9 px-3 border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">
                  <Upload className="h-4 w-4" />
                  {importMut.isPending ? 'Importing...' : 'Import model file'}
                </span>
              </label>
              {importMut.isSuccess && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-2">Model imported.</p>
              )}
              {importMut.isError && (
                <p className="text-xs text-destructive mt-2">
                  {importMut.error instanceof Error ? importMut.error.message : 'Import failed'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
