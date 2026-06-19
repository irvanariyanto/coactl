import { createSpinner, printNotImplemented } from "../../ui/output.js";

export async function updateAction(): Promise<void> {
  const spinner = createSpinner("Refreshing remote sources...").start();
  spinner.info("Update command not yet implemented (AC-014).");
  printNotImplemented("update", "AC-014");
}
