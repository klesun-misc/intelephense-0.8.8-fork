'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const types_1 = require("./types");
const parsedDocument_1 = require("./parsedDocument");
const php7parser_1 = require("php7parser");
class ParseTreeTraverser extends types_1.TreeTraverser {
    constructor(document, symbolTable, refTable) {
        super([document.tree]);
        this._doc = document;
        this._symbolTable = symbolTable;
        this._refTable = refTable;
    }
    get document() {
        return this._doc;
    }
    get symbolTable() {
        return this._symbolTable;
    }
    get refTable() {
        return this._refTable;
    }
    get text() {
        return this._doc.nodeText(this.node);
    }
    get range() {
        return this._doc.nodeRange(this.node);
    }
    get reference() {
        let range = this.range;
        return this._refTable.referenceAtPosition(range.start);
    }
    get scope() {
        let range = this.range;
        if (!range) {
            return null;
        }
        return this._symbolTable.scope(range.start);
    }
    get nameResolver() {
        let firstToken = parsedDocument_1.ParsedDocument.firstToken(this.node);
        let pos = this.document.positionAtOffset(firstToken.offset);
        return this._symbolTable.nameResolver(pos);
    }
    position(pos) {
        let offset = this._doc.offsetAtPosition(pos) - 1;
        let fn = (x) => {
            return x.tokenType !== undefined &&
                offset < x.offset + x.length &&
                offset >= x.offset;
        };
        return this.find(fn);
    }
    clone() {
        let spine = this.spine;
        let traverser = new ParseTreeTraverser(this._doc, this._symbolTable, this._refTable);
        traverser._spine = spine;
        return traverser;
    }
    prevToken(skipTrivia) {
        const spine = this._spine.slice(0);
        let current;
        let parent;
        let prevSiblingIndex;
        while (spine.length > 1) {
            current = spine.pop();
            parent = spine[spine.length - 1];
            prevSiblingIndex = parent.children.indexOf(current) - 1;
            if (prevSiblingIndex > -1) {
                spine.push(parent.children[prevSiblingIndex]);
                if (this._lastToken(spine, skipTrivia)) {
                    this._spine = spine;
                    return this.node;
                }
            }
        }
        return undefined;
    }
    _lastToken(spine, skipTrivia) {
        let node = spine[spine.length - 1];
        if (node.tokenType !== undefined && (!skipTrivia || node.tokenType < php7parser_1.TokenType.Comment)) {
            return spine;
        }
        if (!node.children) {
            return undefined;
        }
        for (let n = node.children.length - 1; n >= 0; --n) {
            spine.push(node.children[n]);
            if (this._lastToken(spine)) {
                return spine;
            }
            else {
                spine.pop();
            }
        }
        return undefined;
    }
    get isDeclarationName() {
        let traverser = this.clone();
        let t = traverser.node;
        let parent = traverser.parent();
        if (!t || !parent) {
            return false;
        }
        return ((t.tokenType === php7parser_1.TokenType.Name || t.tokenType === php7parser_1.TokenType.VariableName) && this._isDeclarationPhrase(parent)) ||
            (parent.phraseType === php7parser_1.PhraseType.Identifier && this._isDeclarationPhrase(traverser.parent()));
    }
    _isDeclarationPhrase(node) {
        if (!node) {
            return false;
        }
        switch (node.phraseType) {
            case php7parser_1.PhraseType.ClassDeclarationHeader:
            case php7parser_1.PhraseType.TraitDeclarationHeader:
            case php7parser_1.PhraseType.InterfaceDeclarationHeader:
            case php7parser_1.PhraseType.PropertyElement:
            case php7parser_1.PhraseType.ConstElement:
            case php7parser_1.PhraseType.ParameterDeclaration:
            case php7parser_1.PhraseType.FunctionDeclarationHeader:
            case php7parser_1.PhraseType.MethodDeclarationHeader:
            case php7parser_1.PhraseType.ClassConstElement:
                return true;
            default:
                return false;
        }
    }
}
exports.ParseTreeTraverser = ParseTreeTraverser;
