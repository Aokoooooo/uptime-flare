import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8')
const latencyChart = readFileSync(new URL('./latency-chart.tsx', import.meta.url), 'utf8')

function cssRule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`))?.groups?.body ?? ''
}

describe('monitor detail layout', () => {
  test('keeps latency chart axis labels visible inside monitor cards', () => {
    expect(cssRule('.chart')).toContain('overflow: visible')
    expect(cssRule('.chart')).not.toContain('padding-left:')
    expect(latencyChart).toContain('size: 64')
    expect(latencyChart).not.toContain('horizontalPadding')
  })

  test('separates incident modal content from actions', () => {
    expect(cssRule('.modal-body')).toContain('margin-bottom:')
    expect(cssRule('.modal-actions')).toContain('display: flex')
  })
})
