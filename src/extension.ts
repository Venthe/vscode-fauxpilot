// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { Configuration, CreateCompletionRequestPrompt, CreateCompletionResponse, OpenAIApi } from 'openai';
import { CancellationToken, ExtensionContext, InlineCompletionContext, InlineCompletionItem, InlineCompletionItemProvider, InlineCompletionList, languages, Position, ProviderResult, Range, TextDocument, window, workspace } from 'vscode';
import { AxiosResponse } from 'axios';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
	console.debug("Registering Fauxpilot provider", new Date());
	context.subscriptions.push(
		languages.registerInlineCompletionItemProvider(
			{ pattern: "**", scheme: 'untitled' }, new FauxpilotCompletionProvider()
		)
	);
}

// this method is called when your extension is deactivated
export function deactivate() {
	console.debug("Deactivating Fauxpilot provider", new Date());
}

class FauxpilotCompletionProvider implements InlineCompletionItemProvider {
	private configuration: Configuration = new Configuration({
		apiKey: "dummy"
	});
	private openai: OpenAIApi = new OpenAIApi(this.configuration, `${workspace.getConfiguration('fauxpilot').get("server")}/${workspace.getConfiguration('fauxpilot').get("engine")}`);

	private getPrompt(document: TextDocument, position: Position): String | undefined {
		return document.getText(
			new Range(position.with(undefined, 0), position)
		);
	}

	private isNil(value: String | undefined | null): boolean {
		return value == undefined || value == null || value.length == 0;
	}

	private callOpenAi(prompt: String): Promise<AxiosResponse<CreateCompletionResponse, any>> {
		console.debug("Calling OpenAi", prompt);
		return this.openai.createCompletion({
			model: "fastertransformer",
			prompt: prompt as CreateCompletionRequestPrompt,
			max_tokens: workspace.getConfiguration('fauxpilot').get("maxTokens"),
			temperature: 0.1
		});
	}

	private toInlineCompletions(value: CreateCompletionResponse): InlineCompletionItem[] {
		return value.choices?.map(choice => choice.text).map(choiceText => ({ insertText: choiceText } as InlineCompletionItem)) || [];
	}

	//@ts-ignore
	// becasue ASYNC and PROMISE
	public async provideInlineCompletionItems(document: TextDocument, position: Position, context: InlineCompletionContext, token: CancellationToken): ProviderResult<InlineCompletionItem[] | InlineCompletionList> {
		const prompt = this.getPrompt(document, position);
		console.debug("Requesting completion for prompt", prompt);

		if (this.isNil(prompt)) {
			console.debug("Prompt is empty, skipping");
			return [];
		}

		// Prompt is already nil-checked
		const response = await this.callOpenAi(prompt as String);
		console.debug("Got response from OpenAi", response);
		const completions = this.toInlineCompletions(response.data);
		console.debug("Transformed completions", completions);
		return completions;
	}
}
