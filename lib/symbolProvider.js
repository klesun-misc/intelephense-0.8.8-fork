'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_languageserver_types_1 = require("vscode-languageserver-types");
const symbol_1 = require("./symbol");
const namespacedSymbolMask = symbol_1.SymbolKind.Interface |
    symbol_1.SymbolKind.Class |
    symbol_1.SymbolKind.Trait |
    symbol_1.SymbolKind.Constant |
    symbol_1.SymbolKind.Function;
class SymbolProvider {
    constructor(symbolStore) {
        this.symbolStore = symbolStore;
    }
    provideDocumentSymbols(uri) {
        let symbolTable = this.symbolStore.getSymbolTable(uri);
        let symbols = symbolTable ? symbolTable.symbols : [];
        let symbolInformationList = [];
        let s;
        for (let n = 0, l = symbols.length; n < l; ++n) {
            s = symbols[n];
            if (s.location) {
                symbolInformationList.push(this.toSymbolInformation(s));
            }
        }
        return symbolInformationList;
    }
    provideWorkspaceSymbols(query) {
        let maxItems = 100;
        const matches = this.symbolStore.matchIterator(query, this.workspaceSymbolFilter);
        const symbolInformationList = [];
        for (let s of matches) {
            symbolInformationList.push(this.toSymbolInformation(s));
            if (--maxItems < 1) {
                break;
            }
        }
        return symbolInformationList;
    }
    workspaceSymbolFilter(s) {
        return !(s.modifiers & (symbol_1.SymbolModifier.Anonymous | symbol_1.SymbolModifier.Use | symbol_1.SymbolModifier.Private)) &&
            s.location &&
            s.kind !== symbol_1.SymbolKind.Parameter &&
            (s.kind !== symbol_1.SymbolKind.Variable || !s.scope);
    }
    toSymbolInformation(s, uri) {
        let si = {
            kind: vscode_languageserver_types_1.SymbolKind.File,
            name: s.name,
            location: uri ? vscode_languageserver_types_1.Location.create(uri, s.location.range) : this.symbolStore.symbolLocation(s),
            containerName: s.scope
        };
        if ((s.kind & namespacedSymbolMask) > 0) {
            let nsSeparatorPos = s.name.lastIndexOf('\\');
            if (nsSeparatorPos >= 0) {
                si.name = s.name.slice(nsSeparatorPos + 1);
                si.containerName = s.name.slice(0, nsSeparatorPos);
            }
        }
        switch (s.kind) {
            case symbol_1.SymbolKind.Class:
                si.kind = vscode_languageserver_types_1.SymbolKind.Class;
                break;
            case symbol_1.SymbolKind.Constant:
            case symbol_1.SymbolKind.ClassConstant:
                si.kind = vscode_languageserver_types_1.SymbolKind.Constant;
                break;
            case symbol_1.SymbolKind.Function:
                si.kind = vscode_languageserver_types_1.SymbolKind.Function;
                break;
            case symbol_1.SymbolKind.Interface:
                si.kind = vscode_languageserver_types_1.SymbolKind.Interface;
                break;
            case symbol_1.SymbolKind.Method:
                if (s.name === '__construct') {
                    si.kind = vscode_languageserver_types_1.SymbolKind.Constructor;
                }
                else {
                    si.kind = vscode_languageserver_types_1.SymbolKind.Method;
                }
                break;
            case symbol_1.SymbolKind.Namespace:
                si.kind = vscode_languageserver_types_1.SymbolKind.Namespace;
                break;
            case symbol_1.SymbolKind.Property:
                si.kind = vscode_languageserver_types_1.SymbolKind.Property;
                break;
            case symbol_1.SymbolKind.Trait:
                si.kind = vscode_languageserver_types_1.SymbolKind.Module;
                break;
            case symbol_1.SymbolKind.Variable:
            case symbol_1.SymbolKind.Parameter:
                si.kind = vscode_languageserver_types_1.SymbolKind.Variable;
                break;
            default:
                throw new Error(`Invalid argument ${s.kind}`);
        }
        return si;
    }
}
exports.SymbolProvider = SymbolProvider;
