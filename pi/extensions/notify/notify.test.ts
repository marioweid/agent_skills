import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alertUser,
  playChime,
  selectChime,
  TurnTracker,
  formatDuration,
} from "./index.ts";

const MIN = 20_000;

test("a short turn with no children stays silent", () => {
  const t = new TurnTracker(MIN);
  t.onRunStart(0);
  assert.equal(t.onSettled(5_000), undefined);
});

test("a long turn with no children rings once", () => {
  const t = new TurnTracker(MIN);
  t.onRunStart(0);
  assert.equal(t.onSettled(60_000), 60_000);
  // A second settle with no new work must not ring again.
  assert.equal(t.onSettled(70_000), undefined);
});

test("main settling while a child still runs does not ring", () => {
  const t = new TurnTracker(MIN);
  t.onRunStart(0);
  assert.equal(t.onChildCount(1, 1_000), undefined);
  assert.equal(t.onSettled(30_000), undefined, "child still running");
});

test("the bell waits for the last child, then rings for the whole span", () => {
  const t = new TurnTracker(MIN);
  t.onRunStart(0);
  t.onChildCount(2, 1_000);
  t.onSettled(30_000);
  t.onChildCount(1, 60_000);
  assert.equal(t.onChildCount(0, 90_000), undefined, "last child done never rings on its own");
  // The delivered result wakes the agent; that run's settle rings for the whole span.
  t.onRunStart(90_000);
  assert.equal(t.onSettled(120_000), 120_000);
});

test("a child finishing while the main thread is mid-run does not ring", () => {
  const t = new TurnTracker(MIN);
  t.onRunStart(0);
  t.onChildCount(1, 1_000);
  assert.equal(t.onChildCount(0, 90_000), undefined, "main thread still working");
  assert.equal(t.onSettled(95_000), 95_000);
});

test("a background child spawned after the turn ended still rings on completion", () => {
  const t = new TurnTracker(MIN);
  t.onRunStart(0);
  t.onSettled(1_000);
  // /bg style: spawn, main goes idle immediately, child works for minutes.
  t.onChildCount(1, 2_000);
  assert.equal(t.onChildCount(0, 200_000), undefined, "finishing child never rings on its own");
  // The delivered result wakes the agent; its clock started when the child spawned.
  t.onRunStart(200_000);
  assert.equal(t.onSettled(205_000), 203_000);
});

test("a finishing child never rings on its own — the delivered result wakes the agent first", () => {
  const t = new TurnTracker(MIN);
  t.onRunStart(0);
  t.onChildCount(1, 1_000);
  assert.equal(t.onSettled(5_000), undefined, "child still running");
  assert.equal(t.onChildCount(0, 30_000), undefined, "last child done never rings on its own");
  // Delivering the result wakes the agent for another run.
  t.onRunStart(30_000);
  assert.equal(t.onSettled(60_000), 60_000, "rings on the following settle for the full span");
});

test("steady-state zero-child updates never ring on their own", () => {
  const t = new TurnTracker(MIN);
  for (const at of [1_000, 50_000, 999_000]) {
    assert.equal(t.onChildCount(0, at), undefined);
  }
});

test("selectChime retains macOS, adds Linux, and falls back on Windows", () => {
  assert.deepEqual(selectChime("darwin"), {
    command: "afplay",
    args: ["/System/Library/Sounds/Glass.aiff"],
  });
  assert.deepEqual(selectChime("linux"), {
    command: "pw-play",
    args: [
      "--volume=0.15",
      "/run/current-system/sw/share/sounds/freedesktop/stereo/complete.oga",
    ],
  });
  assert.equal(selectChime("win32"), undefined);
});

test("a failed Linux player falls back to BEL once", () => {
  const written: string[] = [];
  playChime(
    "linux",
    (_command, _args, callback) => callback(new Error("pw-play unavailable")),
    (text) => written.push(text),
  );
  assert.deepEqual(written, ["\x07"]);
});

test("formatDuration reads naturally at each scale", () => {
  assert.equal(formatDuration(5_000), "5s");
  assert.equal(formatDuration(90_000), "1m 30s");
  assert.equal(formatDuration(3_930_000), "1h 5m");
});

test("model-authored notification text cannot break out of the escape sequence", () => {
  const written: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => {
    written.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    alertUser("done\u0007\u001b]0;pwned\u0007");
  } finally {
    process.stdout.write = original;
  }
  const payload = written.join("");
  assert.ok(!payload.includes("pwned"));
});
