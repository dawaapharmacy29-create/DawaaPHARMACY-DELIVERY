import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import TripsEnhanced from './TripsEnhanced'

type SummaryPreset = {
  statusLabel: string
  proofLabel: string
  ariaLabel: string
}

const SUMMARY_PRESETS: Record<string, SummaryPreset> = {
  'كل المشاوير': { statusLabel: 'كل الحالات', proofLabel: 'كل الإثباتات', ariaLabel: 'عرض كل المشاوير' },
  'بصورة': { statusLabel: 'كل الحالات', proofLabel: 'بصورة', ariaLabel: 'عرض المشاوير التي تحتوي على صورة' },
  'بدون صورة': { statusLabel: 'كل الحالات', proofLabel: 'بدون صورة', ariaLabel: 'عرض المشاوير التي لا تحتوي على صورة' },
  'مستني اعتماد': { statusLabel: 'مستني اعتماد', proofLabel: 'كل الإثباتات', ariaLabel: 'عرض المشاوير المستنية اعتماد' },
  'معتمد': { statusLabel: 'معتمد', proofLabel: 'كل الإثباتات', ariaLabel: 'عرض المشاوير المعتمدة' },
  'مرفوض': { statusLabel: 'مرفوض', proofLabel: 'كل الإثباتات', ariaLabel: 'عرض المشاوير المرفوضة' },
}

function normalizedText(element: Element | null) {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim()
}

function findButton(root: HTMLElement, label: string) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(button =>
    normalizedText(button).startsWith(label),
  )
}

export default function TripsHeaderClickable() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    let attachedHeader: HTMLElement | null = null
    let attachedCards: HTMLElement[] = []
    const cardCleanups = new Map<HTMLElement, () => void>()

    const goBack = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      navigate('/admin')
    }

    const onHeaderKeyDown = (event: Event) => {
      const keyboardEvent = event as KeyboardEvent
      if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') goBack(event)
    }

    const setActiveCard = (activeCard: HTMLElement) => {
      attachedCards.forEach(card => {
        const active = card === activeCard
        card.setAttribute('aria-pressed', String(active))
        card.classList.toggle('ring-2', active)
        card.classList.toggle('ring-[#008E92]', active)
        card.classList.toggle('shadow-md', active)
      })
    }

    const attachHeader = () => {
      const header = root.querySelector<HTMLElement>('header')
      if (!header || header === attachedHeader) return

      if (attachedHeader) {
        attachedHeader.removeEventListener('click', goBack, true)
        attachedHeader.removeEventListener('pointerup', goBack, true)
        attachedHeader.removeEventListener('keydown', onHeaderKeyDown, true)
      }

      attachedHeader = header
      header.setAttribute('role', 'button')
      header.setAttribute('tabindex', '0')
      header.setAttribute('aria-label', 'الرجوع إلى لوحة الإدارة')
      header.classList.add('cursor-pointer')
      header.addEventListener('click', goBack, true)
      header.addEventListener('pointerup', goBack, true)
      header.addEventListener('keydown', onHeaderKeyDown, true)
    }

    const attachSummaryCards = () => {
      const summarySection = root.querySelector<HTMLElement>('main > section:first-of-type')
      if (!summarySection) return

      const cards = Array.from(summarySection.children).filter((element): element is HTMLElement => element instanceof HTMLElement)
      attachedCards = cards

      cards.forEach(card => {
        if (cardCleanups.has(card)) return

        const label = normalizedText(card.querySelector('p'))
        const preset = SUMMARY_PRESETS[label]
        if (!preset) return

        card.setAttribute('role', 'button')
        card.setAttribute('tabindex', '0')
        card.setAttribute('aria-label', preset.ariaLabel)
        card.setAttribute('aria-pressed', 'false')
        card.classList.add(
          'cursor-pointer',
          'transition',
          'hover:-translate-y-0.5',
          'hover:shadow-lg',
          'focus:outline-none',
          'focus:ring-4',
          'focus:ring-teal-200',
        )

        const applyPreset = (event: Event) => {
          event.preventDefault()
          event.stopPropagation()

          findButton(root, preset.statusLabel)?.click()
          findButton(root, preset.proofLabel)?.click()
          setActiveCard(card)

          window.setTimeout(() => {
            root.querySelector('main > section:nth-of-type(2)')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }, 0)
        }

        const onKeyDown = (event: Event) => {
          const keyboardEvent = event as KeyboardEvent
          if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') applyPreset(event)
        }

        card.addEventListener('click', applyPreset)
        card.addEventListener('keydown', onKeyDown)
        cardCleanups.set(card, () => {
          card.removeEventListener('click', applyPreset)
          card.removeEventListener('keydown', onKeyDown)
        })
      })

      const allCard = cards.find(card => normalizedText(card.querySelector('p')) === 'كل المشاوير')
      if (allCard && !cards.some(card => card.getAttribute('aria-pressed') === 'true')) setActiveCard(allCard)
    }

    const initializeInteractiveElements = () => {
      attachHeader()
      attachSummaryCards()
    }

    const closeOpenDetailsWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      const overlays = Array.from(root.querySelectorAll<HTMLElement>('.fixed.inset-0'))
      const detailsOverlay = overlays.reverse().find(overlay => normalizedText(overlay).includes('تفاصيل المشوار'))
      if (!detailsOverlay) return

      event.preventDefault()
      event.stopPropagation()
      const closeButton = detailsOverlay.querySelector<HTMLButtonElement>('button')
      closeButton?.click()
    }

    initializeInteractiveElements()
    const observer = new MutationObserver(initializeInteractiveElements)
    observer.observe(root, { childList: true, subtree: true })
    window.addEventListener('keydown', closeOpenDetailsWithEscape, true)

    return () => {
      observer.disconnect()
      window.removeEventListener('keydown', closeOpenDetailsWithEscape, true)
      if (attachedHeader) {
        attachedHeader.removeEventListener('click', goBack, true)
        attachedHeader.removeEventListener('pointerup', goBack, true)
        attachedHeader.removeEventListener('keydown', onHeaderKeyDown, true)
      }
      cardCleanups.forEach(cleanup => cleanup())
      cardCleanups.clear()
    }
  }, [navigate])

  return <div ref={rootRef}><TripsEnhanced /></div>
}
