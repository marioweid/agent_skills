/**
 * pi-session-tree — every pi session on the machine, as a tree you can switch
 * between.
 *
 * `/sessions`, or left on an empty prompt, opens a directory → session tree.
 * Enter switches this window into the selected session. Sessions another pi
 * window currently holds open are shown but not enterable: a transcript has
 * one writer.
 *
 * There is no hotkey. pi binds every free ctrl letter, and a conflicting
 * registration is skipped and reported as an extension issue on every switch.
 *
 * The tree is also what you see when pi opens, so a window starts as a session
 * picker rather than an empty prompt; `--no-session-tree` turns that off.
 *
 * Only slash commands get a session-control context, so the startup view and
 * the editor's left-arrow both route through `/sessions` rather than
 * duplicating it.
 */

import * as path from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionUIContext,
  KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import { CustomEditor, getAgentDir, SessionManager } from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { matchesKey } from "@earendil-works/pi-tui";
import type { WindowState } from "./src/store.ts";
import { WindowStore } from "./src/store.ts";
import { lastUserText, readConversation } from "./src/transcript.ts";
import type { SessionRow } from "./src/tree.ts";
import { compactTitle } from "./src/tree.ts";
import { openSessionTree } from "./src/view.ts";

const COMMAND = "sessions";

/**
 * The editor, plus: left on an empty prompt goes back to the session list.
 *
 * This has to be the editor rather than a shortcut or a raw input listener,
 * because those two fire for every left arrow anywhere — inside pickers, and
 * in the middle of a line you are editing. The editor sees the key only when
 * it has focus, and only here can "the prompt is empty" be checked first.
 */
class BackToTreeEditor extends CustomEditor {
  private readonly back: () => void;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    back: () => void,
  ) {
    super(tui, theme, keybindings);
    this.back = back;
  }

  override handleInput(data: string): void {
    if (matchesKey(data, "left") && this.getText() === "") {
      this.back();
      return;
    }
    super.handleInput(data);
  }
}

export default function sessionTree(pi: ExtensionAPI) {
  let context: ExtensionContext | undefined;
  let ui: ExtensionUIContext | undefined;
  let store: WindowStore | undefined;
  let storeBroken = false;
  /** What this window is doing, for the coloured dot other windows draw. */
  let state: WindowState = "idle";
  /** What it was doing before a prompt appeared, to go back to when it closes. */
  let stateBeforePrompt: WindowState = "idle";

  pi.registerFlag("no-session-tree", {
    description: "Do not open the session tree when pi starts",
    type: "boolean",
    default: false,
  });

  /**
   * How this window is named in the tree. Its session name if it has one, else
   * a compact form of the first thing the user asked for — the same fallback
   * pi's own session selector uses.
   */
  const windowTitle = (): string | undefined => {
    const session = context?.sessionManager;
    if (!session) return undefined;
    const named = session.getSessionName()?.trim();
    if (named) return named;
    for (const entry of session.getEntries()) {
      if (entry.type !== "message" || entry.message.role !== "user") continue;
      const content = entry.message.content;
      const text =
        typeof content === "string"
          ? content
          : content
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join(" ");
      if (text.trim()) return compactTitle(text);
    }
    return undefined;
  };

  /**
   * Publishing is best-effort: an unwritable state directory must never take
   * down the session, so the first failure gives up for good and the command
   * carries on with whatever other windows have published.
   */
  const publish = () => {
    if (storeBroken) return;
    try {
      store ??= new WindowStore(path.join(getAgentDir(), "session-tree"));
      store.publish(context?.cwd ?? process.cwd(), {
        title: windowTitle(),
        sessionFile: context?.sessionManager.getSessionFile(),
        state,
      });
    } catch (error) {
      storeBroken = true;
      const failed = store;
      store = undefined;
      // Leaving the file behind would advertise this window as live forever.
      try {
        failed?.close();
      } catch {
        // Already unwritable; the next reader prunes it once this pid exits.
      }
      const message = `Session tree disabled: ${String(error)}`;
      if (ui) ui.notify(message, "error");
      else console.error(message);
    }
  };

  /** Every session on the machine, newest first. */
  const listSessions = async (): Promise<SessionRow[]> => {
    const sessions = await SessionManager.listAll();
    // Sessions written before pi recorded a cwd have no directory to file them
    // under, and switching into one would land you somewhere unknown.
    return sessions
      .filter((info) => info.cwd)
      .map((info) => {
        // ponytail: re-reads every transcript to label the rows (~3ms for five
        // sessions, one of them 550KB). Cached by mtime, so only the first
        // open pays. Label from the list itself if that ever stops scaling.
        const last = lastUserText(readConversation(info.path));
        return {
          path: info.path,
          cwd: info.cwd,
          ...(info.name ? { name: info.name } : {}),
          ...(last ? { lastMessage: last } : {}),
          firstMessage: info.firstMessage,
          modified: info.modified.getTime(),
          messageCount: info.messageCount,
        };
      });
  };

  /** Ask pi to run our command; see the note on session_start below. */
  const openTree = () => {
    pi.sendUserMessage(`/${COMMAND}`, { expandPromptTemplates: true });
  };

  pi.on("session_start", (event, ctx) => {
    context = ctx;
    if (ctx.hasUI) ui = ctx.ui;
    publish();
    if (ctx.mode === "tui") {
      ctx.ui.setEditorComponent(
        (tui, theme, keybindings) =>
          new BackToTreeEditor(tui, theme, keybindings, openTree),
      );
    }
    // Only at real startup: a session that replaced this one (switch, new,
    // fork) must not bounce the user straight back into the picker.
    if (event.reason !== "startup" || ctx.mode !== "tui") return;
    if (pi.getFlag("no-session-tree")) return;
    // Commands are the only context that can switch sessions, so ask pi to run
    // ours rather than opening the view with a context that cannot act on it.
    openTree();
  });

  const setState = (next: WindowState) => {
    if (state === next) return;
    state = next;
    publish();
  };

  pi.on("agent_start", () => setState("working"));
  pi.on("agent_settled", () => setState("idle"));
  // A blocking prompt — ask_user, a confirm, the model picker — is the one
  // state worth interrupting someone for, so it outranks whatever was running.
  pi.on("ui_prompt_start", () => {
    stateBeforePrompt = state;
    setState("waiting");
  });
  pi.on("ui_prompt_end", () => setState(stateBeforePrompt));

  // turn_start keeps this window's liveness fresh; turn_end is where the
  // title first exists, since the user entry is appended after the turn opens.
  pi.on("turn_start", () => publish());
  pi.on("turn_end", () => publish());

  pi.on("session_shutdown", () => {
    context = undefined;
    ui = undefined;
    try {
      store?.close();
    } catch {
      // Shutting down; a leftover file is pruned by the next reader anyway.
    }
    store = undefined;
  });

  pi.registerCommand(COMMAND, {
    description: "Browse and switch between every pi session on this machine",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        if (ctx.hasUI) ctx.ui.notify(`/${COMMAND} needs the TUI`, "error");
        return;
      }
      publish();
      if (!store) {
        ctx.ui.notify("Session tree unavailable", "error");
        return;
      }
      // The list is rescanned on the view's own tick, so rows keep up with
      // sessions still being written — including this window's, which keeps
      // answering behind the overlay.
      const outcome = await openSessionTree(ctx, store, await listSessions(), listSessions);

      if (outcome.action === "switch") {
        const { cancelled } = await ctx.switchSession(outcome.sessionPath);
        if (cancelled) ctx.ui.notify("Session switch cancelled", "warning");
        return;
      }
      if (outcome.action === "newSession") {
        // pi starts a session in the directory it is running in, so a new
        // session anywhere else means switching into that directory first.
        if (outcome.cwd === ctx.cwd) {
          await ctx.newSession();
          return;
        }
        if (!outcome.anchor) {
          ctx.ui.notify(
            `Every session in ${outcome.cwd} is open in another window; close one to start a new session there.`,
            "warning",
          );
          return;
        }
        // Two steps rather than a nested replacement: switch into a session
        // that lives there, then let pi's own /new run in the window that came
        // back. Replacing a session from inside a replacement is exactly the
        // stale-context footgun pi's docs warn about.
        const { cancelled } = await ctx.switchSession(outcome.anchor);
        if (cancelled) {
          ctx.ui.notify("New session cancelled", "warning");
          return;
        }
        pi.sendUserMessage("/new", { expandPromptTemplates: true });
      }
    },
  });
}
