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

// eslint-disable-next-line no-control-regex
const OSC_PATTERN =
  /(?:\u001b\]|\u009d)(?:[^\u0007\u001b\u009c]|\u001b(?!\\))*(?:\u0007|\u001b\\|\u009c)/g;
// eslint-disable-next-line no-control-regex
const CSI_PATTERN = /(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]/g;
// eslint-disable-next-line no-control-regex
const ESCAPE_PATTERN = /\u001b(?:[()][0-2A-Z]|[ -/]*[@-~])/g;

export function sanitizeTerminalText(text: string) {
  return text
    .replace(OSC_PATTERN, "")
    .replace(CSI_PATTERN, "")
    .replace(ESCAPE_PATTERN, "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "");
}
