'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const symbol_1 = require("./symbol");
const typeAggregate_1 = require("./typeAggregate");
const reference_1 = require("./reference");
class DefinitionProvider {
    constructor(symbolStore, documentStore, refStore) {
        this.symbolStore = symbolStore;
        this.documentStore = documentStore;
        this.refStore = refStore;
    }
    provideDefinition(uri, position) {
        let doc = this.documentStore.find(uri);
        let table = this.refStore.getReferenceTable(uri);
        if (!doc || !table) {
            return null;
        }
        let ref = table.referenceAtPosition(position);
        if (!ref) {
            return null;
        }
        let symbols = this.symbolStore.findSymbolsByReference(ref, typeAggregate_1.MemberMergeStrategy.Override);
        if (ref.kind === symbol_1.SymbolKind.Constructor && symbols.length < 1) {
            symbols = this.symbolStore.findSymbolsByReference(reference_1.Reference.create(symbol_1.SymbolKind.Class, ref.name, ref.location), typeAggregate_1.MemberMergeStrategy.Override);
        }
        let locations = [];
        let s;
        let loc;
        for (let n = 0; n < symbols.length; ++n) {
            s = symbols[n];
            if (s.location && (loc = this.symbolStore.symbolLocation(s))) {
                locations.push(loc);
            }
        }
        return locations.length === 1 ? locations[0] : locations;
    }
}
exports.DefinitionProvider = DefinitionProvider;
