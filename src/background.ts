// Background event page: the one place commands actually execute.
//
// Two ways in, one exit:
//   1. Keyboard shortcuts declared in the manifest -> commands.onCommand
//   2. The popup -> runtime.sendMessage({ type: "run-command", id })
// Both resolve to the same command function, so behaviour can't drift.

import { commandsById } from "src/commands";

interface RunCommandMessage {
  type: "run-command";
  id: string;
}

function isRunCommandMessage(msg: unknown): msg is RunCommandMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as RunCommandMessage).type === "run-command" &&
    typeof (msg as RunCommandMessage).id === "string"
  );
}

async function run(id: string): Promise<void> {
  const command = commandsById[id];
  if (!command) {
    console.warn(`[operator] unknown command: ${id}`);
    return;
  }
  try {
    await command.run();
  } catch (err) {
    console.error(`[operator] command "${id}" failed:`, err);
  }
}

// Keyboard shortcuts.
browser.commands.onCommand.addListener((command) => {
  void run(command);
});

// Popup requests. Returning the promise lets the popup await completion.
browser.runtime.onMessage.addListener((message) => {
  if (isRunCommandMessage(message)) {
    return run(message.id);
  }
  return undefined;
});
