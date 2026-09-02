import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useStore } from '../store/StoreContext'
import { uid } from '../lib/format'
import { ROLE_LABEL, type Role, type User } from '../types'
import { Field, Modal, PageTitle, RoleBadge, inputClass } from '../components/ui'
import { ConfirmProcess } from '../components/ConfirmProcess'
import { defaultAvatarUrl, shortAccountId } from '../lib/avatar'

const ROLES: Role[] = ['admin', 'cajero', 'cocina', 'mozo']

export function Usuarios() {
  const { state, saveUser, deleteUser } = useStore()
  const { user: me } = useAuth()
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
              photoUrl: defaultAvatarUrl('Mozo', 'staff'),
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
              <img
                src={u.photoUrl || defaultAvatarUrl(u.name, 'staff')}
                alt={u.name}
                className="h-12 w-12 rounded-full object-cover ring-1 ring-ink/10"
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
              {u.id !== me?.id ? (
                <button className="text-sm text-brick" onClick={() => deleteUser(u.id)}>
                  Eliminar
                </button>
              ) : null}
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
            <div className="flex items-center gap-3 rounded-2xl bg-cream px-3 py-3">
              <img
                src={editing.photoUrl || defaultAvatarUrl(editing.name || 'Usuario', 'staff')}
                alt=""
                className="h-14 w-14 rounded-full object-cover"
              />
              <p className="text-xs text-ink/45">Vista previa de la foto de sesión</p>
            </div>
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
            <Field label="Contraseña">
              <input
                className={inputClass}
                value={editing.password}
                onChange={(e) => setEditing({ ...editing, password: e.target.value })}
              />
            </Field>
            <Field label="URL foto (opcional)">
              <input
                className={inputClass}
                value={editing.photoUrl || ''}
                onChange={(e) => setEditing({ ...editing, photoUrl: e.target.value })}
                placeholder="https://..."
              />
            </Field>
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
            <Field label="PIN">
              <input
                className={inputClass}
                value={editing.pin}
                onChange={(e) => setEditing({ ...editing, pin: e.target.value })}
              />
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
          const photoUrl = editing.photoUrl || defaultAvatarUrl(editing.name || 'Usuario', 'staff')
          void saveUser({ ...editing, photoUrl })
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
