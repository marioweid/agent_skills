import assert from "node:assert/strict";
import { test } from "node:test";
import { TurnTracker, formatDuration } from "./index.ts";

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
  assert.equal(t.onChildCount(1, 60_000), undefined, "one child left");
  assert.equal(t.onChildCount(0, 90_000), 90_000, "last child done");
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
  assert.equal(t.onChildCount(1, 2_000), undefined);
  assert.equal(t.onChildCount(0, 200_000), 198_000);
});

test("steady-state zero-child updates never ring on their own", () => {
  const t = new TurnTracker(MIN);
  for (const at of [1_000, 50_000, 999_000]) {
    assert.equal(t.onChildCount(0, at), undefined);
  }
});

test("formatDuration reads naturally at each scale", () => {
  assert.equal(formatDuration(5_000), "5s");
  assert.equal(formatDuration(90_000), "1m 30s");
  assert.equal(formatDuration(3_930_000), "1h 5m");
});
