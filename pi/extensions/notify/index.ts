/**
 * notify — desktop notification + chime when the whole turn is finished.
 *
 * "Finished" means the main thread has settled *and* no subagent is still
 * running. A settled main thread on its own is not enough: delivering a
 * subagent result wakes the agent for another run, so ringing on every settle
 * fires in the middle of long fan-out work.
 *
 * Based on pi's bundled `examples/extensions/notify.ts`.
 */

import { execFile } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Published by the subagents extension on every manager change. */
const SUBAGENT_ACTIVITY_CHANNEL = "subagents:activity";

/** Work shorter than this settles silently; a three-second answer needs no alert. */
const MIN_RUN_MS = 20_000;
const SOUND_FILE = "/System/Library/Sounds/Glass.aiff";

function windowsToastScript(title: string, body: string) {
  const type = "Windows.UI.Notifications";
  const mgr = `[${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime]`;
  const template = `[${type}.ToastTemplateType]::ToastText01`;
  const toast = `[${type}.ToastNotification]::new($xml)`;
  return [
    `${mgr} > $null`,
    `$xml = [${type}.ToastNotificationManager]::GetTemplateContent(${template})`,
    `$xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode('${body}')) > $null`,
    `[${type}.ToastNotificationManager]::CreateToastNotifier('${title}').Show(${toast})`,
  ].join("; ");
}

function showNotification(title: string, body: string) {
  if (process.env.WT_SESSION) {
    execFile("powershell.exe", [
      "-NoProfile",
      "-Command",
      windowsToastScript(title, body),
    ]);
  } else if (process.env.KITTY_WINDOW_ID) {
    process.stdout.write(`\x1b]99;i=1:d=0;${title}\x1b\\`);
    process.stdout.write(`\x1b]99;i=1:p=body;${body}\x1b\\`);
  } else {
    process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
  }
}

function playChime() {
  if (process.platform === "darwin") {
    execFile("afplay", [SOUND_FILE]);
    return;
  }
  process.stdout.write("\x07");
}

export function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * Decides when the bell rings. Split out from the extension wiring so the
 * "don't ring while children are still working" rule is directly testable.
 */
export class TurnTracker {
  private startedAt: number | undefined;
  private mainIdle = true;
  private runningChildren = 0;
  /** Guards against re-ringing when nothing has happened since the last bell. */
  private armed = false;
  private readonly minRunMs: number;

  constructor(minRunMs: number = MIN_RUN_MS) {
    this.minRunMs = minRunMs;
  }

  onRunStart(now: number): void {
    this.startedAt ??= now;
    this.mainIdle = false;
    this.armed = true;
  }

  onChildCount(count: number, now: number): number | undefined {
    if (count > this.runningChildren) {
      this.startedAt ??= now;
      this.armed = true;
    }
    this.runningChildren = count;
    return this.maybeRing(now);
  }

  onSettled(now: number): number | undefined {
    this.mainIdle = true;
    return this.maybeRing(now);
  }

  /** Returns the elapsed time to report, or undefined when the bell stays quiet. */
  private maybeRing(now: number): number | undefined {
    if (!this.armed || !this.mainIdle || this.runningChildren > 0) return undefined;
    const elapsed = now - (this.startedAt ?? now);
    this.armed = false;
    this.startedAt = undefined;
    return elapsed >= this.minRunMs ? elapsed : undefined;
  }
}

export default function (pi: ExtensionAPI) {
  const tracker = new TurnTracker();

  const ring = (elapsed: number | undefined) => {
    if (elapsed === undefined) return;
    showNotification("pi", `Ready for input — ${formatDuration(elapsed)}`);
    playChime();
  };

  pi.on("agent_start", async () => {
    tracker.onRunStart(Date.now());
  });

  // agent_settled fires per low-level run; pi may still retry, compact, or run
  // a queued follow-up, and children may still be working.
  pi.on("agent_settled", async () => {
    ring(tracker.onSettled(Date.now()));
  });

  pi.events.on(SUBAGENT_ACTIVITY_CHANNEL, (data: unknown) => {
    const running = (data as { running?: number } | undefined)?.running;
    if (typeof running !== "number") return;
    ring(tracker.onChildCount(running, Date.now()));
  });
}
