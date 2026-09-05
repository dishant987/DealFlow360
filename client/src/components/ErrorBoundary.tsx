import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

// A render error anywhere used to blank the whole page. Show what broke instead.
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[DealFlow360] render error:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-svh flex items-center justify-center p-6">
        <div className="max-w-lg space-y-3 rounded-lg border p-6">
          <h1 className="text-lg font-semibold text-destructive">Something broke on this screen</h1>
          <p className="text-sm text-muted-foreground">
            The page failed to render. The details below are also in the browser console.
          </p>
          <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-48">
            {this.state.error.message}
          </pre>
          <div className="flex gap-2">
            <Button onClick={() => this.setState({ error: null })}>Try again</Button>
            <Button variant="outline" onClick={() => (window.location.href = '/')}>
              Back to workspace
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
