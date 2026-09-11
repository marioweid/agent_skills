/**
 * Strip terminal control sequences from text this process did not author.
 *
 * Anything that reaches the terminal from outside — repository paths, diff
 * bodies, a notification title the model wrote — can carry escape sequences
 * that move the cursor, repaint the screen, or terminate an OSC payload early
 * and have the remainder interpreted as commands. Sanitize at the point where
 * such text enters a rendered string or an escape sequence, then apply trusted
 * styling on top.
 */

const OSC_PATTERN =
  // oxlint-disable-next-line no-control-regex -- Match terminal control sequences to remove them.
  /(?:\u001b\]|\u009d)(?:[^\u0007\u001b\u009c]|\u001b(?!\\))*(?:\u0007|\u001b\\|\u009c)/g;
// oxlint-disable-next-line no-control-regex -- Match terminal control sequences to remove them.
const CSI_PATTERN = /(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]/g;
// Final byte is `[0-~]`, not `[@-~]`: the Fp range (0x30-0x3f) carries ESC 7 and
// ESC 8, cursor save/restore, which would otherwise survive and let injected
// text reposition output that is drawn after it.
// oxlint-disable-next-line no-control-regex -- Match terminal control sequences to remove them.
const ESCAPE_PATTERN = /\u001b(?:[()][0-2A-Z]|[ -/]*[0-~])/g;

export function sanitizeTerminalText(text: string) {
  return (
    text
      .replace(OSC_PATTERN, "")
      .replace(CSI_PATTERN, "")
      .replace(ESCAPE_PATTERN, "")
      // oxlint-disable-next-line no-control-regex -- Strip non-printing control characters.
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "")
  );
}
