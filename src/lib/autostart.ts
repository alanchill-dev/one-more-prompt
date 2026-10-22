import { isTauri } from "@tauri-apps/api/core"
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart"

/** Sync launch-at-login to `value`. Enabled registrations refresh the executable
 * path after a rename or move; disabled registrations stay disabled.
 *
 * Dev builds are deliberately excluded: tauri-plugin-autostart registers
 * `current_exe()`, which for a dev build is an ephemeral `target/debug` binary
 * inside a worktree. That path can't launch standalone at login (it needs the
 * Vite dev server), so registering it writes a broken login item that fails on
 * every login. Only the installed release app should own the login item. */
export async function syncAutostart(value: boolean): Promise<void> {
  if (!isTauri()) return
  if (import.meta.env.DEV) return
  if (value) {
    await enableAutostart()
    return
  }
  if (await isAutostartEnabled()) await disableAutostart()
}
