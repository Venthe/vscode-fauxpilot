import { Configuration, CreateCompletionRequestPrompt, CreateCompletionResponse, OpenAIApi } from 'openai';
import { CancellationToken, InlineCompletionContext, InlineCompletionItem, InlineCompletionItemProvider, InlineCompletionList, Position, ProviderResult, Range, TextDocument, workspace, StatusBarItem } from 'vscode';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { nextId } from './Uuid';
import { LEADING_LINES_PROP } from './Constants';

export class FauxpilotCompletionProvider implements InlineCompletionItemProvider {
    cachedPrompts: Map<string, number> = new Map<string, number>();

    private configuration: Configuration = new Configuration({
        apiKey: workspace.getConfiguration('fauxpilot').get("token")
    });
    private openai: OpenAIApi = new OpenAIApi(this.configuration, `${workspace.getConfiguration('fauxpilot').get("server")}/${workspace.getConfiguration('fauxpilot').get("engine")}`);
    private requestStatus: string = "done";
    private statusBar: StatusBarItem;
    private oobabooga_axios: AxiosInstance;

    constructor(statusBar: StatusBarItem){
        this.statusBar = statusBar;
        this.oobabooga_axios = axios.create();

        // intercept the completion request response of oobabooga to bring it into the correct format.
        this.oobabooga_axios.interceptors.response.use(res => {
            if (res.status == 200){
                res.data = {
                    'id': '0',
                    'object': "0",
                    'created': 0,
                    'model': "0",
                    'choices': [{'text': res.data.results[0].text,
                        'index': 0,
                        'logprobs': null,
                        'finish_reason': ""
                        }]
                };
                return res;
            }
            return null;
        });
    }

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
        while (this.requestStatus === "pending") {
            await this.sleep(200);
            console.debug("current id = ", currentId, " request status = ", this.requestStatus);
            if (this.newestTimestamp() > currentTimestamp) {
                console.debug("newest timestamp=", this.newestTimestamp(), "current timestamp=", currentTimestamp);
                console.debug("Newer request is pending, skipping");
                this.cachedPrompts.delete(currentId);
                return Promise.resolve(([] as InlineCompletionItem[]));
            }
        }

        console.debug("current id = ", currentId, "set request status to pending");
        this.requestStatus = "pending";
        this.statusBar.tooltip = "Fauxpilot - Working";
        this.statusBar.text = "$(loading~spin)";

        return this.callOpenAi(prompt as String).then((response) => {
            this.statusBar.text = "$(light-bulb)";
            return this.toInlineCompletions(response.data, position);
        }).catch((error) => {
            console.error(error);
            this.statusBar.text = "$(alert)";
            return ([] as InlineCompletionItem[]);
        }).finally(() => {
            console.debug("current id = ", currentId, "set request status to done");
            this.requestStatus = "done";
            this.cachedPrompts.delete(currentId);
        });
    }

    private getPrompt(document: TextDocument, position: Position): String | undefined {        
        const promptLinesCount = workspace.getConfiguration('fauxpilot').get("maxLines") as number;

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
        console.debug("Calling OpenAi", prompt);

        //check if inline completion is enabled
        const stopWords = workspace.getConfiguration('fauxpilot').get("inlineCompletion") ? ["\n"] : [];
        const use_oobabooga = workspace.getConfiguration('fauxpilot').get("oobabooga") as boolean;
        console.debug("Calling OpenAi with stop words = ", stopWords);
        if (use_oobabooga) {
            // create the completion request for oobabooga webui
            let request = {
                'prompt': prompt,
                'max_new_tokens': workspace.getConfiguration('fauxpilot').get("maxTokens"),
                'auto_max_new_tokens': false,
                'preset': 'None',
                'do_sample': true,
                'temperature': workspace.getConfiguration('fauxpilot').get("temperature"),
                'top_p': 0.1,
                'typical_p': 1,
                'epsilon_cutoff': 0,
                'eta_cutoff': 0,
                'tfs': 1,
                'top_a': 0,
                'repetition_penalty': 1.18,
                'repetition_penalty_range': 0,
                'top_k': 40,
                'min_length': 0,
                'no_repeat_ngram_size': 0,
                'num_beams': 1,
                'penalty_alpha': 0,
                'length_penalty': 1,
                'early_stopping': false,
                'mirostat_mode': 0,
                'mirostat_tau': 5,
                'mirostat_eta': 0.1,
                'guidance_scale': 1,
                'negative_prompt': '',
                'seed': -1,
                'add_bos_token': true,
                'truncation_length': 2048,
                'ban_eos_token': false,
                'skip_special_tokens': true,
                'stopping_strings': stopWords
            }
            let url = workspace.getConfiguration('fauxpilot').get("server") as string;
            let oobabooga_request = this.oobabooga_axios.post(url, request);
            return oobabooga_request;
        }
        return this.openai.createCompletion({
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
