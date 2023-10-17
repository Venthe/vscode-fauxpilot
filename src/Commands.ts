import { ConfigurationTarget, workspace } from "vscode";
import { fauxpilotClient } from "./FauxpilotClient";

const configuration = workspace.getConfiguration();
const target = ConfigurationTarget.Global;

function setExtensionStatus(enabled: boolean) {
    console.debug("Setting fauxpilot state to", enabled);
    // configuration.update('fauxpilot.enabled', enabled, target, false).then(console.error);
    fauxpilotClient.isEnabled = enabled;
}

export type Command = { command: string, callback: (...args: any[]) => any, thisArg?: any };

export const turnOnFauxpilot: Command = {
    command: "fauxpilot.enable",
    callback: () => setExtensionStatus(true)
};

export const turnOffFauxpilot: Command = {
    command: "fauxpilot.disable",
    callback: () => setExtensionStatus(false)
};
