// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { commands, ExtensionContext, languages, StatusBarAlignment, window, workspace} from 'vscode';
import { turnOffFauxpilot, turnOnFauxpilot } from './Commands';
import { FauxpilotCompletionProvider } from './FauxpilotCompletionProvider';
import { stat } from 'fs';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
	console.debug("Registering Fauxpilot provider", new Date());

	const configuration = workspace.getConfiguration();

	const statusBar = window.createStatusBarItem(StatusBarAlignment.Right);
	statusBar.text = "$(light-bulb)";
	statusBar.tooltip = `Fauxpilot - ${configuration.get('fauxpilot.enabled') ? "Enabled" : "Disabled"}`;

	const statusUpdateCallback = (callback: any) =>{
		return ()=>{
			statusBar.tooltip = `Fauxpilot - ${configuration.get('fauxpilot.enabled') ? "Enabled" : "Disabled"}`;
			callback();
		};
	};

	context.subscriptions.push(
		languages.registerInlineCompletionItemProvider(
			{ pattern: "**" }, new FauxpilotCompletionProvider(statusBar)
		),

		commands.registerCommand(turnOnFauxpilot.command, statusUpdateCallback(turnOnFauxpilot.callback)),
		commands.registerCommand(turnOffFauxpilot.command, statusUpdateCallback(turnOffFauxpilot.callback)),
		statusBar
	);


	statusBar.show();

}

// this method is called when your extension is deactivated
export function deactivate() {
	console.debug("Deactivating Fauxpilot provider", new Date());
}