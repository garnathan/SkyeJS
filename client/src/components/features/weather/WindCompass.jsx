function WindCompass({ windSpeed, windDirection, windGusts, windDirectionCardinal }) {
  // Wind direction in degrees indicates where wind is coming FROM (0 = from North, 90 = from East)
  // Arrow should point in the direction wind is BLOWING TO, so add 180°
  const rotation = ((windDirection || 0) + 180) % 360;

  // Determine wind strength category for coloring
  const getWindStrength = (speed) => {
    if (speed < 5) return { label: 'Calm', color: '#22c55e', bgColor: 'bg-green-100 dark:bg-green-900/30' };
    if (speed < 20) return { label: 'Light', color: '#3b82f6', bgColor: 'bg-blue-100 dark:bg-blue-900/30' };
    if (speed < 40) return { label: 'Moderate', color: '#f59e0b', bgColor: 'bg-amber-100 dark:bg-amber-900/30' };
    if (speed < 60) return { label: 'Strong', color: '#f97316', bgColor: 'bg-orange-100 dark:bg-orange-900/30' };
    return { label: 'Very Strong', color: '#ef4444', bgColor: 'bg-red-100 dark:bg-red-900/30' };
  };

  const windStrength = getWindStrength(windSpeed);

  const size = 120;
  const center = size / 2;
  const outerRadius = size / 2 - 8;
  const innerRadius = outerRadius - 20;
  const arrowLength = outerRadius - 8;

  return (
    <div className="flex items-center gap-6">
      {/* Compass SVG */}
      <div className="flex-shrink-0">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <defs>
            <linearGradient id="compassGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#e2e8f0" />
            </linearGradient>
            <linearGradient id="compassGradientDark" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
            <filter id="compassShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
            </filter>
          </defs>

          {/* Outer ring */}
          <circle
            cx={center}
            cy={center}
            r={outerRadius}
            className="fill-slate-100 dark:fill-slate-800"
            stroke="#cbd5e1"
            strokeWidth="2"
            filter="url(#compassShadow)"
          />

          {/* Inner circle */}
          <circle
            cx={center}
            cy={center}
            r={innerRadius}
            className="fill-white dark:fill-slate-900"
            stroke="#e2e8f0"
            strokeWidth="1"
          />

          {/* Cardinal direction markers */}
          {['N', 'E', 'S', 'W'].map((dir, i) => {
            const angle = (i * 90 - 90) * (Math.PI / 180);
            const x = center + Math.cos(angle) * (outerRadius - 10);
            const y = center + Math.sin(angle) * (outerRadius - 10);
            return (
              <text
                key={dir}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-slate-400 dark:fill-slate-500"
                fontSize="10"
                fontWeight={dir === 'N' ? 'bold' : 'normal'}
              >
                {dir}
              </text>
            );
          })}

          {/* Tick marks for intercardinal directions */}
          {[45, 135, 225, 315].map((deg) => {
            const angle = (deg - 90) * (Math.PI / 180);
            const x1 = center + Math.cos(angle) * (outerRadius - 2);
            const y1 = center + Math.sin(angle) * (outerRadius - 2);
            const x2 = center + Math.cos(angle) * (outerRadius - 6);
            const y2 = center + Math.sin(angle) * (outerRadius - 6);
            return (
              <line
                key={deg}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#94a3b8"
                strokeWidth="1"
              />
            );
          })}

          {/* Wind direction arrow */}
          <g transform={`rotate(${rotation}, ${center}, ${center})`}>
            {/* Arrow body */}
            <line
              x1={center}
              y1={center + 15}
              x2={center}
              y2={center - arrowLength + 15}
              stroke={windStrength.color}
              strokeWidth="3"
              strokeLinecap="round"
            />
            {/* Arrow head */}
            <polygon
              points={`
                ${center},${center - arrowLength + 5}
                ${center - 8},${center - arrowLength + 20}
                ${center + 8},${center - arrowLength + 20}
              `}
              fill={windStrength.color}
            />
            {/* Arrow tail (smaller) */}
            <circle
              cx={center}
              cy={center + 18}
              r="4"
              fill={windStrength.color}
              opacity="0.7"
            />
          </g>

          {/* Center dot */}
          <circle
            cx={center}
            cy={center}
            r="6"
            className="fill-slate-300 dark:fill-slate-600"
          />
          <circle
            cx={center}
            cy={center}
            r="3"
            className="fill-slate-500 dark:fill-slate-400"
          />
        </svg>
      </div>

      {/* Wind info */}
      <div className="flex-1">
        <div className="flex items-baseline gap-2 mb-1">
          <p className="text-3xl font-bold text-slate-900 dark:text-white">
            {windSpeed}
          </p>
          <p className="text-lg text-slate-500 dark:text-slate-400">km/h</p>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
          {windDirectionCardinal} ({windDirection}°)
        </p>

        <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium ${windStrength.bgColor}`}>
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: windStrength.color }}
          />
          <span style={{ color: windStrength.color }}>{windStrength.label}</span>
        </div>

        {windGusts > windSpeed && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            Gusts up to {windGusts} km/h
          </p>
        )}
      </div>
    </div>
  );
}

export default WindCompass;
