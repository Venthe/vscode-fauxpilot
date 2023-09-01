
import OpenAI from 'openai';
import {
    CancellationToken, InlineCompletionContext, InlineCompletionItem, InlineCompletionItemProvider, InlineCompletionList, Position, ProviderResult, Range,
    TextDocument, workspace, StatusBarItem, OutputChannel, WorkspaceConfiguration, InlineCompletionTriggerKind
} from 'vscode';

import { nextId,delay } from './Utils';
import { LEADING_LINES_PROP } from './Constants';
import { fauxpilotClient } from './FauxpilotClient';
import { fetch } from './AccessBackend';


export class FauxpilotCompletionProvider implements InlineCompletionItemProvider {
    cachedPrompts: Map<string, number> = new Map<string, number>();

    private requestStatus: string = "done";
    private statusBar: StatusBarItem;
    private extConfig: WorkspaceConfiguration;
    private userPressKeyCount = 0;
    private baseUrl: string;

    constructor(statusBar: StatusBarItem, extConfig: WorkspaceConfiguration) {
        this.statusBar = statusBar;
        this.extConfig = extConfig;
        this.baseUrl = fauxpilotClient.BaseUrl;
        this.baseUrl = fauxpilotClient.BaseUrl;
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

        const prompt = this.getPrompt(document, position);
        let suggestionDelay = fauxpilotClient.SuggestionDelay;
        if (suggestionDelay > 0) {
            let holdPressId = ++this.userPressKeyCount;
            fauxpilotClient.log(`try await ${suggestionDelay}, ${holdPressId}`);
            await delay(suggestionDelay);
            if (holdPressId != this.userPressKeyCount) {
                return [];
            }    
            fauxpilotClient.log(`after await, ${holdPressId}, ${this.userPressKeyCount}`);
            if (token.isCancellationRequested) {
                fauxpilotClient.log('request cancelled.');
                return [];
            }
        }

        // fauxpilotClient.log(`Requesting completion for prompt: ${prompt}`);
        fauxpilotClient.log(`Requesting completion for prompt, length: ${prompt?.length ?? 0}`);

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
            await delay(200);
            fauxpilotClient.log("current id = " + currentId + " request status = " + this.requestStatus);
            if (this.newestTimestamp() > currentTimestamp) {
                fauxpilotClient.log("newest timestamp=" + this.newestTimestamp() + "current timestamp=" + currentTimestamp);
                fauxpilotClient.log("Newer request is pending, skipping");
                this.cachedPrompts.delete(currentId);
                return Promise.resolve(([] as InlineCompletionItem[]));
            }
        }

        if (token.isCancellationRequested) {
            fauxpilotClient.log('request cancelled.');
            return [];
        }

        fauxpilotClient.log("current id = " + currentId + "set request status to pending");
        this.requestStatus = "pending";
        this.statusBar.tooltip = "Fauxpilot - Working";
        this.statusBar.text = "$(loading~spin)";

        fauxpilotClient.log("Calling OpenAi, prompt length: " + prompt?.length);
        const promptStr = prompt?.toString();
        if (!promptStr) {
            return [];
        }
        return fetch(promptStr).then((response) => {
            this.statusBar.text = "$(light-bulb)";
            // if (token.isCancellationRequested) {
            //     fauxpilotClient.log('request cancelled.');
            //     return [];
            // }
            var result = this.toInlineCompletions(response, position);
            fauxpilotClient.log("inline completions array length: " + result.length);
            return result;
        }).finally(() => {
            fauxpilotClient.log("current id = " + currentId + " set request status to done");
            this.requestStatus = "done";
            this.cachedPrompts.delete(currentId);
        });

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

    private toInlineCompletions(value: OpenAI.Completion, position: Position): InlineCompletionItem[] {
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
