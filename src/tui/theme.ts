import chalk from "chalk";

export const colors = {
  brand: chalk.magenta,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  muted: chalk.gray,
  accent: chalk.cyan,
  heading: chalk.bold.white,
} as const;

export const symbols = {
  check: "✓",
  cross: "✗",
  arrow: "→",
  dot: "●",
  circle: "○",
  dash: "─",
  warning: "⚠",
} as const;

export const BRAND = "coactl";
