import * as assert from 'assert';
import { window } from "vscode";
import { nextId } from "../../Utils";

suite('Id generation', () => {
    test('First ID generated is a valid number', () => {
        let result = nextId();
        assert.equal(result, 0);
    });
    test('Next ID generated is different from the first', () => {
        let result1 = nextId();
        let result2 = nextId();
        assert.notEqual(result1, result2);
    });
});