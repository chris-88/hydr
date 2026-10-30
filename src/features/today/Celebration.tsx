import { useEffect, useState } from 'react'

const COLOURS = ['#bfe3f0', '#7fd1c9', '#d9d0f5', '#f6d7dc', '#8cc9dd']

/** A short, soft confetti drift the first time the goal is reached each day. */
export default function Celebration({ reached, dayKey }: { reached: boolean; dayKey: string }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!reached) return
    const key = `water.celebrated.${dayKey}`
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, '1')
    setShow(true)
    const t = setTimeout(() => setShow(false), 3000)
    return () => clearTimeout(t)
  }, [reached, dayKey])

  if (!show) return null
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50">
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="confetti"
          style={{
            left: `${(i * 37) % 100}%`,
            background: COLOURS[i % COLOURS.length],
            animationDelay: `${(i % 7) * 120}ms`,
            animationDuration: `${2200 + (i % 5) * 200}ms`,
          }}
        />
      ))}
    </div>
  )
}
