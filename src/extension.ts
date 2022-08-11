// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { Configuration, CreateCompletionRequestPrompt, CreateCompletionResponse, OpenAIApi } from 'openai';
import { CancellationToken, ExtensionContext, InlineCompletionContext, InlineCompletionItem, InlineCompletionItemProvider, InlineCompletionList, languages, Position, ProviderResult, Range, TextDocument, window, workspace } from 'vscode';
import { AxiosResponse } from 'axios';

let poorManUuid = 0;

function uuidv4() {
	return `${poorManUuid++}`;
}

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
	readonly delay: number = 150;

	cachedPrompts: Map<string, number> = new Map<string, number>();
	
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

	private toInlineCompletions(value: CreateCompletionResponse, position: Position): InlineCompletionItem[] {
		return value.choices?.map(choice => choice.text)
			.map(choiceText => new InlineCompletionItem(choiceText as string, new Range(position, position))) || [];
	}

	private newestTimestamp() {
		return Array.from(this.cachedPrompts.values()).reduce((a, b) => Math.max(a, b))
	}

	private sleep(miliseconds: number) {
		return new Promise(r => setTimeout(r, miliseconds))
	};

	//@ts-ignore
	// becasue ASYNC and PROMISE
	public async provideInlineCompletionItems(document: TextDocument, position: Position, context: InlineCompletionContext, token: CancellationToken): ProviderResult<InlineCompletionItem[] | InlineCompletionList> {
		const prompt = this.getPrompt(document, position);
		console.debug("Requesting completion for prompt", prompt);

		if (this.isNil(prompt) ) {
			console.debug("Prompt is empty, skipping");
			return Promise.resolve(([] as InlineCompletionItem[]));
		}

		const currentTimestamp = Date.now();
		const currentId = uuidv4();
		this.cachedPrompts.set(currentId, currentTimestamp);
		await this.sleep(this.delay)
		if (currentTimestamp < this.newestTimestamp()) {
			console.debug("Newer request is present, skipping");
			this.cachedPrompts.delete(currentId);
			return Promise.resolve(([] as InlineCompletionItem[]));
		}

		// Prompt is already nil-checked
		const response = await this.callOpenAi(prompt as String);
		console.debug("Got response from OpenAi", response);
		const completions = this.toInlineCompletions(response.data, position);
		console.debug("Transformed completions", completions);
		return Promise.resolve(completions);
	}
}
