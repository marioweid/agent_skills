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
import {
  asActivity,
  SUBAGENT_ACTIVITY_CHANNEL,
} from "../shared/subagent-activity.ts";
import { sanitizeTerminalText } from "../shared/terminal-text.ts";

/** Work shorter than this settles silently; a three-second answer needs no alert. */
const MIN_RUN_MS = 10_000;
const SOUND_FILE = "/System/Library/Sounds/Glass.aiff";

/** Escapes a value for a PowerShell single-quoted string literal. */
function psQuote(value: string) {
  return value.replace(/'/g, "''");
}

function windowsToastScript(title: string, body: string) {
  const type = "Windows.UI.Notifications";
  const mgr = `[${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime]`;
  const template = `[${type}.ToastTemplateType]::ToastText01`;
  const toast = `[${type}.ToastNotification]::new($xml)`;
  return [
    `${mgr} > $null`,
    `$xml = [${type}.ToastNotificationManager]::GetTemplateContent(${template})`,
    `$xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode('${psQuote(body)}')) > $null`,
    `[${type}.ToastNotificationManager]::CreateToastNotifier('${psQuote(title)}').Show(${toast})`,
  ].join("; ");
}

/**
 * The body can be model-authored text (`alertUser` passes an `ask_user`
 * question), so it is stripped of control characters before it is embedded in
 * an escape sequence — a bare BEL or ST would terminate the OSC payload and
 * hand the remainder to the terminal as commands.
 */
function showNotification(rawTitle: string, rawBody: string) {
  const title = sanitizeTerminalText(rawTitle);
  const body = sanitizeTerminalText(rawBody);
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

/**
 * Alert the user that the agent is blocked on them right now. Used by the
 * `ask_user` tool; unlike the turn-end bell there is no minimum-duration gate,
 * a question needs an answer whenever it is asked.
 */
export function alertUser(message: string) {
  showNotification("pi", message);
  playChime();
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
    const activity = asActivity(data);
    if (!activity) return;
    ring(tracker.onChildCount(activity.running, Date.now()));
  });
}
