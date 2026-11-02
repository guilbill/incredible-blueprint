/** After "Later", the notice comes back on the level list once this much time has passed. */
export const SNOOZE_MS = 30 * 60 * 1000

/**
 * When the "new version" banner shows. It waits on the level list (never over a game), "Later" hides it
 * for {@link SNOOZE_MS}, and a newer version brings it back at once.
 */
export class UpdateNotice {
  private ready = false
  private snoozedUntil = 0

  /** A new version is installed and waiting. */
  markReady(): void {
    this.ready = true
    this.snoozedUntil = 0
  }

  snooze(now: number): void {
    this.snoozedUntil = now + SNOOZE_MS
  }

  shouldShow(now: number): boolean {
    return this.ready && now >= this.snoozedUntil
  }
}
