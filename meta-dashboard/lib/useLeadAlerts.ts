'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lead } from './leadTypes'
import { selfCreated } from './manualLeads'

const STORAGE_KEY = 'lead_alerts'
let audioCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    audioCtx ??= new Ctor()
    return audioCtx
  } catch { return null }
}

function chime() {
  const ctx = getCtx()
  if (!ctx || ctx.state === 'suspended') { ctx?.resume().catch(() => {}); if (ctx?.state !== 'running') return }
  const t0 = ctx.currentTime
  ;[[880, 0], [1320, 0.16]].forEach(([freq, delay]) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t0 + delay)
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + delay + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.5)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0 + delay)
    osc.stop(t0 + delay + 0.55)
  })
}

export function useLeadAlerts(leads: Lead[], loaded: boolean) {
  const [enabled, setEnabled] = useState(false)
  const [toast, setToast] = useState<{ lead: Lead; extra: number } | null>(null)
  const seen = useRef<Set<string> | null>(null)
  const enabledRef = useRef(false)
  useEffect(() => { enabledRef.current = enabled })

  useEffect(() => {
    try { setEnabled(localStorage.getItem(STORAGE_KEY) === '1') } catch {}
    const unlock = () => { getCtx()?.resume().catch(() => {}) }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  useEffect(() => {
    if (!loaded) return
    if (seen.current === null) { seen.current = new Set(leads.map(l => l.id)); return }
    const fresh = leads.filter(l => !seen.current!.has(l.id))
    if (!fresh.length) return
    fresh.forEach(l => seen.current!.add(l.id))
    const incoming = fresh.filter(l => !selfCreated.has(l.id)) // quem cadastrou à mão não precisa de aviso
    if (!incoming.length) return
    const newest = incoming[0]
    setToast({ lead: newest, extra: incoming.length - 1 })
    if (enabledRef.current) {
      chime()
      try {
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('Novo lead', { body: [newest.nome ?? 'Sem nome', newest.campanha].filter(Boolean).join(' · ') })
        }
      } catch {}
    }
  }, [leads, loaded])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 12_000)
    return () => clearTimeout(id)
  }, [toast])

  const toggle = useCallback(async () => {
    const next = !enabledRef.current
    setEnabled(next)
    try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch {}
    if (next) {
      chime()
      try {
        if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission()
      } catch {}
    }
  }, [])

  return { enabled, toggle, toast, dismiss: () => setToast(null) }
}
