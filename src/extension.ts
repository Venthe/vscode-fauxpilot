// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { commands, ExtensionContext, languages, StatusBarAlignment, window, workspace} from 'vscode';
import { turnOffFauxpilot, turnOnFauxpilot } from './Commands';
import { FauxpilotCompletionProvider } from './FauxpilotCompletionProvider';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
	console.debug("Registering Fauxpilot provider", new Date());

	const statusBar = window.createStatusBarItem(StatusBarAlignment.Right);
	statusBar.text = "$(light-bulb)";
	statusBar.tooltip = `Fauxpilot - Ready`;

	let outputChannel = window.createOutputChannel("Fauxpilot");
	var extConfig = workspace.getConfiguration("fauxpilot");

	const statusUpdateCallback = (callback: any, showIcon: boolean) => async () => {
		await callback();
		if (showIcon) {
			statusBar.show();
		} else {
			statusBar.hide();
		}
	};

	context.subscriptions.push(

		languages.registerInlineCompletionItemProvider(
			extConfig.get("fileFilter", [{ pattern: "**" }]), new FauxpilotCompletionProvider(statusBar, outputChannel, extConfig)
		),

		commands.registerCommand(turnOnFauxpilot.command, statusUpdateCallback(turnOnFauxpilot.callback, true)),
		commands.registerCommand(turnOffFauxpilot.command, statusUpdateCallback(turnOffFauxpilot.callback, false)),
		statusBar
	);

	if (workspace.getConfiguration('fauxpilot').get("enabled")) {
		statusBar.show();
	}
}

// this method is called when your extension is deactivated
export function deactivate() {
	console.debug("Deactivating Fauxpilot provider", new Date());
}