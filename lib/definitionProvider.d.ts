import { Position } from 'vscode-languageserver-types';
import { SymbolStore } from './symbolStore';
import { ParsedDocumentStore } from './parsedDocument';
import { ReferenceStore } from './reference';
export declare class DefinitionProvider {
    symbolStore: SymbolStore;
    documentStore: ParsedDocumentStore;
    refStore: ReferenceStore;
    constructor(symbolStore: SymbolStore, documentStore: ParsedDocumentStore, refStore: ReferenceStore);
    provideDefinition(uri: string, position: Position): import("../node_modules/vscode-languageserver-types/lib/umd/main").Definition;
}
