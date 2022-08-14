let poorManUuid = 0;

// Placeholder for a real Unique ID function
//  Considering how JS works; I don't believe that such naiive implementation
//  will cause any trouble
export function nextId() {
    return `${poorManUuid++}`;
}