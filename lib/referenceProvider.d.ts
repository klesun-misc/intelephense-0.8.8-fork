import { Position, ReferenceContext, Location } from 'vscode-languageserver-types';
import { ParsedDocumentStore } from './parsedDocument';
import { SymbolStore } from './symbolStore';
import { PhpSymbol } from './symbol';
import { Reference, ReferenceStore, ReferenceTable } from './reference';
export declare class ReferenceProvider {
    documentStore: ParsedDocumentStore;
    symbolStore: SymbolStore;
    refStore: ReferenceStore;
    constructor(documentStore: ParsedDocumentStore, symbolStore: SymbolStore, refStore: ReferenceStore);
    provideReferenceLocations(uri: string, position: Position, referenceContext: ReferenceContext): Promise<Location[]>;
    provideReferences(symbols: PhpSymbol[], table: ReferenceTable, includeDeclaration: boolean): Promise<Reference[]>;
    private _provideReferences;
    private _methodReferences;
    private _classConstantReferences;
    private _propertyReferences;
    private _createMemberReferenceFilterFn;
    private _variableReferences;
    private _symbolRefsInTableScope;
}
