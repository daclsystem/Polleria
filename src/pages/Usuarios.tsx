import { useRef, useState } from 'react'
import { useStore } from '../store/StoreContext'
import { uid } from '../lib/format'
import { ROLE_LABEL, type Role, type User } from '../types'
import { Field, Modal, PageTitle, RoleBadge, inputClass } from '../components/ui'
import { ConfirmProcess } from '../components/ConfirmProcess'
import { realPhotoUrl, shortAccountId } from '../lib/avatar'
import { PersonAvatar } from '../components/PersonAvatar'
import { uploadAvatar } from '../lib/minio'

const ROLES: Role[] = ['admin', 'cajero', 'cocina', 'mozo']

export function Usuarios() {
  const { state, saveUser } = useStore()
  const [editing, setEditing] = useState<User | null>(null)
  const [dlg, setDlg] = useState<'confirm' | 'busy' | 'done' | null>(null)

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="Usuarios y roles" hint="Admin, cajero, cocina y mozo ven módulos distintos." />
        <button
          className="rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-white"
          onClick={() =>
            setEditing({
              id: uid('u'),
              name: '',
              email: '',
              password: '123456',
              role: 'mozo',
              active: true,
              pin: '5555',
            })
          }
        >
          Nuevo usuario
        </button>
      </div>
      <div className="mt-6 grid gap-3">
        {state.users
          .filter((u) => !u.isSystem)
          .map((u) => (
          <article key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <PersonAvatar
                name={u.name}
                photoUrl={u.photoUrl}
                tone="staff"
                className="h-12 w-12 text-sm ring-1 ring-ink/10"
              />
              <div>
                <p className="font-semibold">{u.name}</p>
                <p className="text-sm text-ink/45">{u.email}</p>
                {u.dni ? <p className="text-xs text-ink/40">DNI {u.dni}{u.phone ? ` · ${u.phone}` : ''}</p> : null}
                <p className="font-mono text-[10px] tracking-wider text-ink/35">ID · {shortAccountId(u.id)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <RoleBadge role={u.role} />
              <button
                onClick={() => saveUser({ ...u, active: !u.active })}
                className={`text-xs font-semibold ${u.active ? 'text-sage' : 'text-brick'}`}
              >
                {u.active ? 'Activo' : 'Inactivo'}
              </button>
              <button className="text-sm text-ember" onClick={() => setEditing(u)}>
                Editar
              </button>
            </div>
          </article>
        ))}
      </div>
      <Modal open={!!editing} title="Usuario" onClose={() => setEditing(null)}>
        {editing ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              setDlg('confirm')
            }}
          >
            <StaffPhotoField editing={editing} setEditing={setEditing} />
            <Field label="Nombre">
              <input
                className={inputClass}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Correo">
              <input
                className={inputClass}
                type="email"
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="DNI">
                <input
                  className={inputClass}
                  value={editing.dni || ''}
                  onChange={(e) => setEditing({ ...editing, dni: e.target.value })}
                  placeholder="12345678"
                />
              </Field>
              <Field label="Teléfono">
                <input
                  className={inputClass}
                  value={editing.phone || ''}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  placeholder="999999999"
                />
              </Field>
            </div>
            <Field label="Rol">
              <select
                className={inputClass}
                value={editing.role}
                onChange={(e) => setEditing({ ...editing, role: e.target.value as Role })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </Field>
            <button className="w-full rounded-xl bg-ember py-3 font-semibold text-white">Guardar</button>
          </form>
        ) : null}
      </Modal>
      <ConfirmProcess
        open={!!dlg}
        phase={dlg === 'done' ? 'done' : dlg === 'busy' ? 'busy' : 'confirm'}
        title="¿Guardar usuario?"
        message={<p>Se actualizan nombre, rol y datos de acceso.</p>}
        confirmLabel="Sí, guardar"
        doneTitle="Usuario procesado"
        doneMessage="El usuario quedó guardado."
        onConfirm={() => {
          if (!editing) return
          setDlg('busy')
          void saveUser({ ...editing, photoUrl: realPhotoUrl(editing.photoUrl) })
            .then(() => setDlg('done'))
            .catch((err) => {
              setDlg('confirm')
              alert((err as Error).message || 'No se pudo guardar el usuario')
            })
        }}
        onCancel={() => setDlg(null)}
        onDone={() => {
          setDlg(null)
          setEditing(null)
        }}
      />
    </div>
  )
}

function StaffPhotoField({
  editing,
  setEditing,
}: {
  editing: User
  setEditing: (u: User) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-cream px-3 py-3">
      <button type="button" onClick={() => ref.current?.click()} className="shrink-0" disabled={busy}>
        <PersonAvatar
          name={editing.name || 'Usuario'}
          photoUrl={editing.photoUrl}
          tone="staff"
          className="h-14 w-14 text-base"
        />
      </button>
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{busy ? 'Subiendo foto…' : 'Foto del usuario'}</p>
        <p className="text-xs text-ink/45">Toca para subir a MinIO. Sin foto se muestran iniciales.</p>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setBusy(true)
          void uploadAvatar(file)
            .then((url) => setEditing({ ...editing, photoUrl: url }))
            .catch((err) => alert((err as Error).message || 'No se pudo subir la foto'))
            .finally(() => setBusy(false))
        }}
      />
    </div>
  )
}
