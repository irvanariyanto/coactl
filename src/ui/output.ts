import chalk from "chalk";
import Table from "cli-table3";
import ora, { type Ora } from "ora";
import { BRAND, colors, symbols } from "../tui/theme.js";

export function createSpinner(label: string): Ora {
  return ora({ text: label, color: "cyan" });
}

export function createTable(headers: string[]): Table.Table {
  return new Table({
    head: headers.map((h) => colors.heading(h)),
    style: { head: [], border: ["gray"] },
    chars: {
      mid: symbols.dash,
      "mid-mid": "┼",
      "top-mid": "┬",
      "bottom-mid": "┴",
      left: "│",
      "left-mid": "├",
      right: "│",
      "right-mid": "┤",
      top: symbols.dash,
      "top-left": "┌",
      "top-right": "┐",
      bottom: symbols.dash,
      "bottom-left": "└",
      "bottom-right": "┘",
      middle: "│",
    },
  });
}

export function printHeader(text: string): void {
  console.log(colors.brand(`\n${symbols.dot} ${BRAND}`) + colors.muted(` ${symbols.arrow} `) + colors.heading(text));
}

export function printNotImplemented(commandName: string, ticketRef?: string): void {
  console.log(
    colors.warning(`${symbols.warning}  ${BRAND} ${commandName}`) +
      colors.muted(": not yet implemented") +
      (ticketRef ? colors.muted(` (${ticketRef})`) : ""),
  );
  process.exitCode = 1;
}
