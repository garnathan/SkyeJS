/**
 * Enhanced Weather Icons with 3D-style effects, gradients, and animations
 */

// Animated Sun with glow effect
export function SunnyIcon({ size = 64, className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
    >
      <defs>
        {/* Sun gradient */}
        <radialGradient id="sunGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="50%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#F59E0B" />
        </radialGradient>
        {/* Glow effect */}
        <filter id="sunGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Inner shadow for 3D effect */}
        <filter id="sunInnerShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feOffset dx="2" dy="2" />
          <feGaussianBlur stdDeviation="2" result="offset-blur" />
          <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse" />
          <feFlood floodColor="#D97706" floodOpacity="0.5" result="color" />
          <feComposite operator="in" in="color" in2="inverse" result="shadow" />
          <feComposite operator="over" in="shadow" in2="SourceGraphic" />
        </filter>
      </defs>

      {/* Rays - animated rotation */}
      <g className="origin-center animate-spin-slow" style={{ transformOrigin: '50px 50px' }}>
        {[...Array(8)].map((_, i) => (
          <line
            key={i}
            x1="50"
            y1="10"
            x2="50"
            y2="20"
            stroke="#FBBF24"
            strokeWidth="3"
            strokeLinecap="round"
            transform={`rotate(${i * 45} 50 50)`}
            opacity="0.8"
          />
        ))}
      </g>

      {/* Main sun circle with 3D effect */}
      <circle
        cx="50"
        cy="50"
        r="25"
        fill="url(#sunGradient)"
        filter="url(#sunGlow)"
      />

      {/* Highlight for 3D effect */}
      <ellipse
        cx="43"
        cy="43"
        rx="8"
        ry="6"
        fill="white"
        opacity="0.4"
      />
    </svg>
  );
}

// Moon icon with craters and glow
export function MoonIcon({ size = 64, className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
    >
      <defs>
        <radialGradient id="moonGradient" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#F8FAFC" />
          <stop offset="50%" stopColor="#E2E8F0" />
          <stop offset="100%" stopColor="#CBD5E1" />
        </radialGradient>
        <filter id="moonGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Crater shadow */}
        <filter id="craterShadow">
          <feDropShadow dx="1" dy="1" stdDeviation="0.5" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* Glow aura */}
      <circle cx="50" cy="50" r="32" fill="#E0E7FF" opacity="0.3" />

      {/* Main moon */}
      <circle
        cx="50"
        cy="50"
        r="28"
        fill="url(#moonGradient)"
        filter="url(#moonGlow)"
      />

      {/* Craters for texture */}
      <circle cx="40" cy="40" r="5" fill="#CBD5E1" opacity="0.5" filter="url(#craterShadow)" />
      <circle cx="60" cy="55" r="4" fill="#CBD5E1" opacity="0.4" filter="url(#craterShadow)" />
      <circle cx="45" cy="60" r="3" fill="#CBD5E1" opacity="0.3" filter="url(#craterShadow)" />
      <circle cx="55" cy="38" r="2" fill="#CBD5E1" opacity="0.3" filter="url(#craterShadow)" />

      {/* Highlight */}
      <ellipse cx="40" cy="38" rx="10" ry="8" fill="white" opacity="0.4" />
    </svg>
  );
}

// Cloudy icon with layered 3D clouds
export function CloudyIcon({ size = 64, className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
    >
      <defs>
        <linearGradient id="cloudGradient1" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#F1F5F9" />
          <stop offset="100%" stopColor="#CBD5E1" />
        </linearGradient>
        <linearGradient id="cloudGradient2" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#E2E8F0" />
          <stop offset="100%" stopColor="#94A3B8" />
        </linearGradient>
        <filter id="cloudShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="2" dy="3" stdDeviation="2" floodColor="#64748B" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* Back cloud (darker, for depth) */}
      <g transform="translate(5, -5)" filter="url(#cloudShadow)">
        <ellipse cx="60" cy="55" rx="22" ry="16" fill="url(#cloudGradient2)" />
        <ellipse cx="45" cy="60" rx="18" ry="14" fill="url(#cloudGradient2)" />
        <ellipse cx="70" cy="60" rx="15" ry="12" fill="url(#cloudGradient2)" />
      </g>

      {/* Front cloud (lighter, main) */}
      <g filter="url(#cloudShadow)">
        <ellipse cx="50" cy="55" rx="25" ry="18" fill="url(#cloudGradient1)" />
        <ellipse cx="30" cy="58" rx="18" ry="14" fill="url(#cloudGradient1)" />
        <ellipse cx="68" cy="58" rx="16" ry="13" fill="url(#cloudGradient1)" />
        <ellipse cx="40" cy="50" rx="15" ry="12" fill="url(#cloudGradient1)" />
        <ellipse cx="58" cy="48" rx="14" ry="11" fill="url(#cloudGradient1)" />
      </g>

      {/* Highlight on front cloud */}
      <ellipse cx="40" cy="48" rx="10" ry="6" fill="white" opacity="0.5" />
    </svg>
  );
}

// Partly cloudy with sun peeking through
export function PartlyCloudyIcon({ size = 64, className = '', isNight = false }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
    >
      <defs>
        <radialGradient id="partlySunGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="50%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#F59E0B" />
        </radialGradient>
        <radialGradient id="partlyMoonGradient" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#F8FAFC" />
          <stop offset="50%" stopColor="#E2E8F0" />
          <stop offset="100%" stopColor="#CBD5E1" />
        </radialGradient>
        <linearGradient id="partlyCloudGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#F1F5F9" />
          <stop offset="100%" stopColor="#CBD5E1" />
        </linearGradient>
        <filter id="partlyGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="partlyCloudShadow">
          <feDropShadow dx="2" dy="3" stdDeviation="2" floodColor="#64748B" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* Sun/Moon in background */}
      {isNight ? (
        <circle cx="65" cy="30" r="18" fill="url(#partlyMoonGradient)" filter="url(#partlyGlow)" />
      ) : (
        <>
          {/* Sun rays */}
          <g className="origin-center animate-spin-slow" style={{ transformOrigin: '65px 30px' }}>
            {[...Array(8)].map((_, i) => (
              <line
                key={i}
                x1="65"
                y1="8"
                x2="65"
                y2="14"
                stroke="#FBBF24"
                strokeWidth="2"
                strokeLinecap="round"
                transform={`rotate(${i * 45} 65 30)`}
                opacity="0.7"
              />
            ))}
          </g>
          <circle cx="65" cy="30" r="15" fill="url(#partlySunGradient)" filter="url(#partlyGlow)" />
          <ellipse cx="60" cy="26" rx="5" ry="4" fill="white" opacity="0.4" />
        </>
      )}

      {/* Cloud in foreground */}
      <g filter="url(#partlyCloudShadow)">
        <ellipse cx="45" cy="62" rx="28" ry="18" fill="url(#partlyCloudGradient)" />
        <ellipse cx="25" cy="65" rx="18" ry="13" fill="url(#partlyCloudGradient)" />
        <ellipse cx="65" cy="65" rx="16" ry="12" fill="url(#partlyCloudGradient)" />
        <ellipse cx="35" cy="55" rx="16" ry="12" fill="url(#partlyCloudGradient)" />
        <ellipse cx="55" cy="53" rx="15" ry="11" fill="url(#partlyCloudGradient)" />
      </g>

      {/* Highlight */}
      <ellipse cx="35" cy="53" rx="10" ry="6" fill="white" opacity="0.5" />
    </svg>
  );
}

// Rainy icon with animated raindrops
export function RainyIcon({ size = 64, className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
    >
      <defs>
        <linearGradient id="rainCloudGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#94A3B8" />
          <stop offset="100%" stopColor="#64748B" />
        </linearGradient>
        <linearGradient id="raindropGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
        <filter id="rainCloudShadow">
          <feDropShadow dx="2" dy="2" stdDeviation="2" floodColor="#475569" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* Dark rain cloud */}
      <g filter="url(#rainCloudShadow)">
        <ellipse cx="50" cy="35" rx="28" ry="18" fill="url(#rainCloudGradient)" />
        <ellipse cx="28" cy="40" rx="18" ry="13" fill="url(#rainCloudGradient)" />
        <ellipse cx="70" cy="40" rx="16" ry="12" fill="url(#rainCloudGradient)" />
        <ellipse cx="38" cy="28" rx="15" ry="11" fill="url(#rainCloudGradient)" />
        <ellipse cx="60" cy="27" rx="14" ry="10" fill="url(#rainCloudGradient)" />
      </g>

      {/* Animated raindrops */}
      <g className="animate-rain">
        <path d="M30 55 Q32 60, 30 65 Q28 60, 30 55" fill="url(#raindropGradient)" />
        <path d="M45 58 Q47 63, 45 68 Q43 63, 45 58" fill="url(#raindropGradient)" />
        <path d="M60 55 Q62 60, 60 65 Q58 60, 60 55" fill="url(#raindropGradient)" />
        <path d="M75 58 Q77 63, 75 68 Q73 63, 75 58" fill="url(#raindropGradient)" />
      </g>
      <g className="animate-rain-delayed">
        <path d="M25 70 Q27 75, 25 80 Q23 75, 25 70" fill="url(#raindropGradient)" />
        <path d="M40 73 Q42 78, 40 83 Q38 78, 40 73" fill="url(#raindropGradient)" />
        <path d="M55 70 Q57 75, 55 80 Q53 75, 55 70" fill="url(#raindropGradient)" />
        <path d="M70 73 Q72 78, 70 83 Q68 78, 70 73" fill="url(#raindropGradient)" />
      </g>

      {/* Subtle highlight on cloud */}
      <ellipse cx="38" cy="28" rx="8" ry="5" fill="white" opacity="0.2" />
    </svg>
  );
}

// Snowy icon with animated snowflakes
export function SnowyIcon({ size = 64, className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
    >
      <defs>
        <linearGradient id="snowCloudGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#E2E8F0" />
          <stop offset="100%" stopColor="#94A3B8" />
        </linearGradient>
        <filter id="snowCloudShadow">
          <feDropShadow dx="2" dy="2" stdDeviation="2" floodColor="#64748B" floodOpacity="0.3" />
        </filter>
        <filter id="snowflakeGlow">
          <feGaussianBlur stdDeviation="0.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Snow cloud */}
      <g filter="url(#snowCloudShadow)">
        <ellipse cx="50" cy="35" rx="28" ry="18" fill="url(#snowCloudGradient)" />
        <ellipse cx="28" cy="40" rx="18" ry="13" fill="url(#snowCloudGradient)" />
        <ellipse cx="70" cy="40" rx="16" ry="12" fill="url(#snowCloudGradient)" />
        <ellipse cx="38" cy="28" rx="15" ry="11" fill="url(#snowCloudGradient)" />
        <ellipse cx="60" cy="27" rx="14" ry="10" fill="url(#snowCloudGradient)" />
      </g>

      {/* Highlight */}
      <ellipse cx="38" cy="28" rx="8" ry="5" fill="white" opacity="0.4" />

      {/* Animated snowflakes */}
      <g filter="url(#snowflakeGlow)">
        <g className="animate-snow">
          <text x="28" y="62" fontSize="10" fill="#E0F2FE">❄</text>
          <text x="48" y="58" fontSize="8" fill="#E0F2FE">❄</text>
          <text x="68" y="62" fontSize="10" fill="#E0F2FE">❄</text>
        </g>
        <g className="animate-snow-delayed">
          <text x="35" y="78" fontSize="8" fill="#E0F2FE">❄</text>
          <text x="55" y="74" fontSize="10" fill="#E0F2FE">❄</text>
          <text x="75" y="78" fontSize="8" fill="#E0F2FE">❄</text>
        </g>
        <g className="animate-snow-delayed-2">
          <text x="22" y="88" fontSize="6" fill="#E0F2FE">❄</text>
          <text x="42" y="90" fontSize="8" fill="#E0F2FE">❄</text>
          <text x="62" y="86" fontSize="6" fill="#E0F2FE">❄</text>
        </g>
      </g>
    </svg>
  );
}

// Thunderstorm icon with lightning
export function ThunderstormIcon({ size = 64, className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
    >
      <defs>
        <linearGradient id="stormCloudGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#64748B" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
        <linearGradient id="lightningGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="50%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
        <filter id="stormCloudShadow">
          <feDropShadow dx="2" dy="2" stdDeviation="2" floodColor="#1E293B" floodOpacity="0.5" />
        </filter>
        <filter id="lightningGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Dark storm cloud */}
      <g filter="url(#stormCloudShadow)">
        <ellipse cx="50" cy="30" rx="28" ry="17" fill="url(#stormCloudGradient)" />
        <ellipse cx="28" cy="35" rx="18" ry="12" fill="url(#stormCloudGradient)" />
        <ellipse cx="70" cy="35" rx="16" ry="11" fill="url(#stormCloudGradient)" />
        <ellipse cx="38" cy="23" rx="15" ry="10" fill="url(#stormCloudGradient)" />
        <ellipse cx="60" cy="22" rx="14" ry="9" fill="url(#stormCloudGradient)" />
      </g>

      {/* Lightning bolt */}
      <g filter="url(#lightningGlow)" className="animate-lightning">
        <polygon
          points="55,42 48,58 54,58 45,80 58,55 52,55 60,42"
          fill="url(#lightningGradient)"
          stroke="#FCD34D"
          strokeWidth="1"
        />
      </g>

      {/* Rain drops */}
      <g className="animate-rain">
        <path d="M25 55 Q27 60, 25 65 Q23 60, 25 55" fill="#60A5FA" opacity="0.7" />
        <path d="M70 55 Q72 60, 70 65 Q68 60, 70 55" fill="#60A5FA" opacity="0.7" />
      </g>
      <g className="animate-rain-delayed">
        <path d="M30 70 Q32 75, 30 80 Q28 75, 30 70" fill="#60A5FA" opacity="0.7" />
        <path d="M65 70 Q67 75, 65 80 Q63 75, 65 70" fill="#60A5FA" opacity="0.7" />
      </g>
    </svg>
  );
}

// Foggy icon with layers
export function FoggyIcon({ size = 64, className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
    >
      <defs>
        <linearGradient id="fogGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#CBD5E1" stopOpacity="0.3" />
          <stop offset="50%" stopColor="#94A3B8" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#CBD5E1" stopOpacity="0.3" />
        </linearGradient>
      </defs>

      {/* Fog layers with subtle animation */}
      <g className="animate-fog">
        <rect x="10" y="30" width="80" height="8" rx="4" fill="url(#fogGradient)" opacity="0.7" />
        <rect x="15" y="45" width="70" height="8" rx="4" fill="url(#fogGradient)" opacity="0.8" />
        <rect x="8" y="60" width="84" height="8" rx="4" fill="url(#fogGradient)" opacity="0.6" />
        <rect x="20" y="75" width="60" height="8" rx="4" fill="url(#fogGradient)" opacity="0.5" />
      </g>
    </svg>
  );
}

// Windy icon
export function WindyIcon({ size = 64, className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
    >
      <defs>
        <linearGradient id="windGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#94A3B8" stopOpacity="0.3" />
          <stop offset="50%" stopColor="#64748B" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#94A3B8" stopOpacity="0.3" />
        </linearGradient>
      </defs>

      {/* Wind lines with animation */}
      <g className="animate-wind">
        <path
          d="M10 35 Q30 32, 50 35 Q70 38, 80 32 Q85 30, 82 35"
          fill="none"
          stroke="url(#windGradient)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M15 50 Q35 47, 55 50 Q75 53, 90 47"
          fill="none"
          stroke="url(#windGradient)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M5 65 Q25 62, 45 65 Q65 68, 75 62 Q80 60, 77 65"
          fill="none"
          stroke="url(#windGradient)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

// Main weather icon component that selects the right icon
export function WeatherIcon({ condition, isNight = false, size = 64, className = '' }) {
  const iconMap = {
    sunny: isNight ? MoonIcon : SunnyIcon,
    clear: isNight ? MoonIcon : SunnyIcon,
    cloudy: CloudyIcon,
    overcast: CloudyIcon,
    partlycloudy: PartlyCloudyIcon,
    partly_cloudy: PartlyCloudyIcon,
    'partly-cloudy': PartlyCloudyIcon,
    rainy: RainyIcon,
    rain: RainyIcon,
    showers: RainyIcon,
    drizzle: RainyIcon,
    snowy: SnowyIcon,
    snow: SnowyIcon,
    sleet: SnowyIcon,
    thunderstorm: ThunderstormIcon,
    thunder: ThunderstormIcon,
    storm: ThunderstormIcon,
    foggy: FoggyIcon,
    fog: FoggyIcon,
    mist: FoggyIcon,
    hazy: FoggyIcon,
    windy: WindyIcon,
    wind: WindyIcon,
  };

  const normalizedCondition = (condition || '').toLowerCase().replace(/\s+/g, '');
  const IconComponent = iconMap[normalizedCondition] || (isNight ? MoonIcon : PartlyCloudyIcon);

  // Pass isNight to PartlyCloudyIcon if needed
  if (IconComponent === PartlyCloudyIcon) {
    return <PartlyCloudyIcon size={size} className={className} isNight={isNight} />;
  }

  return <IconComponent size={size} className={className} />;
}

export default WeatherIcon;
