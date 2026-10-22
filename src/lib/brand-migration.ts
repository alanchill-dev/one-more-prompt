const CURRENT_PREFIX = "one-more-prompt.ui."
const LEGACY_PREFIX = "usagepal.ui."
const MIGRATED_KEY = `${CURRENT_PREFIX}brand-migration.v1`

/** Copy old UI state once; later resets must not resurrect old pins or unread state. */
export function readUiStorage(key: string): string | null {
  const storage = window.localStorage
  if (storage.getItem(MIGRATED_KEY) !== "done") {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    for (const legacyKey of keys) {
      if (!legacyKey?.startsWith(LEGACY_PREFIX)) continue
      const currentKey = `${CURRENT_PREFIX}${legacyKey.slice(LEGACY_PREFIX.length)}`
      if (storage.getItem(currentKey) === null) {
        const value = storage.getItem(legacyKey)
        if (value !== null) storage.setItem(currentKey, value)
      }
    }
    storage.setItem(MIGRATED_KEY, "done")
  }
  return storage.getItem(key)
}
