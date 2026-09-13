import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * HiVE Hexagonal Geometric Logo
 * Intricate honeycomb hexagon with intersecting node connections representing
 * a multi-agent collective intelligence network / RAG vector hive.
 */
export function HiveLogoIcon({ size = 28, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Modern Vibrant Gradient for HiVE */}
        <linearGradient id="hive-gradient" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="50%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>

        <linearGradient id="hive-inner" x1="8" y1="8" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#93C5FD" />
          <stop offset="100%" stopColor="#60A5FA" />
        </linearGradient>
      </defs>

      {/* Outer Hexagon Shield */}
      <path
        d="M16 2.5L28.5 9.7V22.3L16 29.5L3.5 22.3V9.7L16 2.5Z"
        fill="url(#hive-gradient)"
      />

      {/* Inner Geometric Honeycomb Structure */}
      {/* Top cell */}
      <path
        d="M16 7L21.5 10.2V16.2L16 13L10.5 16.2V10.2L16 7Z"
        fill="#FFFFFF"
        fillOpacity="0.92"
      />

      {/* Bottom-left node */}
      <path
        d="M10.5 18L16 21.2V25L8.5 20.7V14.5L10.5 15.6V18Z"
        fill="#FFFFFF"
        fillOpacity="0.75"
      />

      {/* Bottom-right node */}
      <path
        d="M21.5 18L16 21.2V25L23.5 20.7V14.5L21.5 15.6V18Z"
        fill="#FFFFFF"
        fillOpacity="0.75"
      />

      {/* Central Hive Core Vertex */}
      <circle cx="16" cy="15" r="2" fill="#1E3A8A" />
    </svg>
  )
}

/**
 * HiVE Brand Logo Component
 * Dynamic link: navigates to /workspace if logged in, or /login if unauthenticated.
 */
export default function HiveLogo({
  size = 'md', // 'sm' | 'md' | 'lg'
  showText = true,
  className = '',
}) {
  const { user } = useAuth()
  const destination = user ? '/workspace' : '/login'

  const iconSizes = {
    sm: 22,
    md: 28,
    lg: 36,
  }

  const textClasses = {
    sm: 'text-sm font-bold tracking-tight',
    md: 'text-base font-bold tracking-tight',
    lg: 'text-2xl font-extrabold tracking-tight',
  }

  return (
    <Link
      to={destination}
      className={`inline-flex items-center gap-2.5 group transition-transform active:scale-95 ${className}`}
      title={user ? 'Go to Workspace' : 'Go to Login'}
    >
      <div className="relative flex items-center justify-center shrink-0 drop-shadow-sm group-hover:scale-105 transition-transform duration-200">
        <HiveLogoIcon size={iconSizes[size] || 28} />
      </div>

      {showText && (
        <span
          className={`${textClasses[size] || 'text-base font-bold'} text-[var(--text-primary)] font-['Outfit'] group-hover:text-blue-500 transition-colors`}
        >
          HiVE
        </span>
      )}
    </Link>
  )
}
