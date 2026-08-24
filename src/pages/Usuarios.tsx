import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useStore } from '../store/StoreContext'
import { uid } from '../lib/format'
import { ROLE_LABEL, type Role, type User } from '../types'
import { Field, Modal, PageTitle, RoleBadge, inputClass } from '../components/ui'

const ROLES: Role[] = ['admin', 'cajero', 'cocina', 'mozo']

export function Usuarios() {
  const { state, saveUser, deleteUser } = useStore()
  const { user: me } = useAuth()
  const [editing, setEditing] = useState<User | null>(null)

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
        {state.users.map((u) => (
          <article key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
            <div>
              <p className="font-semibold">{u.name}</p>
              <p className="text-sm text-ink/45">{u.email}</p>
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
              saveUser(editing)
              setEditing(null)
            }}
          >
            <Field label="Nombre">
              <input className={inputClass} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
            </Field>
            <Field label="Correo">
              <input className={inputClass} type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} required />
            </Field>
            <Field label="Contraseña">
              <input className={inputClass} value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} />
            </Field>
            <Field label="Rol">
              <select className={inputClass} value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value as Role })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="PIN">
              <input className={inputClass} value={editing.pin} onChange={(e) => setEditing({ ...editing, pin: e.target.value })} />
            </Field>
            <button className="w-full rounded-xl bg-ember py-3 font-semibold text-white">Guardar</button>
          </form>
        ) : null}
      </Modal>
    </div>
  )
}
