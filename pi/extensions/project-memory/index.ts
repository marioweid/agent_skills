/**
 * project-memory — the current focus from `.agent/PLAN.md`, in every prompt.
 *
 * Per-repo memory is plain markdown the agent edits with its normal tools:
 * `.agent/PLAN.md` (a `## Now` block plus Next/Done), `.agent/JOURNAL.md`
 * (append-only), and `.agent/plans/<slug>.md` for full designs. This extension
 * only injects the Now block into the system prompt and offers `/plan`; no
 * tools, no storage format of its own.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { buildMemoryBlock, extractNow, journalTemplate, planTemplate } from "./plan.ts";

const AGENT_DIR = ".agent";
const PLAN_FILE = "PLAN.md";
const JOURNAL_FILE = "JOURNAL.md";

const planPathFor = (cwd: string) => path.join(cwd, AGENT_DIR, PLAN_FILE);

export default function projectMemory(pi: ExtensionAPI) {
  /** Cache key is `path\0mtimeMs`; a changed mtime is the only reason to re-read. */
  let cachedKey: string | undefined;
  let cachedBlock: string | undefined;
  /** The last read failure already reported, so a broken file warns once, not per turn. */
  let reportedFailure: string | undefined;

  /**
   * The block to append, or undefined when there is nothing to inject.
   *
   * The returned string must be byte-identical from turn to turn while the file
   * is unchanged: the system prompt is the prefix of the provider's prompt
   * cache key, so a churning suffix invalidates the cache and re-bills the
   * whole context at full input price.
   */
  const memoryBlock = (cwd: string, report: (message: string) => void): string | undefined => {
    const planPath = planPathFor(cwd);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(planPath);
    } catch (error) {
      // No plan file is the normal case for most repos, not a failure.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        reportOnce(`project-memory: cannot stat ${planPath}: ${String(error)}`, report);
      }
      cachedKey = undefined;
      cachedBlock = undefined;
      return undefined;
    }

    const key = `${planPath}\0${stat.mtimeMs}`;
    if (key === cachedKey) return cachedBlock;

    let content: string;
    try {
      content = fs.readFileSync(planPath, "utf8");
    } catch (error) {
      reportOnce(`project-memory: cannot read ${planPath}: ${String(error)}`, report);
      return undefined;
    }

    reportedFailure = undefined;
    const now = extractNow(content);
    cachedKey = key;
    cachedBlock = now === undefined ? undefined : buildMemoryBlock(now);
    return cachedBlock;
  };

  const reportOnce = (message: string, report: (message: string) => void) => {
    if (reportedFailure === message) return;
    reportedFailure = message;
    report(message);
  };

  pi.on("before_agent_start", (event, ctx) => {
    const block = memoryBlock(ctx.cwd, (message) => {
      if (ctx.hasUI) ctx.ui.notify(message, "error");
      else console.error(message);
    });
    if (block === undefined) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
  });

  /** Command output goes to the transcript, not a toast, so it stays readable. */
  const show = (text: string) => {
    pi.sendMessage(
      { customType: "project-memory", content: text, display: true },
      { deliverAs: "nextTurn" },
    );
  };

  const createPlan = (ctx: ExtensionCommandContext, title: string) => {
    const dir = path.join(ctx.cwd, AGENT_DIR);
    const files = [
      { file: path.join(dir, PLAN_FILE), content: planTemplate(title) },
      { file: path.join(dir, JOURNAL_FILE), content: journalTemplate(title) },
    ];
    const existing = files.filter((entry) => fs.existsSync(entry.file));
    if (existing.length > 0) {
      const names = existing.map((entry) => entry.file).join(", ");
      show(`Refusing to overwrite existing project memory: ${names}`);
      return;
    }
    fs.mkdirSync(dir, { recursive: true });
    for (const entry of files) fs.writeFileSync(entry.file, entry.content, { flag: "wx" });
    cachedKey = undefined;
    show(
      [
        `Created ${files[0]?.file} and ${files[1]?.file}.`,
        "",
        "Fill in the `## Now` section — it is injected into the system prompt every turn.",
      ].join("\n"),
    );
  };

  pi.registerCommand("plan", {
    description: "Show the .agent/PLAN.md Now block, or `/plan new <title>` to create it",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      // Split on the word, not the prefix: `/plan newfoo` is a typo, not `new foo`.
      const [verb, ...rest] = trimmed.split(/\s+/);
      if (verb === "new") {
        const title = rest.join(" ");
        if (!title) {
          show("Usage: /plan new <title>");
          return;
        }
        createPlan(ctx, title);
        return;
      }
      if (trimmed) {
        show(`Unknown arguments: ${trimmed}. Usage: /plan | /plan new <title>`);
        return;
      }

      const planPath = planPathFor(ctx.cwd);
      if (!fs.existsSync(planPath)) {
        show(`No ${planPath}. Run \`/plan new <title>\` to create it.`);
        return;
      }
      const now = extractNow(fs.readFileSync(planPath, "utf8"));
      if (now === undefined) {
        show(`${planPath} has no \`## Now\` section, so nothing is injected.`);
        return;
      }
      show(`${planPath}\n\n## Now\n\n${now}`);
    },
  });
}
