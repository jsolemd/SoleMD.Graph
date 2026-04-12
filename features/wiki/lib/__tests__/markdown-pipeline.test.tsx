/**
 * @jest-environment jsdom
 */
import type { ComponentType, ReactNode } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

jest.mock('remark-gfm', () => jest.fn())
jest.mock('rehype-slug', () => jest.fn())
jest.mock('react-markdown', () => ({
  defaultUrlTransform: (url: string) => url,
}))

import {
  createWikiComponentMap,
  type AnimationEmbedProps,
  type CalloutProps,
  type EntityMentionProps,
  type PaperCitationProps,
  type WikiLinkProps,
} from '../markdown-pipeline'

function WikiLink({ slug, children, onNavigate }: WikiLinkProps) {
  return (
    <button type="button" onClick={() => onNavigate(slug)}>
      {children}
    </button>
  )
}

function PaperCitation({ children }: PaperCitationProps) {
  return <span>{children}</span>
}

function Callout({ children }: CalloutProps) {
  return <div>{children}</div>
}

function AnimationEmbed({ name }: AnimationEmbedProps) {
  return <div data-animation={name}>{name}</div>
}

function EntityMention({ children }: EntityMentionProps) {
  return <span>{children}</span>
}

describe('createWikiComponentMap', () => {
  const onNavigate = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  function renderLink(href: string) {
    const components = createWikiComponentMap(
      {
        resolvedLinks: { serotonin: 'entities/serotonin' },
        paperGraphRefs: {},
        linkedEntities: {},
        bodyEntityMatches: [],
      },
      { onNavigate },
      { WikiLink, PaperCitation, Callout, AnimationEmbed, EntityMention },
    )
    const Link = components.a as ComponentType<{ href?: string; children?: ReactNode }>
    render(<Link href={href}>Serotonin</Link>)
  }

  it('routes wiki scheme links through in-panel navigation', () => {
    renderLink('wiki:entities/serotonin')
    fireEvent.click(screen.getByRole('button', { name: 'Serotonin' }))
    expect(onNavigate).toHaveBeenCalledWith('entities/serotonin')
  })

  it('routes known relative wiki slugs through in-panel navigation', () => {
    renderLink('entities/serotonin')
    fireEvent.click(screen.getByRole('button', { name: 'Serotonin' }))
    expect(onNavigate).toHaveBeenCalledWith('entities/serotonin')
  })

  it('routes /wiki/ public-path hrefs through in-panel navigation', () => {
    renderLink('/wiki/entities/serotonin')
    fireEvent.click(screen.getByRole('button', { name: 'Serotonin' }))
    expect(onNavigate).toHaveBeenCalledWith('entities/serotonin')
  })

  it('opens external http links as anchors in a new tab', () => {
    renderLink('https://example.com')
    expect(screen.getByRole('link', { name: 'Serotonin' })).toHaveAttribute('target', '_blank')
  })
})
