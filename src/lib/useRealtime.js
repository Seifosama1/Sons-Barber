import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

/**
 * useRealtime — subscribe to live Supabase table changes.
 *
 * Usage:
 *   useRealtime('appointments', { filter: `barber_id=eq.${id}` }, (payload) => {
 *     // payload.eventType: 'INSERT' | 'UPDATE' | 'DELETE'
 *     // payload.new: new row data
 *     // payload.old: old row data (UPDATE/DELETE)
 *     refetch()
 *   })
 *
 * @param {string}   table     — Supabase table name
 * @param {object}   options   — { filter, schema }  (all optional)
 * @param {function} callback  — called on every change
 */
export function useRealtime(table, options = {}, callback) {
  const cbRef = useRef(callback)
  cbRef.current = callback // always use latest callback without re-subscribing

  useEffect(() => {
    const channelName = `rt-${table}-${Math.random().toString(36).slice(2)}`
    const schema = options.schema || 'public'

    let config = {
      event: '*',
      schema,
      table,
    }
    if (options.filter) config.filter = options.filter

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', config, (payload) => {
        cbRef.current(payload)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, options.filter, options.schema])
}

/**
 * useRealtimeList — manages a live list that stays in sync automatically.
 *
 * Usage:
 *   const [items, setItems] = useRealtimeList('appointments', initialData, {
 *     filter: `barber_id=eq.${id}`,
 *     idKey: 'id'
 *   })
 *
 * Returns a setState fn so you can still set the initial data from a fetch.
 */
export function useRealtimeList(table, options = {}) {
  const idKey = options.idKey || 'id'

  function reducer(list, payload) {
    const { eventType, new: newRow, old: oldRow } = payload

    if (eventType === 'INSERT') {
      // avoid duplicates
      if (list.find(r => r[idKey] === newRow[idKey])) return list
      return [newRow, ...list]
    }

    if (eventType === 'UPDATE') {
      return list.map(r => r[idKey] === newRow[idKey] ? { ...r, ...newRow } : r)
    }

    if (eventType === 'DELETE') {
      return list.filter(r => r[idKey] !== oldRow[idKey])
    }

    return list
  }

  return reducer
}
