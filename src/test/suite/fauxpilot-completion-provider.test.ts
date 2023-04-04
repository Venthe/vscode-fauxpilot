import assert = require("assert");
import { FauxpilotCompletionProvider } from "../../FauxpilotCompletionProvider";
import { CancellationToken, InlineCompletionContext, InlineCompletionItem, InlineCompletionItemProvider, InlineCompletionList, Position, ProviderResult, Range, TextDocument, workspace, StatusBarItem } from 'vscode';
import { AxiosResponse } from 'axios';
import { CreateCompletionResponse } from "openai";

suite('provideInlineCompletionItems', () => {
    test('Normal completion', async () => {
        const provider = new FauxpilotCompletionProvider(statusBarStub(), testCompletion([{ text: "Example response" }]));
        const result = await provider.provideInlineCompletionItems(
            documentStub("Example prompt"),
            positionStub(),
            null as any,
            null as any
        );
        assert.equal((result as any)[0].insertText, "Example response");
    });
    test('Debounced completion', async () => {
        // Rewrite as before/after each
        let output: any[] = [];
        const originalLog = console.log;
        const originalDebug = console.debug;
        console.log = (message?: any, ...optional: any[]) => {
            output.push([message, ...optional]);
            originalLog(message, ...optional);
        };
        console.debug = (message?: any, ...optional: any[]) => {
            output.push([message, ...optional]);
            originalDebug(message, ...optional);
        };

        const provider = new FauxpilotCompletionProvider(statusBarStub(), testCompletion([{ text: "Example response" }]));
        (provider.provideInlineCompletionItems(
            documentStub("Example prompt 1"),
            positionStub(),
            null as any,
            null as any
        ) as Promise<any>).then(console.debug);
        const result = await provider.provideInlineCompletionItems(
            documentStub("Example prompt 2"),
            positionStub(),
            null as any,
            null as any
        );

        console.debug = originalDebug;
        console.log = originalLog;

        assert.equal((result as any)[0].insertText, "Example response");
        assert.deepEqual(output, [
            [
                "Requesting completion for prompt",
                "Example prompt 1"
            ],
            [
                "Requesting completion for prompt",
                "Example prompt 2"
            ],
            [
                "Resolved previous debounce with defaults"
            ],
            [
                []
            ],
            [
                "Resolved debounce"
            ],
            [
                "Requesting completion after debounce period"
            ],
            [
                "Calling OpenAi",
                "Example prompt 2"
            ],
            [
                "Calling OpenAi with stop words = ",
                ["\n"]
            ]
        ]);
    });
});

function positionStub(): Position {
    return {
        line: 0,
        character: 0
    } as any;
}

function documentStub(out?: any): TextDocument {
    return {
        getText: () => out
    } as any;
}

function statusBarStub(): StatusBarItem { 
    return {
        tooltip: "",
        text: ""
    } as any
} 

function testCompletion(choices: { text: string }[]) {
    return {
        createCompletion: async (params: any): Promise<AxiosResponse<CreateCompletionResponse, any>> => {
            console.warn("DEBUG COMPLETION", params);
            const result: CreateCompletionResponse = {
                choices
            };
            return {
                data: result
            } as AxiosResponse;
        }
    };
}