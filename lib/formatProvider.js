'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const lsp = require("vscode-languageserver-types");
const php7parser_1 = require("php7parser");
const parsedDocument_1 = require("./parsedDocument");
class FormatProvider {
    constructor(docStore) {
        this.docStore = docStore;
    }
    provideDocumentFormattingEdits(doc, formatOptions) {
        let parsedDoc = this.docStore.find(doc.uri);
        if (!parsedDoc) {
            return [];
        }
        let visitor = new FormatVisitor(parsedDoc, formatOptions);
        parsedDoc.traverse(visitor);
        let edits = visitor.edits;
        let text = parsedDoc.text;
        if (visitor.firstToken &&
            visitor.firstToken.tokenType === php7parser_1.TokenType.OpenTag &&
            visitor.OpenTagCount === 1) {
            let closeTagIndex = visitor.last3Tokens.findIndex(this._isCloseTag);
            let endEdit;
            let lastToken = visitor.last3Tokens.length ? visitor.last3Tokens[visitor.last3Tokens.length - 1] : undefined;
            let lastTokenText = parsedDoc.tokenText(lastToken);
            if (closeTagIndex < 0) {
                if (lastToken && lastToken.tokenType === php7parser_1.TokenType.Whitespace && lastTokenText.search(FormatProvider.blkLinePattern) < 0) {
                    endEdit = lsp.TextEdit.replace(parsedDoc.tokenRange(lastToken), '\n\n');
                }
                else if (lastToken && lastToken.tokenType !== php7parser_1.TokenType.Whitespace) {
                    endEdit = lsp.TextEdit.insert(parsedDoc.tokenRange(lastToken).end, '\n\n');
                }
            }
            else if (closeTagIndex > 0 && (lastToken.tokenType === php7parser_1.TokenType.CloseTag || (lastToken.tokenType === php7parser_1.TokenType.Text && !lastTokenText.trim()))) {
                let tokenBeforeClose = visitor.last3Tokens[closeTagIndex - 1];
                let replaceStart;
                if (tokenBeforeClose.tokenType === php7parser_1.TokenType.Whitespace) {
                    replaceStart = parsedDoc.tokenRange(tokenBeforeClose).start;
                }
                else {
                    replaceStart = parsedDoc.tokenRange(visitor.last3Tokens[closeTagIndex]).start;
                }
                endEdit = lsp.TextEdit.replace({ start: replaceStart, end: parsedDoc.tokenRange(lastToken).end }, '\n\n');
                if (edits.length) {
                    let lastEdit = edits[edits.length - 1];
                    if (lastEdit.range.end.line > endEdit.range.start.line ||
                        (lastEdit.range.end.line === endEdit.range.start.line && lastEdit.range.end.character > endEdit.range.start.character)) {
                        edits.shift();
                    }
                }
            }
            if (endEdit) {
                edits.unshift(endEdit);
            }
        }
        return edits;
    }
    provideDocumentRangeFormattingEdits(doc, range, formatOptions) {
        let parsedDoc = this.docStore.find(doc.uri);
        if (!parsedDoc) {
            return [];
        }
        let visitor = new FormatVisitor(parsedDoc, formatOptions, range);
        parsedDoc.traverse(visitor);
        return visitor.edits;
    }
    _isCloseTag(t) {
        return t.tokenType === php7parser_1.TokenType.CloseTag;
    }
}
FormatProvider.blkLinePattern = /^(\r\n|\r|\n){2}$/;
exports.FormatProvider = FormatProvider;
class FormatVisitor {
    constructor(doc, formatOptions, range) {
        this.doc = doc;
        this.formatOptions = formatOptions;
        this._indentText = '';
        this._startOffset = -1;
        this._endOffset = -1;
        this._active = true;
        this._lastParameterListWasMultiLine = false;
        this.OpenTagCount = 0;
        this._edits = [];
        this._isMultilineCommaDelimitedListStack = [];
        this._indentUnit = formatOptions.insertSpaces ? FormatVisitor.createWhitespace(formatOptions.tabSize, ' ') : '\t';
        if (range) {
            this._startOffset = this.doc.offsetAtPosition(range.start);
            this._endOffset = this.doc.offsetAtPosition(range.end);
            this._active = false;
        }
        this.last3Tokens = [];
        this._decrementOnTheseNodes = [];
    }
    get edits() {
        return this._edits.reverse();
    }
    preorder(node, spine) {
        let parent = spine.length ? spine[spine.length - 1] : { phraseType: php7parser_1.PhraseType.Unknown, children: [] };
        switch (node.phraseType) {
            case php7parser_1.PhraseType.FunctionDeclarationBody:
                if (parent.phraseType === php7parser_1.PhraseType.AnonymousFunctionCreationExpression || this._lastParameterListWasMultiLine) {
                    this._nextFormatRule = FormatVisitor.singleSpaceBefore;
                    this._lastParameterListWasMultiLine = false;
                }
                else {
                    this._nextFormatRule = FormatVisitor.newlineIndentBefore;
                }
                return true;
            case php7parser_1.PhraseType.MethodDeclarationBody:
                if (this._lastParameterListWasMultiLine) {
                    this._nextFormatRule = FormatVisitor.singleSpaceBefore;
                    this._lastParameterListWasMultiLine = false;
                }
                else {
                    this._nextFormatRule = FormatVisitor.newlineIndentBefore;
                }
                return true;
            case php7parser_1.PhraseType.ClassDeclarationBody:
            case php7parser_1.PhraseType.TraitDeclarationBody:
            case php7parser_1.PhraseType.InterfaceDeclarationBody:
                this._nextFormatRule = FormatVisitor.newlineIndentBefore;
                return true;
            case php7parser_1.PhraseType.ParameterDeclarationList:
            case php7parser_1.PhraseType.ArgumentExpressionList:
            case php7parser_1.PhraseType.ClosureUseList:
            case php7parser_1.PhraseType.ArrayInitialiserList:
            case php7parser_1.PhraseType.QualifiedNameList:
                if ((this._previousToken &&
                    this._previousToken.tokenType === php7parser_1.TokenType.Whitespace &&
                    FormatVisitor.countNewlines(this.doc.tokenText(this._previousToken)) > 0) ||
                    this._hasNewlineWhitespaceChild(node)) {
                    this._nextFormatRule = FormatVisitor.newlineIndentBefore;
                    this._isMultilineCommaDelimitedListStack.push(true);
                    this._incrementIndent();
                }
                else {
                    this._isMultilineCommaDelimitedListStack.push(false);
                    if (node.phraseType !== php7parser_1.PhraseType.QualifiedNameList) {
                        this._nextFormatRule = FormatVisitor.noSpaceBefore;
                    }
                }
                return true;
            case php7parser_1.PhraseType.ConstElementList:
            case php7parser_1.PhraseType.ClassConstElementList:
            case php7parser_1.PhraseType.PropertyElementList:
            case php7parser_1.PhraseType.StaticVariableDeclarationList:
            case php7parser_1.PhraseType.VariableNameList:
                if ((this._previousToken &&
                    this._previousToken.tokenType === php7parser_1.TokenType.Whitespace &&
                    FormatVisitor.countNewlines(this.doc.tokenText(this._previousToken)) > 0) ||
                    this._hasNewlineWhitespaceChild(node)) {
                    this._isMultilineCommaDelimitedListStack.push(true);
                    this._incrementIndent();
                }
                else {
                    this._isMultilineCommaDelimitedListStack.push(false);
                }
                this._nextFormatRule = FormatVisitor.singleSpaceOrNewlineIndentBefore;
                return true;
            case php7parser_1.PhraseType.EncapsulatedVariableList:
                this._nextFormatRule = FormatVisitor.noSpaceBefore;
                return true;
            case php7parser_1.PhraseType.SimpleVariable:
                if (parent.phraseType === php7parser_1.PhraseType.EncapsulatedVariableList) {
                    this._nextFormatRule = FormatVisitor.noSpaceBefore;
                }
                return true;
            case undefined:
                break;
            default:
                if (parent.phraseType === php7parser_1.PhraseType.EncapsulatedVariableList) {
                    this._nextFormatRule = FormatVisitor.noSpaceBefore;
                }
                return true;
        }
        let rule = this._nextFormatRule;
        let previous = this._previousToken;
        let previousNonWsToken = this._previousNonWsToken;
        this._previousToken = node;
        if (this._previousToken.tokenType !== php7parser_1.TokenType.Whitespace) {
            this._previousNonWsToken = this._previousToken;
        }
        if (!this.firstToken) {
            this.firstToken = this._previousToken;
        }
        this.last3Tokens.push(this._previousToken);
        if (this.last3Tokens.length > 3) {
            this.last3Tokens.shift();
        }
        if (this._previousToken.tokenType === php7parser_1.TokenType.OpenTag || this._previousToken.tokenType === php7parser_1.TokenType.OpenTagEcho) {
            this.OpenTagCount++;
        }
        this._nextFormatRule = null;
        if (!this._active && this._startOffset > -1 && parsedDocument_1.ParsedDocument.isOffsetInToken(this._startOffset, node)) {
            this._active = true;
        }
        if (!previous) {
            return false;
        }
        switch (node.tokenType) {
            case php7parser_1.TokenType.Whitespace:
                this._nextFormatRule = rule;
                return false;
            case php7parser_1.TokenType.Comment:
                return false;
            case php7parser_1.TokenType.DocumentComment:
                rule = FormatVisitor.newlineIndentBefore;
                break;
            case php7parser_1.TokenType.PlusPlus:
                if (parent.phraseType === php7parser_1.PhraseType.PostfixIncrementExpression) {
                    rule = FormatVisitor.noSpaceBefore;
                }
                break;
            case php7parser_1.TokenType.MinusMinus:
                if (parent.phraseType === php7parser_1.PhraseType.PostfixDecrementExpression) {
                    rule = FormatVisitor.noSpaceBefore;
                }
                break;
            case php7parser_1.TokenType.Backslash:
                if (parent.phraseType === php7parser_1.PhraseType.NamespaceName) {
                    rule = FormatVisitor.noSpaceBefore;
                }
                break;
            case php7parser_1.TokenType.VariableName:
                if (previousNonWsToken.tokenType === php7parser_1.TokenType.Dollar) {
                    rule = FormatVisitor.noSpaceBefore;
                }
                break;
            case php7parser_1.TokenType.Semicolon:
            case php7parser_1.TokenType.Comma:
            case php7parser_1.TokenType.Text:
            case php7parser_1.TokenType.EncapsulatedAndWhitespace:
            case php7parser_1.TokenType.DollarCurlyOpen:
            case php7parser_1.TokenType.CurlyOpen:
                rule = FormatVisitor.noSpaceBefore;
                break;
            case php7parser_1.TokenType.OpenBrace:
                if (previousNonWsToken && previousNonWsToken.tokenType === php7parser_1.TokenType.Dollar) {
                    rule = FormatVisitor.noSpaceBefore;
                }
                else if (!rule) {
                    rule = FormatVisitor.singleSpaceBefore;
                }
                break;
            case php7parser_1.TokenType.Colon:
                if (parent.phraseType === php7parser_1.PhraseType.CaseStatement || parent.phraseType === php7parser_1.PhraseType.DefaultStatement) {
                    rule = FormatVisitor.noSpaceBefore;
                }
                break;
            case php7parser_1.TokenType.OpenTag:
            case php7parser_1.TokenType.OpenTagEcho:
                rule = FormatVisitor.noSpaceBefore;
                this._indentText = FormatVisitor.createWhitespace(Math.ceil((this.doc.lineSubstring(node.offset).length - 1) / this._indentUnit.length), this._indentUnit);
                break;
            case php7parser_1.TokenType.Else:
            case php7parser_1.TokenType.ElseIf:
                if (previousNonWsToken && previousNonWsToken.tokenType === php7parser_1.TokenType.CloseBrace) {
                    rule = FormatVisitor.singleSpaceBefore;
                }
                break;
            case php7parser_1.TokenType.Name:
                if (parent.phraseType === php7parser_1.PhraseType.PropertyAccessExpression || previousNonWsToken.tokenType === php7parser_1.TokenType.Backslash) {
                    rule = FormatVisitor.noSpaceBefore;
                }
                break;
            case php7parser_1.TokenType.While:
                if (parent.phraseType === php7parser_1.PhraseType.DoStatement) {
                    rule = FormatVisitor.singleSpaceBefore;
                }
                break;
            case php7parser_1.TokenType.Catch:
                rule = FormatVisitor.singleSpaceBefore;
                break;
            case php7parser_1.TokenType.Arrow:
            case php7parser_1.TokenType.ColonColon:
                if (previous && previous.tokenType === php7parser_1.TokenType.Whitespace && FormatVisitor.countNewlines(this.doc.tokenText(previous)) > 0) {
                    let outerExpr = parent;
                    for (let n = spine.length - 2; n >= 0; --n) {
                        if (parsedDocument_1.ParsedDocument.isPhrase(spine[n], FormatVisitor.memberAccessExprTypes)) {
                            outerExpr = spine[n];
                        }
                        else {
                            break;
                        }
                    }
                    if (!this._decrementOnTheseNodes.find((x) => { return x === outerExpr; })) {
                        this._decrementOnTheseNodes.push(outerExpr);
                        this._incrementIndent();
                    }
                }
                rule = FormatVisitor.noSpaceOrNewlineIndentBefore;
                break;
            case php7parser_1.TokenType.OpenParenthesis:
                if (this._shouldOpenParenthesisHaveNoSpaceBefore(parent, previousNonWsToken)) {
                    rule = FormatVisitor.noSpaceBefore;
                }
                else if (!rule) {
                    rule = FormatVisitor.singleSpaceBefore;
                }
                break;
            case php7parser_1.TokenType.OpenBracket:
                if (parent.phraseType === php7parser_1.PhraseType.SubscriptExpression) {
                    rule = FormatVisitor.noSpaceBefore;
                }
                break;
            case php7parser_1.TokenType.CloseBrace:
                this._decrementIndent();
                if (parent.phraseType === php7parser_1.PhraseType.SubscriptExpression ||
                    parent.phraseType === php7parser_1.PhraseType.EncapsulatedExpression ||
                    parent.phraseType === php7parser_1.PhraseType.EncapsulatedVariable) {
                    rule = FormatVisitor.noSpaceBefore;
                }
                else {
                    rule = FormatVisitor.newlineIndentBefore;
                }
                break;
            case php7parser_1.TokenType.CloseBracket:
            case php7parser_1.TokenType.CloseParenthesis:
                if (!rule) {
                    rule = FormatVisitor.noSpaceBefore;
                }
                break;
            case php7parser_1.TokenType.CloseTag:
                if (previous.tokenType === php7parser_1.TokenType.Comment && this.doc.tokenText(previous).slice(0, 2) !== '/*') {
                    rule = FormatVisitor.noSpaceBefore;
                }
                else if (rule !== FormatVisitor.indentOrNewLineIndentBefore) {
                    rule = FormatVisitor.singleSpaceOrNewlineIndentBefore;
                }
                break;
            default:
                break;
        }
        if (!rule) {
            rule = FormatVisitor.singleSpaceOrNewlineIndentPlusOneBefore;
        }
        if (!this._active) {
            return false;
        }
        let edit = rule(previous, this.doc, this._indentText, this._indentUnit);
        if (edit) {
            this._edits.push(edit);
        }
        if (this._isKeyword(node)) {
            let text = this.doc.tokenText(node);
            let lcText = text.toLowerCase();
            if (text !== lcText) {
                this._edits.push(lsp.TextEdit.replace(this.doc.tokenRange(node), lcText));
            }
        }
        else if (this._isTrueFalseNull(node, spine)) {
            let text = this.doc.tokenText(node);
            let lcText = text.toLowerCase();
            if (text !== lcText) {
                this._edits.push(lsp.TextEdit.replace(this.doc.tokenRange(node), lcText));
            }
        }
        return false;
    }
    postorder(node, spine) {
        let parent = spine[spine.length - 1];
        let decrementOnNode = this._decrementOnTheseNodes.length ? this._decrementOnTheseNodes[this._decrementOnTheseNodes.length - 1] : undefined;
        if (decrementOnNode === node) {
            this._decrementIndent();
            this._decrementOnTheseNodes.pop();
        }
        switch (node.phraseType) {
            case php7parser_1.PhraseType.CaseStatement:
            case php7parser_1.PhraseType.DefaultStatement:
                this._decrementIndent();
                return;
            case php7parser_1.PhraseType.NamespaceDefinition:
                this._nextFormatRule = FormatVisitor.doubleNewlineIndentBefore;
                return;
            case php7parser_1.PhraseType.NamespaceUseDeclaration:
                if (this._isLastNamespaceUseDeclaration(parent, node)) {
                    this._nextFormatRule = FormatVisitor.doubleNewlineIndentBefore;
                }
                return;
            case php7parser_1.PhraseType.ParameterDeclarationList:
            case php7parser_1.PhraseType.ArgumentExpressionList:
            case php7parser_1.PhraseType.ClosureUseList:
            case php7parser_1.PhraseType.QualifiedNameList:
            case php7parser_1.PhraseType.ArrayInitialiserList:
                if (this._isMultilineCommaDelimitedListStack.pop()) {
                    this._nextFormatRule = FormatVisitor.newlineIndentBefore;
                    this._decrementIndent();
                    if (node.phraseType === php7parser_1.PhraseType.ParameterDeclarationList) {
                        this._lastParameterListWasMultiLine = true;
                    }
                }
                return;
            case php7parser_1.PhraseType.ConstElementList:
            case php7parser_1.PhraseType.PropertyElementList:
            case php7parser_1.PhraseType.ClassConstElementList:
            case php7parser_1.PhraseType.StaticVariableDeclarationList:
            case php7parser_1.PhraseType.VariableNameList:
                if (this._isMultilineCommaDelimitedListStack.pop()) {
                    this._decrementIndent();
                }
                return;
            case php7parser_1.PhraseType.EncapsulatedVariableList:
                this._nextFormatRule = FormatVisitor.noSpaceBefore;
                return;
            case php7parser_1.PhraseType.AnonymousFunctionCreationExpression:
                this._nextFormatRule = null;
                break;
            case undefined:
                break;
            default:
                return;
        }
        switch (node.tokenType) {
            case php7parser_1.TokenType.Comment:
                if (this.doc.tokenText(node).slice(0, 2) === '/*') {
                    this._nextFormatRule = FormatVisitor.singleSpaceOrNewlineIndentBefore;
                    if (this._active) {
                        let edit = this._formatDocBlock(node);
                        if (edit) {
                            this._edits.push(edit);
                        }
                    }
                }
                else {
                    this._nextFormatRule = FormatVisitor.indentOrNewLineIndentBefore;
                }
                break;
            case php7parser_1.TokenType.DocumentComment:
                this._nextFormatRule = FormatVisitor.newlineIndentBefore;
                if (!this._active) {
                    break;
                }
                let edit = this._formatDocBlock(node);
                if (edit) {
                    this._edits.push(edit);
                }
                break;
            case php7parser_1.TokenType.OpenBrace:
                if (parent.phraseType === php7parser_1.PhraseType.EncapsulatedExpression) {
                    this._nextFormatRule = FormatVisitor.noSpaceBefore;
                }
                else {
                    this._nextFormatRule = FormatVisitor.newlineIndentBefore;
                }
                this._incrementIndent();
                break;
            case php7parser_1.TokenType.CloseBrace:
                if (parent.phraseType !== php7parser_1.PhraseType.EncapsulatedVariable &&
                    parent.phraseType !== php7parser_1.PhraseType.EncapsulatedExpression &&
                    parent.phraseType !== php7parser_1.PhraseType.SubscriptExpression) {
                    this._nextFormatRule = FormatVisitor.newlineIndentBefore;
                }
                break;
            case php7parser_1.TokenType.Semicolon:
                if (parent.phraseType === php7parser_1.PhraseType.ForStatement) {
                    this._nextFormatRule = FormatVisitor.singleSpaceBefore;
                }
                else {
                    this._nextFormatRule = FormatVisitor.newlineIndentBefore;
                }
                break;
            case php7parser_1.TokenType.Colon:
                if (this._shouldIndentAfterColon(spine[spine.length - 1])) {
                    this._incrementIndent();
                    this._nextFormatRule = FormatVisitor.newlineIndentBefore;
                }
                break;
            case php7parser_1.TokenType.Ampersand:
                if (parent.phraseType !== php7parser_1.PhraseType.BitwiseExpression) {
                    this._nextFormatRule = FormatVisitor.noSpaceBefore;
                }
                break;
            case php7parser_1.TokenType.Plus:
            case php7parser_1.TokenType.Minus:
                if (parent.phraseType === php7parser_1.PhraseType.UnaryOpExpression) {
                    this._nextFormatRule = FormatVisitor.noSpaceBefore;
                }
                break;
            case php7parser_1.TokenType.PlusPlus:
                if (parent.phraseType === php7parser_1.PhraseType.PrefixIncrementExpression) {
                    this._nextFormatRule = FormatVisitor.noSpaceBefore;
                }
                break;
            case php7parser_1.TokenType.MinusMinus:
                if (parent.phraseType === php7parser_1.PhraseType.PrefixDecrementExpression) {
                    this._nextFormatRule = FormatVisitor.noSpaceBefore;
                }
                break;
            case php7parser_1.TokenType.Ellipsis:
            case php7parser_1.TokenType.Exclamation:
            case php7parser_1.TokenType.AtSymbol:
            case php7parser_1.TokenType.ArrayCast:
            case php7parser_1.TokenType.BooleanCast:
            case php7parser_1.TokenType.FloatCast:
            case php7parser_1.TokenType.IntegerCast:
            case php7parser_1.TokenType.ObjectCast:
            case php7parser_1.TokenType.StringCast:
            case php7parser_1.TokenType.UnsetCast:
            case php7parser_1.TokenType.Tilde:
            case php7parser_1.TokenType.Backslash:
            case php7parser_1.TokenType.OpenParenthesis:
            case php7parser_1.TokenType.OpenBracket:
                this._nextFormatRule = FormatVisitor.noSpaceBefore;
                break;
            case php7parser_1.TokenType.CurlyOpen:
            case php7parser_1.TokenType.DollarCurlyOpen:
                this._incrementIndent();
                this._nextFormatRule = FormatVisitor.noSpaceBefore;
                break;
            case php7parser_1.TokenType.Comma:
                if (parent.phraseType === php7parser_1.PhraseType.ArrayInitialiserList ||
                    parent.phraseType === php7parser_1.PhraseType.ConstElementList ||
                    parent.phraseType === php7parser_1.PhraseType.ClassConstElementList ||
                    parent.phraseType === php7parser_1.PhraseType.PropertyElementList ||
                    parent.phraseType === php7parser_1.PhraseType.StaticVariableDeclarationList ||
                    parent.phraseType === php7parser_1.PhraseType.VariableNameList) {
                    this._nextFormatRule = FormatVisitor.singleSpaceOrNewlineIndentBefore;
                }
                else if (this._isMultilineCommaDelimitedListStack.length > 0 &&
                    this._isMultilineCommaDelimitedListStack[this._isMultilineCommaDelimitedListStack.length - 1]) {
                    this._nextFormatRule = FormatVisitor.newlineIndentBefore;
                }
                break;
            case php7parser_1.TokenType.Arrow:
            case php7parser_1.TokenType.ColonColon:
                this._nextFormatRule = FormatVisitor.noSpaceBefore;
                break;
            case php7parser_1.TokenType.OpenTag:
                let tagText = this.doc.tokenText(node);
                if (tagText.length > 2) {
                    if (FormatVisitor.countNewlines(tagText) > 0) {
                        this._nextFormatRule = FormatVisitor.indentOrNewLineIndentBefore;
                    }
                    else {
                        this._nextFormatRule = FormatVisitor.noSpaceOrNewlineIndentBefore;
                    }
                    break;
                }
            case php7parser_1.TokenType.OpenTagEcho:
                this._nextFormatRule = FormatVisitor.singleSpaceOrNewlineIndentBefore;
                break;
            default:
                break;
        }
        if (this._active && this._endOffset > -1 && parsedDocument_1.ParsedDocument.isOffsetInToken(this._endOffset, node)) {
            this.haltTraverse = true;
            this._active = false;
        }
    }
    _isTrueFalseNull(node, spine) {
        let parent = spine.length ? spine[spine.length - 1] : undefined;
        let greatGrandParent = spine.length > 2 ? spine[spine.length - 3] : undefined;
        const keywords = ['true', 'false', 'null'];
        return parsedDocument_1.ParsedDocument.isToken(node, [php7parser_1.TokenType.Name]) &&
            parsedDocument_1.ParsedDocument.isPhrase(parent, [php7parser_1.PhraseType.NamespaceName]) &&
            parent.children.length === 1 &&
            parsedDocument_1.ParsedDocument.isPhrase(greatGrandParent, [php7parser_1.PhraseType.ConstantAccessExpression]) &&
            keywords.indexOf(this.doc.tokenText(node).toLowerCase()) > -1;
    }
    _formatDocBlock(node) {
        let text = this.doc.tokenText(node);
        let formatted = text.replace(FormatVisitor._docBlockRegex, '\n' + this._indentText + ' *');
        return formatted !== text ? lsp.TextEdit.replace(this.doc.tokenRange(node), formatted) : null;
    }
    _incrementIndent() {
        this._indentText += this._indentUnit;
    }
    _decrementIndent() {
        this._indentText = this._indentText.slice(0, -this._indentUnit.length);
    }
    _hasNewlineWhitespaceChild(phrase) {
        for (let n = 0, l = phrase.children.length; n < l; ++n) {
            if (phrase.children[n].tokenType === php7parser_1.TokenType.Whitespace &&
                FormatVisitor.countNewlines(this.doc.tokenText(phrase.children[n])) > 0) {
                return true;
            }
        }
        return false;
    }
    _isLastNamespaceUseDeclaration(parent, child) {
        let i = parent.children.indexOf(child);
        while (i < parent.children.length) {
            ++i;
            child = parent.children[i];
            if (child.phraseType) {
                return child.phraseType !== php7parser_1.PhraseType.NamespaceUseDeclaration;
            }
        }
        return true;
    }
    _shouldIndentAfterColon(parent) {
        switch (parent.phraseType) {
            case php7parser_1.PhraseType.CaseStatement:
            case php7parser_1.PhraseType.DefaultStatement:
                return true;
            default:
                return false;
        }
    }
    _shouldOpenParenthesisHaveNoSpaceBefore(parent, lastNonWsToken) {
        switch (parent.phraseType) {
            case php7parser_1.PhraseType.FunctionCallExpression:
            case php7parser_1.PhraseType.MethodCallExpression:
            case php7parser_1.PhraseType.ScopedCallExpression:
            case php7parser_1.PhraseType.EchoIntrinsic:
            case php7parser_1.PhraseType.EmptyIntrinsic:
            case php7parser_1.PhraseType.EvalIntrinsic:
            case php7parser_1.PhraseType.ExitIntrinsic:
            case php7parser_1.PhraseType.IssetIntrinsic:
            case php7parser_1.PhraseType.ListIntrinsic:
            case php7parser_1.PhraseType.PrintIntrinsic:
            case php7parser_1.PhraseType.UnsetIntrinsic:
            case php7parser_1.PhraseType.ArrayCreationExpression:
            case php7parser_1.PhraseType.FunctionDeclarationHeader:
            case php7parser_1.PhraseType.MethodDeclarationHeader:
            case php7parser_1.PhraseType.ObjectCreationExpression:
            case php7parser_1.PhraseType.RequireExpression:
            case php7parser_1.PhraseType.RequireOnceExpression:
            case php7parser_1.PhraseType.IncludeExpression:
            case php7parser_1.PhraseType.IncludeOnceExpression:
                return true;
            default:
                if (!lastNonWsToken) {
                    return false;
                }
                break;
        }
        switch (lastNonWsToken.tokenType) {
            case php7parser_1.TokenType.Require:
            case php7parser_1.TokenType.RequireOnce:
            case php7parser_1.TokenType.Include:
            case php7parser_1.TokenType.IncludeOnce:
            case php7parser_1.TokenType.Isset:
            case php7parser_1.TokenType.List:
            case php7parser_1.TokenType.Print:
            case php7parser_1.TokenType.Unset:
            case php7parser_1.TokenType.Eval:
            case php7parser_1.TokenType.Exit:
            case php7parser_1.TokenType.Empty:
                return true;
            default:
                return false;
        }
    }
    _hasColonChild(phrase) {
        for (let n = 0, l = phrase.children.length; n < l; ++n) {
            if (phrase.children[n].tokenType === php7parser_1.TokenType.Colon) {
                return true;
            }
        }
        return false;
    }
    _isKeyword(t) {
        if (!t) {
            return false;
        }
        switch (t.tokenType) {
            case php7parser_1.TokenType.Abstract:
            case php7parser_1.TokenType.Array:
            case php7parser_1.TokenType.As:
            case php7parser_1.TokenType.Break:
            case php7parser_1.TokenType.Callable:
            case php7parser_1.TokenType.Case:
            case php7parser_1.TokenType.Catch:
            case php7parser_1.TokenType.Class:
            case php7parser_1.TokenType.ClassConstant:
            case php7parser_1.TokenType.Clone:
            case php7parser_1.TokenType.Const:
            case php7parser_1.TokenType.Continue:
            case php7parser_1.TokenType.Declare:
            case php7parser_1.TokenType.Default:
            case php7parser_1.TokenType.Do:
            case php7parser_1.TokenType.Echo:
            case php7parser_1.TokenType.Else:
            case php7parser_1.TokenType.ElseIf:
            case php7parser_1.TokenType.Empty:
            case php7parser_1.TokenType.EndDeclare:
            case php7parser_1.TokenType.EndFor:
            case php7parser_1.TokenType.EndForeach:
            case php7parser_1.TokenType.EndIf:
            case php7parser_1.TokenType.EndSwitch:
            case php7parser_1.TokenType.EndWhile:
            case php7parser_1.TokenType.Eval:
            case php7parser_1.TokenType.Exit:
            case php7parser_1.TokenType.Extends:
            case php7parser_1.TokenType.Final:
            case php7parser_1.TokenType.Finally:
            case php7parser_1.TokenType.For:
            case php7parser_1.TokenType.ForEach:
            case php7parser_1.TokenType.Function:
            case php7parser_1.TokenType.Global:
            case php7parser_1.TokenType.Goto:
            case php7parser_1.TokenType.HaltCompiler:
            case php7parser_1.TokenType.If:
            case php7parser_1.TokenType.Implements:
            case php7parser_1.TokenType.Include:
            case php7parser_1.TokenType.IncludeOnce:
            case php7parser_1.TokenType.InstanceOf:
            case php7parser_1.TokenType.InsteadOf:
            case php7parser_1.TokenType.Interface:
            case php7parser_1.TokenType.Isset:
            case php7parser_1.TokenType.List:
            case php7parser_1.TokenType.And:
            case php7parser_1.TokenType.Or:
            case php7parser_1.TokenType.Xor:
            case php7parser_1.TokenType.Namespace:
            case php7parser_1.TokenType.New:
            case php7parser_1.TokenType.Print:
            case php7parser_1.TokenType.Private:
            case php7parser_1.TokenType.Public:
            case php7parser_1.TokenType.Protected:
            case php7parser_1.TokenType.Require:
            case php7parser_1.TokenType.RequireOnce:
            case php7parser_1.TokenType.Return:
            case php7parser_1.TokenType.Static:
            case php7parser_1.TokenType.Switch:
            case php7parser_1.TokenType.Throw:
            case php7parser_1.TokenType.Trait:
            case php7parser_1.TokenType.Try:
            case php7parser_1.TokenType.Unset:
            case php7parser_1.TokenType.Use:
            case php7parser_1.TokenType.Var:
            case php7parser_1.TokenType.While:
            case php7parser_1.TokenType.Yield:
            case php7parser_1.TokenType.YieldFrom:
                return true;
            default:
                return false;
        }
    }
}
FormatVisitor._docBlockRegex = /(?:\r\n|\r|\n)[ \t]*\*/g;
FormatVisitor.memberAccessExprTypes = [
    php7parser_1.PhraseType.MethodCallExpression, php7parser_1.PhraseType.PropertyAccessExpression,
    php7parser_1.PhraseType.ScopedCallExpression, php7parser_1.PhraseType.ClassConstantAccessExpression, php7parser_1.PhraseType.ScopedPropertyAccessExpression
];
(function (FormatVisitor) {
    function singleSpaceBefore(previous, doc, indentText, indentUnit) {
        if (previous.tokenType !== php7parser_1.TokenType.Whitespace) {
            return lsp.TextEdit.insert(doc.positionAtOffset(previous.offset + previous.length), ' ');
        }
        let actualWs = doc.tokenText(previous);
        let expectedWs = ' ';
        if (actualWs === expectedWs) {
            return null;
        }
        return lsp.TextEdit.replace(doc.tokenRange(previous), expectedWs);
    }
    FormatVisitor.singleSpaceBefore = singleSpaceBefore;
    function indentBefore(previous, doc, indentText, indentUnit) {
        if (previous.tokenType !== php7parser_1.TokenType.Whitespace) {
            return indentText ? lsp.TextEdit.insert(doc.positionAtOffset(previous.offset + previous.length), indentText) : null;
        }
        if (!indentText) {
            return lsp.TextEdit.del(doc.tokenRange(previous));
        }
        let actualWs = doc.tokenText(previous);
        if (actualWs === indentText) {
            return null;
        }
        return lsp.TextEdit.replace(doc.tokenRange(previous), indentText);
    }
    FormatVisitor.indentBefore = indentBefore;
    function indentOrNewLineIndentBefore(previous, doc, indentText, indentUnit) {
        if (previous.tokenType !== php7parser_1.TokenType.Whitespace) {
            return indentText ? lsp.TextEdit.insert(doc.positionAtOffset(previous.offset + previous.length), indentText) : null;
        }
        let actualWs = doc.tokenText(previous);
        let nl = countNewlines(actualWs);
        if (nl) {
            let expectedWs = createWhitespace(Math.max(1, nl), '\n') + indentText;
            if (actualWs === expectedWs) {
                return null;
            }
            return lsp.TextEdit.replace(doc.tokenRange(previous), expectedWs);
        }
        if (!indentText) {
            return lsp.TextEdit.del(doc.tokenRange(previous));
        }
        if (actualWs === indentText) {
            return null;
        }
        return lsp.TextEdit.replace(doc.tokenRange(previous), indentText);
    }
    FormatVisitor.indentOrNewLineIndentBefore = indentOrNewLineIndentBefore;
    function newlineIndentBefore(previous, doc, indentText, indentUnit) {
        if (previous.tokenType !== php7parser_1.TokenType.Whitespace) {
            return lsp.TextEdit.insert(doc.positionAtOffset(previous.offset + previous.length), '\n' + indentText);
        }
        let actualWs = doc.tokenText(previous);
        let expectedWs = createWhitespace(Math.max(1, countNewlines(actualWs)), '\n') + indentText;
        if (actualWs === expectedWs) {
            return null;
        }
        return lsp.TextEdit.replace(doc.tokenRange(previous), expectedWs);
    }
    FormatVisitor.newlineIndentBefore = newlineIndentBefore;
    function doubleNewlineIndentBefore(previous, doc, indentText, indentUnit) {
        if (previous.tokenType !== php7parser_1.TokenType.Whitespace) {
            return lsp.TextEdit.insert(doc.positionAtOffset(previous.offset + previous.length), '\n\n' + indentText);
        }
        let actualWs = doc.tokenText(previous);
        let expected = createWhitespace(Math.max(2, countNewlines(actualWs)), '\n') + indentText;
        if (actualWs === expected) {
            return null;
        }
        return lsp.TextEdit.replace(doc.tokenRange(previous), expected);
    }
    FormatVisitor.doubleNewlineIndentBefore = doubleNewlineIndentBefore;
    function noSpaceBefore(previous, doc, indentText, indentUnit) {
        if (previous.tokenType !== php7parser_1.TokenType.Whitespace) {
            return null;
        }
        return lsp.TextEdit.del(doc.tokenRange(previous));
    }
    FormatVisitor.noSpaceBefore = noSpaceBefore;
    function noSpaceOrNewlineIndentPlusOneBefore(previous, doc, indentText, indentUnit) {
        if (previous.tokenType !== php7parser_1.TokenType.Whitespace) {
            return null;
        }
        let actualWs = doc.tokenText(previous);
        let newlineCount = countNewlines(actualWs);
        if (!newlineCount) {
            return lsp.TextEdit.del(doc.tokenRange(previous));
        }
        let expectedWs = createWhitespace(newlineCount, '\n') + indentText + indentUnit;
        if (actualWs === expectedWs) {
            return null;
        }
        return lsp.TextEdit.replace(doc.tokenRange(previous), expectedWs);
    }
    FormatVisitor.noSpaceOrNewlineIndentPlusOneBefore = noSpaceOrNewlineIndentPlusOneBefore;
    function noSpaceOrNewlineIndentBefore(previous, doc, indentText, indentUnit) {
        if (previous.tokenType !== php7parser_1.TokenType.Whitespace) {
            return null;
        }
        let actualWs = doc.tokenText(previous);
        let newlineCount = countNewlines(actualWs);
        if (!newlineCount) {
            return lsp.TextEdit.del(doc.tokenRange(previous));
        }
        let expectedWs = createWhitespace(newlineCount, '\n') + indentText;
        if (actualWs === expectedWs) {
            return null;
        }
        return lsp.TextEdit.replace(doc.tokenRange(previous), expectedWs);
    }
    FormatVisitor.noSpaceOrNewlineIndentBefore = noSpaceOrNewlineIndentBefore;
    function singleSpaceOrNewlineIndentPlusOneBefore(previous, doc, indentText, indentUnit) {
        if (previous.tokenType !== php7parser_1.TokenType.Whitespace) {
            return lsp.TextEdit.insert(doc.positionAtOffset(previous.offset + previous.length), ' ');
        }
        let actualWs = doc.tokenText(previous);
        if (actualWs === ' ') {
            return null;
        }
        let newlineCount = countNewlines(actualWs);
        if (!newlineCount) {
            return lsp.TextEdit.replace(doc.tokenRange(previous), ' ');
        }
        let expectedWs = createWhitespace(newlineCount, '\n') + indentText + indentUnit;
        if (actualWs !== expectedWs) {
            return lsp.TextEdit.replace(doc.tokenRange(previous), expectedWs);
        }
        return null;
    }
    FormatVisitor.singleSpaceOrNewlineIndentPlusOneBefore = singleSpaceOrNewlineIndentPlusOneBefore;
    function singleSpaceOrNewlineIndentBefore(previous, doc, indentText, indentUnit) {
        if (previous.tokenType !== php7parser_1.TokenType.Whitespace) {
            return lsp.TextEdit.insert(doc.positionAtOffset(previous.offset + previous.length), ' ');
        }
        let actualWs = doc.tokenText(previous);
        if (actualWs === ' ') {
            return null;
        }
        let newlineCount = countNewlines(actualWs);
        if (!newlineCount) {
            return lsp.TextEdit.replace(doc.tokenRange(previous), ' ');
        }
        let expectedWs = createWhitespace(newlineCount, '\n') + indentText;
        if (actualWs !== expectedWs) {
            return lsp.TextEdit.replace(doc.tokenRange(previous), expectedWs);
        }
        return null;
    }
    FormatVisitor.singleSpaceOrNewlineIndentBefore = singleSpaceOrNewlineIndentBefore;
    function createWhitespace(n, unit) {
        let text = '';
        while (n > 0) {
            text += unit;
            --n;
        }
        return text;
    }
    FormatVisitor.createWhitespace = createWhitespace;
    function countNewlines(text) {
        let c;
        let count = 0;
        let l = text.length;
        let n = 0;
        while (n < l) {
            c = text[n];
            ++n;
            if (c === '\r') {
                ++count;
                if (n < l && text[n] === '\n') {
                    ++n;
                }
            }
            else if (c === '\n') {
                ++count;
            }
        }
        return count;
    }
    FormatVisitor.countNewlines = countNewlines;
})(FormatVisitor || (FormatVisitor = {}));
