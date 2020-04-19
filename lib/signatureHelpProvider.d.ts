import * as lsp from 'vscode-languageserver-types';
import { SymbolStore } from './symbolStore';
import { ParsedDocumentStore } from './parsedDocument';
import { ReferenceStore } from './reference';
export declare class SignatureHelpProvider {
    symbolStore: SymbolStore;
    docStore: ParsedDocumentStore;
    refStore: ReferenceStore;
    constructor(symbolStore: SymbolStore, docStore: ParsedDocumentStore, refStore: ReferenceStore);
    provideSignatureHelp(uri: string, position: lsp.Position): lsp.SignatureHelp;
    private _createSignatureHelp;
    private _signatureInfo;
    private _parameterInfoArray;
    private _parameterInfo;
    private _getSymbol;
    private _isCallablePhrase;
    private _isNamePhrase;
    private _isArgExprList;
    private _isMemberName;
    private _isScopedMemberName;
    private _isNameToken;
    private _isIdentifier;
    private _isClassTypeDesignator;
    private _isNamePhraseOrRelativeScope;
}
