'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const symbol_1 = require("./symbol");
const typeAggregate_1 = require("./typeAggregate");
const util = require("./util");
class ReferenceProvider {
    constructor(documentStore, symbolStore, refStore) {
        this.documentStore = documentStore;
        this.symbolStore = symbolStore;
        this.refStore = refStore;
        this._provideReferences = (symbol, table) => {
            switch (symbol.kind) {
                case symbol_1.SymbolKind.Parameter:
                case symbol_1.SymbolKind.Variable:
                    return Promise.resolve(this._variableReferences(symbol, table, this.symbolStore.getSymbolTable(table.uri)));
                case symbol_1.SymbolKind.Class:
                case symbol_1.SymbolKind.Interface:
                case symbol_1.SymbolKind.Trait:
                case symbol_1.SymbolKind.Function:
                case symbol_1.SymbolKind.Constant:
                    return this.refStore.find(symbol.name);
                case symbol_1.SymbolKind.Property:
                    return this._propertyReferences(symbol, table);
                case symbol_1.SymbolKind.ClassConstant:
                    return this._classConstantReferences(symbol, table);
                case symbol_1.SymbolKind.Method:
                    return this._methodReferences(symbol, table);
                default:
                    return Promise.resolve([]);
            }
        };
    }
    provideReferenceLocations(uri, position, referenceContext) {
        let locations = [];
        let doc = this.documentStore.find(uri);
        let table = this.refStore.getReferenceTable(uri);
        if (!doc || !table) {
            return Promise.resolve(locations);
        }
        let symbols;
        let ref = table.referenceAtPosition(position);
        if (ref) {
            if (ref.kind === symbol_1.SymbolKind.Constructor) {
                ref = { kind: symbol_1.SymbolKind.Class, name: ref.name, location: ref.location };
            }
            symbols = this.symbolStore.findSymbolsByReference(ref, typeAggregate_1.MemberMergeStrategy.Base);
        }
        else {
            return Promise.resolve(locations);
        }
        return this.provideReferences(symbols, table, referenceContext.includeDeclaration).then((refs) => {
            return refs.map((v) => {
                return v.location;
            });
        });
    }
    provideReferences(symbols, table, includeDeclaration) {
        let refs = [];
        symbols = symbols.slice();
        let provideRefsFn = this._provideReferences;
        return new Promise((resolve, reject) => {
            let onResolve = (r) => {
                Array.prototype.push.apply(refs, r);
                let s = symbols.pop();
                if (s) {
                    provideRefsFn(s, table).then(onResolve);
                }
                else {
                    resolve(Array.from(new Set(refs)));
                }
            };
            onResolve([]);
        });
    }
    _methodReferences(symbol, table) {
        if ((symbol.modifiers & symbol_1.SymbolModifier.Private) > 0) {
            let lcScope = symbol.scope ? symbol.scope.toLowerCase() : '';
            let name = symbol.name.toLowerCase();
            let fn = (x) => {
                return x.kind === symbol_1.SymbolKind.Method && x.name.toLowerCase() === name && x.scope && x.scope.toLowerCase() === lcScope;
            };
            return Promise.resolve(this._symbolRefsInTableScope(symbol, table, fn));
        }
        else {
            return this.refStore.find(symbol.name, this._createMemberReferenceFilterFn(symbol));
        }
    }
    _classConstantReferences(symbol, table) {
        if ((symbol.modifiers & symbol_1.SymbolModifier.Private) > 0) {
            let lcScope = symbol.scope ? symbol.scope.toLowerCase() : '';
            let fn = (x) => {
                return x.kind === symbol_1.SymbolKind.ClassConstant && x.name === symbol.name && x.scope && x.scope.toLowerCase() === lcScope;
            };
            return Promise.resolve(this._symbolRefsInTableScope(symbol, table, fn));
        }
        else {
            return this.refStore.find(symbol.name, this._createMemberReferenceFilterFn(symbol));
        }
    }
    _propertyReferences(symbol, table) {
        let name = symbol.name;
        if ((symbol.modifiers & symbol_1.SymbolModifier.Private) > 0) {
            let lcScope = symbol.scope ? symbol.scope.toLowerCase() : '';
            let fn = (x) => {
                return x.kind === symbol_1.SymbolKind.Property && x.name === name && x.scope && lcScope === x.scope.toLowerCase();
            };
            return Promise.resolve(this._symbolRefsInTableScope(symbol, table, fn));
        }
        else {
            return this.refStore.find(name, this._createMemberReferenceFilterFn(symbol));
        }
    }
    _createMemberReferenceFilterFn(baseMember) {
        let store = this.symbolStore;
        let lcBaseTypeName = baseMember.scope ? baseMember.scope.toLowerCase() : '';
        let map = {};
        map[lcBaseTypeName] = true;
        let associatedFilterFn = (x) => {
            return lcBaseTypeName === x.name.toLowerCase();
        };
        return (r) => {
            if (!(r.kind & (symbol_1.SymbolKind.Property | symbol_1.SymbolKind.Method | symbol_1.SymbolKind.ClassConstant)) || !r.scope) {
                return false;
            }
            let lcScope = r.scope.toLowerCase();
            if (map[lcScope] !== undefined) {
                return map[lcScope];
            }
            let aggregateType = typeAggregate_1.TypeAggregate.create(store, r.scope);
            if (!aggregateType) {
                return map[lcScope] = false;
            }
            return map[lcScope] = aggregateType.associated(associatedFilterFn).length > 0;
        };
    }
    _variableReferences(symbol, refTable, symbolTable) {
        let symbolTreeTraverser = symbolTable.createTraverser();
        symbolTreeTraverser.find((x) => {
            return x === symbol;
        });
        let outerScope = symbolTreeTraverser.parent();
        let useVarFn = (s) => {
            return s.kind === symbol_1.SymbolKind.Variable &&
                (s.modifiers & symbol_1.SymbolModifier.Use) > 0 &&
                s.name === symbol.name;
        };
        let isScopeSymbol = (x) => {
            return x.kind === symbol_1.SymbolKind.Function && (x.modifiers & symbol_1.SymbolModifier.Anonymous) > 0 && util.find(x.children, useVarFn) !== undefined;
        };
        while (outerScope && isScopeSymbol(outerScope)) {
            outerScope = symbolTreeTraverser.parent();
        }
        if (!outerScope) {
            return [];
        }
        let scopePositions = [];
        let varScopeVisitor = {
            preorder: (node, spine) => {
                if (node === outerScope || isScopeSymbol(node)) {
                    if (node.location) {
                        scopePositions.push(node.location.range.start);
                    }
                    return true;
                }
                return false;
            }
        };
        symbolTreeTraverser.traverse(varScopeVisitor);
        if (!scopePositions.length) {
            return [];
        }
        let refTreeTraverser = refTable.createTraverser();
        let refs = [];
        let refFn = (r) => {
            return (r.kind === symbol_1.SymbolKind.Variable || r.kind === symbol_1.SymbolKind.Parameter) && r.name === symbol.name;
        };
        let isScope = (x) => {
            return x.kind === undefined && x.location && scopePositions.length && util.positionEquality(x.location.range.start, scopePositions[0]);
        };
        if (!refTreeTraverser.find(isScope)) {
            return [];
        }
        let refVisitor = {
            preorder: (node, spine) => {
                if (isScope(node)) {
                    scopePositions.shift();
                    return true;
                }
                else if (refFn(node)) {
                    refs.push(node);
                }
                return false;
            }
        };
        refTreeTraverser.traverse(refVisitor);
        return refs;
    }
    _symbolRefsInTableScope(symbol, refTable, filterFn) {
        let traverser = refTable.createTraverser();
        let pos = symbol.location ? symbol.location.range.start : undefined;
        if (!pos) {
            return [];
        }
        let findFn = (x) => {
            return x.kind === undefined &&
                x.location && x.location.range && util.positionEquality(x.location.range.start, pos);
        };
        if (traverser.find(findFn) && traverser.parent()) {
            return traverser.filter(filterFn);
        }
        return [];
    }
}
exports.ReferenceProvider = ReferenceProvider;
