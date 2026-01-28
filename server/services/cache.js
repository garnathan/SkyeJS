import NodeCache from 'node-cache';

// Create cache instance with default TTL of 5 minutes
// useClones: false prevents doubling memory by returning references instead of copies
export const cache = new NodeCache({
  stdTTL: 300,
  checkperiod: 60,
  useClones: false
});

// Wrapper functions for easier use
export const cacheGet = (key) => cache.get(key);
export const cacheSet = (key, value, ttl) => cache.set(key, value, ttl);
export const cacheDel = (key) => cache.del(key);
export const cacheFlush = () => cache.flushAll();

export default cache;
