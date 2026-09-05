// Client-side mirror of the backend's FederatedIdUtility.
//
// The backend encodes every group it serves as
// `(namespace_id << 44) | local_id`, where `namespace_id` is the
// `gitlab_environments.namespace_id` of the environment the group was fetched
// from. Since each environment owns a unique namespace, a group's owning
// environment can be recovered from the high bits of its id alone.
//
// These values stay below 2^53, so plain JavaScript numbers are exact.

const NAMESPACE_MULTIPLIER = 17592186044416; // 2 ** 44

export function federatedGroupId(namespaceId: number, localId: number): number {
  return Math.trunc(namespaceId) * NAMESPACE_MULTIPLIER + Math.trunc(localId);
}

export function groupNamespaceId(federatedId: number): number {
  return Math.floor(Math.abs(Math.trunc(federatedId)) / NAMESPACE_MULTIPLIER);
}

export function groupLocalId(federatedId: number): number {
  return Math.abs(Math.trunc(federatedId)) % NAMESPACE_MULTIPLIER;
}

export function groupsForEnvironment<T extends { id: number }>(
  groups: readonly T[],
  namespaceId: number,
): T[] {
  const ns = Math.trunc(namespaceId);
  return groups.filter((group) => groupNamespaceId(group.id) === ns);
}
