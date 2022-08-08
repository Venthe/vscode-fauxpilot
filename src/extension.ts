// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { Configuration, CreateCompletionResponse, OpenAIApi } from 'openai';
import { CancellationToken, commands, ExtensionContext, InlineCompletionContext, InlineCompletionItem, InlineCompletionItemProvider, InlineCompletionList, languages, Position, ProviderResult, Range, TextDocument, window, workspace } from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(_context: ExtensionContext) {

	console.log()
	const configuration = new Configuration({
		apiKey: "dummy"
	});
	const openai: OpenAIApi = new OpenAIApi(configuration, `${workspace.getConfiguration('fauxpilot').get("server")}/${workspace.getConfiguration('fauxpilot').get("engine")}`);

	const provider: InlineCompletionItemProvider = {
		//@ts-ignore
		// becasue ASYNC and PROMISE
		provideInlineCompletionItems: async (document: TextDocument, position: Position, _context: InlineCompletionContext, _token: CancellationToken): Promise<ProviderResult<InlineCompletionList | InlineCompletionItem[]>> => {
			const textBeforeCursor = document.getText(
				new Range(position.with(undefined, 0), position)
			);

			try {
				const result = await openai.createCompletion({
					model: "fastertransformer",
					prompt: textBeforeCursor,
					max_tokens: workspace.getConfiguration('fauxpilot').get("maxTokens"),
					temperature: 0.1
				});
				return result.data.choices?.map(a => a.text).map(a => ({ insertText: a } as InlineCompletionItem)) || [];
			} catch (err: any) {
				window.showErrorMessage(err);
			}
		}
	};

	languages.registerInlineCompletionItemProvider(
		{ pattern: "**" }, provider
	);
}

// this method is called when your extension is deactivated
export function deactivate() { }
