import { WeatherIcon } from './WeatherIcons';

function WeatherCard({ day, temp, condition, icon, isToday = false, isNight = false }) {
  return (
    <div
      className={`card p-4 text-center ${
        isToday ? 'ring-2 ring-accent-500' : ''
      }`}
    >
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
        {day}
      </p>
      <div className="flex justify-center mb-2">
        <WeatherIcon condition={icon} isNight={isNight} size={48} />
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
        {temp}°C
      </p>
      <p className="text-sm text-slate-500 dark:text-slate-400">{condition}</p>
    </div>
  );
}

export default WeatherCard;
