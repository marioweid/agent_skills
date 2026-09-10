import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeTerminalText } from "./terminal-text.ts";

const ESC = "\u001b";
const BEL = "\u0007";

test("an OSC payload cannot survive to retitle the terminal", () => {
  const attack = `done${ESC}]0;pwned${BEL}`;
  const clean = sanitizeTerminalText(attack);
  assert.equal(clean, "done");
  assert.ok(!clean.includes("pwned"));
});

test("a bare BEL is stripped, so it cannot terminate an enclosing OSC early", () => {
  // notify embeds this text inside `\x1b]777;notify;<title>;<body>\x07`. A BEL
  // in the body would close that payload and hand the rest to the terminal.
  assert.equal(sanitizeTerminalText(`body${BEL}; rm -rf /`), "body; rm -rf /");
  assert.ok(!sanitizeTerminalText(`x${BEL}y`).includes(BEL));
});

test("CSI cursor and colour sequences are stripped", () => {
  assert.equal(sanitizeTerminalText(`${ESC}[2J${ESC}[H cleared`), " cleared");
  assert.equal(sanitizeTerminalText(`${ESC}[31mred${ESC}[0m`), "red");
});

test("two-byte and charset escapes are stripped", () => {
  assert.equal(sanitizeTerminalText(`${ESC}(0lqk${ESC}(B`), "lqk");
  assert.equal(sanitizeTerminalText(`${ESC}7saved${ESC}8`), "saved");
});

test("8-bit C1 forms are stripped, not just the ESC-prefixed ones", () => {
  assert.equal(sanitizeTerminalText("\u009b31mred"), "red");
  assert.equal(sanitizeTerminalText("\u009d0;t\u009c after"), " after");
});

test("ordinary text survives, including tabs, newlines and non-ASCII", () => {
  const text = "Ready — 2 done\tof 3\nnext line ✓ caf\u00e9";
  assert.equal(sanitizeTerminalText(text), text);
});

test("an empty string stays empty rather than throwing", () => {
  assert.equal(sanitizeTerminalText(""), "");
});
