import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LightBulbIcon,
  BoltIcon,
  ArrowPathIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  CheckIcon,
  WifiIcon,
  FolderIcon,
  Cog6ToothIcon,
  FireIcon,
  MinusIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { homeApi } from '../services/api';

// Device Card Component
function DeviceCard({ device, onToggle }) {
  const isOnline = device.online !== false;
  const isOn = device.state?.isOn;

  const handleToggle = () => {
    if (!isOnline) {
      toast.error('Device is offline');
      return;
    }
    onToggle(device, !isOn);
  };

  return (
    <div className={`card p-4 ${!isOnline ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isOn ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-slate-100 dark:bg-slate-700'}`}>
            {device.capabilities?.includes('on_off') && !device.capabilities?.includes('brightness') ? (
              <BoltIcon className={`w-5 h-5 ${isOn ? 'text-yellow-500' : 'text-slate-400'}`} />
            ) : (
              <LightBulbIcon className={`w-5 h-5 ${isOn ? 'text-yellow-500' : 'text-slate-400'}`} />
            )}
          </div>
          <div>
            <h3 className="font-medium text-slate-900 dark:text-white">{device.name}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {device.model} • {device.provider}
              {!isOnline && ' • Offline'}
            </p>
          </div>
        </div>

        {/* Power Toggle */}
        <button
          onClick={handleToggle}
          disabled={!isOnline}
          className={`relative w-14 h-7 rounded-full transition-colors ${
            isOn ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
          } ${!isOnline ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            isOn ? 'translate-x-8' : 'translate-x-1'
          }`} />
        </button>
      </div>
    </div>
  );
}

// Group Card Component
function GroupCard({ group, devices, onToggle, onEdit, onDelete, isToggling }) {
  const groupDevices = devices.filter(d => group.deviceIds?.includes(d.id));
  const onlineDevices = groupDevices.filter(d => d.online !== false);
  const onCount = groupDevices.filter(d => d.state?.isOn).length;
  const allOn = onCount === groupDevices.length && groupDevices.length > 0;
  const someOn = onCount > 0 && onCount < groupDevices.length;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${allOn ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-slate-100 dark:bg-slate-700'}`}>
            <FolderIcon className={`w-5 h-5 ${allOn ? 'text-yellow-500' : someOn ? 'text-yellow-400' : 'text-slate-400'}`} />
          </div>
          <div>
            <h3 className="font-medium text-slate-900 dark:text-white">{group.name}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {groupDevices.length} device{groupDevices.length !== 1 ? 's' : ''} • {onCount} on
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(group)}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
            title="Edit group"
          >
            <Cog6ToothIcon className="w-4 h-4" />
          </button>

          {/* Power Toggle */}
          <button
            onClick={() => onToggle(group, !allOn)}
            disabled={isToggling || onlineDevices.length === 0}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              allOn ? 'bg-green-500' : someOn ? 'bg-green-300 dark:bg-green-700' : 'bg-slate-300 dark:bg-slate-600'
            } ${onlineDevices.length === 0 ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          >
            <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              allOn || someOn ? 'translate-x-8' : 'translate-x-1'
            }`} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Create/Edit Group Modal
function GroupModal({ group, devices, onClose, onSave, onDelete }) {
  const [name, setName] = useState(group?.name || '');
  const [selectedDevices, setSelectedDevices] = useState(new Set(group?.deviceIds || []));
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = !!group?.id;

  const toggleDevice = (deviceId) => {
    const newSelected = new Set(selectedDevices);
    if (newSelected.has(deviceId)) {
      newSelected.delete(deviceId);
    } else {
      newSelected.add(deviceId);
    }
    setSelectedDevices(newSelected);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      await onSave({
        id: group?.id,
        name: name.trim(),
        deviceIds: Array.from(selectedDevices),
      });
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || error.message || 'Failed to save group');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete group "${group.name}"?`)) return;
    try {
      await onDelete(group.id);
      onClose();
    } catch (error) {
      toast.error('Failed to delete group');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {isEditing ? 'Edit Group' : 'Create Group'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
            <XMarkIcon className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Group Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Office, Living Room"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400"
              required
              autoFocus
            />
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Select Devices ({selectedDevices.size} selected)
            </label>
            <div className="space-y-2">
              {devices.map((device) => (
                <div
                  key={device.id}
                  onClick={() => toggleDevice(device.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedDevices.has(device.id)
                      ? 'bg-accent-50 dark:bg-accent-900/20 border-accent-300 dark:border-accent-700'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-accent-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                      selectedDevices.has(device.id)
                        ? 'bg-accent-500 border-accent-500'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {selectedDevices.has(device.id) && (
                        <CheckIcon className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">{device.name}</p>
                      <p className="text-xs text-slate-500">{device.model} • {device.provider}</p>
                    </div>
                  </div>
                </div>
              ))}
              {devices.length === 0 && (
                <p className="text-center text-slate-500 py-4">No devices available</p>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            {isEditing && (
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
              >
                Delete
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim()}
              className="px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : isEditing ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Add Device Modal
function AddDeviceModal({ onClose, onAdd }) {
  const [ip, setIp] = useState('');
  const [name, setName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!ip) return;

    setIsAdding(true);
    try {
      await onAdd(ip, name);
      onClose();
    } catch (error) {
      toast.error(error.message || 'Failed to add device');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Add Tapo Device</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
            <XMarkIcon className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                IP Address *
              </label>
              <input
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="192.168.1.100"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400"
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                Find the IP in your Tapo app under Device Info
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Name (optional)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Living Room Light"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAdding || !ip}
              className="flex-1 px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 disabled:opacity-50"
            >
              {isAdding ? 'Adding...' : 'Add Device'}
            </button>
          </div>
        </form>

        <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
          Note: Make sure TAPO_EMAIL and TAPO_PASSWORD are set in your .env file.
        </p>
      </div>
    </div>
  );
}

// Discovery Modal Component
function DiscoveryModal({ onClose, onDevicesAdded }) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [selectedDevices, setSelectedDevices] = useState(new Set());
  const [isAdding, setIsAdding] = useState(false);

  const startScan = async () => {
    setIsScanning(true);
    setScanResult(null);
    try {
      const response = await homeApi.discoverTapoDevices();
      setScanResult(response.data);
      const newDeviceIps = (response.data.newDevices || []).map(d => d.ip);
      setSelectedDevices(new Set(newDeviceIps));
    } catch (error) {
      toast.error('Discovery failed: ' + (error.message || 'Unknown error'));
    } finally {
      setIsScanning(false);
    }
  };

  const toggleDevice = (ip) => {
    const newSelected = new Set(selectedDevices);
    if (newSelected.has(ip)) {
      newSelected.delete(ip);
    } else {
      newSelected.add(ip);
    }
    setSelectedDevices(newSelected);
  };

  const addSelectedDevices = async () => {
    const devicesToAdd = scanResult.devicesFound
      .filter(d => selectedDevices.has(d.ip) && !d.alreadyAdded)
      .map(d => ({ ip: d.ip, name: d.name }));

    if (devicesToAdd.length === 0) {
      toast.error('No new devices selected');
      return;
    }

    setIsAdding(true);
    try {
      await homeApi.addDiscoveredDevices(devicesToAdd);
      toast.success(`Added ${devicesToAdd.length} device(s)`);
      onDevicesAdded();
      onClose();
    } catch (error) {
      toast.error('Failed to add devices: ' + (error.message || 'Unknown error'));
    } finally {
      setIsAdding(false);
    }
  };

  const newDevicesCount = scanResult?.devicesFound?.filter(d => !d.alreadyAdded && !d.error).length || 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <MagnifyingGlassIcon className="w-5 h-5" />
            Discover Tapo Devices
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
            <XMarkIcon className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {!scanResult && !isScanning && (
          <div className="text-center py-8">
            <WifiIcon className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Scan your local network to find Tapo devices automatically.
            </p>
            <button
              onClick={startScan}
              className="btn-primary inline-flex items-center gap-2"
            >
              <MagnifyingGlassIcon className="w-4 h-4" />
              Start Network Scan
            </button>
            <p className="text-xs text-slate-500 mt-4">
              This may take up to a minute depending on your network.
            </p>
          </div>
        )}

        {isScanning && (
          <div className="text-center py-12">
            <ArrowPathIcon className="w-10 h-10 text-accent-500 mx-auto mb-4 animate-spin" />
            <p className="text-slate-600 dark:text-slate-400">
              Scanning network for Tapo devices...
            </p>
            <p className="text-xs text-slate-500 mt-2">
              This may take up to a minute.
            </p>
          </div>
        )}

        {scanResult && !isScanning && (
          <>
            <div className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              Scanned {scanResult.subnetsScanned?.length || 0} subnet(s): {scanResult.subnetsScanned?.map(s => s.replace('.0', '.x')).join(', ')}
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              {scanResult.devicesFound?.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <p>No Tapo devices found on your network.</p>
                  <p className="text-xs mt-2">Make sure your devices are powered on and connected to WiFi.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {scanResult.devicesFound.map((device) => (
                    <div
                      key={device.ip}
                      className={`p-3 rounded-lg border transition-colors ${
                        device.alreadyAdded
                          ? 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-700'
                          : device.error
                          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                          : selectedDevices.has(device.ip)
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-accent-300 cursor-pointer'
                      }`}
                      onClick={() => !device.alreadyAdded && !device.error && toggleDevice(device.ip)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {!device.alreadyAdded && !device.error && (
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                              selectedDevices.has(device.ip)
                                ? 'bg-green-500 border-green-500'
                                : 'border-slate-300 dark:border-slate-600'
                            }`}>
                              {selectedDevices.has(device.ip) && (
                                <CheckIcon className="w-3 h-3 text-white" />
                              )}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white">
                              {device.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {device.ip} • {device.model}
                              {device.alreadyAdded && ' • Already added'}
                              {device.error && ` • ${device.error}`}
                            </p>
                          </div>
                        </div>
                        {device.alreadyAdded && (
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                            Added
                          </span>
                        )}
                        {device.isOn !== undefined && !device.error && (
                          <span className={`text-xs px-2 py-1 rounded ${
                            device.isOn
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                          }`}>
                            {device.isOn ? 'On' : 'Off'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={startScan}
                className="flex-1 px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg flex items-center justify-center gap-2"
              >
                <ArrowPathIcon className="w-4 h-4" />
                Rescan
              </button>
              <button
                onClick={addSelectedDevices}
                disabled={isAdding || selectedDevices.size === 0 || newDevicesCount === 0}
                className="flex-1 px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isAdding ? (
                  <>
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <PlusIcon className="w-4 h-4" />
                    Add {selectedDevices.size > 0 ? selectedDevices.size : ''} Device{selectedDevices.size !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Single Zone Card Component
function ZoneCard({ zone, onSetTemperature, onBoost, onCancelBoost, onSetMode }) {
  const [adjustedTemp, setAdjustedTemp] = useState(null);

  const displayTemp = adjustedTemp !== null ? adjustedTemp : zone.targetTemperature;
  const hasChanges = adjustedTemp !== null && adjustedTemp !== zone.targetTemperature;

  const incrementTemp = () => {
    const newTemp = Math.min((adjustedTemp ?? zone.targetTemperature) + 0.5, 30);
    setAdjustedTemp(newTemp);
  };

  const decrementTemp = () => {
    const newTemp = Math.max((adjustedTemp ?? zone.targetTemperature) - 0.5, 5);
    setAdjustedTemp(newTemp);
  };

  const applyTemperature = async () => {
    if (adjustedTemp !== null) {
      await onSetTemperature(zone.id, adjustedTemp);
      setAdjustedTemp(null);
    }
  };

  const cancelChanges = () => {
    setAdjustedTemp(null);
  };

  return (
    <div className="card p-4">
      {/* Header with zone name */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${zone.isHeating ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-slate-100 dark:bg-slate-700'}`}>
            <FireIcon className={`w-4 h-4 ${zone.isHeating ? 'text-orange-500' : 'text-slate-400'}`} />
          </div>
          <h3 className="font-medium text-sm text-slate-900 dark:text-white">{zone.name}</h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {zone.isHeating ? 'Heating' : 'Idle'} • {zone.modeName || 'Auto'}
          {zone.isBoostActive && ` • Boost`}
        </p>
      </div>

      {/* Current temperature - prominent */}
      <div className="text-center py-2">
        <p className="text-4xl font-bold text-slate-900 dark:text-white">
          {zone.currentTemperature !== null ? `${zone.currentTemperature}°` : '--'}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Current</p>
      </div>

      {/* Target temperature control - smaller */}
      <div className="flex items-center justify-center gap-3 py-2 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={decrementTemp}
          className="p-1 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
        >
          <MinusIcon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        </button>

        <div className="text-center min-w-[70px]">
          <p className={`text-xl font-semibold ${hasChanges ? 'text-accent-500' : 'text-slate-600 dark:text-slate-300'}`}>
            {displayTemp}°
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">Target</p>
        </div>

        <button
          onClick={incrementTemp}
          className="p-1 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
        >
          <PlusIcon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        </button>
      </div>

      {/* Apply/Cancel buttons when temp changed */}
      {hasChanges && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={cancelChanges}
            className="flex-1 px-2 py-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-xs"
          >
            Cancel
          </button>
          <button
            onClick={applyTemperature}
            className="flex-1 px-2 py-1.5 bg-accent-500 text-white rounded-lg hover:bg-accent-600 text-xs"
          >
            Set {adjustedTemp}°
          </button>
        </div>
      )}

      {/* Quick actions */}
      {!hasChanges && (
        <div className="flex gap-2 mt-3">
          {zone.isBoostActive ? (
            <button
              onClick={() => onCancelBoost(zone.id)}
              className="flex-1 px-2 py-1.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-900/50 text-xs font-medium"
            >
              Cancel Boost
            </button>
          ) : (
            <button
              onClick={() => onBoost(zone.id)}
              className="flex-1 px-2 py-1.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-900/50 text-xs font-medium"
            >
              Boost
            </button>
          )}
          <select
            value={zone.modeName || 'Auto'}
            onChange={(e) => onSetMode(zone.id, e.target.value)}
            className="flex-1 px-2 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-300 border-0"
          >
            <option value="Auto">Auto</option>
            <option value="On">On</option>
            <option value="Off">Off</option>
            <option value="All Day">All Day</option>
          </select>
        </div>
      )}
    </div>
  );
}

// Thermostat Section Component (shows all zones side by side)
function ThermostatCard({ thermostat, onSetTemperature, onBoost, onCancelBoost, onSetMode }) {
  if (!thermostat?.configured) {
    return null;
  }

  if (!thermostat?.connected) {
    return (
      <div className="card p-4 border-l-4 border-amber-500">
        <div className="flex items-center gap-3">
          <FireIcon className="w-6 h-6 text-amber-500" />
          <div>
            <h3 className="font-medium text-slate-900 dark:text-white">Thermostat</h3>
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Unable to connect: {thermostat.error || 'Unknown error'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const zones = thermostat.allZones || [];
  if (zones.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {zones.map((zone) => (
        <ZoneCard
          key={zone.id}
          zone={zone}
          onSetTemperature={onSetTemperature}
          onBoost={onBoost}
          onCancelBoost={onCancelBoost}
          onSetMode={onSetMode}
        />
      ))}
    </div>
  );
}

// Main Home Automation Page
function HomeAutomation() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

  // Fetch all devices
  const {
    data: devicesData,
    isLoading: devicesLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['home-devices'],
    queryFn: async () => {
      const response = await homeApi.getDevices();
      return response.data;
    },
    refetchInterval: 30000,
    staleTime: 10000,
  });

  // Fetch groups
  const { data: groupsData, isLoading: groupsLoading } = useQuery({
    queryKey: ['home-groups'],
    queryFn: async () => {
      const response = await homeApi.getGroups();
      return response.data;
    },
  });

  // Fetch thermostat
  const { data: thermostatData, isLoading: thermostatLoading } = useQuery({
    queryKey: ['home-thermostat'],
    queryFn: async () => {
      const response = await homeApi.getThermostat();
      return response.data;
    },
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000,
  });

  // Power toggle mutation
  const powerMutation = useMutation({
    mutationFn: async ({ device, state }) => {
      return homeApi.setPower(device.provider, device.id, state);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['home-devices']);
    },
    onError: (error) => {
      toast.error(`Failed to toggle device: ${error.message}`);
    },
  });

  // Group power mutation
  const groupPowerMutation = useMutation({
    mutationFn: async ({ groupId, state }) => {
      return homeApi.setGroupPower(groupId, state);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['home-devices']);
      const { summary } = data.data;
      if (summary.failed > 0) {
        toast.error(`${summary.failed} device(s) failed to respond`);
      }
    },
    onError: (error) => {
      toast.error(`Failed to toggle group: ${error.response?.data?.error || error.message}`);
    },
  });

  // Create group mutation
  const createGroupMutation = useMutation({
    mutationFn: async ({ name, deviceIds }) => {
      return homeApi.createGroup(name, deviceIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['home-groups']);
      toast.success('Group created');
    },
  });

  // Update group mutation
  const updateGroupMutation = useMutation({
    mutationFn: async ({ id, name, deviceIds }) => {
      return homeApi.updateGroup(id, { name, deviceIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['home-groups']);
      toast.success('Group updated');
    },
  });

  // Delete group mutation
  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId) => {
      return homeApi.deleteGroup(groupId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['home-groups']);
      toast.success('Group deleted');
    },
  });

  // Add device mutation
  const addDeviceMutation = useMutation({
    mutationFn: async ({ ip, name }) => {
      return homeApi.addTapoDevice(ip, name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['home-devices']);
      toast.success('Device added successfully');
    },
  });

  // Delete device mutation
  const deleteDeviceMutation = useMutation({
    mutationFn: async (deviceId) => {
      return homeApi.removeTapoDevice(deviceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['home-devices']);
      toast.success('Device removed');
    },
    onError: (error) => {
      toast.error(`Failed to remove device: ${error.message}`);
    },
  });

  // Thermostat mutations
  const thermostatTempMutation = useMutation({
    mutationFn: async ({ zoneId, temperature }) => {
      return homeApi.setThermostatTemperature(zoneId, temperature);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['home-thermostat']);
      toast.success('Temperature updated');
    },
    onError: (error) => {
      toast.error(`Failed to set temperature: ${error.response?.data?.error || error.message}`);
    },
  });

  const thermostatBoostMutation = useMutation({
    mutationFn: async ({ zoneId, temperature, hours }) => {
      return homeApi.activateThermostatBoost(zoneId, temperature, hours);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['home-thermostat']);
      toast.success('Boost activated');
    },
    onError: (error) => {
      toast.error(`Failed to activate boost: ${error.response?.data?.error || error.message}`);
    },
  });

  const thermostatCancelBoostMutation = useMutation({
    mutationFn: async (zoneId) => {
      return homeApi.deactivateThermostatBoost(zoneId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['home-thermostat']);
      toast.success('Boost cancelled');
    },
    onError: (error) => {
      toast.error(`Failed to cancel boost: ${error.response?.data?.error || error.message}`);
    },
  });

  const thermostatModeMutation = useMutation({
    mutationFn: async ({ zoneId, mode }) => {
      return homeApi.setThermostatMode(zoneId, mode);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['home-thermostat']);
      toast.success('Mode updated');
    },
    onError: (error) => {
      toast.error(`Failed to set mode: ${error.response?.data?.error || error.message}`);
    },
  });

  const handleToggle = useCallback((device, state) => {
    powerMutation.mutate({ device, state });
  }, [powerMutation]);

  const handleGroupToggle = useCallback((group, state) => {
    groupPowerMutation.mutate({ groupId: group.id, state });
  }, [groupPowerMutation]);

  const handleSaveGroup = useCallback(async (groupData) => {
    if (groupData.id) {
      await updateGroupMutation.mutateAsync(groupData);
    } else {
      await createGroupMutation.mutateAsync(groupData);
    }
  }, [createGroupMutation, updateGroupMutation]);

  const handleDeleteGroup = useCallback(async (groupId) => {
    await deleteGroupMutation.mutateAsync(groupId);
  }, [deleteGroupMutation]);

  const handleAddDevice = useCallback(async (ip, name) => {
    await addDeviceMutation.mutateAsync({ ip, name });
  }, [addDeviceMutation]);

  const openGroupModal = (group = null) => {
    setEditingGroup(group);
    setShowGroupModal(true);
  };

  // Thermostat handlers
  const handleSetThermostatTemp = useCallback(async (zoneId, temperature) => {
    await thermostatTempMutation.mutateAsync({ zoneId, temperature });
  }, [thermostatTempMutation]);

  const handleThermostatBoost = useCallback(async (zoneId, temperature = null, hours = 1) => {
    await thermostatBoostMutation.mutateAsync({ zoneId, temperature, hours });
  }, [thermostatBoostMutation]);

  const handleCancelThermostatBoost = useCallback(async (zoneId) => {
    await thermostatCancelBoostMutation.mutateAsync(zoneId);
  }, [thermostatCancelBoostMutation]);

  const handleSetThermostatMode = useCallback(async (zoneId, mode) => {
    await thermostatModeMutation.mutateAsync({ zoneId, mode });
  }, [thermostatModeMutation]);

  const devices = devicesData?.devices || [];
  const groups = groupsData?.groups || [];
  const goveeDevices = devices.filter(d => d.provider === 'govee');
  const tapoDevices = devices.filter(d => d.provider === 'tapo');
  const thermostat = thermostatData;
  const isLoading = devicesLoading || groupsLoading;

  return (
    <div className="max-w-4xl mx-auto animate-fade-in pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Home Automation
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {devices.length} device{devices.length !== 1 ? 's' : ''} • {groups.length} group{groups.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              try {
                await homeApi.refresh();
                refetch();
              } catch (error) {
                toast.error('Refresh failed');
              }
            }}
            disabled={isFetching}
            className="btn-ghost p-2"
            title="Refresh device states"
          >
            <ArrowPathIcon className={`w-5 h-5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowDiscoveryModal(true)}
            className="btn-ghost flex items-center gap-2"
            title="Discover Tapo devices"
          >
            <MagnifyingGlassIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Discover</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <PlusIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Add Device</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <ArrowPathIcon className="w-8 h-8 animate-spin text-accent-500" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Thermostat */}
          {thermostat?.configured && (
            <div>
              <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                Heating
              </h2>
              <ThermostatCard
                thermostat={thermostat}
                onSetTemperature={handleSetThermostatTemp}
                onBoost={handleThermostatBoost}
                onCancelBoost={handleCancelThermostatBoost}
                onSetMode={handleSetThermostatMode}
              />
            </div>
          )}

          {/* Device Groups */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Groups ({groups.length})
              </h2>
              <button
                onClick={() => openGroupModal()}
                className="text-sm text-accent-600 dark:text-accent-400 hover:underline flex items-center gap-1"
              >
                <PlusIcon className="w-4 h-4" />
                New Group
              </button>
            </div>
            {groups.length === 0 ? (
              <div className="card p-6 text-center">
                <FolderIcon className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                  Create groups to control multiple devices at once
                </p>
                <button
                  onClick={() => openGroupModal()}
                  className="mt-3 text-sm text-accent-600 dark:text-accent-400 hover:underline"
                >
                  Create your first group
                </button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {groups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    devices={devices}
                    onToggle={handleGroupToggle}
                    onEdit={openGroupModal}
                    onDelete={handleDeleteGroup}
                    isToggling={groupPowerMutation.isPending}
                  />
                ))}
              </div>
            )}
          </div>

          {devices.length === 0 ? (
            <div className="card p-8 text-center">
              <LightBulbIcon className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <h2 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
                No Devices Found
              </h2>
              <p className="text-slate-500 dark:text-slate-400 mb-4">
                Add your Tapo devices by IP address, or Govee devices will be discovered automatically.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="btn-primary inline-flex items-center gap-2"
              >
                <PlusIcon className="w-4 h-4" />
                Add Tapo Device
              </button>
            </div>
          ) : (
            <>
              {/* Govee Devices */}
              {goveeDevices.length > 0 && (
                <div>
                  <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                    Govee Devices ({goveeDevices.length})
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {goveeDevices.map((device) => (
                      <DeviceCard
                        key={device.id}
                        device={device}
                        onToggle={handleToggle}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Tapo Devices */}
              {tapoDevices.length > 0 && (
                <div>
                  <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                    TP-Link Tapo Devices ({tapoDevices.length})
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {tapoDevices.map((device) => (
                      <div key={device.id} className="relative group">
                        <DeviceCard
                          device={device}
                          onToggle={handleToggle}
                        />
                        <button
                          onClick={() => deleteDeviceMutation.mutate(device.id)}
                          className="absolute top-2 right-2 p-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remove device"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Discovery Actions */}
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          onClick={() => setShowDiscoveryModal(true)}
          className="btn-ghost flex items-center gap-2"
        >
          <MagnifyingGlassIcon className="w-4 h-4" />
          Discover Tapo Devices
        </button>
        <button
          onClick={async () => {
            toast.success('Scanning for Govee devices...');
            try {
              await homeApi.discoverGoveeDevices();
              refetch();
              toast.success('Govee discovery complete');
            } catch (error) {
              toast.error('Govee discovery failed');
            }
          }}
          className="btn-ghost flex items-center gap-2"
        >
          <MagnifyingGlassIcon className="w-4 h-4" />
          Discover Govee Devices
        </button>
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddDeviceModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddDevice}
        />
      )}

      {showDiscoveryModal && (
        <DiscoveryModal
          onClose={() => setShowDiscoveryModal(false)}
          onDevicesAdded={() => {
            queryClient.invalidateQueries(['home-devices']);
          }}
        />
      )}

      {showGroupModal && (
        <GroupModal
          group={editingGroup}
          devices={devices}
          onClose={() => {
            setShowGroupModal(false);
            setEditingGroup(null);
          }}
          onSave={handleSaveGroup}
          onDelete={handleDeleteGroup}
        />
      )}
    </div>
  );
}

export default HomeAutomation;
