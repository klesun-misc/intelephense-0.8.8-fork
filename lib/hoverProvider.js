'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const symbol_1 = require("./symbol");
const typeAggregate_1 = require("./typeAggregate");
class HoverProvider {
    constructor(docStore, symbolStore, refStore) {
        this.docStore = docStore;
        this.symbolStore = symbolStore;
        this.refStore = refStore;
    }
    provideHover(uri, pos) {
        let doc = this.docStore.find(uri);
        let table = this.refStore.getReferenceTable(uri);
        if (!doc || !table) {
            return undefined;
        }
        let ref = table.referenceAtPosition(pos);
        if (!ref) {
            return undefined;
        }
        let symbol = this.symbolStore.findSymbolsByReference(ref, typeAggregate_1.MemberMergeStrategy.Override).shift();
        if (!symbol) {
            return undefined;
        }
        switch (symbol.kind) {
            case symbol_1.SymbolKind.Function:
            case symbol_1.SymbolKind.Method:
                return {
                    contents: [this.modifiersToString(symbol.modifiers), symbol.name + symbol_1.PhpSymbol.signatureString(symbol)].join(' ').trim(),
                    range: ref.location.range
                };
            case symbol_1.SymbolKind.Parameter:
                return {
                    contents: [symbol_1.PhpSymbol.type(symbol) || 'mixed', symbol.name].join(' ').trim(),
                    range: ref.location.range
                };
            case symbol_1.SymbolKind.Property:
                return {
                    contents: [this.modifiersToString(symbol.modifiers), symbol_1.PhpSymbol.type(symbol) || 'mixed', symbol.name].join(' ').trim(),
                    range: ref.location.range
                };
            case symbol_1.SymbolKind.Variable:
                return {
                    contents: [ref.type, symbol.name].join(' ').trim(),
                    range: ref.location.range
                };
            case symbol_1.SymbolKind.Constant:
            case symbol_1.SymbolKind.ClassConstant:
                return {
                    contents: [this.modifiersToString(symbol.modifiers), 'const', symbol.name, symbol.value ? `= ${symbol.value}` : ''].join(' ').trim(),
                    range: ref.location.range
                };
            default:
                return undefined;
        }
    }
    modifiersToString(modifiers) {
        let modStrings = [];
        if (modifiers & symbol_1.SymbolModifier.Public) {
            modStrings.push('public');
        }
        if (modifiers & symbol_1.SymbolModifier.Protected) {
            modStrings.push('protected');
        }
        if (modifiers & symbol_1.SymbolModifier.Private) {
            modStrings.push('private');
        }
        if (modifiers & symbol_1.SymbolModifier.Final) {
            modStrings.push('final');
        }
        if (modifiers & symbol_1.SymbolModifier.Abstract) {
            modStrings.push('abstract');
        }
        return modStrings.join(' ');
    }
}
exports.HoverProvider = HoverProvider;
