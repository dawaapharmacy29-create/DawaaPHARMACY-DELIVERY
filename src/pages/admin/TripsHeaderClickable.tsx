import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import TripsEnhanced from './TripsEnhanced'

export default function TripsHeaderClickable() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const header = rootRef.current?.querySelector('header')
    if (!header) return

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

    const onKeyDown = (event: Event) => {
      const keyboardEvent = event as KeyboardEvent
      if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') goBack(event)
    }
    header.addEventListener('keydown', onKeyDown, true)

    return () => {
      header.removeEventListener('click', goBack, true)
      header.removeEventListener('pointerup', goBack, true)
      header.removeEventListener('keydown', onKeyDown, true)
    }
  }, [navigate])

  return <div ref={rootRef}><TripsEnhanced /></div>
}
