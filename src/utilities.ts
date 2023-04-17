export function debounce<T>(fn: (ths: any, ...args: any[]) => Promise<T>,
    { timeout = 300, defaultReturn }: { timeout: number, defaultReturn?: T }) {
    let timer: NodeJS.Timeout;
    let previousPromise: any;
    return async (...args: any[]) => {
        // Resolve any previous pending promises, so that we will never leave
        //  them dangling
        // TODO: Extract debug logging wrapper
        previousPromise?.((() => {
            console.debug("Resolved previous debounce with defaults");
            return defaultReturn;
        })());
        clearTimeout(timer);
        return new Promise(resolve => {
            // Add previous promise, so that we can resolve it with empty upon the
            //  next (debounced) call
            previousPromise = resolve;
            timer = setTimeout(() => {
                // TODO: Extract debug logging wrapper
                resolve((() => {
                    console.debug("Resolved debounce");
                    // Because we are actually calling the API, we must resolved
                    //  all previous debounced calls with empty, so we ensure that
                    //  there is no dangling resolved promise that would be called
                    //  during the next debounced call
                    previousPromise = undefined;
                    // @ts-ignore
                    return fn.apply(this, args);
                })());
            }, timeout);
        });
    };
}