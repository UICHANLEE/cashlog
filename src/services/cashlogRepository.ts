import {
  type Expense,
  type ExpenseSource,
  type LedgerCategoryId,
  type LedgerKind,
} from '../domain/cashlog'
import { normalizePetState, type PetState } from '../domain/pet'
import type { CashlogSession } from './auth'
import type { SupabaseConfig } from './supabaseConfig'

type CashlogEntryRow = {
  id: string
  user_id?: string
  date_time: string
  amount: number
  kind: LedgerKind
  category: LedgerCategoryId
  title: string
  memo: string
  source: ExpenseSource
  image_url?: string | null
  video_url?: string | null
  analysis?: Expense['analysis'] | null
  created_at: string
  updated_at: string
}

type PetProfileRow = {
  user_id?: string
  pet_state: Partial<PetState>
  updated_at: string
}

const entriesTableName = 'cashlog_entries'
const petProfilesTableName = 'cashlog_pet_profiles'

const headers = (config: SupabaseConfig, session: CashlogSession) => ({
  apikey: config.anonKey,
  Authorization: `Bearer ${session.accessToken}`,
  'Content-Type': 'application/json',
})

const expenseToRow = (expense: Expense, userId?: string): CashlogEntryRow => ({
  id: expense.id,
  ...(userId ? { user_id: userId } : {}),
  date_time: expense.dateTime,
  amount: expense.amount,
  kind: expense.kind,
  category: expense.category,
  title: expense.title,
  memo: expense.memo,
  source: expense.source,
  image_url: expense.imageUrl ?? null,
  video_url: expense.videoUrl ?? null,
  analysis: expense.analysis ?? null,
  created_at: expense.createdAt,
  updated_at: expense.updatedAt,
})

const rowToExpense = (row: CashlogEntryRow): Expense => ({
  id: row.id,
  dateTime: row.date_time,
  amount: row.amount,
  kind: row.kind,
  category: row.category,
  title: row.title,
  memo: row.memo,
  source: row.source,
  ...(row.image_url ? { imageUrl: row.image_url } : {}),
  ...(row.video_url ? { videoUrl: row.video_url } : {}),
  ...(row.analysis ? { analysis: row.analysis } : {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const mergeExpenses = (local: Expense[], remote: Expense[]): Expense[] => {
  const byId = new Map<string, Expense>()
  for (const item of local) byId.set(item.id, item)
  for (const item of remote) {
    const previous = byId.get(item.id)
    if (!previous || item.updatedAt.localeCompare(previous.updatedAt) >= 0) {
      byId.set(item.id, item)
    }
  }
  return [...byId.values()].sort((a, b) => b.dateTime.localeCompare(a.dateTime))
}

export const createCashlogRepository = (
  config: SupabaseConfig | null,
  session: CashlogSession | null,
) => {
  if (!config || !session) return null

  const entriesBase = `${config.url}/rest/v1/${entriesTableName}`
  const petProfilesBase = `${config.url}/rest/v1/${petProfilesTableName}`
  const userId = session.user?.id

  const listExpenses = async (): Promise<Expense[]> => {
    const response = await fetch(`${entriesBase}?select=*&order=date_time.desc`, {
      headers: headers(config, session),
    })
    if (!response.ok) throw new Error(await response.text())
    const rows = (await response.json()) as CashlogEntryRow[]
    return rows.map(rowToExpense)
  }

  const upsertExpenses = async (expenses: Expense[]) => {
    if (expenses.length === 0) return
    const response = await fetch(`${entriesBase}?on_conflict=id`, {
      method: 'POST',
      headers: {
        ...headers(config, session),
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(expenses.map((expense) => expenseToRow(expense, userId))),
    })
    if (!response.ok) throw new Error(await response.text())
  }

  const upsertExpense = async (expense: Expense) => upsertExpenses([expense])

  const getPetState = async (): Promise<PetState | null> => {
    const response = await fetch(`${petProfilesBase}?select=pet_state,updated_at&limit=1`, {
      headers: headers(config, session),
    })
    if (!response.ok) throw new Error(await response.text())
    const rows = (await response.json()) as PetProfileRow[]
    const row = rows[0]
    return row?.pet_state ? normalizePetState(row.pet_state) : null
  }

  const upsertPetState = async (petState: PetState) => {
    const response = await fetch(`${petProfilesBase}?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        ...headers(config, session),
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        ...(userId ? { user_id: userId } : {}),
        pet_state: petState,
        updated_at: new Date().toISOString(),
      }),
    })
    if (!response.ok) throw new Error(await response.text())
  }

  return { listExpenses, upsertExpense, upsertExpenses, getPetState, upsertPetState }
}
