
(function() {

    var fs = require('fs');
    var esprima = require('esprima');
    var escodegen = require('escodegen');
    var deterministicRandom = require('./DeterministicRandom');

    var api = {
        markSourceFct:"addSource",
        markSinkFct:"addSink",
        markSource:"source"
    };

    var strategy = {
        markRateLiteral:0.2,
        markRateSourceFct:0.2,
        markRateSinkFct:0.8,
        sourcesLiterals:0,
        sourcesFunctions:0,
        sinks:0,
        markLiteralAsSource:function(l /*Literal*/) {
            return random() < this.markRateLiteral;
        },
        markFunctionAsSource:function(f /*FunctionDeclaration or FunctionExpression*/) {
            return random() < this.markRateSourceFct;
//            return 0;
        },
        markFunctionAsSink:function(f /*FunctionDeclaration or FunctionExpression*/) {
            return random() < this.markRateSinkFct;
        }
    };

    function NodeAndParent(node, parent) {
        this.node = node;
        this.parent = parent;
    }

    function NodeParentKey(node, parent, key) {
        this.node = node;
        this.parent = parent;
        this.key = key;
    }

    var sourceFunctions = [];
    var sinkFunctions = [];
    var sourceSinkFunctions = [];
    var sourceLiterals = [];

    function seedPolicy(code) {
        try {
            var ast = esprima.parse(code, {loc:true, range:true, comment:true, tokens:true, raw:true});
        } catch (e) {
            console.log("\nPreprocessor: Error when parsing " + fileName + ". Will ignore this file.\n" + e);
            return code;
        }
        ast = escodegen.attachComments(ast, ast.comments, ast.tokens);
        traverse(ast, null, null, preVisitor, postVisitor);
        var typeofSources;
        if (sourceFunctions.length > 0) {
            typeofSources = Math.floor(random() * 2);
        } else {
            typeofSources = 1;
        }
        if (typeofSources == 1) {
            var index = Math.floor(random() * (sourceLiterals.length - 1));
            var element = sourceLiterals[index];
            sourceLiterals = [];
            sourceLiterals[0] = element;
            sourceFunctions = []
        } else {
            var index = Math.floor(random() * (sourceFunctions.length - 1));
            var element = sourceFunctions[index];
            sourceFunctions = [];
            sourceFunctions[0] = element;
            sourceLiterals = []
        }
        for (var i = 0; i < sourceSinkFunctions.length; i++) {
            sourceFunctions.push(sourceSinkFunctions[i]);
        }
        sourceSinkFunctions = [];
        if (sinkFunctions.length > 1) {
            var index = Math.floor(random() * (sinkFunctions.length - 1));
            var element = sinkFunctions[index];
            sinkFunctions = [];
            sinkFunctions[0] = element;
        }
        markFunctions();
        markLiterals();
        declareTmpVariables(ast);
        ast.body.splice(0, 0, esprima.parse("var utils = require(\"../../../TestUtils\");"));
        var transformedCode = escodegen.generate(ast, {comment:true});
        return transformedCode;
    }

    // Executes visitor on the object and its children (recursively).
    function traverse(object, parent, key, preVisitor, postVisitor) {
        var key, child;

        if (preVisitor.call(null, object, parent, key) === false) {
            return;
        }
        for (key in object) {
            if (object.hasOwnProperty(key)) {
                child = object[key];
                if (typeof child === 'object' && child !== null) {
                    traverse(child, object, key, preVisitor, postVisitor);
                }
            }
        }
        postVisitor.call(null, object, parent);
    }

    function preVisitor(node, parent, key) {
        if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression") {
            var isSource = strategy.markFunctionAsSource(node);
            var isSink = strategy.markFunctionAsSink(node);
//            if (isSource && isSink) sourceSinkFunctions.push(new NodeAndParent(node, parent));
            if (isSource) sourceFunctions.push(new NodeAndParent(node, parent));
            else if (isSink) sinkFunctions.push(new NodeAndParent(node, parent));
        }
        if (node.type === "Literal" && strategy.markLiteralAsSource(node)
              && !(parent.type === "Property" && key === "key"))
            sourceLiterals.push(new NodeParentKey(node, parent, key));
    }

    function postVisitor(node, parent) {
    }

    function markFunctions() {
        for (var i = 0; i < sourceFunctions.length; i++) {
            strategy.sourcesFunctions++;
            markFunction(sourceFunctions[i], api.markSourceFct);
        }
        for (i = 0; i < sinkFunctions.length; i++) {
            strategy.sinks++;
            markFunction(sinkFunctions[i], api.markSinkFct);
        }
        for (var i = 0; i < sourceSinkFunctions.length; i++) {
            strategy.sinks++;
            strategy.sourcesFunctions++;
            markFunction(sourceSinkFunctions[i], api.markSourceFct, api.markSinkFct);
        }
    }

    function markFunction(nodeAndParent, markFctName1, markFctName2) {
        if (nodeAndParent.node.type === "FunctionDeclaration") {
            markFctDeclaration(nodeAndParent, markFctName1, markFctName2);
        } else if (nodeAndParent.node.type === "FunctionExpression") {
            markFctExpression(nodeAndParent, markFctName1, markFctName2);
        }
    }

    function markFctDeclaration(nodeAndParent, markFctName1, markFctName2) {
        var parent = nodeAndParent.parent;
        var fctDecl = nodeAndParent.node;
        if (!Array.isArray(parent)) throw "parent of function declaration should be an array, but is " + typeof parent;
        var fctIdx = parent.indexOf(fctDecl);
        var markStmt1 = freshMarkStatement(fctDecl.id.name, markFctName1);
        insertIntoArray(parent, fctIdx + 1, markStmt1);
        if (markFctName2) {
            var markStmt2 = freshMarkStatement(fctDecl.id.name, markFctName2);
            insertIntoArray(parent, fctIdx + 2, markStmt2);
        }
    }

    function markFctExpression(nodeAndParent, markFctName1, markFctName2) {
        var parent = nodeAndParent.parent;
        var fctExpr = nodeAndParent.node;
        var propName = findPropName(parent, fctExpr);
        var markSequenceStmt = freshMarkSequenceExpr(fctExpr, markFctName1, markFctName2);
        parent[propName] = markSequenceStmt;
    }

    function findPropName(object, propValue) {
        var keys = Object.keys(object);
        for (var i = 0; i < keys.length; i++) {
            if (object[keys[i]] === propValue)
                return keys[i];
        }
        throw "Could not find value " + propValue + " in object " + object;
    }

    function freshMarkStatement(val, markFctName) {
        var code = "utils." + markFctName + "(" + val + ");";
        return esprima.parse(code).body[0];
    }

    function freshMarkExpression(val, markFctName) {
        var code = "utils." + markFctName + "(" + val + ");";
        return esprima.parse(code).body[0].expression;
    }

    var varCtr = 0;

    function freshMarkSequenceExpr(fctExpr, markFctName1, markFctName2) {
        var varName = "$tmp" + (varCtr++)
        var code = varName + "=x, " + "utils." + markFctName1 + "(" + varName + "), " + (markFctName2 ? "utils." + markFctName2 + "(" + varName + "), " : "") + varName;
        var ast = esprima.parse(code).body[0].expression;
        ast.expressions[0].right = fctExpr;
        return ast;
    }

    // needed for code that runs in strict mode
    function declareTmpVariables(ast) {
        if (varCtr > 0) {
            var varNames = [];
            for (var i = 0; i < varCtr; i++) {
                varNames.push("$tmp" + i);
            }
            var declarationStr = "var " + varNames.join(", ") + ";";
            ast.body.splice(0, 0, esprima.parse(declarationStr));
        }
    }

    function markLiterals() {
        for (var i = 0; i < sourceLiterals.length; i++) {
            strategy.sourcesLiterals++;
            var literal = sourceLiterals[i].node;
            var parent = sourceLiterals[i].parent;
            var key = sourceLiterals[i].key;
            parent[key] = freshMarkExpression(literal.raw, api.markSource);
        }
    }

    function insertIntoArray(arr, idx, elem) {
        if (idx < 0) {
            throw "Index must be non-negative, but is " + idx;
        } else if (arr.length <= idx) {
            arr[idx] = elem;
        } else {
            var remainder = arr.slice(idx);
            arr[idx] = elem;
            for (var i = 0; i < remainder.length; i++) {
                arr[idx + i + 1] = remainder[i];
            }
        }
    }


    // main part
    if (process.argv.length !== 5) throw "Wrong number of arguments.";
    var fileName = process.argv[2];
    var newFileName = process.argv[3];
    var randomSeed = process.argv[4];
    var random = deterministicRandom.getRandomFct(randomSeed);
    var code = fs.readFileSync(fileName, "utf8");
    var processedCode = seedPolicy(code);
    fs.writeFileSync(newFileName, processedCode, "utf8")
    console.log("Seeded " + strategy.sourcesLiterals + " literal sources, " + strategy.sourcesFunctions + " function sources and " + strategy.sinks)
})();
