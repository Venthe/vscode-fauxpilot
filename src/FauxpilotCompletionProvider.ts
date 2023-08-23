import { Configuration, CreateCompletionRequestPrompt, CreateCompletionResponse, OpenAIApi } from 'openai';
import {
    CancellationToken, InlineCompletionContext, InlineCompletionItem, InlineCompletionItemProvider, InlineCompletionList, Position, ProviderResult, Range,
    TextDocument, workspace, StatusBarItem, OutputChannel, WorkspaceConfiguration
} from 'vscode';
import { AxiosResponse, AxiosRequestConfig } from 'axios';
import { nextId } from './Uuid';
import { LEADING_LINES_PROP } from './Constants';



const http = require('http');
const https = require('https');
// const OpenAI = require('openai');

export class FauxpilotCompletionProvider implements InlineCompletionItemProvider {
    cachedPrompts: Map<string, number> = new Map<string, number>();

    private configuration: Configuration = new Configuration({
        apiKey: workspace.getConfiguration('fauxpilot').get("token")
    });
    private openai: OpenAIApi;
    private requestStatus: string = "done";
    private statusBar: StatusBarItem;
    private outputChannel: OutputChannel;
    private extConfig: WorkspaceConfiguration;
    private excludeFileExts: Array<String>;

    // this one seems doesn't work...
    private requestConfig: AxiosRequestConfig;

    constructor(statusBar: StatusBarItem, outputChannel: OutputChannel, extConfig: WorkspaceConfiguration) {
        this.statusBar = statusBar;
        this.outputChannel = outputChannel;
        this.extConfig = extConfig;
        const baseUrl = `${extConfig.get("server")}/${extConfig.get("engine")}`;
        this.outputChannel.appendLine(`openai baseUrl: ${baseUrl}`);
        this.openai = new OpenAIApi(this.configuration, baseUrl);
        
        this.requestConfig = {
            // arg from https://azureossd.github.io/2022/03/10/NodeJS-with-Keep-Alives-and-Connection-Reuse/
            httpAgent: new http.Agent({
                keepAlive: true,
                maxSockets: 6, // or 128 / os.cpus().length if running node across multiple CPUs
                maxFreeSockets: 6, // or 128 / os.cpus().length if running node across multiple CPUs
                timeout: 60000, // active socket keepalive for 60 seconds
                freeSocketTimeout: 30000, // free socket keepalive for 30 seconds
            }),
            httpsAgent: new https.Agent({
                keepAlive: true,
                maxSockets: 6, // or 128 / os.cpus().length if running node across multiple CPUs
                maxFreeSockets: 6, // or 128 / os.cpus().length if running node across multiple CPUs
                timeout: 60000, // active socket keepalive for 30 seconds
                freeSocketTimeout: 30000, // free socket keepalive for 30 seconds
            }),
        };

        this.excludeFileExts = [];
        // let excludeFileExtsConfig = extConfig.get("excludeFileExts", new Map<String, Boolean>());
        let excludeFileExtsConfig: { [key: string]: boolean } = extConfig.get("excludeFileExts", {});
        for (const key in excludeFileExtsConfig as object) {
            if (excludeFileExtsConfig[key]) {
                this.excludeFileExts.push(key);
            }
        }
    }

    //@ts-ignore
    // because ASYNC and PROMISE
    public async provideInlineCompletionItems(document: TextDocument, position: Position, context: InlineCompletionContext, token: CancellationToken): ProviderResult<InlineCompletionItem[] | InlineCompletionList> {
        if (!this.extConfig.get("enabled")) {
            this.outputChannel.appendLine("Extension not enabled, skipping.");
            return Promise.resolve(([] as InlineCompletionItem[]));
        }
        var fileExt = document.fileName.split('.').pop();
        if (fileExt && this.excludeFileExts.includes(fileExt)) {
            // check if fileExt in array excludeFileExts
            this.outputChannel.appendLine("Ignore file ext: " + fileExt);
            return [];
        }
        
        const prompt = this.getPrompt(document, position);
        this.outputChannel.appendLine(`Requesting completion for prompt: $prompt`);

        if (this.isNil(prompt)) {
            this.outputChannel.appendLine("Prompt is empty, skipping");
            return Promise.resolve(([] as InlineCompletionItem[]));
        }

        const currentTimestamp = Date.now();
        const currentId = nextId();
        this.cachedPrompts.set(currentId, currentTimestamp);

        // check there is no newer request util this.request_status is done
        while (this.requestStatus === "pending") {
            this.outputChannel.appendLine("pending, and Waiting for response...");
            await this.sleep(200);
            this.outputChannel.appendLine("current id = " + currentId + " request status = " + this.requestStatus);
            if (this.newestTimestamp() > currentTimestamp) {
                this.outputChannel.appendLine("newest timestamp=" + this.newestTimestamp() + "current timestamp=" + currentTimestamp);
                this.outputChannel.appendLine("Newer request is pending, skipping");
                this.cachedPrompts.delete(currentId);
                return Promise.resolve(([] as InlineCompletionItem[]));
            }
        }

        this.outputChannel.appendLine("current id = " + currentId + "set request status to pending");
        this.requestStatus = "pending";
        this.statusBar.tooltip = "Fauxpilot - Working";
        this.statusBar.text = "$(loading~spin)";

        return this.callOpenAi(prompt as String).then((response) => {
            this.statusBar.text = "$(light-bulb)";
            var result = this.toInlineCompletions(response.data, position);
            this.outputChannel.appendLine("inline completions array length: " + result.length);
            return result;
        }).catch((error) => {
            this.outputChannel.appendLine("prompt: " + prompt);
            this.outputChannel.appendLine(error.stack);
            this.outputChannel.appendLine(error);
            this.statusBar.text = "$(alert)";
            return ([] as InlineCompletionItem[]);
        }).finally(() => {
            this.outputChannel.appendLine("current id = " + currentId + "set request status to done");
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
        // this.outputChannel.appendLine("Calling OpenAi: " + prompt + "\n prompt length: " + prompt.length);
        this.outputChannel.appendLine("Calling OpenAi, prompt length: " + prompt.length);

        //check if inline completion is enabled
        const stopWords = this.extConfig.get("inlineCompletion") ? ["\n"] : [];
        this.outputChannel.appendLine("Calling OpenAi with stop words = " + stopWords);

        return this.openai.createCompletion({
            model: this.extConfig.get("model") ?? "<<UNSET>>",
            prompt: prompt as CreateCompletionRequestPrompt,
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            max_tokens: this.extConfig.get("maxTokens"),
            temperature: this.extConfig.get("temperature"),
            stop: stopWords
        });
        // }, this.requestConfig);
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

        this.outputChannel.appendLine('Get choice text: ' + choice1Text);
        this.outputChannel.appendLine('---------END-OF-CHOICE-TEXT-----------');
        if (choice1Text.trim().length <= 0) {
            return [];
        }

        return [new InlineCompletionItem(choice1Text, new Range(position, position.translate(0, choice1Text.length)))];
    }

}
