import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  MagnifyingGlassIcon,
  MusicalNoteIcon,
  CheckIcon,
  ForwardIcon,
  BackwardIcon,
  ArrowPathIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import api from '../services/api';

function Music() {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentState, setCurrentState] = useState(null);
  const [artistImage, setArtistImage] = useState(null);
  const queryClient = useQueryClient();

  // Fetch current state on mount
  const { isLoading: isLoadingCurrent } = useQuery({
    queryKey: ['music-current'],
    queryFn: async () => {
      const response = await api.get('/music-next/current');
      if (response.data.search_artist) {
        setCurrentState(response.data);
      }
      return response.data;
    },
  });

  // Fetch search history
  const { data: historyData } = useQuery({
    queryKey: ['music-history'],
    queryFn: async () => {
      const response = await api.get('/music-next/history');
      return response.data;
    },
  });

  // Fetch artist image when recommendation changes
  useEffect(() => {
    if (currentState?.current_recommendation) {
      setArtistImage(null);
      api.get('/music-next/artist-image', {
        params: { artist: currentState.current_recommendation }
      }).then(response => {
        setArtistImage(response.data.image_url);
      }).catch(() => {
        setArtistImage(null);
      });
    }
  }, [currentState?.current_recommendation]);

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async (artist) => {
      const response = await api.get('/music-next/search', { params: { artist } });
      return response.data;
    },
    onSuccess: (data) => {
      setCurrentState(data);
      queryClient.invalidateQueries(['music-history']);
      setSearchTerm('');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to search for artist');
    },
  });

  // Listened mutation
  const listenedMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/music-next/listened', {
        artist: currentState.search_artist,
        recommended: currentState.current_recommendation,
      });
      return response.data;
    },
    onSuccess: (data) => {
      setCurrentState(data);
      if (!data.current_recommendation) {
        toast.success("You've explored all recommendations!");
      }
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update');
    },
  });

  // Skip mutation
  const skipMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/music-next/skip', {
        artist: currentState.search_artist,
        recommended: currentState.current_recommendation,
      });
      return response.data;
    },
    onSuccess: (data) => {
      setCurrentState(data);
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to skip');
    },
  });

  // Back mutation
  const backMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/music-next/back', {
        artist: currentState.search_artist,
      });
      return response.data;
    },
    onSuccess: (data) => {
      setCurrentState(data);
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Cannot go back further');
    },
  });

  const handleSearch = useCallback(() => {
    const artist = searchTerm.trim();
    if (artist) {
      searchMutation.mutate(artist);
    }
  }, [searchTerm, searchMutation]);

  const handleHistoryClick = useCallback((artist) => {
    searchMutation.mutate(artist);
  }, [searchMutation]);

  const handleListen = useCallback(() => {
    if (currentState?.current_recommendation) {
      const searchQuery = encodeURIComponent(currentState.current_recommendation);
      window.open(`https://www.youtube.com/results?search_query=${searchQuery}`, '_blank');
    }
  }, [currentState]);

  const handleNewSearch = useCallback(() => {
    setCurrentState(null);
    setSearchTerm('');
  }, []);

  const isLoading = searchMutation.isPending || listenedMutation.isPending ||
    skipMutation.isPending || backMutation.isPending;

  const canGoBack = currentState && (currentState.current_index || 0) > 0;

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
        Music Discovery
      </h1>
      <p className="text-slate-500 dark:text-slate-400 mb-6">
        Discover similar artists based on your favorite bands
      </p>

      {/* Search Card */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <MusicalNoteIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Artist Search
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Find artists similar to ones you love
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Enter an artist or band name..."
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              disabled={searchMutation.isPending}
            />
          </div>
          <Button
            onClick={handleSearch}
            disabled={!searchTerm.trim() || searchMutation.isPending}
          >
            <MagnifyingGlassIcon className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Recommendation Card */}
      {currentState?.search_artist && (
        <div className="card p-6 mb-6">
          <div className="mb-4">
            <span className="text-slate-500 dark:text-slate-400">Based on: </span>
            <span className="text-purple-600 dark:text-purple-400 font-semibold">
              {currentState.search_artist}
            </span>
          </div>

          {currentState.current_recommendation ? (
            <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl p-6 text-white text-center">
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm opacity-90">Try listening to:</span>
                <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
                  {currentState.listened_count + 1} / {currentState.total_count}
                </span>
              </div>

              {/* Artist Image */}
              <div className="w-48 h-48 mx-auto mb-4 rounded-xl overflow-hidden shadow-lg bg-white/10">
                {artistImage ? (
                  <img
                    src={artistImage}
                    alt={currentState.current_recommendation}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <MusicalNoteIcon className="w-16 h-16 text-white/50" />
                  </div>
                )}
              </div>

              {/* Artist Name */}
              <h3 className="text-3xl font-bold mb-6">
                {currentState.current_recommendation}
              </h3>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 justify-center">
                <button
                  onClick={() => listenedMutation.mutate()}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-4 py-2 border-2 border-white rounded-lg hover:bg-white hover:text-purple-500 transition-colors disabled:opacity-50"
                >
                  <CheckIcon className="w-4 h-4" />
                  Listened
                </button>
                <button
                  onClick={() => skipMutation.mutate()}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-4 py-2 border-2 border-white rounded-lg hover:bg-white hover:text-purple-500 transition-colors disabled:opacity-50"
                >
                  <ForwardIcon className="w-4 h-4" />
                  Skip
                </button>
                <button
                  onClick={() => backMutation.mutate()}
                  disabled={isLoading || !canGoBack}
                  className="flex items-center gap-2 px-4 py-2 border-2 border-white rounded-lg hover:bg-white hover:text-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <BackwardIcon className="w-4 h-4" />
                  Back
                </button>
                <button
                  onClick={handleNewSearch}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-4 py-2 border-2 border-white rounded-lg hover:bg-white hover:text-purple-500 transition-colors disabled:opacity-50"
                >
                  <ArrowPathIcon className="w-4 h-4" />
                  New Search
                </button>
                <button
                  onClick={handleListen}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-4 py-2 border-2 border-white rounded-lg hover:bg-white hover:text-purple-500 transition-colors disabled:opacity-50"
                >
                  <PlayIcon className="w-4 h-4" />
                  Listen
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-100 dark:bg-slate-700 rounded-xl p-8 text-center">
              <CheckIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <p className="text-lg text-slate-700 dark:text-slate-300 mb-4">
                You've explored all recommendations for this artist!
              </p>
              <Button onClick={() => searchMutation.mutate(currentState.search_artist)}>
                <ArrowPathIcon className="w-4 h-4 mr-2" />
                Check for Updates
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Search History */}
      {historyData?.history && historyData.history.length > 0 && (
        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
            Search History
          </h3>
          <div className="flex flex-wrap gap-2">
            {historyData.history.map((artist, index) => (
              <button
                key={index}
                onClick={() => handleHistoryClick(artist)}
                disabled={searchMutation.isPending}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-purple-500 hover:text-white dark:hover:bg-purple-500 rounded-full text-sm text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50"
              >
                {artist}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!currentState?.search_artist && !isLoadingCurrent && (!historyData?.history || historyData.history.length === 0) && (
        <div className="card p-8 text-center">
          <MusicalNoteIcon className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400">
            Search for an artist to start discovering similar music
          </p>
        </div>
      )}
    </div>
  );
}

export default Music;
