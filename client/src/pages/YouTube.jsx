import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  PlayIcon,
  QueueListIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  ChevronRightIcon,
  VideoCameraIcon,
  DocumentDuplicateIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import api from '../services/api';

function YouTube() {
  const [channelInput, setChannelInput] = useState('');
  const [playlists, setPlaylists] = useState([]);
  const [channelName, setChannelName] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [videos, setVideos] = useState([]);
  const [downloadUrl, setDownloadUrl] = useState('');

  // Playlist Copier State
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState(new Set());
  const [copyOptions, setCopyOptions] = useState({
    copyPrivate: true,
    copyDescriptions: true
  });
  const [sourceAuthorized, setSourceAuthorized] = useState(false);
  const [destinationAuthorized, setDestinationAuthorized] = useState(false);

  // Check OAuth status on mount
  const { data: oauthStatus, refetch: refetchOAuthStatus } = useQuery({
    queryKey: ['youtube-oauth-status'],
    queryFn: async () => {
      const response = await api.get('/youtube/oauth/status');
      return response.data;
    },
    refetchInterval: 5000, // Poll every 5 seconds to detect OAuth completion
  });

  useEffect(() => {
    if (oauthStatus) {
      setSourceAuthorized(oauthStatus.sourceAuthorized);
      setDestinationAuthorized(oauthStatus.destinationAuthorized);
    }
  }, [oauthStatus]);

  // Listen for OAuth callback messages
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === 'oauth_success') {
        if (event.data.accountType === 'source') {
          setSourceAuthorized(true);
          toast.success('Source account authorized!');
        } else if (event.data.accountType === 'destination') {
          setDestinationAuthorized(true);
          toast.success('Destination account authorized!');
        }
        refetchOAuthStatus();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [refetchOAuthStatus]);

  // Fetch playlists mutation
  const playlistsMutation = useMutation({
    mutationFn: async (channel) => {
      const response = await api.get('/youtube/playlists', { params: { channel } });
      return response.data;
    },
    onSuccess: (data) => {
      setPlaylists(data.playlists);
      setChannelName(data.channelName);
      setSelectedPlaylist(null);
      setVideos([]);
      setSelectedPlaylistIds(new Set());
      toast.success(`Found ${data.playlists.length} playlists`);
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to fetch playlists');
    },
  });

  // Fetch playlist videos mutation
  const videosMutation = useMutation({
    mutationFn: async (playlistId) => {
      const response = await api.get('/youtube/playlist-videos', { params: { playlistId } });
      return response.data;
    },
    onSuccess: (data) => {
      setVideos(data.videos);
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to fetch videos');
    },
  });

  // Download audio mutation
  const downloadMutation = useMutation({
    mutationFn: async (url) => {
      const response = await api.post('/youtube/download-audio', { url });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.fileData) {
        const link = document.createElement('a');
        link.href = `data:audio/mpeg;base64,${data.fileData}`;
        link.download = data.filename;
        link.click();
        toast.success('Download complete!');
      }
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Download failed');
    },
  });

  // Copy playlists mutation
  const copyPlaylistsMutation = useMutation({
    mutationFn: async (data) => {
      const response = await api.post('/youtube/copy-playlists', data);
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(data.message);
      setSelectedPlaylistIds(new Set());
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to copy playlists');
    },
  });

  const handleSearchPlaylists = () => {
    if (channelInput.trim()) {
      playlistsMutation.mutate(channelInput.trim());
    }
  };

  const handleSelectPlaylist = (playlist) => {
    setSelectedPlaylist(playlist);
    videosMutation.mutate(playlist.id);
  };

  const handleDownload = () => {
    if (downloadUrl.trim()) {
      downloadMutation.mutate(downloadUrl.trim());
    }
  };

  const handleAuthorize = async (accountType) => {
    try {
      const response = await api.get(`/youtube/oauth/authorize/${accountType}`);
      if (response.data.auth_url) {
        // Open OAuth window
        window.open(response.data.auth_url, '_blank', 'width=600,height=700');
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to start authorization');
    }
  };

  const handleLogout = async (accountType) => {
    try {
      await api.post(`/youtube/oauth/revoke/${accountType}`);
      if (accountType === 'source') {
        setSourceAuthorized(false);
      } else {
        setDestinationAuthorized(false);
      }
      toast.success(`${accountType} account logged out`);
      refetchOAuthStatus();
    } catch (error) {
      toast.error('Failed to logout');
    }
  };

  const togglePlaylistSelection = (playlistId) => {
    const newSet = new Set(selectedPlaylistIds);
    if (newSet.has(playlistId)) {
      newSet.delete(playlistId);
    } else {
      newSet.add(playlistId);
    }
    setSelectedPlaylistIds(newSet);
  };

  const selectAllPlaylists = () => {
    setSelectedPlaylistIds(new Set(playlists.map(p => p.id)));
  };

  const selectNonePlaylists = () => {
    setSelectedPlaylistIds(new Set());
  };

  const handleCopyPlaylists = () => {
    if (selectedPlaylistIds.size === 0) {
      toast.error('Please select at least one playlist');
      return;
    }

    if (!sourceAuthorized || !destinationAuthorized) {
      toast.error('Please authorize both accounts first');
      return;
    }

    copyPlaylistsMutation.mutate({
      playlistIds: Array.from(selectedPlaylistIds),
      copyPrivate: copyOptions.copyPrivate,
      copyDescriptions: copyOptions.copyDescriptions
    });
  };

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
        YouTube Tools
      </h1>

      {/* Playlist Copier Section */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <DocumentDuplicateIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              YouTube Playlist Copier
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Copy playlists from one YouTube account to another
            </p>
          </div>
        </div>

        {/* Step 1: Search Channel */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Step 1: Find Source Channel
          </h3>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                type="text"
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                placeholder="@handle or channel name"
                onKeyDown={(e) => e.key === 'Enter' && handleSearchPlaylists()}
                disabled={playlistsMutation.isPending}
              />
            </div>
            <Button
              onClick={handleSearchPlaylists}
              disabled={!channelInput.trim() || playlistsMutation.isPending}
            >
              {playlistsMutation.isPending ? (
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <MagnifyingGlassIcon className="w-5 h-5" />
              )}
            </Button>
          </div>
          {channelName && (
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
              Channel: <span className="font-medium text-red-600 dark:text-red-400">{channelName}</span>
            </p>
          )}
        </div>

        {/* Step 2: Select Playlists */}
        {playlists.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Step 2: Select Playlists ({selectedPlaylistIds.size} selected)
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={selectAllPlaylists}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Select All
                </button>
                <span className="text-slate-300 dark:text-slate-600">|</span>
                <button
                  onClick={selectNonePlaylists}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Select None
                </button>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-2 border border-slate-200 dark:border-slate-700 rounded-lg p-2">
              {playlists.map((playlist) => (
                <label
                  key={playlist.id}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                    selectedPlaylistIds.has(playlist.id)
                      ? 'bg-red-50 dark:bg-red-900/20'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedPlaylistIds.has(playlist.id)}
                    onChange={() => togglePlaylistSelection(playlist.id)}
                    className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                  />
                  {playlist.thumbnail ? (
                    <img
                      src={playlist.thumbnail}
                      alt={playlist.title}
                      className="w-10 h-7 object-cover rounded"
                    />
                  ) : (
                    <div className="w-10 h-7 bg-slate-200 dark:bg-slate-600 rounded flex items-center justify-center">
                      <QueueListIcon className="w-4 h-4 text-slate-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {playlist.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {playlist.videoCount} videos • {playlist.privacy}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Authorization & Copy */}
        {playlists.length > 0 && selectedPlaylistIds.size > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Step 3: Authorize & Copy
            </h3>

            {/* OAuth Status */}
            {!oauthStatus?.configured && (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-4">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  YouTube OAuth is not configured. Please set up OAuth credentials in config.json to use the playlist copier.
                </p>
              </div>
            )}

            {oauthStatus?.configured && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {/* Source Account */}
                  <div className="p-3 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Source Account
                      </span>
                      {sourceAuthorized ? (
                        <CheckCircleIcon className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircleIcon className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    {sourceAuthorized ? (
                      <button
                        onClick={() => handleLogout('source')}
                        className="text-xs text-red-600 dark:text-red-400 hover:underline"
                      >
                        Logout
                      </button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleAuthorize('source')}
                      >
                        Authorize Source
                      </Button>
                    )}
                  </div>

                  {/* Destination Account */}
                  <div className="p-3 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Destination Account
                      </span>
                      {destinationAuthorized ? (
                        <CheckCircleIcon className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircleIcon className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    {destinationAuthorized ? (
                      <button
                        onClick={() => handleLogout('destination')}
                        className="text-xs text-red-600 dark:text-red-400 hover:underline"
                      >
                        Logout
                      </button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleAuthorize('destination')}
                      >
                        Authorize Destination
                      </Button>
                    )}
                  </div>
                </div>

                {/* Copy Options */}
                <div className="flex flex-wrap gap-4 mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={copyOptions.copyPrivate}
                      onChange={(e) => setCopyOptions(prev => ({ ...prev, copyPrivate: e.target.checked }))}
                      className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      Include private playlists
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={copyOptions.copyDescriptions}
                      onChange={(e) => setCopyOptions(prev => ({ ...prev, copyDescriptions: e.target.checked }))}
                      className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      Copy descriptions
                    </span>
                  </label>
                </div>

                {/* Copy Button */}
                <Button
                  onClick={handleCopyPlaylists}
                  disabled={!sourceAuthorized || !destinationAuthorized || copyPlaylistsMutation.isPending}
                  className="w-full"
                >
                  {copyPlaylistsMutation.isPending ? (
                    <>
                      <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                      Copying...
                    </>
                  ) : (
                    <>
                      <DocumentDuplicateIcon className="w-5 h-5 mr-2" />
                      Copy {selectedPlaylistIds.size} Playlist{selectedPlaylistIds.size !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Playlist Browser */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <VideoCameraIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Playlist Videos
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {selectedPlaylist ? selectedPlaylist.title : 'Click a playlist to view videos'}
              </p>
            </div>
          </div>

          {playlists.length > 0 && !selectedPlaylist ? (
            <div className="max-h-64 overflow-y-auto space-y-2">
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  onClick={() => handleSelectPlaylist(playlist)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  {playlist.thumbnail ? (
                    <img
                      src={playlist.thumbnail}
                      alt={playlist.title}
                      className="w-12 h-9 object-cover rounded"
                    />
                  ) : (
                    <div className="w-12 h-9 bg-slate-200 dark:bg-slate-600 rounded flex items-center justify-center">
                      <QueueListIcon className="w-5 h-5 text-slate-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {playlist.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {playlist.videoCount} videos
                    </p>
                  </div>
                  <ChevronRightIcon className="w-4 h-4 text-slate-400" />
                </button>
              ))}
            </div>
          ) : videos.length > 0 ? (
            <>
              <button
                onClick={() => { setSelectedPlaylist(null); setVideos([]); }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline mb-3"
              >
                ← Back to playlists
              </button>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {videos.map((video) => (
                  <a
                    key={video.videoId}
                    href={`https://www.youtube.com/watch?v=${video.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="w-16 h-9 bg-slate-200 dark:bg-slate-600 rounded flex items-center justify-center">
                      <PlayIcon className="w-5 h-5 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {video.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        #{video.position + 1}
                      </p>
                    </div>
                    <PlayIcon className="w-4 h-4 text-red-500" />
                  </a>
                ))}
              </div>
            </>
          ) : videosMutation.isPending ? (
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-sm text-slate-500">Loading videos...</p>
            </div>
          ) : (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-700/50 rounded-lg">
              <VideoCameraIcon className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
              <p className="text-slate-500 dark:text-slate-400">
                {playlists.length > 0 ? 'Click a playlist to view videos' : 'Search for a channel first'}
              </p>
            </div>
          )}
        </div>

        {/* Audio Download Section */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <ArrowDownTrayIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Download Audio
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Extract MP3 audio from YouTube videos
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                type="text"
                value={downloadUrl}
                onChange={(e) => setDownloadUrl(e.target.value)}
                placeholder="Paste YouTube URL..."
                onKeyDown={(e) => e.key === 'Enter' && handleDownload()}
                disabled={downloadMutation.isPending}
              />
            </div>
            <Button
              onClick={handleDownload}
              disabled={!downloadUrl.trim() || downloadMutation.isPending}
            >
              {downloadMutation.isPending ? (
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <ArrowDownTrayIcon className="w-5 h-5" />
              )}
            </Button>
          </div>

          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Note: Download functionality requires yt-dlp and ffmpeg installed on the server.
          </p>
        </div>
      </div>
    </div>
  );
}

export default YouTube;
