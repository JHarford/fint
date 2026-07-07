import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { emit, subscribe } from '@/lib/data-bus'
import type { CalPalSettings } from '@/types'

// Sensible starting point until the user saves their own numbers
export const DEFAULT_SETTINGS: CalPalSettings = {
  id: 1, weight_kg: 80, height_cm: 178, sex: 'male', age: 35,
  activity: 1.4, adjustment: 0, protein_per_kg: 1.6, updated_at: '',
}

export function useCalPalSettings() {
  const [settings, setSettings] = useState<CalPalSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false) // false until a row exists in the DB
  const [loading, setLoading] = useState(true)
  const initialLoad = useRef(true)

  const fetch = useCallback(async () => {
    if (initialLoad.current) setLoading(true)
    const { data, error } = await supabase
      .from('calpal_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
    if (error) console.error('Error fetching Cal Pal settings:', error)
    else if (data) {
      setSettings(data)
      setSaved(true)
    }
    if (initialLoad.current) {
      setLoading(false)
      initialLoad.current = false
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => subscribe('calpal_settings', fetch), [fetch])

  const save = async (updates: Partial<Omit<CalPalSettings, 'id' | 'updated_at'>>) => {
    const next = { ...settings, ...updates }
    setSettings(next)
    const { error } = await supabase.from('calpal_settings').upsert({
      id: 1,
      weight_kg: next.weight_kg,
      height_cm: next.height_cm,
      sex: next.sex,
      age: next.age,
      activity: next.activity,
      adjustment: next.adjustment,
      protein_per_kg: next.protein_per_kg,
      updated_at: new Date().toISOString(),
    })
    if (error) {
      await fetch()
      throw error
    }
    setSaved(true)
    emit('calpal_settings')
  }

  return { settings, saved, loading, save }
}
