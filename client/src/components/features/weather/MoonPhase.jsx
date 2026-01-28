import dayjs from 'dayjs';

function MoonPhase({ moonData, isLoading }) {
  if (isLoading) {
    return (
      <div className="card p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
            <div className="flex-1 space-y-2">
              <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!moonData) {
    return null;
  }

  const { phase, phaseName, illumination, moonrise, moonset, isWaxing } = moonData;

  // Create SVG moon visualization
  // phase: 0 = new moon, 0.5 = full moon, 1 = new moon
  const renderMoon = () => {
    const size = 96;
    const center = size / 2;
    const radius = size / 2 - 4;

    // Calculate the terminator curve based on phase
    // 0-0.5: waxing (right side lit), 0.5-1: waning (left side lit)
    const phaseAngle = phase * 2 * Math.PI;

    // The illumination comes from different sides
    // In the Northern Hemisphere:
    // - Waxing (0-0.5): right side illuminated, shadow on left
    // - Waning (0.5-1): left side illuminated, shadow on right

    // Calculate how much of the visible disc is lit
    // At phase 0: 0% lit (new moon)
    // At phase 0.25: 50% lit (first quarter, right half)
    // At phase 0.5: 100% lit (full moon)
    // At phase 0.75: 50% lit (last quarter, left half)

    // The x-coordinate of the terminator at any y
    // Uses an ellipse that squishes based on phase
    const terminatorX = Math.cos(phaseAngle) * radius;

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <clipPath id="moonCircle">
            <circle cx={center} cy={center} r={radius} />
          </clipPath>
          <linearGradient id="moonSurface" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e5e7eb" />
            <stop offset="50%" stopColor="#d1d5db" />
            <stop offset="100%" stopColor="#9ca3af" />
          </linearGradient>
          <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
            <stop offset="70%" stopColor="#fef9c3" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#fef9c3" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Moon glow effect */}
        <circle cx={center} cy={center} r={radius + 8} fill="url(#moonGlow)" />

        {/* Moon background (dark side) */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="#1e293b"
          stroke="#334155"
          strokeWidth="1"
        />

        {/* Lit portion of the moon */}
        <g clipPath="url(#moonCircle)">
          {phase <= 0.5 ? (
            // Waxing: illuminate from right
            <ellipse
              cx={center}
              cy={center}
              rx={Math.abs(terminatorX)}
              ry={radius}
              fill="url(#moonSurface)"
              transform={terminatorX >= 0 ? '' : `translate(${radius * 2}, 0) scale(-1, 1)`}
            />
          ) : (
            // Waning: illuminate from left
            <ellipse
              cx={center}
              cy={center}
              rx={Math.abs(terminatorX)}
              ry={radius}
              fill="url(#moonSurface)"
              transform={terminatorX < 0 ? '' : `translate(${-radius * 2}, 0) scale(-1, 1)`}
            />
          )}

          {/* Full illumination overlay based on actual illumination */}
          {illumination > 50 && (
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="url(#moonSurface)"
              opacity={(illumination - 50) / 50}
            />
          )}
        </g>

        {/* Subtle crater details */}
        <g clipPath="url(#moonCircle)" opacity="0.3">
          <circle cx={center - 10} cy={center - 15} r="6" fill="#9ca3af" />
          <circle cx={center + 15} cy={center + 10} r="8" fill="#9ca3af" />
          <circle cx={center + 5} cy={center - 5} r="4" fill="#9ca3af" />
          <circle cx={center - 18} cy={center + 12} r="5" fill="#9ca3af" />
        </g>
      </svg>
    );
  };

  return (
    <div className="card p-6">
      <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-4">
        Moon Phase
      </h3>

      <div className="flex items-center gap-6">
        {/* Moon visualization */}
        <div className="flex-shrink-0">
          {renderMoon()}
        </div>

        {/* Moon info */}
        <div className="flex-1">
          <p className="text-xl font-semibold text-slate-900 dark:text-white mb-1">
            {phaseName}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            {illumination}% illuminated
            {isWaxing ? ' (waxing)' : ' (waning)'}
          </p>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-400 dark:text-slate-500">Moonrise</p>
              <p className="font-medium text-slate-900 dark:text-white">
                {moonrise ? dayjs(moonrise).format('HH:mm') : '--:--'}
              </p>
            </div>
            <div>
              <p className="text-slate-400 dark:text-slate-500">Moonset</p>
              <p className="font-medium text-slate-900 dark:text-white">
                {moonset ? dayjs(moonset).format('HH:mm') : '--:--'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Illumination bar */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 mb-1">
          <span>New</span>
          <span>Full</span>
        </div>
        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-slate-400 to-yellow-300 rounded-full transition-all duration-500"
            style={{ width: `${illumination}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default MoonPhase;
