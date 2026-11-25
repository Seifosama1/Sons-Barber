import { useState, useRef } from 'react'
import '../styles/phoneInput.css'

/*
  Egyptian phone number UX:
  - Prefix is always +20 (shown as flag + code, non-editable)
  - User types the local number starting with 01x
  - Auto-formats as: 0100 000 0000
  - Validates: must be 11 digits starting with 010, 011, 012, or 015
*/

const EG_OPERATORS = { '010': 'Vodafone', '011': 'Etisalat', '012': 'Orange', '015': 'WE' }

function formatEgyptian(raw) {
  // Keep only digits
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  if (digits.length === 0) return ''
  if (digits.length <= 4) return digits
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
}

function getOperator(digits) {
  const prefix = digits.slice(0, 3)
  return EG_OPERATORS[prefix] || null
}

function isValid(digits) {
  return digits.length === 11 && /^01[0125]/.test(digits)
}

export default function PhoneInput({ value, onChange }) {
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)

  const rawDigits = value.replace(/\D/g, '')
  const formatted = formatEgyptian(rawDigits)
  const operator = getOperator(rawDigits)
  const valid = isValid(rawDigits)
  const hasValue = rawDigits.length > 0
  const invalid = hasValue && rawDigits.length === 11 && !valid

  function handleChange(e) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 11)
    onChange(digits)
  }

  return (
    <div className={`phone-field ${focused ? 'focused' : ''} ${valid ? 'valid' : ''} ${invalid ? 'invalid' : ''}`}>
      {/* Country prefix badge */}
      <div className="phone-prefix">
        <span className="flag">🇪🇬</span>
        <span className="country-code">+20</span>
        <span className="prefix-divider" />
      </div>

      <input
        ref={inputRef}
        className="phone-input-field"
        type="tel"
        inputMode="numeric"
        placeholder="0100 000 0000"
        value={formatted}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete="tel"
        dir="ltr"
      />

      {/* Operator badge */}
      {operator && rawDigits.length >= 3 && (
        <span className="operator-badge">{operator}</span>
      )}

      {/* Status icon */}
      {hasValue && (
        <span className={`phone-status-icon ${valid ? 'ok' : rawDigits.length === 11 ? 'err' : 'typing'}`}>
          {valid ? '✓' : rawDigits.length === 11 ? '✗' : ''}
        </span>
      )}
    </div>
  )
}
