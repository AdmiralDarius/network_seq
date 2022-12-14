var fs = require('fs');
var esprima = require('esprima');
var escodegen = require('escodegen');
var conditionalStatements = [];
var parentsLastSwitch = [];
var tempVarId = "tmp23and42"
var tempVarId2 = "tmp23and43"
var UTILS_NAME = "uTILs2342ClEAnPC";

if (process.argv[2]) {
    var content = fs.readFileSync(process.argv[2]);
    var transformedCode = pcClean(content)
    fs.writeFileSync(process.argv[2], transformedCode, "utf8");
    console.log("Appended PCCleaner instructions to " + process.argv[2]);
}

function pcClean(content) {
    try {
        var ast = esprima.parse(content, {loc:true, range:true, comment:true, tokens:true});
    } catch (e) {
        console.log("\nPreprocessor: Error when parsing " + process.argv[2] + ". Will ignore this file.\n" + e);
        return;
    }
    ast = escodegen.attachComments(ast, ast.comments, ast.tokens);
    traverse(ast, null, null, null, preVisitor, postVisitor);
    return escodegen.generate(ast, {comment:true});
}

module.exports = pcClean;

// Executes visitor on the object and its children (recursively).
function traverse(object, parent, grandpa, key, preVisitor, postVisitor) {
    var key, child;

    if (preVisitor.call(null, object, parent, grandpa, key) === false) {
        return;
    }
    for (key in object) {
        if (object.hasOwnProperty(key)) {
            child = object[key];
            if (typeof child === 'object' && child !== null) {
                traverse(child, object, parent, key, preVisitor, postVisitor);
            }
        }
    }
    postVisitor.call(null, object, parent);
}

function preVisitor(node, parent, grandpa, key) {
    var iid1 = Number.MAX_SAFE_INTEGER;
    var iid2 = iid1 - 1;
    var iid3 = iid1 - 2;

    if (node.type === "SwitchStatement") {
        parentsLastSwitch.push({p: parent, n: node, k:key});
    }

    if (node.type === "SwitchCase") {
        var lastSwitch = parentsLastSwitch[parentsLastSwitch.length - 1];
        if (node.test && node.test.type == "CallExpression" && node.test.callee.property) {
            if (node.test.callee.property.name && (node.test.callee.property.name === "C2")) {
                var iidCond = node.test.arguments[0].value;
                var instrumentedCall = "J$.analysis.cleanPC(" + iidCond + ")";
                lastSwitch.p[lastSwitch.k] = esprima.parse("{1; " + instrumentedCall + "}").body[0]
                var newParent = lastSwitch.p[lastSwitch.k].body;
                lastSwitch.p[lastSwitch.k].body[0] = lastSwitch.n;
                lastSwitch.p = newParent;
                lastSwitch.k = 0;
            }
        }
    }

    if (node.type === "WhileStatement" || node.type === "ForStatement" || node.type === "DoWhileStatement"
        || node.type === "IfStatement" || node.type === "ForInStatement") {
        if (node.test && node.test.type == "CallExpression" && node.test.callee.property) {
            if (node.test.callee.property.name && (node.test.callee.property.name === "C")) {
                var iidCond = node.test.arguments[0].value;
                conditionalStatements.push(node);
                var instrumentedCall = "J$.analysis.cleanPC(" + iidCond + ")";
                if (parent.type === "LabeledStatement") {
                    grandpa[key] = esprima.parse("{1; " + instrumentedCall + "}").body[0];
                    grandpa[key].body[0] = parent;
                } else if (node.type === "IfStatement") {
                    parent[key] = esprima.parse("{1; " + instrumentedCall + "}").body[0];
                    parent[key].body[0] = node;
                } else {
                    var temp = node.body;
                    node.body = esprima.parse("{1; " + instrumentedCall + "}").body[0];
                    node.body.body[0] = temp;
                    parent[key] = esprima.parse("{1; " + instrumentedCall + "}").body[0];
                    parent[key].body[0] = node;
                }
            }
        }
    }
    if (node.type === "ConditionalExpression") {
        if (node.test && node.test.type == "CallExpression" && node.test.callee.property) {
            if (node.test.callee.property.name && (node.test.callee.property.name === "C")) {
                // if ((node.consequent && node.consequent.type === "CallExpression"
                //     && node.consequent.callee.type === "MemberExpression"
                //     && (node.consequent.callee.property.name == "_"))
                //         || (node.alternate && node.alternate.type === "CallExpression"
                //             && node.alternate.callee.type === "MemberExpression"
                //             && (node.alternate.callee.property.name == "_"))
                // ) {
                //     //skip Jalangi added conditional expressions
                // } else {
                    var iidCond = node.test.arguments[0].value;
                    var temp = parent[key]
                    var instrumentedCall = "J$.analysis.cleanPC(" + iidCond + ")";
                    var callA = esprima.parse("J$.analysis.aggregatePC(22," + iidCond + ")").body[0].expression;
                    callA.arguments[0] = temp.consequent;
                    temp.consequent = callA;
                    var callB = esprima.parse("J$.analysis.aggregatePC(22," + iidCond + ")").body[0].expression;
                    callB.arguments[0] = temp.alternate;
                    temp.alternate = callB;
                    parent[key] = esprima.parse("a=(" + tempVarId + "=1," + instrumentedCall + "," + tempVarId + ")").body[0].expression.right;
                    parent[key].expressions[0].right = temp;
                // }
            }
        }
    }
    if (node.type === "BreakStatement") {
        if (conditionalStatements.length > 0) {
            var lastCondBlock = null;
            for (var index = conditionalStatements.length - 1; index >= 0 && lastCondBlock === null; index--) {
                var currCondType = conditionalStatements[index].type
                if (currCondType === "WhileStatement" || currCondType === "ForStatement"
                    || currCondType === "DoWhileStatement" || currCondType === "ForInStatement"
                    || currCondType === "SwitchStatement")
                    lastCondBlock = conditionalStatements[conditionalStatements.length - 1];
            }
            if (!lastCondBlock) {
                var instrumentedCall = "J$.analysis.cleanPC(-1)"; //clean the pc modifs in the local function
                var temp = parent[key];
                parent[key] = esprima.parse("{" + instrumentedCall + ";1}").body[0];
                parent[key].body[1] = temp;
            } else if (lastCondBlock.test.callee.property.name && lastCondBlock.test.callee.property.name === "C") {
                var iidCond = lastCondBlock.test.arguments[0].value;
                var instrumentedCall = "J$.analysis.cleanPC(" + iidCond + ")";
                var temp = parent[key];
                parent[key] = esprima.parse("{" + instrumentedCall + ";1}").body[0];
                parent[key].body[1] = temp;
            }
        }
    }
    if (node.type === "ThrowStatement") {
        var instrumentedCall = "J$.analysis.cleanPC(-1)"; //clean the pc modifs in the local function
        var temp = parent[key];
        parent[key] = esprima.parse("{" + instrumentedCall + ";1}").body[0];
        parent[key].body[1] = temp;
    }
    if (node.type === "ReturnStatement" && node.argument && node.argument.callee
        && node.argument.callee.property && node.argument.callee.property.name === "Rt") {
        var oldStuff = node.argument.arguments[1];
        var newCall = esprima.parse("J$.analysis.aggregatePC(1,-1)").body[0].expression;
        newCall.arguments[0] = oldStuff;
        node.argument.arguments[1] = newCall;
    }
}

function postVisitor(node, parent) {
    if (node.type === "WhileStatement" || node.type === "ForStatement" || node.type === "DoWhileStatement"
        || node.type === "IfStatement" || node.type === "ForInStatement") {
        conditionalStatements.pop();
    }
    if (node.type === "SwitchStatement") {
        parentsLastSwitch.pop();
    }

}
