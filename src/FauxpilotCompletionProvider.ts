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
    private request_status: string = "done";

    //@ts-ignore
    // because ASYNC and PROMISE
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

        // check there is no newer request util this.request_status is done
        while (this.request_status === "pending") {
            await this.sleep(200);
            console.debug("current id = ", currentId, " request status = ", this.request_status);
            if (this.newestTimestamp() > currentTimestamp) {
                console.debug("newest timestamp=", this.newestTimestamp(), "current timestamp=", currentTimestamp);
                console.debug("Newer request is pending, skipping");
                this.cachedPrompts.delete(currentId);
                return Promise.resolve(([] as InlineCompletionItem[]));
            }
        }

        console.debug("current id = ", currentId, "set request status to pending");
        this.request_status = "pending";
        return this.callOpenAi(prompt as String).then((response) => {
            console.debug("current id = ", currentId, "set request status to done");
            this.request_status = "done";
            this.cachedPrompts.delete(currentId);
            return this.toInlineCompletions(response.data, position);
        }).catch((error) => {
            console.debug("current id = ", currentId, "set request status to done");
            this.request_status = "done";
            this.cachedPrompts.delete(currentId);
            console.error(error);
            return ([] as InlineCompletionItem[]);
        });
    }

    private getPrompt(document: TextDocument, position: Position): String | undefined {
        const firstLine = Math.max(position.line - (workspace.getConfiguration('fauxpilot').get("maxLines") as number), 0);

        return document.getText(
            new Range(firstLine, 0, position.line, position.character)
        );
    }

    private isNil(value: String | undefined | null): boolean {
        return value === undefined || value === null || value.length === 0;
    }

    private newestTimestamp() {
        return Array.from(this.cachedPrompts.values()).reduce((a, b) => Math.max(a, b));
    }

    private sleep(milliseconds: number) {
        return new Promise(r => setTimeout(r, milliseconds));
    };

    private callOpenAi(prompt: String): Promise<AxiosResponse<CreateCompletionResponse, any>> {
        console.debug("Calling OpenAi", prompt);

        //check if inline completion is enabled
        const stop_words = workspace.getConfiguration('fauxpilot').get("inlineCompletion") ? ["\n"] : [];
        console.debug("Calling OpenAi with stop words = ", stop_words);
        return this.openai.createCompletion({
            model: workspace.getConfiguration('fauxpilot').get("model") ?? "<<UNSET>>",
            prompt: prompt as CreateCompletionRequestPrompt,
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            max_tokens: workspace.getConfiguration('fauxpilot').get("maxTokens"),
            temperature: workspace.getConfiguration('fauxpilot').get("temperature"),
            stop: stop_words
        });
    }

    private toInlineCompletions(value: CreateCompletionResponse, position: Position): InlineCompletionItem[] {
        return value.choices?.map(choice => choice.text)
            .map(choiceText => new InlineCompletionItem(choiceText as string, new Range(position, position))) || [];
    }
}
