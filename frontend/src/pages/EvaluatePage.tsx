import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
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
import { getEvaluate, getEvaluateExportUrl } from '@/api/evaluate'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function MetricStat({ label, value }: { label: string; value: number | null }) {
  const display =
    value == null
      ? '—'
      : value < 1
        ? (value * 100).toFixed(2) + '%'
        : value.toFixed(4)

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{display}</p>
    </div>
  )
}

export function EvaluatePage() {
  const { data, isLoading } = useQuery({ queryKey: ['evaluate'], queryFn: getEvaluate })

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Evaluate</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review training history, metrics, and confusion matrix.
          </p>
        </div>
        <a href={getEvaluateExportUrl()} download>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </a>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <MetricStat label="Best train loss" value={data?.best_train_loss ?? null} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <MetricStat label="Best val loss" value={data?.best_val_loss ?? null} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <MetricStat label="Best train acc" value={data?.best_train_accuracy ?? null} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <MetricStat label="Best val acc" value={data?.best_val_accuracy ?? null} />
          </CardContent>
        </Card>
      </div>

      {data && data.epoch_history.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Loss history</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.epoch_history}>
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
              <CardTitle className="text-base">Accuracy history</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.epoch_history}>
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

      {data?.confusion_matrix && data.class_labels && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Confusion matrix</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="text-xs font-mono border-collapse">
                <thead>
                  <tr>
                    <th className="p-1 text-muted-foreground">True \ Pred</th>
                    {data.class_labels.map(l => (
                      <th key={l} className="p-1 text-muted-foreground">{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.confusion_matrix.map((row, i) => (
                    <tr key={i}>
                      <td className="p-1 text-muted-foreground font-medium">
                        {data.class_labels![i]}
                      </td>
                      {row.map((val, j) => (
                        <td
                          key={j}
                          className={`p-1 text-center rounded ${
                            i === j
                              ? 'bg-primary/20 font-bold text-primary'
                              : val > 0
                                ? 'text-destructive/80'
                                : 'text-muted-foreground'
                          }`}
                        >
                          {val}
                        </td>
                      ))}
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
