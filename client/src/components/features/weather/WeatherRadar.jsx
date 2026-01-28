import { useState, useEffect, useCallback, useRef } from 'react';
import { PlayIcon, PauseIcon, ForwardIcon, BackwardIcon } from '@heroicons/react/24/solid';
import dayjs from 'dayjs';

// Default location: Killiney, Co. Dublin
const DEFAULT_LOCATION = { lat: 53.2631, lng: -6.1083, name: 'Killiney, Co. Dublin' };

function WeatherRadar({ radarData, isLoading, location }) {
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackSpeed = 500; // ms between frames
  const intervalRef = useRef(null);

  const radarFrames = radarData?.radar?.frames || [];
  const satelliteFrames = radarData?.satellite?.frames || [];

  // Use the shorter of the two frame arrays for sync
  const maxFrames = Math.max(radarFrames.length, satelliteFrames.length);

  const currentRadarFrame = radarFrames[Math.min(currentFrameIndex, radarFrames.length - 1)];
  const currentSatelliteFrame = satelliteFrames[Math.min(currentFrameIndex, satelliteFrames.length - 1)];

  // Use provided location or default to Killiney
  const markerLat = location?.lat || DEFAULT_LOCATION.lat;
  const markerLng = location?.lng || DEFAULT_LOCATION.lng;
  const locationName = location?.name || DEFAULT_LOCATION.name;

  // Tile configuration - zoom 6 for wide view
  const zoom = 6;

  // Convert lat/lng to tile coordinates
  // Formula: https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
  const n = Math.pow(2, zoom);
  const exactTileX = ((markerLng + 180) / 360) * n;
  const latRad = (markerLat * Math.PI) / 180;
  const exactTileY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

  // Center tile (integer part)
  const centerX = Math.floor(exactTileX);
  const centerY = Math.floor(exactTileY);

  // Position within the center tile (0-1 range)
  const tileOffsetX = exactTileX - centerX;
  const tileOffsetY = exactTileY - centerY;

  // Convert to percentage position in the 3x3 grid
  // The center tile is at grid position (1,1), so we add 1 tile offset
  const markerLeftPercent = ((1 + tileOffsetX) / 3) * 100;
  const markerTopPercent = ((1 + tileOffsetY) / 3) * 100;

  // Get OpenStreetMap tile URL for base map
  const getMapTileUrl = useCallback((x, y) => {
    return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
  }, [zoom]);

  // Get radar tile URL
  const getRadarTileUrl = useCallback((frame, x, y) => {
    if (!frame || !radarData?.host) return null;
    const host = radarData.host;
    const path = frame.path;
    // Color scheme 4 = The Weather Channel, options 1_1 = smooth + snow
    return `${host}${path}/256/${zoom}/${x}/${y}/4/1_1.png`;
  }, [radarData?.host, zoom]);

  // Get satellite tile URL
  const getSatelliteTileUrl = useCallback((frame, x, y) => {
    if (!frame || !radarData?.host) return null;
    const host = radarData.host;
    const path = frame.path;
    return `${host}${path}/256/${zoom}/${x}/${y}/0/0_0.png`;
  }, [radarData?.host, zoom]);

  // Build a 3x3 grid of tiles
  const getTileGrid = useCallback((type) => {
    const tiles = [];
    const frame = type === 'radar' ? currentRadarFrame : currentSatelliteFrame;
    const getTileUrl = type === 'radar' ? getRadarTileUrl : getSatelliteTileUrl;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = centerX + dx;
        const y = centerY + dy;
        tiles.push({
          x: dx,
          y: dy,
          mapUrl: getMapTileUrl(x, y),
          overlayUrl: frame ? getTileUrl(frame, x, y) : null
        });
      }
    }
    return tiles;
  }, [centerX, centerY, getMapTileUrl, getRadarTileUrl, getSatelliteTileUrl, currentRadarFrame, currentSatelliteFrame]);

  // Reset frame index when data changes
  useEffect(() => {
    setCurrentFrameIndex(maxFrames > 0 ? maxFrames - 1 : 0);
    setIsPlaying(false);
  }, [maxFrames]);

  // Playback logic
  useEffect(() => {
    if (isPlaying && maxFrames > 0) {
      intervalRef.current = setInterval(() => {
        setCurrentFrameIndex((prev) => {
          const next = prev + 1;
          if (next >= maxFrames) {
            return 0; // Loop back to start
          }
          return next;
        });
      }, playbackSpeed);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, maxFrames, playbackSpeed]);

  const handlePrevFrame = () => {
    setIsPlaying(false);
    setCurrentFrameIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNextFrame = () => {
    setIsPlaying(false);
    setCurrentFrameIndex((prev) => Math.min(maxFrames - 1, prev + 1));
  };

  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
  };

  if (isLoading) {
    return (
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          Weather Radar & Satellite
        </h2>
        <div className="card p-4">
          <div className="animate-pulse grid grid-cols-2 gap-4">
            <div className="h-64 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
            <div className="h-64 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!radarData || (radarFrames.length === 0 && satelliteFrames.length === 0)) {
    return (
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          Weather Radar & Satellite
        </h2>
        <div className="card p-4 text-center text-slate-500 dark:text-slate-400">
          Radar data unavailable
        </div>
      </div>
    );
  }

  const radarTiles = getTileGrid('radar');
  const satelliteTiles = getTileGrid('satellite');
  const frameTime = currentRadarFrame ? dayjs.unix(currentRadarFrame.time) :
                    currentSatelliteFrame ? dayjs.unix(currentSatelliteFrame.time) : null;

  // Render a single map panel
  const renderMapPanel = (tiles, type, frame, markerTop, markerLeft) => (
    <div className="relative rounded-lg overflow-hidden" style={{ aspectRatio: '1/1' }}>
      {/* Base map tiles (OpenStreetMap) */}
      <div
        className="absolute inset-0 grid"
        style={{
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(3, 1fr)'
        }}
      >
        {tiles.map((tile, index) => (
          <img
            key={`map-${type}-${index}`}
            src={tile.mapUrl}
            alt=""
            className="w-full h-full object-cover"
            crossOrigin="anonymous"
            onError={(e) => {
              e.target.style.backgroundColor = '#334155';
            }}
          />
        ))}
      </div>

      {/* Overlay tiles */}
      <div
        className="absolute inset-0 grid"
        style={{
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(3, 1fr)'
        }}
      >
        {tiles.map((tile, index) => (
          tile.overlayUrl && (
            <img
              key={`overlay-${type}-${currentFrameIndex}-${index}`}
              src={tile.overlayUrl}
              alt=""
              className="w-full h-full object-cover"
              style={{ opacity: type === 'radar' ? 0.7 : 0.6 }}
              onError={(e) => {
                e.target.style.opacity = 0;
              }}
            />
          )
        ))}
      </div>

      {/* Location marker */}
      <div className="absolute" style={{ top: `${markerTop}%`, left: `${markerLeft}%`, transform: 'translate(-50%, -50%)' }}>
        <div className="w-2 h-2 bg-red-500 rounded-full border border-white shadow-lg" />
      </div>

      {/* Label */}
      <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded px-2 py-1">
        <p className="text-white text-xs font-medium">
          {type === 'radar' ? 'Rain Radar' : 'Satellite (IR)'}
        </p>
      </div>

      {/* Frame type indicator */}
      {frame?.type === 'nowcast' && (
        <div className="absolute top-2 right-2 bg-amber-500/90 backdrop-blur-sm rounded px-2 py-1">
          <p className="text-white text-[10px] font-medium">Forecast</p>
        </div>
      )}

      {/* Map attribution */}
      <div className="absolute bottom-1 right-1 bg-black/50 rounded px-1">
        <p className="text-white/70 text-[8px]">&copy; OSM</p>
      </div>
    </div>
  );

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
        Weather Radar & Satellite
      </h2>

      <div className="card p-4">
        {/* Side by side maps */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {renderMapPanel(radarTiles, 'radar', currentRadarFrame, markerTopPercent, markerLeftPercent)}
          {renderMapPanel(satelliteTiles, 'satellite', currentSatelliteFrame, markerTopPercent, markerLeftPercent)}
        </div>

        {/* Time display */}
        <div className="text-center mb-3">
          <p className="text-sm font-medium text-slate-900 dark:text-white">
            {frameTime ? frameTime.format('HH:mm') : '--:--'}
            {currentRadarFrame?.type === 'nowcast' && (
              <span className="ml-2 text-amber-500 text-xs">(Forecast)</span>
            )}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {frameTime ? frameTime.format('DD MMM YYYY') : ''} &middot; {locationName}
          </p>
        </div>

        {/* Playback controls */}
        <div className="flex items-center justify-center gap-4 mb-3">
          <button
            onClick={handlePrevFrame}
            disabled={currentFrameIndex === 0}
            className="p-2 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <BackwardIcon className="w-5 h-5" />
          </button>

          <button
            onClick={togglePlayback}
            className="p-3 rounded-full bg-accent-500 text-white hover:bg-accent-600 transition-colors"
          >
            {isPlaying ? (
              <PauseIcon className="w-6 h-6" />
            ) : (
              <PlayIcon className="w-6 h-6" />
            )}
          </button>

          <button
            onClick={handleNextFrame}
            disabled={currentFrameIndex === maxFrames - 1}
            className="p-2 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ForwardIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Timeline slider */}
        <div className="px-2">
          <input
            type="range"
            min={0}
            max={maxFrames - 1}
            value={currentFrameIndex}
            onChange={(e) => {
              setIsPlaying(false);
              setCurrentFrameIndex(parseInt(e.target.value, 10));
            }}
            className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-accent-500"
          />
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
            <span>{radarFrames.length > 0 ? dayjs.unix(radarFrames[0].time).format('HH:mm') : '--:--'}</span>
            <span>Frame {currentFrameIndex + 1} / {maxFrames}</span>
            <span>{radarFrames.length > 0 ? dayjs.unix(radarFrames[radarFrames.length - 1].time).format('HH:mm') : '--:--'}</span>
          </div>
        </div>

        {/* Legends side by side */}
        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          {/* Radar legend */}
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Rain Intensity</p>
            <div className="h-2 rounded bg-gradient-to-r from-green-300 via-yellow-400 via-orange-500 to-red-600" />
            <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              <span>Light</span>
              <span>Heavy</span>
            </div>
          </div>

          {/* Satellite legend */}
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Cloud Height (IR)</p>
            <div className="h-2 rounded bg-gradient-to-r from-slate-400 via-slate-200 to-white" />
            <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              <span>Low</span>
              <span>High</span>
            </div>
          </div>
        </div>

        {/* Data source */}
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-3 text-center">
          Data from RainViewer.com
        </p>
      </div>
    </div>
  );
}

export default WeatherRadar;
