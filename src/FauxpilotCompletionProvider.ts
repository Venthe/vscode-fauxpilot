import { Configuration, CreateCompletionRequestPrompt, CreateCompletionResponse, OpenAIApi } from 'openai';
import { CancellationToken, InlineCompletionContext, InlineCompletionItem, InlineCompletionItemProvider, InlineCompletionList, Position, ProviderResult, Range, TextDocument, workspace, StatusBarItem } from 'vscode';
import { AxiosResponse } from 'axios';
import { debounce } from './utilities';

export class FauxpilotCompletionProvider implements InlineCompletionItemProvider {
    // TODO: Make dynamic
    //  AFAIK VSCode creates provider once. As such, token will never be updated
    private configuration: Configuration = new Configuration({
        apiKey: workspace.getConfiguration('fauxpilot').get("token")
    });
    // TODO: Make dynamic
    //  AFAIK VSCode creates provider once. As such, server address will never be updated
    private openai: OpenAIApi = new OpenAIApi(this.configuration, `${workspace.getConfiguration('fauxpilot').get("server")}/${workspace.getConfiguration('fauxpilot').get("engine")}`);
    private readonly debouncedApiCall: any = debounce(
        // TODO: Extract to method.
        //  I absolutely forgot how to handle 'this' context in JS. Simple extraction makes this
        //  undefined. How to bind it?
        (prompt: string, position: Position) => {
            return new Promise(resolve => {
                console.debug("Requesting completion after debounce period");
                this.statusBar.tooltip = "Fauxpilot - Working";
                this.statusBar.text = "$(loading~spin)";
                this.callOpenAi(prompt).then((response) => {
                    this.statusBar.text = "$(light-bulb)";
                    resolve(this.toInlineCompletions(response.data, position));
                }).catch((error) => {
                    this.statusBar.text = "$(alert)";
                    console.error(error);
                    resolve(([] as InlineCompletionItem[]));
                });
            });
        }, { timeout: workspace.getConfiguration('fauxpilot').get("suggestionDelay") as number, defaultReturn: [] });

    constructor(private statusBar: StatusBarItem, private testCompletion?: any) {
    }

    //@ts-ignore
    // because ASYNC and PROMISE
    public async provideInlineCompletionItems(document: TextDocument, position: Position, context: InlineCompletionContext, token: CancellationToken): ProviderResult<InlineCompletionItem[] | InlineCompletionList> {
        if (!workspace.getConfiguration('fauxpilot').get("enabled")) {
            console.debug("Extension not enabled, skipping.");
            return Promise.resolve(([] as InlineCompletionItem[]));
        }

        const prompt = this.getPrompt(document, position);

        if (this.isNil(prompt)) {
            console.debug("Prompt is empty, skipping");
            return Promise.resolve(([] as InlineCompletionItem[]));
        }

        console.debug("Requesting completion for prompt", prompt);
        return this.debouncedApiCall(prompt, position);
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

    private callOpenAi(prompt: String): Promise<AxiosResponse<CreateCompletionResponse, any>> {
        console.debug("Calling OpenAi", prompt);

        // FIXME: I do not understand my own comment below. To verify
        //  check if inline completion is enabled
        const stopWords = workspace.getConfiguration('fauxpilot').get("inlineCompletion") ? ["\n"] : [];
        console.debug("Calling OpenAi with stop words = ", stopWords);
        // FIXME: how to mock in mocha?
        //  Current implementation works by injecting alternative provider via constructor
        return (this.testCompletion ?? this.openai).createCompletion({
            model: workspace.getConfiguration('fauxpilot').get("model") ?? "<<UNSET>>",
            prompt: prompt as CreateCompletionRequestPrompt,
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            max_tokens: workspace.getConfiguration('fauxpilot').get("maxTokens"),
            temperature: workspace.getConfiguration('fauxpilot').get("temperature"),
            stop: stopWords
        });
    }

    private toInlineCompletions(value: CreateCompletionResponse, position: Position): InlineCompletionItem[] {
        return value.choices?.map(choice => choice.text)
            .map(choiceText => new InlineCompletionItem(choiceText as string, new Range(position, position))) || [];
    }
}
