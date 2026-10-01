// Pure merge logic for the shared Drive backup (bloom_ats_backup.json), used by ATSContext's
// sync pipeline. Kept free of React/state so it can be reasoned about and tested on its own.

// Every write to the shared Drive backup used to replace candidates/agencies/staffList/
// meetingLogs/groupChatWebhooks wholesale with whatever this one tab happened to have in memory,
// so two people editing around the same time silently erased each other's work. mergeCollection
// reconciles this tab's state (local) with what is on Drive right now (remote), using `base` (what
// this tab last knew Drive held) only as a tie-breaker. Rules:
//
//  - A record is only ever dropped because of an explicit tombstone (see SyncTombstones), never
//    merely because one side doesn't have it. The earlier version inferred "deleted" from
//    "in base but missing on one side", which is exactly how registered candidates vanished: when
//    two writers raced (both read version N, both wrote), the later write lacked the other's new
//    candidate, and the next merge on the first writer's tab read that absence as a deletion and
//    confirmed it — the candidate disappeared from the app for everyone while their Drive folder
//    stayed behind. The same happened when two tabs in one browser left mismatched copies of
//    ats_candidates / ats_sync_base_candidates in localStorage and a reload merged them.
//  - When both sides have the record and differ, they are merged field by field against base:
//    a field only one side changed takes that side's value, so one person adding an evaluation
//    note while another moves the candidate to the next phase keeps both edits. A field both
//    changed goes to the side with the newer syncUpdatedAt (stamped on every local edit, see
//    stampLocalChanges); arrays of id'd items (evaluationNotes etc.) are merged item by item.
//  - A side whose stamp is older than base's is a stale copy, not an edit (e.g. a backup written
//    by someone who read Drive just before our write landed), so it can't revert newer data.
//  - A tombstone only removes a record whose last edit is not newer than the deletion.
export type SyncCollectionKey = 'candidates' | 'agencies' | 'staffList' | 'meetingLogs' | 'groupChatWebhooks' | 'positions' | 'driveIgnores';
export type TombstoneMap = Record<string, number>; // record id -> deletedAt (epoch ms)
export type SyncTombstones = Partial<Record<SyncCollectionKey, TombstoneMap>>;
export const SYNC_COLLECTION_KEYS: SyncCollectionKey[] = ['candidates', 'agencies', 'staffList', 'meetingLogs', 'groupChatWebhooks', 'positions', 'driveIgnores'];

export const syncStampOf = (x: unknown): number => {
  const v = (x as { syncUpdatedAt?: unknown } | undefined)?.syncUpdatedAt;
  return typeof v === 'number' ? v : 0;
};

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Arrays nested inside a record whose items can be told apart: items with an `id` (evaluation
// notes, action items) or, for an MTG's per-recruiter reports, a `recruiterName`. Such arrays are
// merged item by item instead of one side's whole array winning — otherwise two recruiters typing
// their own reports into the same MTG at the same time erased each other's text.
type ItemKeyFn = (x: any) => string;
const ITEM_KEYS: ItemKeyFn[] = [(x) => x.id, (x) => x.recruiterName];
function itemKeyFnFor(...arrays: unknown[]): ItemKeyFn | null {
  const nonEmpty = arrays.filter((a): a is unknown[] => Array.isArray(a) && a.length > 0);
  if (nonEmpty.length === 0 || arrays.some((a) => a !== undefined && !Array.isArray(a))) return null;
  for (const keyOf of ITEM_KEYS) {
    const ok = nonEmpty.every((arr) => {
      if (!arr.every((x) => x && typeof x === 'object' && typeof keyOf(x) === 'string')) return false;
      return new Set(arr.map(keyOf)).size === arr.length;
    });
    if (ok) return keyOf;
  }
  return null;
}

function mergeKeyedArray(base: any[], local: any[], remote: any[], keyOf: ItemKeyFn, preferLocal: boolean): any[] {
  const baseMap = new Map(base.map((x) => [keyOf(x), x]));
  const localMap = new Map(local.map((x) => [keyOf(x), x]));
  const remoteMap = new Map(remote.map((x) => [keyOf(x), x]));
  const keys = [...local.map(keyOf).filter((k) => !remoteMap.has(k)), ...remote.map(keyOf)];
  const result: any[] = [];
  for (const key of new Set(keys)) {
    const b = baseMap.get(key);
    const l = localMap.get(key);
    const r = remoteMap.get(key);
    // Within one record an item missing on one side while the other side still has it unchanged
    // from base was removed on purpose (e.g. a deleted action item) — the record-level stale-copy
    // check in mergeRecord already keeps an outdated writer from getting this far.
    if (!l) {
      if (b && sameJson(r, b)) continue;
      result.push(r);
    } else if (!r) {
      if (b && sameJson(l, b)) continue;
      result.push(l);
    } else if (sameJson(l, r)) {
      result.push(l);
    } else {
      const merged: Record<string, unknown> = {};
      for (const field of new Set([...Object.keys(l), ...Object.keys(r)])) {
        const value = mergeField(b?.[field], l[field], r[field], preferLocal);
        if (value !== undefined) merged[field] = value;
      }
      result.push(merged);
    }
  }
  return result;
}

function mergeField(baseValue: unknown, localValue: unknown, remoteValue: unknown, preferLocal: boolean): unknown {
  if (sameJson(localValue, remoteValue)) return localValue;
  if (sameJson(localValue, baseValue)) return remoteValue;
  if (sameJson(remoteValue, baseValue)) return localValue;
  const keyOf = itemKeyFnFor(baseValue, localValue, remoteValue);
  if (keyOf) {
    return mergeKeyedArray(Array.isArray(baseValue) ? baseValue : [], (localValue as any[]) || [], (remoteValue as any[]) || [], keyOf, preferLocal);
  }
  return preferLocal ? localValue : remoteValue;
}

function mergeRecord<T extends { id: string }>(b: T | undefined, l: T, r: T): T {
  const lt = syncStampOf(l);
  const rt = syncStampOf(r);
  if (!b) return lt >= rt ? l : r;
  const bt = syncStampOf(b);
  const localStale = lt < bt;
  const remoteStale = rt < bt;
  if (remoteStale && !localStale) return l;
  if (localStale && !remoteStale) return r;

  const preferLocal = lt >= rt;
  const out: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(l), ...Object.keys(r)]);
  keys.delete('syncUpdatedAt');
  let allFromLocal = true;
  let allFromRemote = true;
  for (const key of keys) {
    const value = mergeField((b as any)[key], (l as any)[key], (r as any)[key], preferLocal);
    if (!sameJson(value, (l as any)[key])) allFromLocal = false;
    if (!sameJson(value, (r as any)[key])) allFromRemote = false;
    if (value !== undefined) out[key] = value;
  }
  // Hand back the original object when one side won outright, so the result is byte-identical to
  // it (a rebuilt object with a different key order would look like a change and trigger a write).
  if (allFromRemote && rt >= lt) return r;
  if (allFromLocal && lt >= rt) return l;
  if (lt || rt) out.syncUpdatedAt = Math.max(lt, rt);
  return out as T;
}

export function mergeCollection<T extends { id: string }>(base: T[], local: T[], remote: T[], tombstones: TombstoneMap = {}): T[] {
  const baseMap = new Map(base.map((x) => [x.id, x]));
  const localMap = new Map(local.map((x) => [x.id, x]));
  const remoteMap = new Map(remote.map((x) => [x.id, x]));
  // Records only this side has first (newest registrations are prepended locally), then remote's
  // order. Every tab thereby converges on the order stored on Drive; if each kept its own order,
  // two tabs would see "different" lists forever and keep rewriting the backup at each other.
  const allIds = new Set([...[...localMap.keys()].filter((id) => !remoteMap.has(id)), ...remoteMap.keys()]);

  const result: T[] = [];
  for (const id of allIds) {
    const l = localMap.get(id);
    const r = remoteMap.get(id);
    let winner: T;
    if (!l) winner = r as T;
    else if (!r) winner = l;
    else if (sameJson(l, r)) winner = l;
    else winner = mergeRecord(baseMap.get(id), l, r);
    const deletedAt = tombstones[id];
    if (deletedAt !== undefined && syncStampOf(winner) <= deletedAt) continue;
    result.push(winner);
  }
  return result;
}

// Tombstones older than this are forgotten so the list can't grow forever. A device that stays
// offline for longer than this with a copy of a deleted record could bring it back — acceptable.
const TOMBSTONE_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

export function mergeTombstones(...sources: (SyncTombstones | undefined | null)[]): SyncTombstones {
  const cutoff = Date.now() - TOMBSTONE_RETENTION_MS;
  const result: SyncTombstones = {};
  for (const src of sources) {
    if (!src || typeof src !== 'object') continue;
    for (const key of SYNC_COLLECTION_KEYS) {
      const map = src[key];
      if (!map || typeof map !== 'object') continue;
      const target = (result[key] ||= {});
      for (const [id, at] of Object.entries(map)) {
        if (typeof at !== 'number' || at < cutoff) continue;
        if (!(id in target) || target[id] < at) target[id] = at;
      }
    }
  }
  return result;
}

// Stamps every record a local (user-driven) state update actually changed with syncUpdatedAt, and
// records a tombstone for every id it removed. Returns `next` untouched when nothing changed, so
// a no-op update doesn't produce a new array (which would schedule a pointless Drive write).
export function stampLocalChanges<T extends { id: string }>(
  prev: T[],
  next: T[],
  onRemoved: (removed: TombstoneMap) => void
): T[] {
  if (prev === next) return next;
  const now = Date.now();
  const prevMap = new Map(prev.map((x) => [x.id, x]));
  const nextIds = new Set(next.map((x) => x.id));
  const removed: TombstoneMap = {};
  prev.forEach((x) => {
    if (!nextIds.has(x.id)) removed[x.id] = now;
  });
  if (Object.keys(removed).length > 0) onRemoved(removed);

  let anyStamped = false;
  const stamped = next.map((x) => {
    const p = prevMap.get(x.id);
    if (p === x) return x;
    if (p && JSON.stringify({ ...p, syncUpdatedAt: 0 }) === JSON.stringify({ ...x, syncUpdatedAt: 0 })) return x;
    anyStamped = true;
    return { ...x, syncUpdatedAt: now };
  });
  return anyStamped ? stamped : next;
}
