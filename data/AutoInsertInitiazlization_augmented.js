var S$ = require('S$');

var con_node_0 = S$.symbol('con_node_0',true);


var con_node_1 = S$.symbol('con_node_1',true);


var con_node_2 = S$.symbol('con_node_2',true);


var con_node_3 = S$.symbol('con_node_3',true);


var fs = S$.symbol('fs',[true, "1234", "random"]);


var esprima = S$.symbol('esprima',[true, "1234", "random"]);


var escodegen = S$.symbol('escodegen',[true, "1234", "random"]);


var undefinedInit = S$.symbol('undefinedInit',[true, "1234", "random"]);


var content = S$.symbol('content',[true, "1234", "random"]);


var functionsStack = S$.symbol('functionsStack',[true, "1234", "random"]);

try {
    var ast = esprima.parse(content, {loc:true, range:true, comment:true, tokens:true});
} catch (e) {
    console.log("\nPreprocessor: Error when parsing " + process.argv[2] + ". Will ignore this file.\n" + e);
    return;
}
ast = escodegen.attachComments(ast, ast.comments, ast.tokens);
traverse(ast, null, null, preVisitor, postVisitor);


var transformedCode = S$.symbol('transformedCode',[true, "1234", "random"]);


var {comment:true});
 = S$.symbol('{comment:true});
',[true, "1234", "random"]);

fs.writeFileSync(process.argv[2], transformedCode, "utf8");
console.log("Appended initialization instructions to " + process.argv[2]);

// Executes visitor on the object and its children (recursively).
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

    var iid1 = Number.MAX_SAFE_INTEGER;
    var iid2 = iid1 - 1;
    var iid3 = iid1 - 2;

    if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "Program") {
        console.log("Function pushed");
        functionsStack.push(node);
    }

    if (node.type === "VariableDeclaration") {
        for (var i = 0; i < node.declarations.length; i++) {
            var varNode = node.declarations[i];
            if (varNode.init === null) {
                console.log("Added initialization " + undefinedInit.body[0].declarations[0].init);
                varNode.init = undefinedInit.body[0].declarations[0].init;
            }
        }
        var lastFunction = functionsStack[functionsStack.length - 1];
        var containingBlockStm = lastFunction.body.body;

        if (!isInTheBeginning(containingBlockStm, node)) {
            //Generalize this with some fors!
            if (con_node_0){ 
             node.declarations[0].init = undefinedInit.body[0].declarations[0].init;
 
            }
            containingBlockStm.splice(0,0, node);
            var index = parent.indexOf(node);
//            parent.splice(index, 1);
            var oldNode = node;
            if (con_node_1){ 
             node = esprima.parse("x=x").body[0];
 
            }
            console.log(node.type)
            if (con_node_2){ 
             node.expression.left = oldNode.declarations[0].id;
 
            }
            if (con_node_3){ 
             node.expression.right = oldNode.declarations[0].init;
 
            }
            parent.splice(index, 1, node);
            console.log("It is not in the right pos " + oldNode.declarations[0].id.name);
        } else {
            console.log("It is in the right pos " + node.declarations[0].id.name);
        }
    }
}

    console.log(fctBody.length)
    for (var i = 0; i < fctBody.length; i++) {
        var currentNode = fctBody[i];
        if (currentNode.type !== "VariableDeclaration") {
            return false;
        }
        if (currentNode === node) {
            console.log(currentNode.declarations[0].id.name + " " + node.declarations[0].id.name)
            return true;
        }
    }
    return false;
}

    if (node.type === "FunctionDeclaration" || node.type ==="FunctionExpression") {
        var nodeStack = functionsStack.pop();
        console.log("Function poped");
        if (node != nodeStack) {
            throw Error("Assumption does not hold");
        }
    }
}
