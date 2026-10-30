export default function WaterGauge({ percent, size = 240 }: { percent: number; size?: number }) {
  const fill = Math.max(0, Math.min(100, percent))
  return (
    <div
      className="relative overflow-hidden rounded-full border-[6px] border-white bg-powder/30 shadow-soft"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${fill}% of today's goal`}
    >
      <div
        className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out"
        style={{ height: `${fill}%` }}
      >
        <div className="absolute inset-x-0 -top-5 h-6 overflow-hidden">
          <svg className="wave absolute left-0 h-6" style={{ width: '200%' }} viewBox="0 0 400 24" preserveAspectRatio="none">
            <path d="M0 12 Q25 0 50 12 T100 12 T150 12 T200 12 T250 12 T300 12 T350 12 T400 12 V24 H0 Z" fill="#8cc9dd" />
          </svg>
          <svg className="wave-slow absolute left-0 h-6 opacity-70" style={{ width: '200%' }} viewBox="0 0 400 24" preserveAspectRatio="none">
            <path d="M0 12 Q25 24 50 12 T100 12 T150 12 T200 12 T250 12 T300 12 T350 12 T400 12 V24 H0 Z" fill="#7fd1c9" />
          </svg>
        </div>
        <div className="h-full w-full bg-gradient-to-b from-powder-deep via-aqua to-aqua-deep" />
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className={`text-5xl font-bold tabular-nums drop-shadow-sm ${fill > 55 ? 'text-white' : 'text-ink'}`}>{fill}%</span>
      </div>
    </div>
  )
}
