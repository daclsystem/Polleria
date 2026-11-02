import { Component, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'

/** Un módulo que no descargue no debe ocultar el menú ni el resto del sistema. */
export class ModuleErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="card mx-auto max-w-lg px-6 py-12 text-center">
        <RefreshCw size={28} className="mx-auto text-ember" />
        <h1 className="mt-4 text-xl font-bold">No pudimos abrir esta pantalla</h1>
        <p className="mt-2 text-sm text-ink/55">Recarga para volver a intentarlo. Si el problema continúa, revisa tu conexión.</p>
        <button type="button" onClick={() => window.location.reload()} className="btn-primary mt-6 gap-2 px-5 text-sm">
          <RefreshCw size={16} /> Recargar pantalla
        </button>
      </div>
    )
  }
}
