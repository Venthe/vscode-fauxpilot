import { ConfigurationTarget, workspace } from "vscode";

const configuration = workspace.getConfiguration()
const target = ConfigurationTarget.Global

function setExtensionStatus(enabled: boolean) {
    console.debug("Setting fauxpilot state to", enabled);
    configuration.update('fauxpilot.enabled', enabled, target, false).then(console.error);
}

export type Command = { command: string, callback: (...args: any[]) => any, thisArg?: any };

export const turnOnFauxpilot = {
    command: "fauxpilot.enable",
    callback: () => setExtensionStatus(true)
}

export const turnOffFauxpilot = {
    command: "fauxpilot.disable",
    callback: () => setExtensionStatus(false)
}