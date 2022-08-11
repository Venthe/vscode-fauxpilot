let poorManUuid = 0;

export function uuidv4() {
    return `${poorManUuid++}`;
}