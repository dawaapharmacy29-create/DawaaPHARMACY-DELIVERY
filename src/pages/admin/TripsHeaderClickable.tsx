import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import TripsEnhanced from './TripsEnhanced'

type SummaryPreset = {
  statusLabel: string
  proofLabel: string
  ariaLabel: string
}

const SUMMARY_PRESETS: SummaryPreset[] = [
  { statusLabel: 'كل الحالات', proofLabel: 'كل الإثباتات', ariaLabel: 'عرض كل المشاوير' },
  { statusLabel: 'كل الحالات', proofLabel: 'بصورة', ariaLabel: 'عرض المشاوير التي تحتوي على صورة' },
  { statusLabel: 'كل الحالات', proofLabel: 'بدون صورة', ariaLabel: 'عرض المشاوير التي لا تحتوي على صورة' },
  { statusLabel: 'مستني اعتماد', proofLabel: 'كل الإثباتات', ariaLabel: 'عرض المشاوير المستنية اعتماد' },
  { statusLabel: 'معتمد', proofLabel: 'كل الإثباتات', ariaLabel: 'عرض المشاوير المعتمدة' },
  { statusLabel: 'مرفوض', proofLabel: 'كل الإثباتات', ariaLabel: 'عرض المشاوير المرفوضة' },
]

function findButton(root: HTMLElement, label: string) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(button =>
    (button.textContent || '').replace(/\s+/g, ' ').trim().startsWith(label),
  )
}

export default function TripsHeaderClickable() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    const header = root?.querySelector('header')
    if (!root || !header) return

    const goBack = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      navigate('/admin')
    }

    header.setAttribute('role', 'button')
    header.setAttribute('tabindex', '0')
    header.setAttribute('aria-label', 'الرجوع إلى لوحة الإدارة')
    header.classList.add('cursor-pointer')
    header.addEventListener('click', goBack, true)
    header.addEventListener('pointerup', goBack, true)

    const onHeaderKeyDown = (event: Event) => {
      const keyboardEvent = event as KeyboardEvent
      if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') goBack(event)
    }
    header.addEventListener('keydown', onHeaderKeyDown, true)

    const summarySection = root.querySelector('main > section:first-of-type')
    const cards = summarySection ? Array.from(summarySection.children) as HTMLElement[] : []
    const cleanups: Array<() => void> = []

    const setActiveCard = (activeIndex: number) => {
      cards.forEach((card, index) => {
        const active = index === activeIndex
        card.setAttribute('aria-pressed', String(active))
        card.classList.toggle('ring-2', active)
        card.classList.toggle('ring-[#008E92]', active)
        card.classList.toggle('shadow-md', active)
      })
    }

    cards.slice(0, SUMMARY_PRESETS.length).forEach((card, index) => {
      const preset = SUMMARY_PRESETS[index]
      card.setAttribute('role', 'button')
      card.setAttribute('tabindex', '0')
      card.setAttribute('aria-label', preset.ariaLabel)
      card.classList.add('cursor-pointer', 'transition', 'hover:-translate-y-0.5', 'hover:shadow-lg', 'focus:outline-none', 'focus:ring-4', 'focus:ring-teal-200')

      const applyPreset = (event: Event) => {
        event.preventDefault()
        const statusButton = findButton(root, preset.statusLabel)
        const proofButton = findButton(root, preset.proofLabel)
        statusButton?.click()
        proofButton?.click()
        setActiveCard(index)
        root.querySelector('main > section:nth-of-type(2)')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }

      const onKeyDown = (event: Event) => {
        const keyboardEvent = event as KeyboardEvent
        if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') applyPreset(event)
      }

      card.addEventListener('click', applyPreset)
      card.addEventListener('keydown', onKeyDown)
      cleanups.push(() => {
        card.removeEventListener('click', applyPreset)
        card.removeEventListener('keydown', onKeyDown)
      })
    })

    setActiveCard(0)

    return () => {
      header.removeEventListener('click', goBack, true)
      header.removeEventListener('pointerup', goBack, true)
      header.removeEventListener('keydown', onHeaderKeyDown, true)
      cleanups.forEach(cleanup => cleanup())
    }
  }, [navigate])

  return <div ref={rootRef}><TripsEnhanced /></div>
}
