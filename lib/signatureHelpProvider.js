'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const symbol_1 = require("./symbol");
const parseTreeTraverser_1 = require("./parseTreeTraverser");
const parsedDocument_1 = require("./parsedDocument");
const php7parser_1 = require("php7parser");
const typeAggregate_1 = require("./typeAggregate");
class SignatureHelpProvider {
    constructor(symbolStore, docStore, refStore) {
        this.symbolStore = symbolStore;
        this.docStore = docStore;
        this.refStore = refStore;
    }
    provideSignatureHelp(uri, position) {
        const doc = this.docStore.find(uri);
        const table = this.symbolStore.getSymbolTable(uri);
        const refTable = this.refStore.getReferenceTable(uri);
        if (!doc || !table || !refTable) {
            return undefined;
        }
        const traverser = new parseTreeTraverser_1.ParseTreeTraverser(doc, table, refTable);
        const token = traverser.position(position);
        const prevToken = (parsedDocument_1.ParsedDocument.isToken(token, [php7parser_1.TokenType.CloseParenthesis]) ? token : traverser.clone().prevToken(true));
        const argExpList = traverser.ancestor(this._isArgExprList);
        const callableExpr = traverser.ancestor(this._isCallablePhrase);
        if (!token ||
            !prevToken ||
            (!argExpList && token.tokenType === php7parser_1.TokenType.CloseParenthesis) ||
            (!argExpList && token.tokenType !== php7parser_1.TokenType.OpenParenthesis && prevToken.tokenType !== php7parser_1.TokenType.OpenParenthesis) ||
            !callableExpr) {
            return undefined;
        }
        let symbol = this._getSymbol(traverser.clone());
        let delimFilterFn = (x) => {
            return x.tokenType === php7parser_1.TokenType.Comma && x.offset <= token.offset;
        };
        let argNumber = parsedDocument_1.ParsedDocument.filterChildren(argExpList, delimFilterFn).length;
        return symbol ? this._createSignatureHelp(symbol, argNumber) : undefined;
    }
    _createSignatureHelp(fn, argNumber) {
        if (!fn.children) {
            return null;
        }
        let params = fn.children.filter((x) => {
            return x.kind === symbol_1.SymbolKind.Parameter;
        });
        if (!params.length || argNumber > params.length - 1) {
            return null;
        }
        let nOptionalParams = params.reduce((carry, value) => {
            return value.value ? carry + 1 : carry;
        }, 0);
        let nRequiredParams = params.length - nOptionalParams;
        let signatures = [];
        if (nRequiredParams > 0) {
            signatures.push(this._signatureInfo(fn, params.slice(0, nRequiredParams)));
        }
        for (let n = 1; n <= nOptionalParams; ++n) {
            signatures.push(this._signatureInfo(fn, params.slice(0, nRequiredParams + n)));
        }
        let activeSig = signatures.findIndex((v) => {
            return v.parameters.length > argNumber;
        });
        return {
            activeParameter: argNumber,
            activeSignature: activeSig,
            signatures: signatures
        };
    }
    _signatureInfo(fn, params) {
        let paramInfoArray = this._parameterInfoArray(params);
        let label = fn.name + '(';
        label += paramInfoArray.map((v) => {
            return v.label;
        }).join(', ');
        label += ')';
        let returnType = symbol_1.PhpSymbol.type(fn);
        if (returnType) {
            label += ': ' + returnType;
        }
        let info = {
            label: label,
            parameters: paramInfoArray
        };
        if (fn.doc && fn.doc.description) {
            info.documentation = fn.doc.description;
        }
        return info;
    }
    _parameterInfoArray(params) {
        let infos = [];
        for (let n = 0, l = params.length; n < l; ++n) {
            infos.push(this._parameterInfo(params[n]));
        }
        return infos;
    }
    _parameterInfo(s) {
        let labelParts = [];
        let paramType = symbol_1.PhpSymbol.type(s);
        if (paramType) {
            labelParts.push(paramType);
        }
        labelParts.push(s.name);
        if (s.value) {
            labelParts.push('= ' + s.value);
        }
        let info = {
            label: labelParts.join(' '),
        };
        if (s.doc && s.doc.description) {
            info.documentation = s.doc.description;
        }
        return info;
    }
    _getSymbol(traverser) {
        let expr = traverser.node;
        switch (expr.phraseType) {
            case php7parser_1.PhraseType.FunctionCallExpression:
                if (traverser.child(this._isNamePhrase)) {
                    return this.symbolStore.findSymbolsByReference(traverser.reference).shift();
                }
                return undefined;
            case php7parser_1.PhraseType.MethodCallExpression:
                if (traverser.child(this._isMemberName) && traverser.child(this._isNameToken)) {
                    return this.symbolStore.findSymbolsByReference(traverser.reference, typeAggregate_1.MemberMergeStrategy.Documented).shift();
                }
                return undefined;
            case php7parser_1.PhraseType.ScopedCallExpression:
                if (traverser.child(this._isScopedMemberName) && traverser.child(this._isIdentifier)) {
                    return this.symbolStore.findSymbolsByReference(traverser.reference, typeAggregate_1.MemberMergeStrategy.Documented).shift();
                }
                return undefined;
            case php7parser_1.PhraseType.ObjectCreationExpression:
                if (traverser.child(this._isClassTypeDesignator) && traverser.child(this._isNamePhraseOrRelativeScope)) {
                    return this.symbolStore.findSymbolsByReference(traverser.reference, typeAggregate_1.MemberMergeStrategy.Override).shift();
                }
                return undefined;
            default:
                throw new Error('Invalid Argument');
        }
    }
    _isCallablePhrase(node) {
        switch (node.phraseType) {
            case php7parser_1.PhraseType.FunctionCallExpression:
            case php7parser_1.PhraseType.MethodCallExpression:
            case php7parser_1.PhraseType.ScopedCallExpression:
            case php7parser_1.PhraseType.ObjectCreationExpression:
                return true;
            default:
                return false;
        }
    }
    _isNamePhrase(node) {
        switch (node.phraseType) {
            case php7parser_1.PhraseType.FullyQualifiedName:
            case php7parser_1.PhraseType.RelativeQualifiedName:
            case php7parser_1.PhraseType.QualifiedName:
                return true;
            default:
                return false;
        }
    }
    _isArgExprList(node) {
        return node.phraseType === php7parser_1.PhraseType.ArgumentExpressionList;
    }
    _isMemberName(node) {
        return node.phraseType === php7parser_1.PhraseType.MemberName;
    }
    _isScopedMemberName(node) {
        return node.phraseType === php7parser_1.PhraseType.ScopedMemberName;
    }
    _isNameToken(node) {
        return node.tokenType === php7parser_1.TokenType.Name;
    }
    _isIdentifier(node) {
        return node.phraseType === php7parser_1.PhraseType.Identifier;
    }
    _isClassTypeDesignator(node) {
        return node.phraseType === php7parser_1.PhraseType.ClassTypeDesignator;
    }
    _isNamePhraseOrRelativeScope(node) {
        switch (node.phraseType) {
            case php7parser_1.PhraseType.FullyQualifiedName:
            case php7parser_1.PhraseType.RelativeQualifiedName:
            case php7parser_1.PhraseType.QualifiedName:
            case php7parser_1.PhraseType.RelativeScope:
                return true;
            default:
                return false;
        }
    }
}
exports.SignatureHelpProvider = SignatureHelpProvider;
