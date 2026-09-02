import type { Role, Table, User } from '../types'

/** Admin / sistema ve todos los locales. El resto, solo el asignado. */
export function workingBranchId(
  user: User | null | undefined,
  actingRole: Role,
): string | undefined {
  if (!user) return undefined
  if (user.isSystem || actingRole === 'admin') return undefined
  return user.branchId
}

export function tablesForStaff(
  tables: Table[],
  user: User | null | undefined,
  actingRole: Role,
): Table[] {
  const bid = workingBranchId(user, actingRole)
  if (!bid) return tables
  return tables.filter((t) => !t.branchId || t.branchId === bid)
}

export function orderInStaffBranch(
  order: { tableId?: string; branchId?: string },
  tables: Table[],
  user: User | null | undefined,
  actingRole: Role,
): boolean {
  const bid = workingBranchId(user, actingRole)
  if (!bid) return true
  if (order.branchId) return order.branchId === bid
  if (order.tableId) {
    const t = tables.find((x) => x.id === order.tableId)
    if (t?.branchId) return t.branchId === bid
  }
  return true
}

export function branchNameOf(
  branches: { id: string; name: string }[],
  id?: string,
): string {
  if (!id) return ''
  return branches.find((b) => b.id === id)?.name || ''
}
