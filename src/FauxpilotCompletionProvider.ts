import { Configuration, CreateCompletionRequestPrompt, CreateCompletionResponse, OpenAIApi } from 'openai';
import {
    CancellationToken, InlineCompletionContext, InlineCompletionItem, InlineCompletionItemProvider, InlineCompletionList, Position, ProviderResult, Range,
    TextDocument, workspace, StatusBarItem, OutputChannel, WorkspaceConfiguration
} from 'vscode';
import { AxiosResponse, AxiosRequestConfig } from 'axios';
import { nextId,delay } from './Utils';
import { LEADING_LINES_PROP } from './Constants';
import { fauxpilotClient } from './FauxpilotClient';


export class FauxpilotCompletionProvider implements InlineCompletionItemProvider {
    cachedPrompts: Map<string, number> = new Map<string, number>();

    private configuration: Configuration = new Configuration({
        apiKey: workspace.getConfiguration('fauxpilot').get("token")
    });
    private openai: OpenAIApi;
    private requestStatus: string = "done";
    private statusBar: StatusBarItem;
    private extConfig: WorkspaceConfiguration;
    private userPressKeyCount = 0;
    private baseUrl: string;

    constructor(statusBar: StatusBarItem, extConfig: WorkspaceConfiguration) {
        this.statusBar = statusBar;
        this.extConfig = extConfig;
        this.baseUrl = fauxpilotClient.BaseUrl;
        this.openai = new OpenAIApi(this.configuration, this.baseUrl);
    }

    //@ts-ignore
    // because ASYNC and PROMISE
    public async provideInlineCompletionItems(document: TextDocument, position: Position, context: InlineCompletionContext, token: CancellationToken): ProviderResult<InlineCompletionItem[] | InlineCompletionList> {
        if (!fauxpilotClient.isEnabled) {
            fauxpilotClient.log("Extension not enabled, skipping.");
            return Promise.resolve(([] as InlineCompletionItem[]));
        }

        var fileExt = document.fileName.split('.').pop();
        if (fileExt && fauxpilotClient.ExcludeFileExts.includes(fileExt)) {
            // check if fileExt in array excludeFileExts
            fauxpilotClient.log("Ignore file ext: " + fileExt);
            return [];
        }
        
        let suggestionDelay = fauxpilotClient.SuggestionDelay;
        if (suggestionDelay > 0) {
            let holdPressId = ++this.userPressKeyCount;
            fauxpilotClient.log(`try await ${suggestionDelay}, ${holdPressId}`);
            await delay(suggestionDelay);
            if (holdPressId != this.userPressKeyCount) {
                return [];
            }    
            fauxpilotClient.log(`after await, ${holdPressId}, ${this.userPressKeyCount}`);
        }

        const prompt = this.getPrompt(document, position);
        fauxpilotClient.log(`Requesting completion for prompt: $prompt`);

        if (this.isNil(prompt)) {
            fauxpilotClient.log("Prompt is empty, skipping");
            return Promise.resolve(([] as InlineCompletionItem[]));
        }

        const currentTimestamp = Date.now();
        const currentId = nextId();
        this.cachedPrompts.set(currentId, currentTimestamp);

        // check there is no newer request util this.request_status is done
        while (this.requestStatus === "pending") {
            fauxpilotClient.log("pending, and Waiting for response...");
            await this.sleep(200);
            fauxpilotClient.log("current id = " + currentId + " request status = " + this.requestStatus);
            if (this.newestTimestamp() > currentTimestamp) {
                fauxpilotClient.log("newest timestamp=" + this.newestTimestamp() + "current timestamp=" + currentTimestamp);
                fauxpilotClient.log("Newer request is pending, skipping");
                this.cachedPrompts.delete(currentId);
                return Promise.resolve(([] as InlineCompletionItem[]));
            }
        }

        fauxpilotClient.log("current id = " + currentId + "set request status to pending");
        this.requestStatus = "pending";
        this.statusBar.tooltip = "Fauxpilot - Working";
        this.statusBar.text = "$(loading~spin)";

        return this.callOpenAi(prompt as String).then((response) => {
            this.statusBar.text = "$(light-bulb)";
            var result = this.toInlineCompletions(response.data, position);
            fauxpilotClient.log("inline completions array length: " + result.length);
            return result;
        }).catch((error) => {
            fauxpilotClient.log("prompt: " + prompt);
            fauxpilotClient.log(error.stack);
            fauxpilotClient.log(error);
            this.statusBar.text = "$(alert)";
            return ([] as InlineCompletionItem[]);
        }).finally(() => {
            fauxpilotClient.log("current id = " + currentId + "set request status to done");
            this.requestStatus = "done";
            this.cachedPrompts.delete(currentId);
        });

        // end of 

    }

    private getPrompt(document: TextDocument, position: Position): String | undefined {
        const promptLinesCount = this.extConfig.get("maxLines") as number;

        /* 
        Put entire file in prompt if it's small enough, otherwise only
        take lines above the cursor and from the beginning of the file.
        */
        if (document.lineCount <= promptLinesCount) {
            const range = new Range(0, 0, position.line, position.character);
            return document.getText(range);
        } else {
            const leadingLinesCount = Math.floor(LEADING_LINES_PROP * promptLinesCount);
            const prefixLinesCount = promptLinesCount - leadingLinesCount;
            const firstPrefixLine = position.line - prefixLinesCount;
            const prefix = document.getText(new Range(firstPrefixLine, 0, position.line, position.character));
            const leading = document.getText(new Range(0, 0, leadingLinesCount, 0));
            return leading + prefix;
        }
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
        // fauxpilotClient.log("Calling OpenAi: " + prompt + "\n prompt length: " + prompt.length);
        fauxpilotClient.log("Calling OpenAi, prompt length: " + prompt.length);

        //check if inline completion is enabled
        const stopWords = fauxpilotClient.StopWords;

        if (this.baseUrl != fauxpilotClient.BaseUrl) {
            this.baseUrl = fauxpilotClient.BaseUrl;
            this.openai = new OpenAIApi(this.configuration, this.baseUrl);
        }

        return this.openai.createCompletion({
            model: fauxpilotClient.Model,
            prompt: prompt as CreateCompletionRequestPrompt,
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            max_tokens: fauxpilotClient.MaxTokens,
            temperature: fauxpilotClient.Temperature,
            stop: stopWords
        });
        
    }

    private toInlineCompletions(value: CreateCompletionResponse, position: Position): InlineCompletionItem[] {
        // return value.choices?.map(choice => choice.text)
        //     .map(choiceText => new InlineCompletionItem(choiceText as string, new Range(position, position))) || [];
        if (!value.choices) {
            return [];
        }
        
        // it seems always return 1 choice.
        var choice1Text = value.choices[0].text; 
        if (!choice1Text) {
            return [];
        }

        fauxpilotClient.log('Get choice text: ' + choice1Text);
        fauxpilotClient.log('---------END-OF-CHOICE-TEXT-----------');
        if (choice1Text.trim().length <= 0) {
            return [];
        }

        return [new InlineCompletionItem(choice1Text, new Range(position, position.translate(0, choice1Text.length)))];
    }

}
