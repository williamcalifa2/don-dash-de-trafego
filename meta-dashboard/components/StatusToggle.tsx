'use client'

import { Check, X } from 'lucide-react'

interface StatusToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}

export function StatusToggle({ checked, onChange, label, disabled = false }: StatusToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        userSelect: 'none',
      }}
    >
      {/* Pill Container */}
      <div
        style={{
          width: 58,
          height: 30,
          borderRadius: 15,
          background: checked ? '#22C55E' : 'var(--toggle-off-bg, #94A3B8)',
          boxShadow: checked
            ? 'inset 0 1px 3px rgba(0,0,0,0.2), 0 0 12px rgba(34, 197, 94, 0.4)'
            : 'inset 0 1px 3px rgba(0,0,0,0.2)',
          position: 'relative',
          transition: 'background 0.24s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.24s ease',
          flexShrink: 0,
        }}
      >
        {/* Knob */}
        <div
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 31 : 3,
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: '#FFFFFF',
            boxShadow: '0 2px 5px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'left 0.24s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {checked ? (
            <Check size={14} strokeWidth={3.2} color="#16A34A" />
          ) : (
            <X size={14} strokeWidth={3.2} color="#64748B" />
          )}
        </div>
      </div>

      {label && (
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: checked ? 'var(--green)' : 'var(--text-3)',
            transition: 'color 0.2s',
          }}
        >
          {label}
        </span>
      )}
    </button>
  )
}

