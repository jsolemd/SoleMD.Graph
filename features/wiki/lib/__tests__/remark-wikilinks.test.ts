/**
 * Unit tests for wiki link preprocessing.
 *
 * Tests the preprocessWikilinks function which converts [[target]]
 * wikilinks in raw markdown to standard markdown links before parsing.
 */
import { preprocessWikilinks } from '../remark-wikilinks'

describe('preprocessWikilinks', () => {
  it('converts resolved [[target]] to a standard markdown link', () => {
    const result = preprocessWikilinks(
      'see [[serotonin]] here',
      { serotonin: 'entities/serotonin' },
    )
    expect(result).toBe('see [serotonin](wiki:entities/serotonin) here')
  })

  it('handles display alias [[target|alias]]', () => {
    const result = preprocessWikilinks(
      'see [[serotonin|5-HT]]',
      { serotonin: 'entities/serotonin' },
    )
    expect(result).toBe('see [5-HT](wiki:entities/serotonin)')
  })

  it('handles multiple wikilinks in one line', () => {
    const result = preprocessWikilinks(
      '[[alpha]] and [[beta]]',
      { alpha: 'entities/alpha', beta: 'entities/beta' },
    )
    expect(result).toBe('[alpha](wiki:entities/alpha) and [beta](wiki:entities/beta)')
  })

  it('ignores [[pmid:NNN]] citations', () => {
    const result = preprocessWikilinks(
      '[[pmid:12345]] and [[serotonin]]',
      { serotonin: 'entities/serotonin' },
    )
    expect(result).toBe('[[pmid:12345]] and [serotonin](wiki:entities/serotonin)')
  })

  it('preserves surrounding text', () => {
    const result = preprocessWikilinks(
      'before [[link]] after',
      { link: 'entities/link' },
    )
    expect(result).toBe('before [link](wiki:entities/link) after')
  })

  it('renders unresolved [[target]] as plain text', () => {
    const result = preprocessWikilinks(
      'see [[nonexistent]] here',
      {},
    )
    expect(result).toBe('see nonexistent here')
  })

  it('renders mixed resolved and unresolved wikilinks correctly', () => {
    const result = preprocessWikilinks(
      '[[known]] and [[unknown]]',
      { known: 'entities/known' },
    )
    expect(result).toBe('[known](wiki:entities/known) and unknown')
  })

  it('with empty resolvedLinks, all wikilinks become plain text', () => {
    const result = preprocessWikilinks('[[alpha]] and [[beta]]', {})
    expect(result).toBe('alpha and beta')
  })

  it('normalizes case and spaces for lookup', () => {
    const result = preprocessWikilinks(
      '[[Circadian Rhythm]]',
      { 'circadian-rhythm': 'entities/circadian-rhythm' },
    )
    expect(result).toBe('[Circadian Rhythm](wiki:entities/circadian-rhythm)')
  })

  it('handles wikilinks across multiple lines', () => {
    const result = preprocessWikilinks(
      'line one [[alpha]]\nline two [[beta]]',
      { alpha: 'entities/alpha', beta: 'entities/beta' },
    )
    expect(result).toBe(
      'line one [alpha](wiki:entities/alpha)\nline two [beta](wiki:entities/beta)',
    )
  })
})
