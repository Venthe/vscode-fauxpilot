let poorManUuid = 0;

// Placeholder for a real Unique ID function
//  Considering how JS works; I don't believe that such naiive implementation
//  will cause any trouble
export function nextId() {
    return `${poorManUuid++}`;
}

export function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function currentTimeString(): string {
    const now = new Date();
    const hours = `${now.getHours()}`.padStart(2, '0');
    const minutes = `${now.getMinutes()}`.padStart(2, '0');
    const seconds = `${now.getSeconds()}`.padStart(2, '0');
    const ms = `${now.getMilliseconds()}`.padStart(3, '0');
    return `[${hours}:${minutes}:${seconds}:${ms}]`;
}

