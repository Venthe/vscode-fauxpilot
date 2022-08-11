// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { Configuration, CreateCompletionRequestPrompt, CreateCompletionResponse, OpenAIApi } from 'openai';
import { CancellationToken, ExtensionContext, InlineCompletionContext, InlineCompletionItem, InlineCompletionItemProvider, InlineCompletionList, languages, Position, ProviderResult, Range, TextDocument, window, workspace } from 'vscode';
import { AxiosResponse } from 'axios';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
	function getPrompt(document: TextDocument, position: Position): String | undefined {
		return document.getText(
			new Range(position.with(undefined, 0), position)
		);
	}

	function isNil(value: String | undefined | null): boolean {
		return value == undefined || value == null || value.length == 0;
	}

	function callOpenAi(prompt: String): Promise<AxiosResponse<CreateCompletionResponse, any>> {
		console.debug("Calling OpenAi", prompt);
		return openai.createCompletion({
			model: "fastertransformer",
			prompt: prompt as CreateCompletionRequestPrompt,
			max_tokens: workspace.getConfiguration('fauxpilot').get("maxTokens"),
			temperature: 0.1
		});
	}

	function toInlineCompletions(value: CreateCompletionResponse): InlineCompletionItem[] {
		return value.choices?.map(choice => choice.text).map(choiceText => ({ insertText: choiceText } as InlineCompletionItem)) || [];
	}

	const configuration = new Configuration({
		apiKey: "dummy"
	});
	const openai: OpenAIApi = new OpenAIApi(configuration, `${workspace.getConfiguration('fauxpilot').get("server")}/${workspace.getConfiguration('fauxpilot').get("engine")}`);

	const provider: InlineCompletionItemProvider = {
		//@ts-ignore
		// becasue ASYNC and PROMISE
		provideInlineCompletionItems: async (document: TextDocument, position: Position, _context: InlineCompletionContext, _token: CancellationToken): Promise<ProviderResult<InlineCompletionList | InlineCompletionItem[]>> => {
			const prompt = getPrompt(document, position);
			console.debug("Requesting completion for prompt", prompt);

			if (isNil(prompt)) {
				console.debug("Prompt is empty, skipping");
				return [];
			}

			// Prompt is already nil-checked
			const response = await callOpenAi(prompt as String);
			console.debug("Got response from OpenAi", response);
			const completions = toInlineCompletions(response.data);
			console.debug("Transformed completions", completions);
			return completions;
		}
	};

	console.debug("Registering Fauxpilot provider", new Date());
	context.subscriptions.push(
		languages.registerInlineCompletionItemProvider(
			{ pattern: "**" }, provider
		)
	);
}

// this method is called when your extension is deactivated
export function deactivate() {
	console.debug("Deactivating Fauxpilot provider", new Date());
}
