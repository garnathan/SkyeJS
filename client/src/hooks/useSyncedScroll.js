import { useRef, useCallback, useEffect } from 'react';

/**
 * Hook to synchronize scroll positions across multiple scrollable elements
 * @param {string} groupId - Unique identifier for the scroll group
 * @returns {Object} - { scrollRef, onScroll } to attach to scrollable elements
 */

// Store scroll positions and refs globally per group
const scrollGroups = new Map();

export function useSyncedScroll(groupId) {
  const scrollRef = useRef(null);
  const isScrolling = useRef(false);

  // Register this ref with the group
  useEffect(() => {
    if (!scrollGroups.has(groupId)) {
      scrollGroups.set(groupId, { refs: new Set(), scrollLeft: 0 });
    }
    const group = scrollGroups.get(groupId);
    group.refs.add(scrollRef);

    // Sync to current group scroll position on mount
    if (scrollRef.current && group.scrollLeft > 0) {
      scrollRef.current.scrollLeft = group.scrollLeft;
    }

    return () => {
      group.refs.delete(scrollRef);
      if (group.refs.size === 0) {
        scrollGroups.delete(groupId);
      }
    };
  }, [groupId]);

  const onScroll = useCallback((e) => {
    // Prevent infinite scroll loops
    if (isScrolling.current) return;

    const group = scrollGroups.get(groupId);
    if (!group) return;

    const scrollLeft = e.target.scrollLeft;
    group.scrollLeft = scrollLeft;

    // Sync all other refs in the group
    group.refs.forEach((ref) => {
      if (ref.current && ref !== scrollRef && ref.current.scrollLeft !== scrollLeft) {
        // Mark as programmatic scroll to prevent loop
        const otherIsScrolling = ref.current._isScrolling;
        if (!otherIsScrolling) {
          ref.current._isScrolling = true;
          ref.current.scrollLeft = scrollLeft;
          // Reset flag after a short delay
          requestAnimationFrame(() => {
            if (ref.current) {
              ref.current._isScrolling = false;
            }
          });
        }
      }
    });
  }, [groupId]);

  // Handle the _isScrolling flag check
  const handleScroll = useCallback((e) => {
    if (e.target._isScrolling) return;
    onScroll(e);
  }, [onScroll]);

  return { scrollRef, onScroll: handleScroll };
}

export default useSyncedScroll;
