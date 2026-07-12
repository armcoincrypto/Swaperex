/**
 * Groups journal approval + swap records that share a flowId.
 */

import type { UnifiedActivityGroup, UnifiedActivityItem } from '@/types/unifiedActivity';

const FLOW_KIND_ORDER: Record<string, number> = {
  approval: 0,
  swap: 1,
};

function sortFlowItems(items: UnifiedActivityItem[]): UnifiedActivityItem[] {
  return [...items].sort((a, b) => {
    const aOrder = FLOW_KIND_ORDER[a.kind] ?? 2;
    const bOrder = FLOW_KIND_ORDER[b.kind] ?? 2;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.ts - a.ts;
  });
}

export function groupUnifiedActivityItems(items: UnifiedActivityItem[]): UnifiedActivityGroup[] {
  const flowMap = new Map<string, UnifiedActivityItem[]>();

  for (const item of items) {
    if (item.source !== 'journal' || !item.flowId) continue;
    const list = flowMap.get(item.flowId) ?? [];
    list.push(item);
    flowMap.set(item.flowId, list);
  }

  const multiFlowIds = new Set(
    [...flowMap.entries()].filter(([, flowItems]) => flowItems.length >= 2).map(([id]) => id),
  );

  const usedIds = new Set<string>();
  const groups: UnifiedActivityGroup[] = [];

  for (const item of items) {
    if (usedIds.has(item.id)) continue;

    if (item.flowId && multiFlowIds.has(item.flowId)) {
      const flowItems = sortFlowItems(flowMap.get(item.flowId) ?? []);
      if (flowItems.some((fi) => usedIds.has(fi.id))) continue;
      for (const fi of flowItems) usedIds.add(fi.id);
      groups.push({
        key: `flow:${item.flowId}`,
        flowId: item.flowId,
        items: flowItems,
        isFlow: true,
      });
      continue;
    }

    usedIds.add(item.id);
    groups.push({ key: item.id, items: [item], isFlow: false });
  }

  return groups;
}

export function filterUnifiedActivityGroups(
  groups: UnifiedActivityGroup[],
  tab: 'all' | 'swap' | 'approval' | 'transfer' | 'pending',
): UnifiedActivityGroup[] {
  if (tab === 'all') return groups;

  return groups
    .map((group) => {
      if (tab === 'pending') {
        const pendingItems = group.items.filter((item) => item.needsAttention);
        if (pendingItems.length === 0) return null;
        return { ...group, items: pendingItems };
      }

      const kind =
        tab === 'swap' ? 'swap' : tab === 'approval' ? 'approval' : 'transfer';

      const matched = group.items.filter((item) =>
        kind === 'transfer'
          ? item.kind === 'transfer'
          : item.kind === kind,
      );
      if (matched.length === 0) return null;
      return { ...group, items: matched, isFlow: matched.length > 1 && group.isFlow };
    })
    .filter((group): group is UnifiedActivityGroup => group !== null);
}
