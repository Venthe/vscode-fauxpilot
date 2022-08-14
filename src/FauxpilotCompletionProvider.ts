import { Configuration, CreateCompletionRequestPrompt, CreateCompletionResponse, OpenAIApi } from 'openai';
import { CancellationToken, InlineCompletionContext, InlineCompletionItem, InlineCompletionItemProvider, InlineCompletionList, Position, ProviderResult, Range, TextDocument, workspace } from 'vscode';
import { AxiosResponse } from 'axios';
import { nextId } from './Uuid';

export class FauxpilotCompletionProvider implements InlineCompletionItemProvider {
    cachedPrompts: Map<string, number> = new Map<string, number>();

    private configuration: Configuration = new Configuration({
        apiKey: "dummy"
    });
    private openai: OpenAIApi = new OpenAIApi(this.configuration, `${workspace.getConfiguration('fauxpilot').get("server")}/${workspace.getConfiguration('fauxpilot').get("engine")}`);

    //@ts-ignore
    // becasue ASYNC and PROMISE
    public async provideInlineCompletionItems(document: TextDocument, position: Position, context: InlineCompletionContext, token: CancellationToken): ProviderResult<InlineCompletionItem[] | InlineCompletionList> {
        if (!workspace.getConfiguration('fauxpilot').get("enabled")) {
            console.debug("Extension not enabled, skipping.");
            return Promise.resolve(([] as InlineCompletionItem[]));
        }

        const prompt = this.getPrompt(document, position);
        console.debug("Requesting completion for prompt", prompt);

        if (this.isNil(prompt)) {
            console.debug("Prompt is empty, skipping");
            return Promise.resolve(([] as InlineCompletionItem[]));
        }

        const currentTimestamp = Date.now();
        const currentId = nextId();
        this.cachedPrompts.set(currentId, currentTimestamp);
        await this.sleep(workspace.getConfiguration('fauxpilot').get("suggestionDelay") as number)
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

    private getPrompt(document: TextDocument, position: Position): String | undefined {
        const firstLine = Math.max(position.line - (workspace.getConfiguration('fauxpilot').get("maxLines") as number), 0);

        return document.getText(
            new Range(firstLine, 0, position.line, position.character)
        );
    }

    private isNil(value: String | undefined | null): boolean {
        return value == undefined || value == null || value.length == 0;
    }

    private newestTimestamp() {
        return Array.from(this.cachedPrompts.values()).reduce((a, b) => Math.max(a, b))
    }

    private sleep(miliseconds: number) {
        return new Promise(r => setTimeout(r, miliseconds))
    };

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
}


