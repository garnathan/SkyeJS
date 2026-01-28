import { useState, useEffect, useRef } from 'react';
import { MapPinIcon, ChevronDownIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { weatherApi } from '../../../services/api';

// Fallback default location (used if server config not available)
const FALLBACK_LOCATION = {
  name: 'Killiney, Co. Dublin',
  lat: 53.2631,
  lng: -6.1083,
  country: 'Ireland'
};

// Module-level cache for the configured default location
let cachedDefaultLocation = null;

// Preset locations for quick selection
const PRESET_LOCATIONS = [
  { name: 'Killiney, Co. Dublin', lat: 53.2631, lng: -6.1083, country: 'Ireland' },
  { name: 'Dublin City Centre', lat: 53.3498, lng: -6.2603, country: 'Ireland' },
  { name: 'Cork', lat: 51.8985, lng: -8.4756, country: 'Ireland' },
  { name: 'Galway', lat: 53.2707, lng: -9.0568, country: 'Ireland' },
  { name: 'Limerick', lat: 52.6638, lng: -8.6267, country: 'Ireland' },
  { name: 'Waterford', lat: 52.2593, lng: -7.1101, country: 'Ireland' },
  { name: 'Belfast', lat: 54.5973, lng: -5.9301, country: 'Ireland' },
  { name: 'Killarney', lat: 52.0599, lng: -9.5044, country: 'Ireland' },
  { name: 'Dingle', lat: 52.1408, lng: -10.2686, country: 'Ireland' },
  { name: 'Sligo', lat: 54.2766, lng: -8.4761, country: 'Ireland' },
  { divider: true },
  { name: 'London', lat: 51.5074, lng: -0.1278, country: 'United Kingdom' },
  { name: 'Paris', lat: 48.8566, lng: 2.3522, country: 'France' },
  { name: 'Amsterdam', lat: 52.3676, lng: 4.9041, country: 'Netherlands' },
  { name: 'Berlin', lat: 52.5200, lng: 13.4050, country: 'Germany' },
  { name: 'New York', lat: 40.7128, lng: -74.0060, country: 'USA' },
  { name: 'Los Angeles', lat: 34.0522, lng: -118.2437, country: 'USA' },
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503, country: 'Japan' },
  { name: 'Sydney', lat: -33.8688, lng: 151.2093, country: 'Australia' },
];

// Storage key for persisting location
const STORAGE_KEY = 'skyejs_weather_location';

// Fetch the configured default location from server
export const fetchDefaultLocation = async () => {
  if (cachedDefaultLocation) {
    return cachedDefaultLocation;
  }
  try {
    const response = await weatherApi.getDefaults();
    cachedDefaultLocation = {
      name: response.data.name || FALLBACK_LOCATION.name,
      lat: response.data.lat || FALLBACK_LOCATION.lat,
      lng: response.data.lng || FALLBACK_LOCATION.lng,
      country: 'Configured'
    };
    return cachedDefaultLocation;
  } catch (e) {
    console.warn('Failed to fetch default location from server:', e);
    return FALLBACK_LOCATION;
  }
};

// Get the default location (sync - returns cached or fallback)
const getDefaultLocation = () => {
  return cachedDefaultLocation || FALLBACK_LOCATION;
};

// Load location from localStorage or use default
export const getStoredLocation = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load stored location:', e);
  }
  return getDefaultLocation();
};

// Save location to localStorage
const saveLocation = (location) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
  } catch (e) {
    console.warn('Failed to save location:', e);
  }
};

function LocationSelector({ location, onLocationChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [defaultLocation, setDefaultLocation] = useState(getDefaultLocation());
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Fetch configured default location on mount
  useEffect(() => {
    fetchDefaultLocation().then(loc => {
      setDefaultLocation(loc);
    });
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchQuery('');
        setSearchResults([]);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Search for locations using Open-Meteo geocoding API (free, no API key)
  const searchLocations = async (query, signal) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=en&format=json`,
        { signal }
      );
      const data = await response.json();

      if (data.results) {
        setSearchResults(data.results.map(r => ({
          name: r.name,
          fullName: `${r.name}${r.admin1 ? `, ${r.admin1}` : ''}`,
          lat: r.latitude,
          lng: r.longitude,
          country: r.country
        })));
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      // Ignore abort errors - they're expected when cancelling previous requests
      if (error.name === 'AbortError') return;
      console.error('Location search failed:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced search with AbortController to cancel previous requests
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        // Abort any previous in-flight request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        // Create new AbortController for this request
        abortControllerRef.current = new AbortController();
        searchLocations(searchQuery, abortControllerRef.current.signal);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      // Also abort on cleanup (e.g., component unmount or query change)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [searchQuery]);

  const handleSelectLocation = (loc) => {
    const newLocation = {
      name: loc.fullName || loc.name,
      lat: loc.lat,
      lng: loc.lng,
      country: loc.country
    };
    saveLocation(newLocation);
    onLocationChange(newLocation);
    setIsOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleResetToDefault = () => {
    saveLocation(defaultLocation);
    onLocationChange(defaultLocation);
    setIsOpen(false);
  };

  // Filter presets based on search
  const filteredPresets = searchQuery
    ? PRESET_LOCATIONS.filter(p => !p.divider && p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : PRESET_LOCATIONS;

  // Combine search results with filtered presets
  const displayResults = searchResults.length > 0 ? searchResults : filteredPresets;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Location Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
      >
        <MapPinIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 max-w-[200px] truncate">
          {location?.name || 'Select Location'}
        </span>
        <ChevronDownIcon className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
          {/* Search Input */}
          <div className="p-2 border-b border-slate-200 dark:border-slate-700">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search city or place..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm rounded-md bg-slate-100 dark:bg-slate-700 border-0 focus:ring-2 focus:ring-accent-500 text-slate-900 dark:text-white placeholder-slate-400"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded"
                >
                  <XMarkIcon className="w-4 h-4 text-slate-400" />
                </button>
              )}
            </div>
          </div>

          {/* Results List */}
          <div className="max-h-64 overflow-y-auto">
            {isSearching ? (
              <div className="p-4 text-center text-sm text-slate-500">
                Searching...
              </div>
            ) : displayResults.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-500">
                No locations found
              </div>
            ) : (
              <div className="py-1">
                {displayResults.map((loc, index) => {
                  if (loc.divider) {
                    return (
                      <div key={`divider-${index}`} className="border-t border-slate-200 dark:border-slate-700 my-1">
                        <p className="px-3 py-1 text-xs text-slate-400 uppercase tracking-wide">
                          International
                        </p>
                      </div>
                    );
                  }

                  const isSelected = location?.lat === loc.lat && location?.lng === loc.lng;

                  return (
                    <button
                      key={`${loc.name}-${loc.lat}-${loc.lng}`}
                      onClick={() => handleSelectLocation(loc)}
                      className={`w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between ${
                        isSelected ? 'bg-accent-50 dark:bg-accent-900/20' : ''
                      }`}
                    >
                      <div>
                        <p className={`text-sm ${isSelected ? 'font-medium text-accent-600 dark:text-accent-400' : 'text-slate-700 dark:text-slate-300'}`}>
                          {loc.fullName || loc.name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {loc.country}
                        </p>
                      </div>
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-accent-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Reset to Default */}
          {location?.lat !== defaultLocation.lat || location?.lng !== defaultLocation.lng ? (
            <div className="p-2 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={handleResetToDefault}
                className="w-full px-3 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md text-left"
              >
                Reset to default ({defaultLocation.name})
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default LocationSelector;
