import { useEffect, useRef, useState } from 'react'
import { Download, Printer, QrCode } from 'lucide-react'
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'
import { Field, PageTitle, inputClass } from '../components/ui'
import { publicWebUrl } from '../lib/paths'

type QRPerPage = 1 | 2 | 4 | 6 | 9 | 12
type QRStyle = 'simple' | 'elegant' | 'colorful'

const QR_OPTIONS: { value: QRPerPage; label: string; cols: number }[] = [
  { value: 1, label: '1 código por hoja (Grande)', cols: 1 },
  { value: 2, label: '2 códigos por hoja', cols: 2 },
  { value: 4, label: '4 códigos por hoja', cols: 2 },
  { value: 6, label: '6 códigos por hoja', cols: 3 },
  { value: 9, label: '9 códigos por hoja', cols: 3 },
  { value: 12, label: '12 códigos por hoja', cols: 4 },
]

const STYLE_OPTIONS: { value: QRStyle; label: string; description: string }[] = [
  { value: 'simple', label: 'Simple y limpio', description: 'QR básico con texto mínimo' },
  { value: 'elegant', label: 'Elegante', description: 'Con bordes decorativos y más detalles' },
  { value: 'colorful', label: 'Colorido', description: 'Con colores del logo y diseño llamativo' },
]

export function ImprimirQR() {
  const [qrPerPage, setQrPerPage] = useState<QRPerPage>(4)
  const [qrStyle, setQrStyle] = useState<QRStyle>('elegant')
  const [includeTableNumber, setIncludeTableNumber] = useState(true)
  const [tableCount, setTableCount] = useState(6)
  const [qrCodes, setQrCodes] = useState<{ url: string; table?: number }[]>([])
  const [generating, setGenerating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const printAreaRef = useRef<HTMLDivElement>(null)

  // URL de producción real
  const menuUrl = `${publicWebUrl()}/cliente/`

  const generateQRCodes = async () => {
    setGenerating(true)
    try {
      let codes: { url: string; table?: number }[] = []

      if (includeTableNumber && tableCount > 0) {
        // Generar un QR por cada mesa (1, 2, 3, ...)
        codes = Array.from({ length: tableCount }, (_, i) => ({
          url: menuUrl,
          table: i + 1,
        }))
      } else {
        // Generar QR sin mesa
        codes = Array(qrPerPage).fill({ url: menuUrl })
      }

      setQrCodes(codes)
    } catch (e) {
      alert((e as Error).message || 'Error al generar códigos QR')
    } finally {
      setGenerating(false)
    }
  }

  const handleExportPDF = async () => {
    if (!printAreaRef.current || qrCodes.length === 0) return
    
    setExporting(true)
    try {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = 210 // A4 width in mm
      const pageHeight = 297 // A4 height in mm
      const margin = 10
      
      const totalPages = Math.ceil(qrCodes.length / qrPerPage)
      
      for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
        if (pageIdx > 0) {
          pdf.addPage()
        }
        
        const pageQRs = qrCodes.slice(pageIdx * qrPerPage, (pageIdx + 1) * qrPerPage)
        const selectedOption = QR_OPTIONS.find((o) => o.value === qrPerPage)
        const cols = selectedOption?.cols || 2
        const rows = Math.ceil(pageQRs.length / cols)
        
        const qrWidth = (pageWidth - margin * 2 - (cols - 1) * 5) / cols
        const qrHeight = (pageHeight - margin * 2 - (rows - 1) * 5) / rows
        
        for (let i = 0; i < pageQRs.length; i++) {
          const qr = pageQRs[i]
          const col = i % cols
          const row = Math.floor(i / cols)
          
          const x = margin + col * (qrWidth + 5)
          const y = margin + row * (qrHeight + 5)
          
          // Generar QR como imagen
          const canvas = canvasRefs.current[pageIdx * qrPerPage + i]
          if (canvas) {
            const imgData = canvas.toDataURL('image/png')
            const qrSize = Math.min(qrWidth, qrHeight) * 0.6
            const qrX = x + (qrWidth - qrSize) / 2
            const qrY = y + 10
            
            pdf.addImage(imgData, 'PNG', qrX, qrY, qrSize, qrSize)
            
            // Título
            pdf.setFontSize(14)
            pdf.setFont('helvetica', 'bold')
            pdf.text('Chifa Pollería Lopez', x + qrWidth / 2, qrY + qrSize + 8, { align: 'center' })
            
            // Mesa
            if (qr.table) {
              pdf.setFontSize(12)
              pdf.text(`Mesa ${qr.table}`, x + qrWidth / 2, qrY + qrSize + 14, { align: 'center' })
            }
            
            // Subtítulo
            pdf.setFontSize(10)
            pdf.setFont('helvetica', 'normal')
            pdf.text('Escanea para ver la carta', x + qrWidth / 2, qrY + qrSize + 19, { align: 'center' })
          }
        }
      }
      
      const filename = `QR-Mesas-${includeTableNumber ? `1-${tableCount}` : 'General'}.pdf`
      pdf.save(filename)
      
    } catch (e) {
      console.error('Error exportando PDF:', e)
      alert('Error al exportar PDF: ' + (e as Error).message)
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    if (qrCodes.length === 0) return

    const render = async () => {
      // Esperar un poco para que los canvas estén en el DOM
      await new Promise(resolve => setTimeout(resolve, 100))
      
      for (let i = 0; i < qrCodes.length; i++) {
        const canvas = canvasRefs.current[i]
        if (!canvas) {
          console.log('Canvas no encontrado para índice:', i)
          continue
        }
        
        try {
          // Colores según el estilo
          const colors = {
            simple: { dark: '#000000', light: '#ffffff' },
            elegant: { dark: '#1a3d1a', light: '#ffffff' },
            colorful: { dark: '#E85D04', light: '#FFF4E6' },
          }
          
          await QRCode.toCanvas(canvas, qrCodes[i].url, {
            width: 280,
            margin: 2,
            color: colors[qrStyle],
            errorCorrectionLevel: 'H',
          })
          
          console.log('QR generado para índice:', i)
        } catch (e) {
          console.error('Error rendering QR:', e)
        }
      }
    }

    void render()
  }, [qrCodes, qrStyle])

  const handlePrint = () => {
    window.print()
  }

  const selectedOption = QR_OPTIONS.find((o) => o.value === qrPerPage)

  return (
    <div className="max-w-6xl">
      <PageTitle
        title="Imprimir códigos QR"
        hint="Genera códigos QR enlazados a la carta digital para colocar en las mesas del restaurante."
      />

      <div className="card mt-6 space-y-4 p-5 print:hidden">
        <div className="flex items-center gap-2">
          <QrCode size={20} className="text-ember" />
          <h2 className="font-display text-lg">Configuración de impresión</h2>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Códigos por hoja">
            <select
              className={inputClass}
              value={qrPerPage}
              onChange={(e) => setQrPerPage(Number(e.target.value) as QRPerPage)}
            >
              {QR_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Estilo de diseño">
            <select
              className={inputClass}
              value={qrStyle}
              onChange={(e) => setQrStyle(e.target.value as QRStyle)}
            >
              {STYLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="rounded-2xl bg-ink/[0.03] p-3 text-xs text-ink/55">
          <p className="font-semibold">Estilo seleccionado:</p>
          <p className="mt-1">{STYLE_OPTIONS.find((s) => s.value === qrStyle)?.description}</p>
        </div>

        <label className="flex items-start gap-3 rounded-2xl bg-cream px-3 py-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={includeTableNumber}
            onChange={(e) => setIncludeTableNumber(e.target.checked)}
          />
          <span>
            <span className="block font-bold">Incluir número de mesa</span>
            <span className="block text-xs text-ink/45">
              Genera un QR para cada mesa con su número.
            </span>
          </span>
        </label>

        {includeTableNumber && (
          <Field label="¿Cuántas mesas tienes?">
            <input
              type="number"
              min="1"
              max="100"
              className={inputClass}
              value={tableCount}
              onChange={(e) => setTableCount(Number(e.target.value))}
              placeholder="6"
            />
            <p className="mt-1 text-xs text-ink/45">
              Se generarán QRs numerados: Mesa 1, Mesa 2, Mesa 3... hasta Mesa {tableCount}
            </p>
          </Field>
        )}

        <div className="rounded-2xl bg-ink/[0.03] p-4 text-sm">
          <p className="font-semibold">URL del código QR:</p>
          <p className="mt-1 font-mono text-xs text-ember">{menuUrl}</p>
          <p className="mt-2 text-xs text-ink/55">
            Los clientes escanearán este código para ver la carta digital y realizar pedidos.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => void generateQRCodes()}
            disabled={generating}
            className="flex items-center gap-2 rounded-xl bg-ember px-5 py-3 font-semibold text-white disabled:opacity-50"
          >
            <QrCode size={18} />
            {generating ? 'Generando...' : 'Generar códigos QR'}
          </button>

          {qrCodes.length > 0 && (
            <>
              <button
                onClick={() => void handleExportPDF()}
                disabled={exporting}
                className="flex items-center gap-2 rounded-xl bg-sage px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                <Download size={18} />
                {exporting ? 'Exportando...' : 'Descargar PDF'}
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 rounded-xl bg-ink px-5 py-3 font-semibold text-white"
              >
                <Printer size={18} />
                Imprimir
              </button>
            </>
          )}
        </div>
      </div>

      {/* Vista previa e impresión */}
      {qrCodes.length > 0 && (
        <div className="mt-6" ref={printAreaRef}>
          <div className="mb-4 flex items-center justify-between print:hidden">
            <h3 className="text-lg font-semibold">Vista previa</h3>
            <p className="text-sm text-ink/55">
              {qrCodes.length} {qrCodes.length === 1 ? 'código' : 'códigos'} generado{qrCodes.length === 1 ? '' : 's'}
            </p>
          </div>
          
          {/* Grid para vista previa en pantalla */}
          <div
            className={`grid gap-4 print:hidden ${
              selectedOption?.cols === 1
                ? 'grid-cols-1'
                : selectedOption?.cols === 2
                  ? 'grid-cols-2'
                  : selectedOption?.cols === 3
                    ? 'grid-cols-3'
                    : 'grid-cols-4'
            }`}
          >
            {qrCodes.map((qr, idx) => {
              const getCardStyle = () => {
                switch (qrStyle) {
                  case 'simple':
                    return 'card p-6 text-center'
                  case 'elegant':
                    return 'card border-2 border-[#1a3d1a] p-6 text-center shadow-lg'
                  case 'colorful':
                    return 'card bg-gradient-to-br from-[#FFF4E6] to-[#FFE8CC] border-2 border-[#E85D04] p-6 text-center shadow-xl'
                  default:
                    return 'card p-6 text-center'
                }
              }

              const getTitleStyle = () => {
                switch (qrStyle) {
                  case 'simple':
                    return 'font-display text-xl font-bold text-ink'
                  case 'elegant':
                    return 'font-display text-2xl font-bold text-[#1a3d1a]'
                  case 'colorful':
                    return 'font-display text-2xl font-bold text-[#E85D04]'
                  default:
                    return 'font-display text-2xl font-bold text-ember'
                }
              }

              return (
                <div key={idx} className={`flex flex-col items-center justify-center ${getCardStyle()}`}>
                  {qrStyle === 'elegant' && (
                    <div className="mb-3 text-4xl">🍗</div>
                  )}
                  {qrStyle === 'colorful' && (
                    <div className="mb-2 flex gap-2 text-3xl">
                      <span>🍗</span>
                      <span>🍜</span>
                      <span>🥘</span>
                    </div>
                  )}
                  <div className="mb-3 flex items-center justify-center">
                    <canvas
                      ref={(el) => {
                        if (el) {
                          canvasRefs.current[idx] = el
                        }
                      }}
                      style={{ display: 'block' }}
                    />
                  </div>
                  <h3 className={getTitleStyle()}>
                    Chifa Pollería Lopez
                  </h3>
                  {qr.table && (
                    <p className={`mt-2 text-lg font-bold ${qrStyle === 'colorful' ? 'text-[#E85D04]' : 'text-ink/70'}`}>
                      Mesa {qr.table}
                    </p>
                  )}
                  <p className={`mt-2 text-sm ${qrStyle === 'colorful' ? 'text-[#8B4513]' : 'text-ink/60'}`}>
                    Escanea para ver la carta
                  </p>
                  {qrStyle === 'elegant' && (
                    <div className="mt-3 text-xs text-ink/40">
                      {publicWebUrl().replace('https://', '')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Layout para impresión */}
          <div className="hidden print:block">
            {/* Agrupar QRs por página */}
            {Array.from({ length: Math.ceil(qrCodes.length / qrPerPage) }).map((_, pageIdx) => {
              const pageQRs = qrCodes.slice(pageIdx * qrPerPage, (pageIdx + 1) * qrPerPage)
              return (
                <div
                  key={pageIdx}
                  className="print-page grid h-screen w-full items-center gap-8 p-8"
                  style={{
                    gridTemplateColumns: `repeat(${selectedOption?.cols || 2}, 1fr)`,
                    pageBreakAfter: pageIdx < Math.ceil(qrCodes.length / qrPerPage) - 1 ? 'always' : 'auto',
                  }}
                >
                  {pageQRs.map((qr, idx) => {
                    const globalIdx = pageIdx * qrPerPage + idx
                    return (
                      <div
                        key={globalIdx}
                        className={`flex flex-col items-center justify-center p-6 text-center ${
                          qrStyle === 'simple'
                            ? 'border-2 border-dashed border-ink/20'
                            : qrStyle === 'elegant'
                              ? 'border-4 border-double border-[#1a3d1a] bg-[#f9fdf9]'
                              : 'border-4 border-[#E85D04] bg-gradient-to-br from-[#FFF4E6] to-[#FFE8CC]'
                        }`}
                      >
                        {qrStyle === 'elegant' && (
                          <div className="mb-4 text-5xl">🍗</div>
                        )}
                        {qrStyle === 'colorful' && (
                          <div className="mb-3 flex gap-3 text-4xl">
                            <span>🍗</span>
                            <span>🍜</span>
                            <span>🥘</span>
                          </div>
                        )}
                        <div className="mb-4 flex items-center justify-center">
                          <canvas
                            ref={(el) => {
                              if (el && !canvasRefs.current[globalIdx]) {
                                canvasRefs.current[globalIdx] = el
                              }
                            }}
                            style={{ display: 'block' }}
                          />
                        </div>
                        <h3
                          className={`font-display text-3xl font-bold ${
                            qrStyle === 'simple'
                              ? 'text-[#1a3d1a]'
                              : qrStyle === 'elegant'
                                ? 'text-[#1a3d1a]'
                                : 'text-[#E85D04]'
                          }`}
                        >
                          Chifa Pollería Lopez
                        </h3>
                        {qr.table && (
                          <p
                            className={`mt-3 text-2xl font-bold ${
                              qrStyle === 'colorful' ? 'text-[#E85D04]' : 'text-ink/70'
                            }`}
                          >
                            Mesa {qr.table}
                          </p>
                        )}
                        <p
                          className={`mt-3 text-lg ${
                            qrStyle === 'colorful' ? 'text-[#8B4513] font-semibold' : 'text-ink/60'
                          }`}
                        >
                          Escanea para ver la carta
                        </p>
                        {qrStyle === 'elegant' && (
                          <div className="mt-4 text-sm text-ink/40">
                            {publicWebUrl().replace('https://', '')}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
