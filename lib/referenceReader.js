'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const php7parser_1 = require("php7parser");
const symbol_1 = require("./symbol");
const nameResolver_1 = require("./nameResolver");
const lsp = require("vscode-languageserver-types");
const typeString_1 = require("./typeString");
const typeAggregate_1 = require("./typeAggregate");
const util = require("./util");
const phpDoc_1 = require("./phpDoc");
const reference_1 = require("./reference");
function symbolsToTypeReduceFn(prev, current, index, array) {
    return typeString_1.TypeString.merge(prev, symbol_1.PhpSymbol.type(current));
}
class ReferenceReader {
    constructor(doc, nameResolver, symbolStore) {
        this.doc = doc;
        this.nameResolver = nameResolver;
        this.symbolStore = symbolStore;
        this._symbolFilter = (x) => {
            const mask = symbol_1.SymbolKind.Namespace | symbol_1.SymbolKind.Class | symbol_1.SymbolKind.Interface | symbol_1.SymbolKind.Trait | symbol_1.SymbolKind.Method | symbol_1.SymbolKind.Function | symbol_1.SymbolKind.File;
            return (x.kind & mask) > 0 && !(x.modifiers & symbol_1.SymbolModifier.Magic);
        };
        this._referenceSymbols = (ref) => {
            return this.symbolStore.findSymbolsByReference(ref, typeAggregate_1.MemberMergeStrategy.Documented);
        };
        this._transformStack = [];
        this._variableTable = new VariableTable();
        this._classStack = [];
        this._symbolTable = this.symbolStore.getSymbolTable(this.doc.uri);
        this._symbols = this._symbolTable.filter(this._symbolFilter);
        this._scopeStack = [reference_1.Scope.create(lsp.Location.create(this.doc.uri, util.cloneRange(this._symbols.shift().location.range)))];
    }
    get refTable() {
        return new reference_1.ReferenceTable(this.doc.uri, this._scopeStack[0]);
    }
    preorder(node, spine) {
        let parent = spine.length ? spine[spine.length - 1] : null;
        let parentTransform = this._transformStack.length ? this._transformStack[this._transformStack.length - 1] : null;
        switch (node.phraseType) {
            case php7parser_1.PhraseType.Error:
                this._transformStack.push(null);
                return false;
            case php7parser_1.PhraseType.NamespaceDefinition:
                {
                    let s = this._symbols.shift();
                    this._scopeStackPush(reference_1.Scope.create(this.doc.nodeLocation(node)));
                    this.nameResolver.namespace = s;
                    this._transformStack.push(new NamespaceDefinitionTransform());
                }
                break;
            case php7parser_1.PhraseType.ClassDeclarationHeader:
                this._transformStack.push(new HeaderTransform(this.nameResolver, symbol_1.SymbolKind.Class));
                break;
            case php7parser_1.PhraseType.InterfaceDeclarationHeader:
                this._transformStack.push(new HeaderTransform(this.nameResolver, symbol_1.SymbolKind.Interface));
                break;
            case php7parser_1.PhraseType.TraitDeclarationHeader:
                this._transformStack.push(new HeaderTransform(this.nameResolver, symbol_1.SymbolKind.Trait));
                break;
            case php7parser_1.PhraseType.FunctionDeclarationHeader:
                this._transformStack.push(new HeaderTransform(this.nameResolver, symbol_1.SymbolKind.Function));
                break;
            case php7parser_1.PhraseType.FunctionCallExpression:
                if (parentTransform) {
                    this._transformStack.push(new FunctionCallExpressionTransform(this._referenceSymbols));
                }
                else {
                    this._transformStack.push(null);
                }
                break;
            case php7parser_1.PhraseType.ConstElement:
                this._transformStack.push(new HeaderTransform(this.nameResolver, symbol_1.SymbolKind.Constant));
                break;
            case php7parser_1.PhraseType.ClassConstElement:
                this._transformStack.push(new MemberDeclarationTransform(symbol_1.SymbolKind.ClassConstant, this._currentClassName()));
                break;
            case php7parser_1.PhraseType.MethodDeclarationHeader:
                this._transformStack.push(new MemberDeclarationTransform(symbol_1.SymbolKind.Method, this._currentClassName()));
                break;
            case php7parser_1.PhraseType.PropertyElement:
                this._transformStack.push(new PropertyElementTransform(this._currentClassName()));
                break;
            case php7parser_1.PhraseType.ParameterDeclaration:
                this._transformStack.push(new ParameterDeclarationTransform());
                break;
            case php7parser_1.PhraseType.NamespaceUseDeclaration:
                this._transformStack.push(new NamespaceUseDeclarationTransform());
                break;
            case php7parser_1.PhraseType.NamespaceUseGroupClauseList:
            case php7parser_1.PhraseType.NamespaceUseClauseList:
                this._transformStack.push(new NamespaceUseClauseListTransform(node.phraseType));
                break;
            case php7parser_1.PhraseType.NamespaceUseClause:
            case php7parser_1.PhraseType.NamespaceUseGroupClause:
                {
                    if (this._symbols.length && (this._symbols[0].modifiers & symbol_1.SymbolModifier.Use) > 0) {
                        this.nameResolver.rules.push(this._symbols.shift());
                    }
                    this._transformStack.push(new NamespaceUseClauseTransform(node.phraseType));
                    break;
                }
            case php7parser_1.PhraseType.FunctionDeclaration:
                this._transformStack.push(null);
                this._functionDeclaration(node);
                break;
            case php7parser_1.PhraseType.MethodDeclaration:
                this._transformStack.push(null);
                this._methodDeclaration(node);
                break;
            case php7parser_1.PhraseType.ClassDeclaration:
            case php7parser_1.PhraseType.TraitDeclaration:
            case php7parser_1.PhraseType.InterfaceDeclaration:
            case php7parser_1.PhraseType.AnonymousClassDeclaration:
                {
                    let s = this._symbols.shift() || symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Class, '', this.doc.nodeHashedLocation(node));
                    this._scopeStackPush(reference_1.Scope.create(this.doc.nodeLocation(node)));
                    this.nameResolver.pushClass(s);
                    this._classStack.push(typeAggregate_1.TypeAggregate.create(this.symbolStore, s.name));
                    this._variableTable.pushScope();
                    this._variableTable.setVariable(Variable.create('$this', s.name));
                    this._transformStack.push(null);
                }
                break;
            case php7parser_1.PhraseType.AnonymousFunctionCreationExpression:
                this._anonymousFunctionCreationExpression(node);
                this._transformStack.push(null);
                break;
            case php7parser_1.PhraseType.IfStatement:
            case php7parser_1.PhraseType.SwitchStatement:
                this._transformStack.push(null);
                this._variableTable.pushBranch();
                break;
            case php7parser_1.PhraseType.CaseStatement:
            case php7parser_1.PhraseType.DefaultStatement:
            case php7parser_1.PhraseType.ElseIfClause:
            case php7parser_1.PhraseType.ElseClause:
                this._transformStack.push(null);
                this._variableTable.popBranch();
                this._variableTable.pushBranch();
                break;
            case php7parser_1.PhraseType.SimpleAssignmentExpression:
            case php7parser_1.PhraseType.ByRefAssignmentExpression:
                this._transformStack.push(new SimpleAssignmentExpressionTransform(node.phraseType, this._lastVarTypehints));
                break;
            case php7parser_1.PhraseType.InstanceOfExpression:
                this._transformStack.push(new InstanceOfExpressionTransform());
                break;
            case php7parser_1.PhraseType.ForeachStatement:
                this._transformStack.push(new ForeachStatementTransform());
                break;
            case php7parser_1.PhraseType.ForeachCollection:
                this._transformStack.push(new ForeachCollectionTransform());
                break;
            case php7parser_1.PhraseType.ForeachValue:
                this._transformStack.push(new ForeachValueTransform());
                break;
            case php7parser_1.PhraseType.CatchClause:
                this._transformStack.push(new CatchClauseTransform());
                break;
            case php7parser_1.PhraseType.CatchNameList:
                this._transformStack.push(new CatchNameListTransform());
                break;
            case php7parser_1.PhraseType.QualifiedName:
                this._transformStack.push(new QualifiedNameTransform(this._nameSymbolType(parent), this.doc.nodeLocation(node), this.nameResolver));
                break;
            case php7parser_1.PhraseType.FullyQualifiedName:
                this._transformStack.push(new FullyQualifiedNameTransform(this._nameSymbolType(parent), this.doc.nodeLocation(node)));
                break;
            case php7parser_1.PhraseType.RelativeQualifiedName:
                this._transformStack.push(new RelativeQualifiedNameTransform(this._nameSymbolType(parent), this.doc.nodeLocation(node), this.nameResolver));
                break;
            case php7parser_1.PhraseType.NamespaceName:
                this._transformStack.push(new NamespaceNameTransform(node, this.doc));
                break;
            case php7parser_1.PhraseType.SimpleVariable:
                this._transformStack.push(new SimpleVariableTransform(this.doc.nodeLocation(node), this._variableTable));
                break;
            case php7parser_1.PhraseType.ListIntrinsic:
                this._transformStack.push(new ListIntrinsicTransform());
                break;
            case php7parser_1.PhraseType.ArrayInitialiserList:
                if (parentTransform) {
                    this._transformStack.push(new ArrayInititialiserListTransform());
                }
                else {
                    this._transformStack.push(null);
                }
                break;
            case php7parser_1.PhraseType.ArrayElement:
                if (parentTransform) {
                    this._transformStack.push(new ArrayElementTransform());
                }
                else {
                    this._transformStack.push(null);
                }
                break;
            case php7parser_1.PhraseType.ArrayValue:
                if (parentTransform) {
                    this._transformStack.push(new ArrayValueTransform());
                }
                else {
                    this._transformStack.push(null);
                }
                break;
            case php7parser_1.PhraseType.SubscriptExpression:
                if (parentTransform) {
                    this._transformStack.push(new SubscriptExpressionTransform());
                }
                else {
                    this._transformStack.push(null);
                }
                break;
            case php7parser_1.PhraseType.ScopedCallExpression:
                this._transformStack.push(new MemberAccessExpressionTransform(php7parser_1.PhraseType.ScopedCallExpression, symbol_1.SymbolKind.Method, this._referenceSymbols));
                break;
            case php7parser_1.PhraseType.ScopedPropertyAccessExpression:
                this._transformStack.push(new MemberAccessExpressionTransform(php7parser_1.PhraseType.ScopedPropertyAccessExpression, symbol_1.SymbolKind.Property, this._referenceSymbols));
                break;
            case php7parser_1.PhraseType.ClassConstantAccessExpression:
                this._transformStack.push(new MemberAccessExpressionTransform(php7parser_1.PhraseType.ClassConstantAccessExpression, symbol_1.SymbolKind.ClassConstant, this._referenceSymbols));
                break;
            case php7parser_1.PhraseType.ScopedMemberName:
                this._transformStack.push(new ScopedMemberNameTransform(this.doc.nodeLocation(node)));
                break;
            case php7parser_1.PhraseType.Identifier:
                if (parentTransform) {
                    this._transformStack.push(new IdentifierTransform());
                }
                else {
                    this._transformStack.push(null);
                }
                break;
            case php7parser_1.PhraseType.PropertyAccessExpression:
                this._transformStack.push(new MemberAccessExpressionTransform(php7parser_1.PhraseType.PropertyAccessExpression, symbol_1.SymbolKind.Property, this._referenceSymbols));
                break;
            case php7parser_1.PhraseType.MethodCallExpression:
                this._transformStack.push(new MemberAccessExpressionTransform(php7parser_1.PhraseType.MethodCallExpression, symbol_1.SymbolKind.Method, this._referenceSymbols));
                break;
            case php7parser_1.PhraseType.MemberName:
                this._transformStack.push(new MemberNameTransform(this.doc.nodeLocation(node)));
                break;
            case php7parser_1.PhraseType.AnonymousFunctionUseVariable:
                this._transformStack.push(new AnonymousFunctionUseVariableTransform());
                break;
            case php7parser_1.PhraseType.ObjectCreationExpression:
                if (parentTransform) {
                    this._transformStack.push(new ObjectCreationExpressionTransform());
                }
                else {
                    this._transformStack.push(null);
                }
                break;
            case php7parser_1.PhraseType.ClassTypeDesignator:
            case php7parser_1.PhraseType.InstanceofTypeDesignator:
                if (parentTransform) {
                    this._transformStack.push(new TypeDesignatorTransform(node.phraseType));
                }
                else {
                    this._transformStack.push(null);
                }
                break;
            case php7parser_1.PhraseType.RelativeScope:
                let context = this._classStack.length ? this._classStack[this._classStack.length - 1] : null;
                let name = context ? context.name : '';
                this._transformStack.push(new RelativeScopeTransform(name, this.doc.nodeLocation(node)));
                break;
            case php7parser_1.PhraseType.TernaryExpression:
                if (parentTransform) {
                    this._transformStack.push(new TernaryExpressionTransform());
                }
                else {
                    this._transformStack.push(null);
                }
                break;
            case php7parser_1.PhraseType.CoalesceExpression:
                if (parentTransform) {
                    this._transformStack.push(new CoalesceExpressionTransform());
                }
                else {
                    this._transformStack.push(null);
                }
                break;
            case php7parser_1.PhraseType.EncapsulatedExpression:
                if (parentTransform) {
                    this._transformStack.push(new EncapsulatedExpressionTransform());
                }
                else {
                    this._transformStack.push(null);
                }
                break;
            case undefined:
                if (parentTransform && node.tokenType > php7parser_1.TokenType.EndOfFile && node.tokenType < php7parser_1.TokenType.Equals) {
                    parentTransform.push(new TokenTransform(node, this.doc));
                    if (parentTransform.phraseType === php7parser_1.PhraseType.CatchClause && node.tokenType === php7parser_1.TokenType.VariableName) {
                        this._variableTable.setVariable(parentTransform.variable);
                    }
                }
                else if (node.tokenType === php7parser_1.TokenType.DocumentComment) {
                    let phpDoc = phpDoc_1.PhpDocParser.parse(this.doc.tokenText(node));
                    if (phpDoc) {
                        this._lastVarTypehints = phpDoc.varTags;
                        let varTag;
                        for (let n = 0, l = this._lastVarTypehints.length; n < l; ++n) {
                            varTag = this._lastVarTypehints[n];
                            varTag.typeString = typeString_1.TypeString.nameResolve(varTag.typeString, this.nameResolver);
                            this._variableTable.setVariable(Variable.create(varTag.name, varTag.typeString));
                        }
                    }
                }
                else if (node.tokenType === php7parser_1.TokenType.OpenBrace || node.tokenType === php7parser_1.TokenType.CloseBrace || node.tokenType === php7parser_1.TokenType.Semicolon) {
                    this._lastVarTypehints = undefined;
                }
                break;
            default:
                this._transformStack.push(null);
                break;
        }
        return true;
    }
    postorder(node, spine) {
        if (!node.phraseType) {
            return;
        }
        let transform = this._transformStack.pop();
        let parentTransform = this._transformStack.length ? this._transformStack[this._transformStack.length - 1] : null;
        let scope = this._scopeStack.length ? this._scopeStack[this._scopeStack.length - 1] : null;
        if (parentTransform && transform) {
            parentTransform.push(transform);
        }
        switch (node.phraseType) {
            case php7parser_1.PhraseType.FullyQualifiedName:
            case php7parser_1.PhraseType.QualifiedName:
            case php7parser_1.PhraseType.RelativeQualifiedName:
            case php7parser_1.PhraseType.SimpleVariable:
            case php7parser_1.PhraseType.ScopedCallExpression:
            case php7parser_1.PhraseType.ClassConstantAccessExpression:
            case php7parser_1.PhraseType.ScopedPropertyAccessExpression:
            case php7parser_1.PhraseType.PropertyAccessExpression:
            case php7parser_1.PhraseType.MethodCallExpression:
            case php7parser_1.PhraseType.NamespaceUseClause:
            case php7parser_1.PhraseType.NamespaceUseGroupClause:
            case php7parser_1.PhraseType.ClassDeclarationHeader:
            case php7parser_1.PhraseType.InterfaceDeclarationHeader:
            case php7parser_1.PhraseType.TraitDeclarationHeader:
            case php7parser_1.PhraseType.FunctionDeclarationHeader:
            case php7parser_1.PhraseType.ConstElement:
            case php7parser_1.PhraseType.PropertyElement:
            case php7parser_1.PhraseType.ClassConstElement:
            case php7parser_1.PhraseType.MethodDeclarationHeader:
            case php7parser_1.PhraseType.NamespaceDefinition:
            case php7parser_1.PhraseType.ParameterDeclaration:
            case php7parser_1.PhraseType.AnonymousFunctionUseVariable:
            case php7parser_1.PhraseType.RelativeScope:
                if (scope && transform) {
                    let ref = transform.reference;
                    if (ref) {
                        scope.children.push(ref);
                    }
                }
                if (node.phraseType === php7parser_1.PhraseType.NamespaceDefinition) {
                    this._scopeStack.pop();
                }
                break;
            case php7parser_1.PhraseType.SimpleAssignmentExpression:
            case php7parser_1.PhraseType.ByRefAssignmentExpression:
                this._variableTable.setVariables(transform.variables);
                break;
            case php7parser_1.PhraseType.InstanceOfExpression:
                this._variableTable.setVariable(transform.variable);
                break;
            case php7parser_1.PhraseType.ForeachValue:
                this._variableTable.setVariables(parentTransform.variables);
                break;
            case php7parser_1.PhraseType.IfStatement:
            case php7parser_1.PhraseType.SwitchStatement:
                this._variableTable.popBranch();
                this._variableTable.pruneBranches();
                break;
            case php7parser_1.PhraseType.ClassDeclaration:
            case php7parser_1.PhraseType.TraitDeclaration:
            case php7parser_1.PhraseType.InterfaceDeclaration:
            case php7parser_1.PhraseType.AnonymousClassDeclaration:
                this.nameResolver.popClass();
                this._classStack.pop();
                this._scopeStack.pop();
                this._variableTable.popScope();
                break;
            case php7parser_1.PhraseType.FunctionDeclaration:
            case php7parser_1.PhraseType.MethodDeclaration:
            case php7parser_1.PhraseType.AnonymousFunctionCreationExpression:
                this._scopeStack.pop();
                this._variableTable.popScope();
                break;
            default:
                break;
        }
    }
    _currentClassName() {
        let c = this._classStack.length ? this._classStack[this._classStack.length - 1] : undefined;
        return c ? c.name : '';
    }
    _scopeStackPush(scope) {
        if (this._scopeStack.length) {
            this._scopeStack[this._scopeStack.length - 1].children.push(scope);
        }
        this._scopeStack.push(scope);
    }
    _nameSymbolType(parent) {
        if (!parent) {
            return symbol_1.SymbolKind.Class;
        }
        switch (parent.phraseType) {
            case php7parser_1.PhraseType.ConstantAccessExpression:
                return symbol_1.SymbolKind.Constant;
            case php7parser_1.PhraseType.FunctionCallExpression:
                return symbol_1.SymbolKind.Function;
            case php7parser_1.PhraseType.ClassTypeDesignator:
                return symbol_1.SymbolKind.Constructor;
            default:
                return symbol_1.SymbolKind.Class;
        }
    }
    _methodDeclaration(node) {
        let scope = reference_1.Scope.create(this.doc.nodeLocation(node));
        this._scopeStackPush(scope);
        this._variableTable.pushScope(['$this']);
        let type = this._classStack.length ? this._classStack[this._classStack.length - 1] : null;
        let symbol = this._symbols.shift();
        if (type && symbol) {
            let lcName = symbol.name.toLowerCase();
            let fn = (x) => {
                return x.kind === symbol_1.SymbolKind.Method && lcName === x.name.toLowerCase();
            };
            symbol = type.members(typeAggregate_1.MemberMergeStrategy.Documented, fn).shift();
            let children = symbol && symbol.children ? symbol.children : [];
            let param;
            for (let n = 0, l = children.length; n < l; ++n) {
                param = children[n];
                if (param.kind === symbol_1.SymbolKind.Parameter) {
                    this._variableTable.setVariable(Variable.create(param.name, symbol_1.PhpSymbol.type(param)));
                }
            }
        }
    }
    _functionDeclaration(node) {
        let symbol = this._symbols.shift();
        this._scopeStackPush(reference_1.Scope.create(this.doc.nodeLocation(node)));
        this._variableTable.pushScope();
        let children = symbol && symbol.children ? symbol.children : [];
        let param;
        for (let n = 0, l = children.length; n < l; ++n) {
            param = children[n];
            if (param.kind === symbol_1.SymbolKind.Parameter) {
                this._variableTable.setVariable(Variable.create(param.name, symbol_1.PhpSymbol.type(param)));
            }
        }
    }
    _anonymousFunctionCreationExpression(node) {
        let symbol = this._symbols.shift();
        this._scopeStackPush(reference_1.Scope.create(this.doc.nodeLocation(node)));
        let carry = ['$this'];
        let children = symbol && symbol.children ? symbol.children : [];
        let s;
        for (let n = 0, l = children.length; n < l; ++n) {
            s = children[n];
            if (s.kind === symbol_1.SymbolKind.Variable && (s.modifiers & symbol_1.SymbolModifier.Use) > 0) {
                carry.push(s.name);
            }
        }
        this._variableTable.pushScope(carry);
        for (let n = 0, l = children.length; n < l; ++n) {
            s = children[n];
            if (s.kind === symbol_1.SymbolKind.Parameter) {
                this._variableTable.setVariable(Variable.create(s.name, symbol_1.PhpSymbol.type(s)));
            }
        }
    }
}
exports.ReferenceReader = ReferenceReader;
class TokenTransform {
    constructor(token, doc) {
        this.token = token;
        this.doc = doc;
    }
    get tokenType() {
        return this.token.tokenType;
    }
    get text() {
        return this.doc.tokenText(this.token);
    }
    get location() {
        return this.doc.nodeLocation(this.token);
    }
    get type() {
        switch (this.token.tokenType) {
            case php7parser_1.TokenType.FloatingLiteral:
                return 'float';
            case php7parser_1.TokenType.StringLiteral:
            case php7parser_1.TokenType.EncapsulatedAndWhitespace:
                return 'string';
            case php7parser_1.TokenType.IntegerLiteral:
                return 'int';
            case php7parser_1.TokenType.Name:
                {
                    let lcName = this.text.toLowerCase();
                    return lcName === 'true' || lcName === 'false' ? 'bool' : '';
                }
            default:
                return '';
        }
    }
    push(transform) { }
}
class NamespaceNameTransform {
    constructor(node, document) {
        this.node = node;
        this.document = document;
        this.phraseType = php7parser_1.PhraseType.NamespaceName;
        this._parts = [];
    }
    get location() {
        return this.document.nodeLocation(this.node);
    }
    push(transform) {
        if (transform.tokenType === php7parser_1.TokenType.Name) {
            this._parts.push(transform.text);
        }
    }
    get text() {
        return this._parts.join('\\');
    }
}
class NamespaceUseClauseListTransform {
    constructor(phraseType) {
        this.phraseType = phraseType;
        this.references = [];
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.NamespaceUseClause ||
            transform.phraseType === php7parser_1.PhraseType.NamespaceUseGroupClause) {
            this.references.push(transform.reference);
        }
    }
}
class NamespaceUseDeclarationTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.NamespaceUseDeclaration;
        this._kind = symbol_1.SymbolKind.Class;
        this._prefix = '';
        this.references = [];
    }
    push(transform) {
        if (transform.tokenType === php7parser_1.TokenType.Const) {
            this._kind = symbol_1.SymbolKind.Constant;
        }
        else if (transform.tokenType === php7parser_1.TokenType.Function) {
            this._kind = symbol_1.SymbolKind.Function;
        }
        else if (transform.phraseType === php7parser_1.PhraseType.NamespaceName) {
            this._prefix = transform.text;
        }
        else if (transform.phraseType === php7parser_1.PhraseType.NamespaceUseGroupClauseList) {
            this.references = transform.references;
            let ref;
            let prefix = this._prefix ? this._prefix + '\\' : '';
            for (let n = 0; n < this.references.length; ++n) {
                ref = this.references[n];
                ref.name = prefix + ref.name;
                if (!ref.kind) {
                    ref.kind = this._kind;
                }
            }
        }
        else if (transform.phraseType === php7parser_1.PhraseType.NamespaceUseClauseList) {
            this.references = transform.references;
            let ref;
            for (let n = 0; n < this.references.length; ++n) {
                ref = this.references[n];
                ref.kind = this._kind;
            }
        }
    }
}
class NamespaceUseClauseTransform {
    constructor(phraseType) {
        this.phraseType = phraseType;
        this.reference = reference_1.Reference.create(0, '', null);
    }
    push(transform) {
        if (transform.tokenType === php7parser_1.TokenType.Function) {
            this.reference.kind = symbol_1.SymbolKind.Function;
        }
        else if (transform.tokenType === php7parser_1.TokenType.Const) {
            this.reference.kind = symbol_1.SymbolKind.Constant;
        }
        else if (transform.phraseType === php7parser_1.PhraseType.NamespaceName) {
            this.reference.name = transform.text;
            this.reference.location = transform.location;
        }
    }
}
class CatchClauseTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.CatchClause;
        this._varType = '';
        this._varName = '';
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.CatchNameList) {
            this._varType = transform.type;
        }
        else if (transform.tokenType === php7parser_1.TokenType.VariableName) {
            this._varName = transform.text;
        }
    }
    get variable() {
        return this._varName && this._varType ? Variable.create(this._varName, this._varType) : null;
    }
}
class CatchNameListTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.CatchNameList;
        this.type = '';
    }
    push(transform) {
        let ref = transform.reference;
        if (ref) {
            this.type = typeString_1.TypeString.merge(this.type, ref.name);
        }
    }
}
class AnonymousFunctionUseVariableTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.AnonymousFunctionUseVariable;
    }
    push(transform) {
        if (transform.tokenType === php7parser_1.TokenType.VariableName) {
            this.reference = reference_1.Reference.create(symbol_1.SymbolKind.Variable, transform.text, transform.location);
        }
    }
}
class ForeachStatementTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.ForeachStatement;
        this._type = '';
        this.variables = [];
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.ForeachCollection) {
            this._type = typeString_1.TypeString.arrayDereference(transform.type);
        }
        else if (transform.phraseType === php7parser_1.PhraseType.ForeachValue) {
            let vars = transform.variables;
            for (let n = 0; n < vars.length; ++n) {
                this.variables.push(Variable.resolveBaseVariable(vars[n], this._type));
            }
        }
    }
}
var Variable;
(function (Variable) {
    function create(name, type) {
        return {
            name: name,
            arrayDereferenced: 0,
            type: type
        };
    }
    Variable.create = create;
    function resolveBaseVariable(variable, type) {
        let deref = variable.arrayDereferenced;
        if (deref > 0) {
            while (deref-- > 0) {
                type = typeString_1.TypeString.arrayReference(type);
            }
        }
        else if (deref < 0) {
            while (deref++ < 0) {
                type = typeString_1.TypeString.arrayDereference(type);
            }
        }
        return Variable.create(variable.name, type);
    }
    Variable.resolveBaseVariable = resolveBaseVariable;
})(Variable || (Variable = {}));
class ForeachValueTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.ForeachValue;
        this.variables = [];
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.SimpleVariable) {
            let ref = transform.reference;
            this.variables = [{ name: ref.name, arrayDereferenced: 0, type: ref.type }];
        }
        else if (transform.phraseType === php7parser_1.PhraseType.ListIntrinsic) {
            this.variables = transform.variables;
        }
    }
}
class ForeachCollectionTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.ForeachCollection;
        this.type = '';
    }
    push(transform) {
        this.type = transform.type || '';
    }
}
class SimpleAssignmentExpressionTransform {
    constructor(phraseType, varTypeOverrides) {
        this.phraseType = phraseType;
        this.varTypeOverrides = varTypeOverrides;
        this.type = '';
        this._pushCount = 0;
        this._variables = [];
    }
    push(transform) {
        ++this._pushCount;
        if (this._pushCount === 1) {
            this._lhs(transform);
        }
        else if (this._pushCount === 2) {
            this.type = transform.type || '';
        }
    }
    _typeOverride(name, tags) {
        if (!tags) {
            return undefined;
        }
        let t;
        for (let n = 0; n < tags.length; ++n) {
            t = tags[n];
            if (name === t.name) {
                return t.typeString;
            }
        }
        return undefined;
    }
    _lhs(lhs) {
        switch (lhs.phraseType) {
            case php7parser_1.PhraseType.SimpleVariable:
                {
                    let ref = lhs.reference;
                    if (ref) {
                        this._variables.push(Variable.create(ref.name, ref.type));
                    }
                    break;
                }
            case php7parser_1.PhraseType.SubscriptExpression:
                {
                    let variable = lhs.variable;
                    if (variable) {
                        this._variables.push(variable);
                    }
                    break;
                }
            case php7parser_1.PhraseType.ListIntrinsic:
                this._variables = lhs.variables;
                break;
            default:
                break;
        }
    }
    get variables() {
        let type = this.type;
        let tags = this.varTypeOverrides;
        let typeOverrideFn = this._typeOverride;
        let fn = (x) => {
            return Variable.resolveBaseVariable(x, typeOverrideFn(x.name, tags) || type);
        };
        return this._variables.map(fn);
    }
}
class ListIntrinsicTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.ListIntrinsic;
        this.variables = [];
    }
    push(transform) {
        if (transform.phraseType !== php7parser_1.PhraseType.ArrayInitialiserList) {
            return;
        }
        this.variables = transform.variables;
        for (let n = 0; n < this.variables.length; ++n) {
            this.variables[n].arrayDereferenced--;
        }
    }
}
class ArrayInititialiserListTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.ArrayInitialiserList;
        this.variables = [];
        this._types = [];
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.ArrayElement) {
            Array.prototype.push.apply(this.variables, transform.variables);
            this._types.push(transform.type);
        }
    }
    get type() {
        let merged;
        let types;
        if (this._types.length < 4) {
            types = this._types;
        }
        else {
            types = [this._types[0], this._types[Math.floor(this._types.length / 2)], this._types[this._types.length - 1]];
        }
        merged = typeString_1.TypeString.mergeMany(types);
        return typeString_1.TypeString.count(merged) < 3 && merged.indexOf('mixed') < 0 ? merged : 'mixed';
    }
}
class ArrayElementTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.ArrayElement;
        this.type = '';
        this.variables = [];
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.ArrayValue) {
            this.variables = transform.variables;
            this.type = transform.type;
        }
    }
}
class ArrayValueTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.ArrayValue;
        this.type = '';
        this.variables = [];
    }
    push(transform) {
        switch (transform.phraseType) {
            case php7parser_1.PhraseType.SimpleVariable:
                {
                    let ref = transform.reference;
                    this.variables = [{ name: ref.name, arrayDereferenced: 0, type: ref.type || '' }];
                    this.type = ref.type;
                }
                break;
            case php7parser_1.PhraseType.SubscriptExpression:
                {
                    let v = transform.variable;
                    if (v) {
                        this.variables = [v];
                    }
                    this.type = transform.type;
                }
                break;
            case php7parser_1.PhraseType.ListIntrinsic:
                this.variables = transform.variables;
                break;
            default:
                if (transform.tokenType !== php7parser_1.TokenType.Ampersand) {
                    this.type = transform.type;
                }
                break;
        }
    }
}
class CoalesceExpressionTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.CoalesceExpression;
        this.type = '';
    }
    push(transform) {
        this.type = typeString_1.TypeString.merge(this.type, transform.type);
    }
}
class TernaryExpressionTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.TernaryExpression;
        this._transforms = [];
    }
    push(transform) {
        this._transforms.push(transform);
    }
    get type() {
        return this._transforms.slice(-2).reduce((prev, current) => {
            return typeString_1.TypeString.merge(prev, current.type);
        }, '');
    }
}
class SubscriptExpressionTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.SubscriptExpression;
        this.type = '';
        this._pushCount = 0;
    }
    push(transform) {
        if (this._pushCount > 0) {
            return;
        }
        ++this._pushCount;
        switch (transform.phraseType) {
            case php7parser_1.PhraseType.SimpleVariable:
                {
                    let ref = transform.reference;
                    if (ref) {
                        this.type = typeString_1.TypeString.arrayDereference(ref.type);
                        this.variable = { name: ref.name, arrayDereferenced: 1, type: this.type };
                    }
                }
                break;
            case php7parser_1.PhraseType.SubscriptExpression:
                {
                    let v = transform.variable;
                    this.type = typeString_1.TypeString.arrayDereference(transform.type);
                    if (v) {
                        v.arrayDereferenced++;
                        this.variable = v;
                        this.variable.type = this.type;
                    }
                }
                break;
            case php7parser_1.PhraseType.FunctionCallExpression:
            case php7parser_1.PhraseType.MethodCallExpression:
            case php7parser_1.PhraseType.PropertyAccessExpression:
            case php7parser_1.PhraseType.ScopedCallExpression:
            case php7parser_1.PhraseType.ScopedPropertyAccessExpression:
            case php7parser_1.PhraseType.ArrayCreationExpression:
                this.type = typeString_1.TypeString.arrayDereference(transform.type);
                break;
            default:
                break;
        }
    }
}
class InstanceOfExpressionTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.InstanceOfExpression;
        this.type = 'bool';
        this._pushCount = 0;
        this._varName = '';
        this._varType = '';
    }
    push(transform) {
        ++this._pushCount;
        if (this._pushCount === 1) {
            if (transform.phraseType === php7parser_1.PhraseType.SimpleVariable) {
                let ref = transform.reference;
                if (ref) {
                    this._varName = ref.name;
                }
            }
        }
        else if (transform.phraseType === php7parser_1.PhraseType.InstanceofTypeDesignator) {
            this._varType = transform.type;
        }
    }
    get variable() {
        return this._varName && this._varType ? { name: this._varName, arrayDereferenced: 0, type: this._varType } : null;
    }
}
class FunctionCallExpressionTransform {
    constructor(referenceSymbolDelegate) {
        this.referenceSymbolDelegate = referenceSymbolDelegate;
        this.phraseType = php7parser_1.PhraseType.FunctionCallExpression;
        this.type = '';
    }
    push(transform) {
        switch (transform.phraseType) {
            case php7parser_1.PhraseType.FullyQualifiedName:
            case php7parser_1.PhraseType.RelativeQualifiedName:
            case php7parser_1.PhraseType.QualifiedName:
                {
                    let ref = transform.reference;
                    this.type = this.referenceSymbolDelegate(ref).reduce(symbolsToTypeReduceFn, '');
                    break;
                }
            default:
                break;
        }
    }
}
class RelativeScopeTransform {
    constructor(type, loc) {
        this.type = type;
        this.phraseType = php7parser_1.PhraseType.RelativeScope;
        this.reference = reference_1.Reference.create(symbol_1.SymbolKind.Class, type, loc);
        this.reference.altName = 'static';
    }
    push(transform) { }
}
class TypeDesignatorTransform {
    constructor(phraseType) {
        this.phraseType = phraseType;
        this.type = '';
    }
    push(transform) {
        switch (transform.phraseType) {
            case php7parser_1.PhraseType.RelativeScope:
            case php7parser_1.PhraseType.FullyQualifiedName:
            case php7parser_1.PhraseType.RelativeQualifiedName:
            case php7parser_1.PhraseType.QualifiedName:
                this.type = transform.type;
                break;
            default:
                break;
        }
    }
}
class AnonymousClassDeclarationTransform {
    constructor(type) {
        this.type = type;
        this.phraseType = php7parser_1.PhraseType.AnonymousClassDeclaration;
    }
    push(transform) { }
}
class ObjectCreationExpressionTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.ObjectCreationExpression;
        this.type = '';
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.ClassTypeDesignator ||
            transform.phraseType === php7parser_1.PhraseType.AnonymousClassDeclaration) {
            this.type = transform.type;
        }
    }
}
class SimpleVariableTransform {
    constructor(loc, varTable) {
        this.phraseType = php7parser_1.PhraseType.SimpleVariable;
        this._varTable = varTable;
        this.reference = reference_1.Reference.create(symbol_1.SymbolKind.Variable, '', loc);
    }
    push(transform) {
        if (transform.tokenType === php7parser_1.TokenType.VariableName) {
            this.reference.name = transform.text;
            this.reference.type = this._varTable.getType(this.reference.name);
        }
    }
    get type() {
        return this.reference.type;
    }
}
class FullyQualifiedNameTransform {
    constructor(symbolKind, loc) {
        this.phraseType = php7parser_1.PhraseType.FullyQualifiedName;
        this.reference = reference_1.Reference.create(symbolKind, '', loc);
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.NamespaceName) {
            this.reference.name = transform.text;
        }
    }
    get type() {
        return this.reference.name;
    }
}
class QualifiedNameTransform {
    constructor(symbolKind, loc, nameResolver) {
        this.phraseType = php7parser_1.PhraseType.QualifiedName;
        this.reference = reference_1.Reference.create(symbolKind, '', loc);
        this._nameResolver = nameResolver;
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.NamespaceName) {
            let name = transform.text;
            let lcName = name.toLowerCase();
            this.reference.name = this._nameResolver.resolveNotFullyQualified(name, this.reference.kind);
            if (((this.reference.kind === symbol_1.SymbolKind.Function || this.reference.kind === symbol_1.SymbolKind.Constant) &&
                name !== this.reference.name && name.indexOf('\\') < 0) || (lcName === 'parent' || lcName === 'self')) {
                this.reference.altName = name;
            }
        }
    }
    get type() {
        return this.reference.name;
    }
}
class RelativeQualifiedNameTransform {
    constructor(symbolKind, loc, nameResolver) {
        this.phraseType = php7parser_1.PhraseType.RelativeQualifiedName;
        this.reference = reference_1.Reference.create(symbolKind, '', loc);
        this._nameResolver = nameResolver;
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.NamespaceName) {
            this.reference.name = this._nameResolver.resolveRelative(transform.text);
        }
    }
    get type() {
        return this.reference.name;
    }
}
class MemberNameTransform {
    constructor(loc) {
        this.phraseType = php7parser_1.PhraseType.MemberName;
        this.reference = reference_1.Reference.create(symbol_1.SymbolKind.None, '', loc);
    }
    push(transform) {
        if (transform.tokenType === php7parser_1.TokenType.Name) {
            this.reference.name = transform.text;
        }
    }
}
class ScopedMemberNameTransform {
    constructor(loc) {
        this.phraseType = php7parser_1.PhraseType.ScopedMemberName;
        this.reference = reference_1.Reference.create(symbol_1.SymbolKind.None, '', loc);
    }
    push(transform) {
        if (transform.tokenType === php7parser_1.TokenType.VariableName ||
            transform.phraseType === php7parser_1.PhraseType.Identifier) {
            this.reference.name = transform.text;
        }
    }
}
class IdentifierTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.Identifier;
        this.text = '';
    }
    push(transform) {
        this.text = transform.text;
        this.location = transform.location;
    }
}
class MemberAccessExpressionTransform {
    constructor(phraseType, symbolKind, referenceSymbolDelegate) {
        this.phraseType = phraseType;
        this.symbolKind = symbolKind;
        this.referenceSymbolDelegate = referenceSymbolDelegate;
        this._scope = '';
    }
    push(transform) {
        switch (transform.phraseType) {
            case php7parser_1.PhraseType.ScopedMemberName:
            case php7parser_1.PhraseType.MemberName:
                this.reference = transform.reference;
                this.reference.kind = this.symbolKind;
                this.reference.scope = this._scope;
                if (this.symbolKind === symbol_1.SymbolKind.Property && this.reference.name && this.reference.name[0] !== '$') {
                    this.reference.name = '$' + this.reference.name;
                }
                break;
            case php7parser_1.PhraseType.ScopedCallExpression:
            case php7parser_1.PhraseType.MethodCallExpression:
            case php7parser_1.PhraseType.PropertyAccessExpression:
            case php7parser_1.PhraseType.ScopedPropertyAccessExpression:
            case php7parser_1.PhraseType.FunctionCallExpression:
            case php7parser_1.PhraseType.SubscriptExpression:
            case php7parser_1.PhraseType.SimpleVariable:
            case php7parser_1.PhraseType.FullyQualifiedName:
            case php7parser_1.PhraseType.QualifiedName:
            case php7parser_1.PhraseType.RelativeQualifiedName:
            case php7parser_1.PhraseType.EncapsulatedExpression:
            case php7parser_1.PhraseType.RelativeScope:
                this._scope = transform.type;
                break;
            default:
                break;
        }
    }
    get type() {
        return this.referenceSymbolDelegate(this.reference).reduce(symbolsToTypeReduceFn, '');
    }
}
class HeaderTransform {
    constructor(nameResolver, kind) {
        this.nameResolver = nameResolver;
        this._kind = kind;
    }
    push(transform) {
        if (transform.tokenType === php7parser_1.TokenType.Name) {
            let name = transform.text;
            let loc = transform.location;
            this.reference = reference_1.Reference.create(this._kind, this.nameResolver.resolveRelative(name), loc);
        }
    }
}
class MemberDeclarationTransform {
    constructor(kind, scope) {
        this._scope = '';
        this._kind = kind;
        this._scope = scope;
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.Identifier) {
            let name = transform.text;
            let loc = transform.location;
            this.reference = reference_1.Reference.create(this._kind, name, loc);
            this.reference.scope = this._scope;
        }
    }
}
class PropertyElementTransform {
    constructor(scope) {
        this._scope = '';
        this._scope = scope;
    }
    push(transform) {
        if (transform.tokenType === php7parser_1.TokenType.VariableName) {
            let name = transform.text;
            let loc = transform.location;
            this.reference = reference_1.Reference.create(symbol_1.SymbolKind.Property, name, loc);
            this.reference.scope = this._scope;
        }
    }
}
class NamespaceDefinitionTransform {
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.NamespaceName) {
            this.reference = reference_1.Reference.create(symbol_1.SymbolKind.Namespace, transform.text, transform.location);
        }
    }
}
class ParameterDeclarationTransform {
    push(transform) {
        if (transform.tokenType === php7parser_1.TokenType.VariableName) {
            this.reference = reference_1.Reference.create(symbol_1.SymbolKind.Parameter, transform.text, transform.location);
        }
    }
}
class EncapsulatedExpressionTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.EncapsulatedExpression;
    }
    push(transform) {
        if (transform.phraseType || (transform.tokenType >= php7parser_1.TokenType.DirectoryConstant && transform.tokenType <= php7parser_1.TokenType.IntegerLiteral)) {
            this._transform = transform;
        }
    }
    get reference() {
        return this._transform ? this._transform.reference : undefined;
    }
    get type() {
        return this._transform ? this._transform.type : undefined;
    }
}
class VariableTable {
    constructor() {
        this._typeVariableSetStack = [VariableSet.create(1)];
    }
    setVariable(v) {
        if (!v || !v.name || !v.type) {
            return;
        }
        this._typeVariableSetStack[this._typeVariableSetStack.length - 1].variables[v.name] = v;
    }
    setVariables(vars) {
        if (!vars) {
            return;
        }
        for (let n = 0; n < vars.length; ++n) {
            this.setVariable(vars[n]);
        }
    }
    pushScope(carry) {
        let scope = VariableSet.create(1);
        if (carry) {
            let type;
            let name;
            for (let n = 0; n < carry.length; ++n) {
                name = carry[n];
                type = this.getType(name);
                if (type && name) {
                    scope.variables[name] = Variable.create(name, type);
                }
            }
        }
        this._typeVariableSetStack.push(scope);
    }
    popScope() {
        this._typeVariableSetStack.pop();
    }
    pushBranch() {
        let b = VariableSet.create(3);
        this._typeVariableSetStack[this._typeVariableSetStack.length - 1].branches.push(b);
        this._typeVariableSetStack.push(b);
    }
    popBranch() {
        this._typeVariableSetStack.pop();
    }
    pruneBranches() {
        let node = this._typeVariableSetStack[this._typeVariableSetStack.length - 1];
        let branches = node.branches;
        node.branches = [];
        for (let n = 0, l = branches.length; n < l; ++n) {
            this._mergeSets(node, branches[n]);
        }
    }
    getType(varName) {
        let typeSet;
        for (let n = this._typeVariableSetStack.length - 1; n >= 0; --n) {
            typeSet = this._typeVariableSetStack[n];
            if (typeSet.variables[varName]) {
                return typeSet.variables[varName].type;
            }
            if (typeSet.kind === 1) {
                break;
            }
        }
        return '';
    }
    _mergeSets(a, b) {
        let keys = Object.keys(b.variables);
        let v;
        for (let n = 0, l = keys.length; n < l; ++n) {
            v = b.variables[keys[n]];
            if (a.variables[v.name]) {
                a.variables[v.name].type = typeString_1.TypeString.merge(a.variables[v.name].type, v.type);
            }
            else {
                a.variables[v.name] = v;
            }
        }
    }
}
var VariableSet;
(function (VariableSet) {
    function create(kind) {
        return {
            kind: kind,
            variables: {},
            branches: []
        };
    }
    VariableSet.create = create;
})(VariableSet || (VariableSet = {}));
(function (ReferenceReader) {
    function discoverReferences(doc, symbolStore) {
        let visitor = new ReferenceReader(doc, new nameResolver_1.NameResolver(), symbolStore);
        doc.traverse(visitor);
        return visitor.refTable;
    }
    ReferenceReader.discoverReferences = discoverReferences;
})(ReferenceReader = exports.ReferenceReader || (exports.ReferenceReader = {}));
