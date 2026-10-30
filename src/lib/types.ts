export interface Entry {
  id: string
  user_id: string
  amount_ml: number
  consumed_at: string
  created_at?: string
  updated_at?: string
  /** True while the write is queued locally and not yet confirmed by Supabase. */
  pending?: boolean
}

export interface Settings {
  user_id: string
  display_name: string
  daily_goal_ml: number
  quick_adds: number[]
  timezone: string
  reminder_enabled: boolean
  reminder_start: string
  reminder_end: string
  reminder_interval_minutes: number
  suppression_minutes: number
  updated_at?: string
}

export const DEFAULT_SETTINGS: Omit<Settings, 'user_id'> = {
  display_name: 'Laura',
  daily_goal_ml: 2000,
  quick_adds: [150, 250, 500],
  timezone: 'Europe/Dublin',
  reminder_enabled: false,
  reminder_start: '09:00:00',
  reminder_end: '21:00:00',
  reminder_interval_minutes: 120,
  suppression_minutes: 60,
}
