import { MODES, getModeConfig, MODE_ORDER } from '../modes'
import type { GraphMode } from '@/features/graph/types'

describe('modes registry', () => {
  it('defines all four modes', () => {
    expect(Object.keys(MODES)).toEqual(
      expect.arrayContaining(['ask', 'explore', 'learn', 'create'])
    )
    expect(Object.keys(MODES)).toHaveLength(4)
  })

  it('MODE_ORDER lists all modes', () => {
    expect(MODE_ORDER).toHaveLength(4)
    for (const mode of MODE_ORDER) {
      expect(MODES[mode]).toBeDefined()
    }
  })

  it.each(Object.keys(MODES) as GraphMode[])('%s has required fields', (key) => {
    const mode = MODES[key]
    expect(mode.key).toBe(key)
    expect(mode.label).toBeTruthy()
    expect(mode.color).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(mode.colorVar).toMatch(/^--color-/)
    expect(mode.placeholder).toBeTruthy()
  })

  it.each(Object.keys(MODES) as GraphMode[])('%s layout has all required properties', (key) => {
    const layout = MODES[key].layout
    expect(typeof layout.autoShowPanels).toBe('boolean')
    expect(typeof layout.autoShowTimeline).toBe('boolean')
    expect(typeof layout.autoShowTable).toBe('boolean')
    expect(typeof layout.showTimeline).toBe('boolean')
    expect(typeof layout.showStatsBar).toBe('boolean')
    expect(typeof layout.showCanvasControls).toBe('boolean')
    expect(typeof layout.showLegends).toBe('boolean')
    expect(typeof layout.showDataTable).toBe('boolean')
    expect(layout.defaultPromptMode).toBeTruthy()
    expect(layout.availablePanels.length).toBeGreaterThan(0)
  })

  it('explore mode auto-shows panels', () => {
    expect(MODES.explore.layout.autoShowPanels).toBe(true)
    expect(MODES.explore.layout.defaultPromptMode).toBe('collapsed')
  })

  it('create mode defaults to maximized prompt', () => {
    expect(MODES.create.layout.defaultPromptMode).toBe('maximized')
  })

  it('ask and learn modes default to normal prompt', () => {
    expect(MODES.ask.layout.defaultPromptMode).toBe('normal')
    expect(MODES.learn.layout.defaultPromptMode).toBe('normal')
  })

  it('all modes share the same panel set including wiki', () => {
    const panels = MODES.ask.layout.availablePanels
    expect(panels).toContain('wiki')
    for (const key of Object.keys(MODES) as GraphMode[]) {
      expect(MODES[key].layout.availablePanels).toEqual(panels)
    }
  })

  it('learn mode has defaultPanel set to wiki', () => {
    expect(MODES.learn.layout.defaultPanel).toBe('wiki')
  })

  it('other modes do not have a defaultPanel', () => {
    expect(MODES.ask.layout.defaultPanel).toBeUndefined()
    expect(MODES.explore.layout.defaultPanel).toBeUndefined()
    expect(MODES.create.layout.defaultPanel).toBeUndefined()
  })
})

describe('getModeConfig', () => {
  it('returns config for a valid mode', () => {
    const config = getModeConfig('ask')
    expect(config.key).toBe('ask')
    expect(config.label).toBe('Ask')
  })
})
