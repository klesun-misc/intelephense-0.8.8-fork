'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const php7parser_1 = require("php7parser");
const phpDoc_1 = require("./phpDoc");
const symbol_1 = require("./symbol");
const typeString_1 = require("./typeString");
const util = require("./util");
class SymbolReader {
    constructor(document, nameResolver) {
        this.document = document;
        this.nameResolver = nameResolver;
        this._uriHash = 0;
        this._transformStack = [new FileTransform(this.document.uri, this.document.nodeHashedLocation(this.document.tree))];
        this._uriHash = Math.abs(util.hash32(document.uri));
    }
    get symbol() {
        return this._transformStack[0].symbol;
    }
    preorder(node, spine) {
        let s;
        let parentNode = (spine.length ? spine[spine.length - 1] : { phraseType: php7parser_1.PhraseType.Unknown, children: [] });
        let parentTransform = this._transformStack[this._transformStack.length - 1];
        switch (node.phraseType) {
            case php7parser_1.PhraseType.Error:
                this._transformStack.push(null);
                return false;
            case php7parser_1.PhraseType.NamespaceDefinition:
                {
                    let t = new NamespaceDefinitionTransform(this.document.nodeHashedLocation(node));
                    this._transformStack.push(t);
                    this.nameResolver.namespace = t.symbol;
                }
                break;
            case php7parser_1.PhraseType.NamespaceUseDeclaration:
                this._transformStack.push(new NamespaceUseDeclarationTransform());
                break;
            case php7parser_1.PhraseType.NamespaceUseClauseList:
            case php7parser_1.PhraseType.NamespaceUseGroupClauseList:
                this._transformStack.push(new NamespaceUseClauseListTransform(node.phraseType));
                break;
            case php7parser_1.PhraseType.NamespaceUseClause:
            case php7parser_1.PhraseType.NamespaceUseGroupClause:
                {
                    let t = new NamespaceUseClauseTransform(node.phraseType, this.document.nodeHashedLocation(node));
                    this._transformStack.push(t);
                    this.nameResolver.rules.push(t.symbol);
                }
                break;
            case php7parser_1.PhraseType.NamespaceAliasingClause:
                this._transformStack.push(new NamespaceAliasingClause());
                break;
            case php7parser_1.PhraseType.ConstElement:
                this._transformStack.push(new ConstElementTransform(this.nameResolver, this.document.nodeHashedLocation(node), this.lastPhpDoc, this.lastPhpDocLocation));
                break;
            case php7parser_1.PhraseType.FunctionDeclaration:
                this._transformStack.push(new FunctionDeclarationTransform(this.nameResolver, this.document.nodeHashedLocation(node), this.lastPhpDoc, this.lastPhpDocLocation));
                break;
            case php7parser_1.PhraseType.FunctionDeclarationHeader:
                this._transformStack.push(new FunctionDeclarationHeaderTransform());
                break;
            case php7parser_1.PhraseType.ParameterDeclarationList:
                this._transformStack.push(new DelimiteredListTransform(php7parser_1.PhraseType.ParameterDeclarationList));
                break;
            case php7parser_1.PhraseType.ParameterDeclaration:
                this._transformStack.push(new ParameterDeclarationTransform(this.document.nodeHashedLocation(node), this.lastPhpDoc, this.lastPhpDocLocation, this.nameResolver));
                break;
            case php7parser_1.PhraseType.TypeDeclaration:
                this._transformStack.push(new TypeDeclarationTransform());
                break;
            case php7parser_1.PhraseType.ReturnType:
                this._transformStack.push(new ReturnTypeTransform());
                break;
            case php7parser_1.PhraseType.FunctionDeclarationBody:
            case php7parser_1.PhraseType.MethodDeclarationBody:
                this._transformStack.push(new FunctionDeclarationBodyTransform(node.phraseType));
                break;
            case php7parser_1.PhraseType.ClassDeclaration:
                {
                    let t = new ClassDeclarationTransform(this.nameResolver, this.document.nodeHashedLocation(node), this.lastPhpDoc, this.lastPhpDocLocation);
                    this._transformStack.push(t);
                    this.nameResolver.pushClass(t.symbol);
                }
                break;
            case php7parser_1.PhraseType.ClassDeclarationHeader:
                this._transformStack.push(new ClassDeclarationHeaderTransform());
                break;
            case php7parser_1.PhraseType.ClassBaseClause:
                this._transformStack.push(new ClassBaseClauseTransform());
                break;
            case php7parser_1.PhraseType.ClassInterfaceClause:
                this._transformStack.push(new ClassInterfaceClauseTransform());
                break;
            case php7parser_1.PhraseType.QualifiedNameList:
                if (parentTransform) {
                    this._transformStack.push(new DelimiteredListTransform(php7parser_1.PhraseType.QualifiedNameList));
                }
                else {
                    this._transformStack.push(null);
                }
                break;
            case php7parser_1.PhraseType.ClassDeclarationBody:
                this._transformStack.push(new TypeDeclarationBodyTransform(php7parser_1.PhraseType.ClassDeclarationBody));
                break;
            case php7parser_1.PhraseType.InterfaceDeclaration:
                {
                    let t = new InterfaceDeclarationTransform(this.nameResolver, this.document.nodeHashedLocation(node), this.lastPhpDoc, this.lastPhpDocLocation);
                    this._transformStack.push(t);
                    this.nameResolver.pushClass(t.symbol);
                }
                break;
            case php7parser_1.PhraseType.InterfaceDeclarationHeader:
                this._transformStack.push(new InterfaceDeclarationHeaderTransform());
                break;
            case php7parser_1.PhraseType.InterfaceBaseClause:
                this._transformStack.push(new InterfaceBaseClauseTransform());
                break;
            case php7parser_1.PhraseType.InterfaceDeclarationBody:
                this._transformStack.push(new TypeDeclarationBodyTransform(php7parser_1.PhraseType.InterfaceDeclarationBody));
                break;
            case php7parser_1.PhraseType.TraitDeclaration:
                this._transformStack.push(new TraitDeclarationTransform(this.nameResolver, this.document.nodeHashedLocation(node), this.lastPhpDoc, this.lastPhpDocLocation));
                break;
            case php7parser_1.PhraseType.TraitDeclarationHeader:
                this._transformStack.push(new TraitDeclarationHeaderTransform());
                break;
            case php7parser_1.PhraseType.TraitDeclarationBody:
                this._transformStack.push(new TypeDeclarationBodyTransform(php7parser_1.PhraseType.TraitDeclarationBody));
                break;
            case php7parser_1.PhraseType.ClassConstDeclaration:
                this._transformStack.push(new FieldDeclarationTransform(php7parser_1.PhraseType.ClassConstDeclaration));
                break;
            case php7parser_1.PhraseType.ClassConstElementList:
                this._transformStack.push(new DelimiteredListTransform(php7parser_1.PhraseType.ClassConstElementList));
                break;
            case php7parser_1.PhraseType.ClassConstElement:
                this._transformStack.push(new ClassConstantElementTransform(this.nameResolver, this.document.nodeHashedLocation(node), this.lastPhpDoc, this.lastPhpDocLocation));
                break;
            case php7parser_1.PhraseType.PropertyDeclaration:
                this._transformStack.push(new FieldDeclarationTransform(php7parser_1.PhraseType.PropertyDeclaration));
                break;
            case php7parser_1.PhraseType.PropertyElementList:
                this._transformStack.push(new DelimiteredListTransform(php7parser_1.PhraseType.PropertyElementList));
                break;
            case php7parser_1.PhraseType.PropertyElement:
                this._transformStack.push(new PropertyElementTransform(this.nameResolver, this.document.nodeHashedLocation(node), this.lastPhpDoc, this.lastPhpDocLocation));
                break;
            case php7parser_1.PhraseType.PropertyInitialiser:
                this._transformStack.push(new PropertyInitialiserTransform());
                break;
            case php7parser_1.PhraseType.TraitUseClause:
                this._transformStack.push(new TraitUseClauseTransform());
                break;
            case php7parser_1.PhraseType.MethodDeclaration:
                this._transformStack.push(new MethodDeclarationTransform(this.nameResolver, this.document.nodeHashedLocation(node), this.lastPhpDoc, this.lastPhpDocLocation));
                break;
            case php7parser_1.PhraseType.MethodDeclarationHeader:
                this._transformStack.push(new MethodDeclarationHeaderTransform());
                break;
            case php7parser_1.PhraseType.Identifier:
                if (parentNode.phraseType === php7parser_1.PhraseType.MethodDeclarationHeader || parentNode.phraseType === php7parser_1.PhraseType.ClassConstElement) {
                    this._transformStack.push(new IdentifierTransform());
                }
                else {
                    this._transformStack.push(null);
                }
                break;
            case php7parser_1.PhraseType.MemberModifierList:
                this._transformStack.push(new MemberModifierListTransform());
                break;
            case php7parser_1.PhraseType.AnonymousClassDeclaration:
                {
                    let t = new AnonymousClassDeclarationTransform(this.document.nodeHashedLocation(node), this.document.createAnonymousName(node));
                    this._transformStack.push(t);
                    this.nameResolver.pushClass(t.symbol);
                }
                break;
            case php7parser_1.PhraseType.AnonymousClassDeclarationHeader:
                this._transformStack.push(new AnonymousClassDeclarationHeaderTransform());
                break;
            case php7parser_1.PhraseType.AnonymousFunctionCreationExpression:
                this._transformStack.push(new AnonymousFunctionCreationExpressionTransform(this.document.nodeHashedLocation(node), this.document.createAnonymousName(node)));
                break;
            case php7parser_1.PhraseType.AnonymousFunctionHeader:
                this._transformStack.push(new AnonymousFunctionHeaderTransform());
                break;
            case php7parser_1.PhraseType.AnonymousFunctionUseClause:
                this._transformStack.push(new AnonymousFunctionUseClauseTransform());
                break;
            case php7parser_1.PhraseType.ClosureUseList:
                this._transformStack.push(new DelimiteredListTransform(php7parser_1.PhraseType.ClosureUseList));
                break;
            case php7parser_1.PhraseType.AnonymousFunctionUseVariable:
                this._transformStack.push(new AnonymousFunctionUseVariableTransform(this.document.nodeHashedLocation(node)));
                break;
            case php7parser_1.PhraseType.SimpleVariable:
                this._transformStack.push(new SimpleVariableTransform(this.document.nodeHashedLocation(node)));
                break;
            case php7parser_1.PhraseType.FunctionCallExpression:
                if (node.children.length) {
                    let name = this.document.nodeText(node.children[0]).toLowerCase();
                    if (name === 'define' || name === '\\define') {
                        this._transformStack.push(new DefineFunctionCallExpressionTransform(this.document.nodeHashedLocation(node)));
                        break;
                    }
                }
                this._transformStack.push(null);
                break;
            case php7parser_1.PhraseType.ArgumentExpressionList:
                if (parentNode.phraseType === php7parser_1.PhraseType.FunctionCallExpression && parentTransform) {
                    this._transformStack.push(new DelimiteredListTransform(php7parser_1.PhraseType.ArgumentExpressionList));
                }
                else {
                    this._transformStack.push(null);
                }
                break;
            case php7parser_1.PhraseType.FullyQualifiedName:
                if (parentTransform) {
                    this._transformStack.push(new FullyQualifiedNameTransform());
                }
                else {
                    this._transformStack.push(null);
                }
                break;
            case php7parser_1.PhraseType.RelativeQualifiedName:
                if (parentTransform) {
                    this._transformStack.push(new RelativeQualifiedNameTransform(this.nameResolver));
                }
                else {
                    this._transformStack.push(null);
                }
                break;
            case php7parser_1.PhraseType.QualifiedName:
                if (parentTransform) {
                    this._transformStack.push(new QualifiedNameTransform(this.nameResolver));
                }
                else {
                    this._transformStack.push(null);
                }
                break;
            case php7parser_1.PhraseType.NamespaceName:
                if (parentTransform) {
                    this._transformStack.push(new NamespaceNameTransform());
                }
                else {
                    this._transformStack.push(null);
                }
                break;
            case undefined:
                if (node.tokenType === php7parser_1.TokenType.DocumentComment) {
                    this.lastPhpDoc = phpDoc_1.PhpDocParser.parse(this.document.nodeText(node));
                    this.lastPhpDocLocation = this.document.nodeHashedLocation(node);
                }
                else if (node.tokenType === php7parser_1.TokenType.CloseBrace) {
                    this.lastPhpDoc = null;
                    this.lastPhpDocLocation = null;
                }
                else if (node.tokenType === php7parser_1.TokenType.VariableName && parentNode.phraseType === php7parser_1.PhraseType.CatchClause) {
                    for (let n = this._transformStack.length - 1; n > -1; --n) {
                        if (this._transformStack[n]) {
                            this._transformStack[n].push(new CatchClauseVariableNameTransform(this.document.tokenText(node), this.document.nodeHashedLocation(node)));
                            break;
                        }
                    }
                }
                else if (parentTransform && node.tokenType > php7parser_1.TokenType.EndOfFile && node.tokenType < php7parser_1.TokenType.Equals) {
                    parentTransform.push(new TokenTransform(node, this.document));
                }
                break;
            default:
                if (parentNode.phraseType === php7parser_1.PhraseType.ConstElement ||
                    parentNode.phraseType === php7parser_1.PhraseType.ClassConstElement ||
                    parentNode.phraseType === php7parser_1.PhraseType.ParameterDeclaration ||
                    (parentNode.phraseType === php7parser_1.PhraseType.ArgumentExpressionList && parentTransform)) {
                    this._transformStack.push(new DefaultNodeTransform(node.phraseType, this.document.nodeText(node)));
                }
                else {
                    this._transformStack.push(null);
                }
                break;
        }
        return true;
    }
    postorder(node, spine) {
        if (!node.phraseType) {
            return;
        }
        let transform = this._transformStack.pop();
        if (!transform) {
            return;
        }
        for (let n = this._transformStack.length - 1; n > -1; --n) {
            if (this._transformStack[n]) {
                this._transformStack[n].push(transform);
                break;
            }
        }
        switch (node.phraseType) {
            case php7parser_1.PhraseType.ClassDeclarationHeader:
            case php7parser_1.PhraseType.InterfaceDeclarationHeader:
            case php7parser_1.PhraseType.AnonymousClassDeclarationHeader:
            case php7parser_1.PhraseType.FunctionDeclarationHeader:
            case php7parser_1.PhraseType.MethodDeclarationHeader:
            case php7parser_1.PhraseType.TraitDeclarationHeader:
            case php7parser_1.PhraseType.AnonymousFunctionHeader:
                this.lastPhpDoc = null;
                this.lastPhpDocLocation = null;
                break;
            default:
                break;
        }
    }
}
exports.SymbolReader = SymbolReader;
class UniqueSymbolCollection {
    constructor() {
        this._symbols = [];
        this._varMap = Object.assign({}, UniqueSymbolCollection._inbuilt);
    }
    get length() {
        return this._symbols.length;
    }
    push(s) {
        if (s.kind & (symbol_1.SymbolKind.Parameter | symbol_1.SymbolKind.Variable)) {
            if (this._varMap[s.name] === undefined) {
                this._varMap[s.name] = true;
                this._symbols.push(s);
            }
        }
        else {
            this._symbols.push(s);
        }
    }
    pushMany(symbols) {
        for (let n = 0, l = symbols.length; n < l; ++n) {
            this.push(symbols[n]);
        }
    }
    toArray() {
        return this._symbols;
    }
}
UniqueSymbolCollection._inbuilt = {
    '$GLOBALS': true,
    '$_SERVER': true,
    '$_GET': true,
    '$_POST': true,
    '$_FILES': true,
    '$_REQUEST': true,
    '$_SESSION': true,
    '$_ENV': true,
    '$_COOKIE': true,
    '$php_errormsg': true,
    '$HTTP_RAW_POST_DATA': true,
    '$http_response_header': true,
    '$argc': true,
    '$argv': true,
    '$this': true
};
class FileTransform {
    constructor(uri, location) {
        this._symbol = symbol_1.PhpSymbol.create(symbol_1.SymbolKind.File, uri, location);
        this._children = new UniqueSymbolCollection();
    }
    push(transform) {
        let s = transform.symbol;
        if (s) {
            this._children.push(s);
            return;
        }
        let symbols = transform.symbols;
        if (symbols) {
            this._children.pushMany(symbols);
        }
    }
    get symbol() {
        this._symbol.children = this._children.toArray();
        return this._symbol;
    }
}
class DelimiteredListTransform {
    constructor(phraseType) {
        this.phraseType = phraseType;
        this.transforms = [];
    }
    push(transform) {
        this.transforms.push(transform);
    }
}
class TokenTransform {
    constructor(token, doc) {
        this.token = token;
        this.doc = doc;
    }
    push(transform) { }
    get text() {
        return this.doc.tokenText(this.token);
    }
    get tokenType() {
        return this.token.tokenType;
    }
    get location() {
        return this.doc.nodeHashedLocation(this.token);
    }
}
class NamespaceNameTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.NamespaceName;
        this._parts = [];
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
class QualifiedNameTransform {
    constructor(nameResolver) {
        this.nameResolver = nameResolver;
        this.phraseType = php7parser_1.PhraseType.QualifiedName;
        this.name = '';
        this.unresolved = '';
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.NamespaceName) {
            this.unresolved = transform.text;
            this.name = this.nameResolver.resolveNotFullyQualified(this.unresolved);
        }
    }
}
class RelativeQualifiedNameTransform {
    constructor(nameResolver) {
        this.nameResolver = nameResolver;
        this.phraseType = php7parser_1.PhraseType.RelativeQualifiedName;
        this.name = '';
        this.unresolved = '';
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.NamespaceName) {
            this.unresolved = transform.text;
            this.name = this.nameResolver.resolveRelative(this.unresolved);
        }
    }
}
class FullyQualifiedNameTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.FullyQualifiedName;
        this.name = '';
        this.unresolved = '';
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.NamespaceName) {
            this.name = this.unresolved = transform.text;
        }
    }
}
class CatchClauseVariableNameTransform {
    constructor(name, location) {
        this.tokenType = php7parser_1.TokenType.VariableName;
        this.symbol = symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Variable, name, location);
    }
    push(transform) { }
}
class ParameterDeclarationTransform {
    constructor(location, doc, docLocation, nameResolver) {
        this.phraseType = php7parser_1.PhraseType.ParameterDeclaration;
        this.symbol = symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Parameter, '', location);
        this._doc = doc;
        this._docLocation = docLocation;
        this._nameResolver = nameResolver;
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.TypeDeclaration) {
            this.symbol.type = transform.type;
        }
        else if (transform.tokenType === php7parser_1.TokenType.Ampersand) {
            this.symbol.modifiers |= symbol_1.SymbolModifier.Reference;
        }
        else if (transform.tokenType === php7parser_1.TokenType.Ellipsis) {
            this.symbol.modifiers |= symbol_1.SymbolModifier.Variadic;
        }
        else if (transform.tokenType === php7parser_1.TokenType.VariableName) {
            this.symbol.name = transform.text;
            SymbolReader.assignPhpDocInfoToSymbol(this.symbol, this._doc, this._docLocation, this._nameResolver);
        }
        else {
            this.symbol.value = transform.text;
        }
    }
}
class DefineFunctionCallExpressionTransform {
    constructor(location) {
        this.phraseType = php7parser_1.PhraseType.FunctionCallExpression;
        this.symbol = symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Constant, '', location);
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.ArgumentExpressionList) {
            let arg1, arg2;
            [arg1, arg2] = transform.transforms;
            if (arg1 && arg1.tokenType === php7parser_1.TokenType.StringLiteral) {
                this.symbol.name = arg1.text.slice(1, -1);
            }
            if (arg2 && (arg2.tokenType === php7parser_1.TokenType.FloatingLiteral ||
                arg2.tokenType === php7parser_1.TokenType.IntegerLiteral ||
                arg2.tokenType === php7parser_1.TokenType.StringLiteral)) {
                this.symbol.value = arg2.text;
            }
            if (this.symbol.name && this.symbol.name[0] === '\\') {
                this.symbol.name = this.symbol.name.slice(1);
            }
        }
    }
}
class SimpleVariableTransform {
    constructor(location) {
        this.phraseType = php7parser_1.PhraseType.SimpleVariable;
        this.symbol = symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Variable, '', location);
    }
    push(transform) {
        if (transform.tokenType === php7parser_1.TokenType.VariableName) {
            this.symbol.name = transform.text;
        }
    }
}
class AnonymousClassDeclarationTransform {
    constructor(location, name) {
        this.phraseType = php7parser_1.PhraseType.AnonymousClassDeclaration;
        this.symbol = symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Class, name, location);
        this.symbol.modifiers = symbol_1.SymbolModifier.Anonymous;
        this.symbol.children = [];
        this.symbol.associated = [];
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.AnonymousClassDeclarationHeader) {
            if (transform.base) {
                this.symbol.associated.push(transform.base);
            }
            Array.prototype.push.apply(this.symbol.associated, transform.interfaces);
        }
        else if (transform.phraseType === php7parser_1.PhraseType.ClassDeclarationBody) {
            Array.prototype.push.apply(this.symbol.children, symbol_1.PhpSymbol.setScope(transform.declarations, this.symbol.name));
            Array.prototype.push.apply(this.symbol.associated, transform.useTraits);
        }
    }
}
class TypeDeclarationBodyTransform {
    constructor(phraseType) {
        this.phraseType = phraseType;
        this.declarations = [];
        this.useTraits = [];
    }
    push(transform) {
        switch (transform.phraseType) {
            case php7parser_1.PhraseType.ClassConstDeclaration:
            case php7parser_1.PhraseType.PropertyDeclaration:
                Array.prototype.push.apply(this.declarations, transform.symbols);
                break;
            case php7parser_1.PhraseType.MethodDeclaration:
                this.declarations.push(transform.symbol);
                break;
            case php7parser_1.PhraseType.TraitUseClause:
                Array.prototype.push.apply(this.useTraits, transform.symbols);
                break;
            default:
                break;
        }
    }
}
class AnonymousClassDeclarationHeaderTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.AnonymousClassDeclarationHeader;
        this.interfaces = [];
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.ClassBaseClause) {
            this.base = transform.symbol;
        }
        else if (transform.phraseType === php7parser_1.PhraseType.ClassInterfaceClause) {
            this.interfaces = transform.symbols;
        }
    }
}
class AnonymousFunctionCreationExpressionTransform {
    constructor(location, name) {
        this.phraseType = php7parser_1.PhraseType.AnonymousFunctionCreationExpression;
        this._symbol = symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Function, name, location);
        this._symbol.modifiers = symbol_1.SymbolModifier.Anonymous;
        this._children = new UniqueSymbolCollection();
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.AnonymousFunctionHeader) {
            this._symbol.modifiers |= transform.modifier;
            this._children.pushMany(transform.parameters);
            this._children.pushMany(transform.uses);
            this._symbol.type = transform.returnType;
        }
        else if (transform.phraseType === php7parser_1.PhraseType.FunctionDeclarationBody) {
            this._children.pushMany(transform.symbols);
        }
    }
    get symbol() {
        this._symbol.children = symbol_1.PhpSymbol.setScope(this._children.toArray(), this._symbol.name);
        return this._symbol;
    }
}
class AnonymousFunctionHeaderTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.AnonymousFunctionHeader;
        this.modifier = symbol_1.SymbolModifier.None;
        this.returnType = '';
        this.parameters = [];
        this.uses = [];
    }
    push(transform) {
        if (transform.tokenType === php7parser_1.TokenType.Ampersand) {
            this.modifier |= symbol_1.SymbolModifier.Reference;
        }
        else if (transform.tokenType === php7parser_1.TokenType.Static) {
            this.modifier |= symbol_1.SymbolModifier.Static;
        }
        else if (transform.phraseType === php7parser_1.PhraseType.ParameterDeclarationList) {
            let transforms = transform.transforms;
            for (let n = 0; n < transforms.length; ++n) {
                this.parameters.push(transforms[n].symbol);
            }
        }
        else if (transform.phraseType === php7parser_1.PhraseType.AnonymousFunctionUseClause) {
            let symbols = transform.symbols;
            for (let n = 0; n < symbols.length; ++n) {
                this.uses.push(symbols[n]);
            }
        }
        else if (transform.phraseType === php7parser_1.PhraseType.ReturnType) {
            this.returnType = transform.type;
        }
    }
}
class FunctionDeclarationBodyTransform {
    constructor(phraseType) {
        this.phraseType = phraseType;
        this._value = new UniqueSymbolCollection();
    }
    push(transform) {
        switch (transform.phraseType) {
            case php7parser_1.PhraseType.SimpleVariable:
            case php7parser_1.PhraseType.AnonymousFunctionCreationExpression:
            case php7parser_1.PhraseType.AnonymousClassDeclaration:
            case php7parser_1.PhraseType.FunctionCallExpression:
                this._value.push(transform.symbol);
                break;
            case undefined:
                if (transform instanceof CatchClauseVariableNameTransform) {
                    this._value.push(transform.symbol);
                }
                break;
            default:
                break;
        }
    }
    get symbols() {
        return this._value.toArray();
    }
}
class AnonymousFunctionUseClauseTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.AnonymousFunctionUseClause;
        this.symbols = [];
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.ClosureUseList) {
            let transforms = transform.transforms;
            for (let n = 0; n < transforms.length; ++n) {
                this.symbols.push(transforms[n].symbol);
            }
        }
    }
}
class AnonymousFunctionUseVariableTransform {
    constructor(location) {
        this.phraseType = php7parser_1.PhraseType.AnonymousFunctionUseVariable;
        this.symbol = symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Variable, '', location);
        this.symbol.modifiers = symbol_1.SymbolModifier.Use;
    }
    push(transform) {
        if (transform.tokenType === php7parser_1.TokenType.VariableName) {
            this.symbol.name = transform.text;
        }
        else if (transform.tokenType === php7parser_1.TokenType.Ampersand) {
            this.symbol.modifiers |= symbol_1.SymbolModifier.Reference;
        }
    }
}
class InterfaceDeclarationTransform {
    constructor(nameResolver, location, doc, docLocation) {
        this.nameResolver = nameResolver;
        this.phraseType = php7parser_1.PhraseType.InterfaceDeclaration;
        this.symbol = symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Interface, '', location);
        SymbolReader.assignPhpDocInfoToSymbol(this.symbol, doc, docLocation, nameResolver);
        this.symbol.children = [];
        this.symbol.associated = [];
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.InterfaceDeclarationHeader) {
            this.symbol.name = this.nameResolver.resolveRelative(transform.name);
            this.symbol.associated = transform.extends;
        }
        else if (transform.phraseType === php7parser_1.PhraseType.InterfaceDeclarationBody) {
            Array.prototype.push.apply(this.symbol.children, symbol_1.PhpSymbol.setScope(transform.declarations, this.symbol.name));
        }
    }
}
class ConstElementTransform {
    constructor(nameResolver, location, doc, docLocation) {
        this.nameResolver = nameResolver;
        this.phraseType = php7parser_1.PhraseType.ConstElement;
        this.symbol = symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Constant, '', location);
        this.symbol.scope = this.nameResolver.namespaceName;
        this._doc = doc;
        this._docLocation = docLocation;
    }
    push(transform) {
        if (transform.tokenType === php7parser_1.TokenType.Name) {
            this.symbol.name = this.nameResolver.resolveRelative(transform.text);
            SymbolReader.assignPhpDocInfoToSymbol(this.symbol, this._doc, this._docLocation, this.nameResolver);
        }
        else {
            this.symbol.value = transform.text;
        }
    }
}
class TraitDeclarationTransform {
    constructor(nameResolver, location, doc, docLocation) {
        this.nameResolver = nameResolver;
        this.phraseType = php7parser_1.PhraseType.TraitDeclaration;
        this.symbol = symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Trait, '', location);
        SymbolReader.assignPhpDocInfoToSymbol(this.symbol, doc, docLocation, nameResolver);
        this.symbol.children = [];
        this.symbol.associated = [];
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.TraitDeclarationHeader) {
            this.symbol.name = this.nameResolver.resolveRelative(transform.name);
        }
        else if (transform.phraseType === php7parser_1.PhraseType.TraitDeclarationBody) {
            Array.prototype.push.apply(this.symbol.children, symbol_1.PhpSymbol.setScope(transform.declarations, this.symbol.name));
            Array.prototype.push.apply(this.symbol.associated, transform.useTraits);
        }
    }
}
class TraitDeclarationHeaderTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.TraitDeclarationHeader;
        this.name = '';
    }
    push(transform) {
        if (transform.tokenType === php7parser_1.TokenType.Name) {
            this.name = transform.text;
        }
    }
}
class InterfaceBaseClauseTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.InterfaceBaseClause;
        this.symbols = [];
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.QualifiedNameList) {
            let transforms = transform.transforms;
            for (let n = 0; n < transforms.length; ++n) {
                this.symbols.push(symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Interface, transforms[n].name));
            }
        }
    }
}
class InterfaceDeclarationHeaderTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.InterfaceDeclarationHeader;
        this.name = '';
        this.extends = [];
    }
    push(transform) {
        if (transform.tokenType === php7parser_1.TokenType.Name) {
            this.name = transform.text;
        }
        else if (transform.phraseType === php7parser_1.PhraseType.InterfaceBaseClause) {
            this.extends = transform.symbols;
        }
    }
}
class TraitUseClauseTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.TraitUseClause;
        this.symbols = [];
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.QualifiedNameList) {
            let transforms = transform.transforms;
            for (let n = 0; n < transforms.length; ++n) {
                this.symbols.push(symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Trait, transforms[n].name));
            }
        }
    }
}
class ClassInterfaceClauseTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.ClassInterfaceClause;
        this.symbols = [];
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.QualifiedNameList) {
            let transforms = transform.transforms;
            for (let n = 0; n < transforms.length; ++n) {
                this.symbols.push(symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Interface, transforms[n].name));
            }
        }
    }
}
class NamespaceDefinitionTransform {
    constructor(location) {
        this.phraseType = php7parser_1.PhraseType.NamespaceDefinition;
        this._symbol = symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Namespace, '', location);
        this._children = new UniqueSymbolCollection();
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.NamespaceName) {
            this._symbol.name = transform.text;
        }
        else {
            let s = transform.symbol;
            if (s) {
                this._children.push(s);
                return;
            }
            let symbols = transform.symbols;
            if (symbols) {
                this._children.pushMany(symbols);
            }
        }
    }
    get symbol() {
        if (this._children.length > 0) {
            this._symbol.children = this._children.toArray();
        }
        return this._symbol;
    }
}
class ClassDeclarationTransform {
    constructor(nameResolver, location, doc, docLocation) {
        this.nameResolver = nameResolver;
        this.phraseType = php7parser_1.PhraseType.ClassDeclaration;
        this.symbol = symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Class, '', location);
        this.symbol.children = [];
        this.symbol.associated = [];
        SymbolReader.assignPhpDocInfoToSymbol(this.symbol, doc, docLocation, nameResolver);
    }
    push(transform) {
        if (transform instanceof ClassDeclarationHeaderTransform) {
            this.symbol.modifiers = transform.modifier;
            this.symbol.name = this.nameResolver.resolveRelative(transform.name);
            if (transform.extends) {
                this.symbol.associated.push(transform.extends);
            }
            Array.prototype.push.apply(this.symbol.associated, transform.implements);
        }
        else if (transform.phraseType === php7parser_1.PhraseType.ClassDeclarationBody) {
            Array.prototype.push.apply(this.symbol.children, symbol_1.PhpSymbol.setScope(transform.declarations, this.symbol.name));
            Array.prototype.push.apply(this.symbol.associated, transform.useTraits);
        }
    }
}
class ClassDeclarationHeaderTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.ClassDeclarationHeader;
        this.modifier = symbol_1.SymbolModifier.None;
        this.name = '';
        this.implements = [];
    }
    push(transform) {
        if (transform.tokenType === php7parser_1.TokenType.Abstract) {
            this.modifier = symbol_1.SymbolModifier.Abstract;
        }
        else if (transform.tokenType === php7parser_1.TokenType.Final) {
            this.modifier = symbol_1.SymbolModifier.Final;
        }
        else if (transform.tokenType === php7parser_1.TokenType.Name) {
            this.name = transform.text;
        }
        else if (transform.phraseType === php7parser_1.PhraseType.ClassBaseClause) {
            this.extends = transform.symbol;
        }
        else if (transform.phraseType === php7parser_1.PhraseType.ClassInterfaceClause) {
            this.implements = transform.symbols;
        }
    }
}
class ClassBaseClauseTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.ClassBaseClause;
        this.symbol = symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Class, '');
    }
    push(transform) {
        switch (transform.phraseType) {
            case php7parser_1.PhraseType.FullyQualifiedName:
            case php7parser_1.PhraseType.RelativeQualifiedName:
            case php7parser_1.PhraseType.QualifiedName:
                this.symbol.name = transform.name;
                break;
            default:
                break;
        }
    }
}
class MemberModifierListTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.MemberModifierList;
        this.modifiers = symbol_1.SymbolModifier.None;
    }
    push(transform) {
        switch (transform.tokenType) {
            case php7parser_1.TokenType.Public:
                this.modifiers |= symbol_1.SymbolModifier.Public;
                break;
            case php7parser_1.TokenType.Protected:
                this.modifiers |= symbol_1.SymbolModifier.Protected;
                break;
            case php7parser_1.TokenType.Private:
                this.modifiers |= symbol_1.SymbolModifier.Private;
                break;
            case php7parser_1.TokenType.Abstract:
                this.modifiers |= symbol_1.SymbolModifier.Abstract;
                break;
            case php7parser_1.TokenType.Final:
                this.modifiers |= symbol_1.SymbolModifier.Final;
                break;
            case php7parser_1.TokenType.Static:
                this.modifiers |= symbol_1.SymbolModifier.Static;
                break;
            default:
                break;
        }
    }
}
class ClassConstantElementTransform {
    constructor(nameResolver, location, doc, docLocation) {
        this.nameResolver = nameResolver;
        this.phraseType = php7parser_1.PhraseType.ClassConstElement;
        this.symbol = symbol_1.PhpSymbol.create(symbol_1.SymbolKind.ClassConstant, '', location);
        this.symbol.modifiers = symbol_1.SymbolModifier.Static;
        this._doc = doc;
        this._docLocation = docLocation;
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.Identifier) {
            this.symbol.name = transform.text;
            SymbolReader.assignPhpDocInfoToSymbol(this.symbol, this._doc, this._docLocation, this.nameResolver);
        }
        else {
            this.symbol.value = transform.text;
        }
    }
}
class MethodDeclarationTransform {
    constructor(nameResolver, location, doc, docLocation) {
        this.nameResolver = nameResolver;
        this.phraseType = php7parser_1.PhraseType.MethodDeclaration;
        this._symbol = symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Method, '', location);
        SymbolReader.assignPhpDocInfoToSymbol(this._symbol, doc, docLocation, nameResolver);
        this._children = new UniqueSymbolCollection();
    }
    push(transform) {
        if (transform instanceof MethodDeclarationHeaderTransform) {
            this._symbol.modifiers = transform.modifiers;
            this._symbol.name = transform.name;
            this._children.pushMany(transform.parameters);
            this._symbol.type = transform.returnType;
        }
        else if (transform.phraseType === php7parser_1.PhraseType.MethodDeclarationBody) {
            this._children.pushMany(transform.symbols);
        }
    }
    get symbol() {
        this._symbol.children = symbol_1.PhpSymbol.setScope(this._children.toArray(), this._symbol.name);
        return this._symbol;
    }
}
class ReturnTypeTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.ReturnType;
        this.type = '';
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.TypeDeclaration) {
            this.type = transform.type;
        }
    }
}
class TypeDeclarationTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.TypeDeclaration;
        this.type = '';
    }
    push(transform) {
        switch (transform.phraseType) {
            case php7parser_1.PhraseType.FullyQualifiedName:
            case php7parser_1.PhraseType.RelativeQualifiedName:
            case php7parser_1.PhraseType.QualifiedName:
                if (TypeDeclarationTransform._scalarTypes[transform.unresolved.toLowerCase()] === 1) {
                    this.type = transform.unresolved;
                }
                else {
                    this.type = transform.name;
                }
                break;
            case undefined:
                if (transform.tokenType === php7parser_1.TokenType.Callable || transform.tokenType === php7parser_1.TokenType.Array) {
                    this.type = transform.text;
                }
                break;
            default:
                break;
        }
    }
}
TypeDeclarationTransform._scalarTypes = { 'int': 1, 'string': 1, 'bool': 1, 'float': 1, 'iterable': 1 };
class IdentifierTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.Identifier;
        this.text = '';
    }
    push(transform) {
        this.text = transform.text;
    }
}
class MethodDeclarationHeaderTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.MethodDeclarationHeader;
        this.modifiers = symbol_1.SymbolModifier.Public;
        this.name = '';
        this.returnType = '';
        this.parameters = [];
    }
    push(transform) {
        switch (transform.phraseType) {
            case php7parser_1.PhraseType.MemberModifierList:
                this.modifiers = transform.modifiers;
                if (!(this.modifiers & (symbol_1.SymbolModifier.Public | symbol_1.SymbolModifier.Protected | symbol_1.SymbolModifier.Private))) {
                    this.modifiers |= symbol_1.SymbolModifier.Public;
                }
                break;
            case php7parser_1.PhraseType.Identifier:
                this.name = transform.text;
                break;
            case php7parser_1.PhraseType.ParameterDeclarationList:
                {
                    let transforms = transform.transforms;
                    for (let n = 0; n < transforms.length; ++n) {
                        this.parameters.push(transforms[n].symbol);
                    }
                }
                break;
            case php7parser_1.PhraseType.ReturnType:
                this.returnType = transform.type;
                break;
            default:
                break;
        }
    }
}
class PropertyInitialiserTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.PropertyInitialiser;
        this.text = '';
    }
    push(transform) {
        this.text = transform.text;
    }
}
class PropertyElementTransform {
    constructor(nameResolver, location, doc, docLocation) {
        this.nameResolver = nameResolver;
        this.phraseType = php7parser_1.PhraseType.PropertyElement;
        this.symbol = symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Property, '', location);
        this._doc = doc;
        this._docLocation = docLocation;
    }
    push(transform) {
        if (transform.tokenType === php7parser_1.TokenType.VariableName) {
            this.symbol.name = transform.text;
            SymbolReader.assignPhpDocInfoToSymbol(this.symbol, this._doc, this._docLocation, this.nameResolver);
        }
        else if (transform.phraseType === php7parser_1.PhraseType.PropertyInitialiser) {
            this.symbol.value = transform.text;
        }
    }
}
class FieldDeclarationTransform {
    constructor(phraseType) {
        this.phraseType = phraseType;
        this._modifier = symbol_1.SymbolModifier.Public;
        this.symbols = [];
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.MemberModifierList) {
            this._modifier = transform.modifiers;
        }
        else if (transform.phraseType === php7parser_1.PhraseType.PropertyElementList ||
            transform.phraseType === php7parser_1.PhraseType.ClassConstElementList) {
            let transforms = transform.transforms;
            let s;
            for (let n = 0; n < transforms.length; ++n) {
                s = transforms[n].symbol;
                if (s) {
                    s.modifiers |= this._modifier;
                    this.symbols.push(s);
                }
            }
        }
    }
}
class FunctionDeclarationTransform {
    constructor(nameResolver, location, phpDoc, phpDocLocation) {
        this.nameResolver = nameResolver;
        this.phraseType = php7parser_1.PhraseType.FunctionDeclaration;
        this._symbol = symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Function, '', location);
        SymbolReader.assignPhpDocInfoToSymbol(this._symbol, phpDoc, phpDocLocation, nameResolver);
        this._children = new UniqueSymbolCollection();
    }
    push(transform) {
        if (transform instanceof FunctionDeclarationHeaderTransform) {
            this._symbol.name = this.nameResolver.resolveRelative(transform.name);
            this._children.pushMany(transform.parameters);
            this._symbol.type = transform.returnType;
        }
        else if (transform.phraseType === php7parser_1.PhraseType.FunctionDeclarationBody) {
            this._children.pushMany(transform.symbols);
        }
    }
    get symbol() {
        this._symbol.children = symbol_1.PhpSymbol.setScope(this._children.toArray(), this._symbol.name);
        return this._symbol;
    }
}
class FunctionDeclarationHeaderTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.FunctionDeclarationHeader;
        this.name = '';
        this.returnType = '';
        this.parameters = [];
    }
    push(transform) {
        if (transform.tokenType === php7parser_1.TokenType.Name) {
            this.name = transform.text;
        }
        else if (transform.phraseType === php7parser_1.PhraseType.ParameterDeclarationList) {
            let transforms = transform.transforms;
            for (let n = 0; n < transforms.length; ++n) {
                this.parameters.push(transforms[n].symbol);
            }
        }
        else if (transform.phraseType === php7parser_1.PhraseType.ReturnType) {
            this.returnType = transform.type;
        }
    }
}
class DefaultNodeTransform {
    constructor(phraseType, text) {
        this.phraseType = phraseType;
        this.text = text;
    }
    push(transform) { }
}
(function (SymbolReader) {
    function assignPhpDocInfoToSymbol(s, doc, docLocation, nameResolver) {
        if (!doc) {
            return s;
        }
        let tag;
        switch (s.kind) {
            case symbol_1.SymbolKind.Property:
            case symbol_1.SymbolKind.ClassConstant:
                tag = doc.findVarTag(s.name);
                if (tag) {
                    s.doc = symbol_1.PhpSymbolDoc.create(tag.description, typeString_1.TypeString.nameResolve(tag.typeString, nameResolver));
                }
                break;
            case symbol_1.SymbolKind.Method:
            case symbol_1.SymbolKind.Function:
                tag = doc.returnTag;
                s.doc = symbol_1.PhpSymbolDoc.create(doc.text);
                if (tag) {
                    s.doc.type = typeString_1.TypeString.nameResolve(tag.typeString, nameResolver);
                }
                break;
            case symbol_1.SymbolKind.Parameter:
                tag = doc.findParamTag(s.name);
                if (tag) {
                    s.doc = symbol_1.PhpSymbolDoc.create(tag.description, typeString_1.TypeString.nameResolve(tag.typeString, nameResolver));
                }
                break;
            case symbol_1.SymbolKind.Class:
            case symbol_1.SymbolKind.Trait:
            case symbol_1.SymbolKind.Interface:
                s.doc = symbol_1.PhpSymbolDoc.create(doc.text);
                if (!s.children) {
                    s.children = [];
                }
                Array.prototype.push.apply(s.children, phpDocMembers(doc, docLocation, nameResolver));
                break;
            default:
                break;
        }
        return s;
    }
    SymbolReader.assignPhpDocInfoToSymbol = assignPhpDocInfoToSymbol;
    function phpDocMembers(phpDoc, phpDocLoc, nameResolver) {
        let magic = phpDoc.propertyTags;
        let symbols = [];
        for (let n = 0, l = magic.length; n < l; ++n) {
            symbols.push(propertyTagToSymbol(magic[n], phpDocLoc, nameResolver));
        }
        magic = phpDoc.methodTags;
        for (let n = 0, l = magic.length; n < l; ++n) {
            symbols.push(methodTagToSymbol(magic[n], phpDocLoc, nameResolver));
        }
        return symbols;
    }
    SymbolReader.phpDocMembers = phpDocMembers;
    function methodTagToSymbol(tag, phpDocLoc, nameResolver) {
        let s = symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Method, tag.name, phpDocLoc);
        s.modifiers = symbol_1.SymbolModifier.Magic | symbol_1.SymbolModifier.Public;
        s.doc = symbol_1.PhpSymbolDoc.create(tag.description, typeString_1.TypeString.nameResolve(tag.typeString, nameResolver));
        s.children = [];
        if (tag.isStatic) {
            s.modifiers |= symbol_1.SymbolModifier.Static;
        }
        if (!tag.parameters) {
            return s;
        }
        for (let n = 0, l = tag.parameters.length; n < l; ++n) {
            s.children.push(magicMethodParameterToSymbol(tag.parameters[n], phpDocLoc, nameResolver));
        }
        return s;
    }
    function magicMethodParameterToSymbol(p, phpDocLoc, nameResolver) {
        let s = symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Parameter, p.name, phpDocLoc);
        s.modifiers = symbol_1.SymbolModifier.Magic;
        s.doc = symbol_1.PhpSymbolDoc.create(undefined, typeString_1.TypeString.nameResolve(p.typeString, nameResolver));
        return s;
    }
    function propertyTagToSymbol(t, phpDocLoc, nameResolver) {
        let s = symbol_1.PhpSymbol.create(symbol_1.SymbolKind.Property, t.name, phpDocLoc);
        s.modifiers = magicPropertyModifier(t) | symbol_1.SymbolModifier.Magic | symbol_1.SymbolModifier.Public;
        s.doc = symbol_1.PhpSymbolDoc.create(t.description, typeString_1.TypeString.nameResolve(t.typeString, nameResolver));
        return s;
    }
    function magicPropertyModifier(t) {
        switch (t.tagName) {
            case '@property-read':
                return symbol_1.SymbolModifier.ReadOnly;
            case '@property-write':
                return symbol_1.SymbolModifier.WriteOnly;
            default:
                return symbol_1.SymbolModifier.None;
        }
    }
    function modifierListToSymbolModifier(phrase) {
        if (!phrase) {
            return 0;
        }
        let flag = symbol_1.SymbolModifier.None;
        let tokens = phrase.children || [];
        for (let n = 0, l = tokens.length; n < l; ++n) {
            flag |= modifierTokenToSymbolModifier(tokens[n]);
        }
        return flag;
    }
    SymbolReader.modifierListToSymbolModifier = modifierListToSymbolModifier;
    function modifierTokenToSymbolModifier(t) {
        switch (t.tokenType) {
            case php7parser_1.TokenType.Public:
                return symbol_1.SymbolModifier.Public;
            case php7parser_1.TokenType.Protected:
                return symbol_1.SymbolModifier.Protected;
            case php7parser_1.TokenType.Private:
                return symbol_1.SymbolModifier.Private;
            case php7parser_1.TokenType.Abstract:
                return symbol_1.SymbolModifier.Abstract;
            case php7parser_1.TokenType.Final:
                return symbol_1.SymbolModifier.Final;
            case php7parser_1.TokenType.Static:
                return symbol_1.SymbolModifier.Static;
            default:
                return symbol_1.SymbolModifier.None;
        }
    }
    SymbolReader.modifierTokenToSymbolModifier = modifierTokenToSymbolModifier;
})(SymbolReader = exports.SymbolReader || (exports.SymbolReader = {}));
class NamespaceUseClauseListTransform {
    constructor(phraseType) {
        this.phraseType = phraseType;
        this.symbols = [];
    }
    push(transform) {
        if (transform.phraseType === php7parser_1.PhraseType.NamespaceUseClause ||
            transform.phraseType === php7parser_1.PhraseType.NamespaceUseGroupClause) {
            this.symbols.push(transform.symbol);
        }
    }
}
class NamespaceUseDeclarationTransform {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.NamespaceUseDeclaration;
        this._kind = symbol_1.SymbolKind.Class;
        this._prefix = '';
        this.symbols = [];
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
            this.symbols = transform.symbols;
            let s;
            let prefix = this._prefix ? this._prefix + '\\' : '';
            for (let n = 0; n < this.symbols.length; ++n) {
                s = this.symbols[n];
                s.associated[0].name = prefix + s.associated[0].name;
                if (!s.kind) {
                    s.kind = s.associated[0].kind = this._kind;
                }
            }
        }
        else if (transform.phraseType === php7parser_1.PhraseType.NamespaceUseClauseList) {
            this.symbols = transform.symbols;
            let s;
            for (let n = 0; n < this.symbols.length; ++n) {
                s = this.symbols[n];
                s.kind = s.associated[0].kind = this._kind;
            }
        }
    }
}
class NamespaceUseClauseTransform {
    constructor(phraseType, location) {
        this.phraseType = phraseType;
        this.symbol = symbol_1.PhpSymbol.create(0, '', location);
        this.symbol.modifiers = symbol_1.SymbolModifier.Use;
        this.symbol.associated = [];
    }
    push(transform) {
        if (transform.tokenType === php7parser_1.TokenType.Function) {
            this.symbol.kind = symbol_1.SymbolKind.Function;
        }
        else if (transform.tokenType === php7parser_1.TokenType.Const) {
            this.symbol.kind = symbol_1.SymbolKind.Constant;
        }
        else if (transform.phraseType === php7parser_1.PhraseType.NamespaceName) {
            let text = transform.text;
            this.symbol.name = symbol_1.PhpSymbol.notFqn(text);
            this.symbol.associated.push(symbol_1.PhpSymbol.create(this.symbol.kind, text));
        }
        else if (transform.phraseType === php7parser_1.PhraseType.NamespaceAliasingClause) {
            this.symbol.name = transform.text;
            this.symbol.location = transform.location;
        }
    }
}
class NamespaceAliasingClause {
    constructor() {
        this.phraseType = php7parser_1.PhraseType.NamespaceAliasingClause;
        this.text = '';
    }
    push(transform) {
        if (transform.tokenType === php7parser_1.TokenType.Name) {
            this.text = transform.text;
            this.location = transform.location;
        }
    }
}
