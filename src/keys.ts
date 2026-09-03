export interface ParsedKey {
  key: string;
  modifiers: string[];
}

const NAMED_KEYS: Record<string, string> = {
  return: "return",
  enter: "return",
  kp_enter: "return",
  tab: "tab",
  escape: "escape",
  esc: "escape",
  space: "space",
  spacebar: "space",
  backspace: "delete",
  back_space: "delete",
  delete: "delete",
  del: "delete",
  home: "home",
  end: "end",
  pageup: "pageup",
  page_up: "pageup",
  prior: "pageup",
  pagedown: "pagedown",
  page_down: "pagedown",
  next: "pagedown",
  up: "up",
  arrowup: "up",
  uparrow: "up",
  down: "down",
  arrowdown: "down",
  downarrow: "down",
  left: "left",
  arrowleft: "left",
  leftarrow: "left",
  right: "right",
  arrowright: "right",
  rightarrow: "right",
  plus: "plus",
  minus: "minus",
  comma: "comma",
  period: "period",
};

const MODIFIERS: Record<string, string> = {
  super: "cmd",
  cmd: "cmd",
  command: "cmd",
  meta: "cmd",
  win: "cmd",
  windows: "cmd",
  ctrl: "ctrl",
  control: "ctrl",
  alt: "option",
  option: "option",
  shift: "shift",
  fn: "fn",
};

export function parseXdotoolKey(raw: string): ParsedKey {
  const input = raw.trim();
  if (!input) {
    throw new Error("Invalid params");
  }

  const tokens = splitKeyCombo(input);
  const modifiers: string[] = [];
  let key: string | undefined;

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower in MODIFIERS) {
      modifiers.push(MODIFIERS[lower]);
      continue;
    }
    key = normalizeKey(token);
  }

  if (!key) {
    throw new Error("Invalid params");
  }

  return { key, modifiers: unique(modifiers) };
}

export function toHotkeyKeys(parsed: ParsedKey): string[] {
  return [...parsed.modifiers, parsed.key];
}

function splitKeyCombo(input: string): string[] {
  if (input.includes("+")) {
    return input.split("+").map((part) => part.trim()).filter(Boolean);
  }
  return [input];
}

function normalizeKey(token: string): string {
  const lower = token.toLowerCase();
  const kp = /^kp[_-]?(.+)$/i.exec(token);
  if (kp) {
    return kp[1].toLowerCase() === "enter" ? "return" : kp[1];
  }
  if (lower in NAMED_KEYS) {
    return NAMED_KEYS[lower];
  }
  if (/^f\d{1,2}$/i.test(token)) {
    return lower;
  }
  if (token.length === 1) {
    return token.toLowerCase();
  }
  return lower;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
