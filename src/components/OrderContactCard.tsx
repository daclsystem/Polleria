import { Bike, MessageCircle } from 'lucide-react'
import { splitVehicle, whatsappHref } from '../lib/vehicle'

export function OrderContactCard({
  localWhatsapp,
  driverName,
  driverPhone,
  driverPhotoUrl,
  driverVehicle,
  driverPlate,
  orderNumber,
}: {
  localWhatsapp?: string
  driverName?: string
  driverPhone?: string
  driverPhotoUrl?: string
  driverVehicle?: string
  driverPlate?: string
  orderNumber?: number | string
}) {
  const veh = splitVehicle(driverVehicle, driverPlate)
  const pedido = orderNumber ? `pedido #${orderNumber}` : 'un pedido'
  const localHref = whatsappHref(localWhatsapp, `Hola, soy cliente de Chifa-Pollería Lopez. Consulta sobre ${pedido}.`)
  const drvHref = whatsappHref(
    driverPhone,
    `Hola ${driverName || ''}, soy el cliente de Chifa-Pollería Lopez (${pedido}).`,
  )

  return (
    <div className="space-y-2">
      {driverName ? (
        <div className="flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-ink/10">
          <img
            src={
              driverPhotoUrl ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(driverName)}&background=0f766e&color=ffffff&size=128&bold=true`
            }
            alt=""
            className="h-14 w-14 rounded-full object-cover ring-2 ring-ink/10"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold tracking-wide text-ink/40 uppercase">Repartidor</p>
            <p className="truncate font-bold">{driverName}</p>
            <p className="flex items-center gap-1 text-xs text-ink/55">
              <Bike size={12} />
              {veh.vehicle}
              {veh.plate ? ` · Placa ${veh.plate}` : ''}
            </p>
          </div>
          {drvHref ? (
            <a
              href={drvHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-[#25d366] px-3 text-xs font-bold text-white"
            >
              <MessageCircle size={14} /> WSP
            </a>
          ) : null}
        </div>
      ) : null}
      {localHref ? (
        <a
          href={localHref}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#1a3d1a] px-3 text-sm font-bold text-white"
        >
          <MessageCircle size={16} /> WhatsApp del local
        </a>
      ) : null}
    </div>
  )
}
