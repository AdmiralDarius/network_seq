var S$ = require('S$');

var con_graph_0 = S$.symbol('con_graph_0',true);


var con_graph_1 = S$.symbol('con_graph_1',true);


var con_graph_2 = S$.symbol('con_graph_2',true);


var con_graph_3 = S$.symbol('con_graph_3',true);


var con_graph_4 = S$.symbol('con_graph_4',true);


var con_fs_5 = S$.symbol('con_fs_5',true);


var con_str_6 = S$.symbol('con_str_6',true);


var con_str_7 = S$.symbol('con_str_7',true);


var con_str_8 = S$.symbol('con_str_8',true);


var fs = S$.symbol('fs',[true, "1234", "random"]);


var EF_TYPE = S$.symbol('EF_TYPE',0);


var IF_TYPE = S$.symbol('IF_TYPE',1);


var BNT_TYPE = S$.symbol('BNT_TYPE',2);


var TraceConstants = S$.symbol('TraceConstants',[true, "1234", "random"]);


var TRACE_ENTRY_SEP = S$.symbol('TRACE_ENTRY_SEP',',');


var NO_ID = S$.symbol('NO_ID',-1);


var verify = S$.symbol('verify',[true, "1234", "random"]);


var e2e = S$.symbol('e2e',[true, "1234", "random"]);


var printOutput = S$.symbol('printOutput',0);


if (printOutput != 0)
    console.log("Counting Flows and checking assertions");

var traceSize = S$.symbol('traceSize',0);

//var tracesFile = "../../../results/trace.json";

var tracesFile = S$.symbol('tracesFile',[true, "1234", "random"]);


var reports = S$.symbol('reports',[true, "1234", "random"]);

for (var index in reports) {
    if (reports[index].length) {
        var explicitFlows = 0, implicitFlows = 0, bntFlows = 0;
        var entries = reports[index].split("\n");
        traceSize += entries.length;
        reports[index] = ""; // hopefully a memory optimization :)

        var testName = entries[0].replace(/\..*/, "").replace(/.*\//, "");

        var flows = [];
        var lastNode = {};
	    var memory = {};
        var idCount = 0;
        var pc = [];
        var sinks = [];
        function getPrevious(id) {
            if (lastNode && lastNode.id === id)
            return lastNode;
            else
            return memory[id];
        }
        if (printOutput != 0)
            console.log("Analyzing trace (size " + entries.length + ")");
        for (var indexOp = 1; indexOp < entries.length; indexOp++) {
            if (entries[indexOp].length) {
                var entry = entries[indexOp].split(TRACE_ENTRY_SEP);
                if (indexOp > 0 && indexOp % 100000 == 0) {
                    if (printOutput != 0)
                        console.log("Checkpoint " + indexOp + " " + pc.length);
//                break;
                }

                var node = {};
                var iid;
                //node.id = idCount++;
                node.edges = [];
                node.type = entry[0];
                if (entry[0] == TraceConstants.SOURCE_OP) {
                    iid = entry[3];
                    node.id = entry[1];
                    memory[entry[1]] = node;
                }

                if (entry[0] == TraceConstants.FLOW_OP) {
                    iid = entry[3];
                    var prev = getPrevious(entry[1]);
                    if (prev) {
                        node.edges.push(prev);
                    }
                    sinks.push(node);
                }

                if (entry[0] == TraceConstants.WRITE_OP) {
		            var ovwVal = getPrevious(entry[1]);
                    iid = entry[3];
                    var prev = getPrevious(entry[2]);
                    var isIflow = false;
                    for (var i in pc) {
                        if (!prev) {
                            flows.push({type: IF_TYPE, node1: pc[i], node2: node});
                            isIflow = true;
                        }
                        node.edges.push(pc[i]);
                    }
                    if (prev) {
                        node.edges.push(prev);
                        if (!ovwVal && !isIflow) {
                            flows.push({type: EF_TYPE, node1: prev, node2: node});
                        }
                    }
                    delete memory[entry[1]];
                    memory[entry[2]] = node;
                }

                if (entry[0] == TraceConstants.UPGRADE_OP) {
                    iid = entry[3];
                    node.id = entry[1];
                    var prev = getPrevious(entry[2]);
                    if (prev) {
                        node.edges.push(prev);
                    } else {
                        flows.push({type: BNT_TYPE, node1: prev, node2: node});
                    }
                }
                if (entry[0] == TraceConstants.OP_OP) {
                    iid = entry[4];
                    var prev = getPrevious(entry[1]);
                    if (prev) {
                        node.edges.push(prev);
                    }
                    prev = getPrevious(entry[2]);
                    if (prev) {
                        node.edges.push(prev);
                    }
                    node.id = entry[entry.length - 2];
                }
                if (entry[0] == TraceConstants.PUSH_OP) {
                    iid = entry[2];
                    node.id = entry[1];
                    var prev = getPrevious(entry[1]);
                    if (prev) {
                        node.edges.push(prev);
                    }
                    pc.push(node);
                }
                if (entry[0] == TraceConstants.POP_OP) {
                    iid = entry[1];
                    while (pc.length > 0) {
                        //TODO check why the popped conditional is not allways at the end
                        if (pc[pc.length - 1].iid == entry[1]);
                            pc.pop();
                    }
                    continue;
                }
                node.iid = iid;
                lastNode = node;
            }
        }
        if (e2e) {
            markEndToEndFlows(sinks);
        }
        for (var iFlows=0; iFlows < flows.length; iFlows++) {
            if (!e2e || (!flows[iFlows].node1 || flows[iFlows].node1.e2e) && flows[iFlows].node2.e2e) {
                if (flows[iFlows].type == EF_TYPE) {
                    explicitFlows++;
                }
                if (flows[iFlows].type == IF_TYPE) {
                    implicitFlows++;
                }
                if (flows[iFlows].type == BNT_TYPE) {
                    bntFlows++;
                }
            }
        }

        if (!verify) {
            if (printOutput != 0)
                console.log("There are " + explicitFlows + "EF " + implicitFlows + "IF and " + bntFlows + "BNT, flows to sink " + sinks.length + ", trace size " + prettyPrint(traceSize));
            else
                console.log(explicitFlows + ", " + implicitFlows + ", " + bntFlows + ", " + sinks.length + ", " + traceSize);
        }

        if (verify == 1) {
            var assertionFile = entries[0].replace(/\/[^\/]*$/, "").replace(/\/[^\/]*$/, "\/") + "flows.json";
            verifyFlows(testName, assertionFile, implicitFlows, explicitFlows, bntFlows);
        }
    }
}

    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

    var efColor, ifColor, bntColor;
    var assertions =  JSON.parse(fs.readFileSync(assertionFile).toString());
    if (assertions[testName].hasOwnProperty("direct")) {
        if (assertions[testName].direct == explicitFlows) {
            efColor = "\x1b[32m"
        } else {
            efColor = "\x1b[31m"
        }
    }
    if (assertions[testName].hasOwnProperty("indirect")) {
        if (assertions[testName].indirect == implicitFlows) {
            ifColor = "\x1b[32m"
        } else {
            ifColor = "\x1b[31m"
        }
    }
    if (assertions[testName].hasOwnProperty("branchNotTaken")) {
        if (assertions[testName].branchNotTaken == bntFlows) {
            bntColor = "\x1b[32m"
        } else {
            bntColor = "\x1b[31m"
        }
    }
    var formatString = "%s " + efColor + " %s\x1b[0m" + ifColor + " %s\x1b[0m"+ bntColor + " %s\x1b[0m";
    console.log(formatString, pad(testName, 50, " ", 2),  pad(explicitFlows, 4, " ", STR_PAD_LEFT), pad(implicitFlows, 4, " ", STR_PAD_LEFT), pad(bntFlows, 4, " ", STR_PAD_LEFT));
}

    for (var i in sinks) {
        var queue = [];
        queue.push(sinks[i]);
        while (queue.length) {
            var element = queue.shift();
            element.e2e = true;
            for (var iNodes in element.edges) {
                queue.push(element.edges[iNodes]);
            }
        }

    }
}

    var tos = function() {var output = ''; for (var property in this) if (typeof this[property] != 'function' && property != "edges" && property != "sourceNode") { output +=(output? ", " : "") + property + ': \'' + this[property]+'\''; } return "{" + output + "}"};
    var nodes = "";
    var roots = ""
    for (var i in graph.nodes) {
        if (!graph.nodes[i].e2e) {
            if (con_graph_0){ 
             graph.nodes[i].color = "#F2E9E1";
 
            }
            if (con_graph_1){ 
             graph.nodes[i].textColor = "black";
 
            }
        }
        if (con_graph_2){ 
         graph.nodes[i].toString = tos;
 
        }
        nodes += (nodes ? ", " : "") + "{ data : " + graph.nodes[i].toString() + "}";
        if (graph.nodes[i].isRoot) {
            roots += (roots ? "," : "") + "#" + graph.nodes[i].id;
        }
    }
    var edges = "";
    for (var i in graph.edges) {
        if (!graph.edges[i].sourceNode.e2e) {
            if (con_graph_3){ 
             graph.edges[i].color = "#ddd";
 
            }
        }
        if (con_graph_4){ 
         graph.edges[i].toString = tos;
 
        }
        edges += (edges ? ", " : "") + "{ data : " + graph.edges[i].toString() + "}";
    }
//    console.log(nodes);
//    console.log(edges)
//    var edges = "{ data: { id: 'a\"e', source: '0', target: '2' } }";
    //breadthfirst
    if (con_fs_5){ 
     fs.writeFileSync(graphFile, "<html><head></head><body><div id=\"cy\" style=\"height:900px;width:1400px;border:1px solid #d4d4d4;\"></div><script src=\"../dagre.js\"></script><script src=\"../jquery-2.1.3.js\"></script><script src=\"../cytoscape.js\"></script><script> $(function(){window.cy = this; var cy = cytoscape({container: document.getElementById('cy'),style: cytoscape.stylesheet().selector('node').css({'content': 'data(name)', 'font-size': 10, class:'node-class', 'font-weight': 'bold', 'background-color': 'data(color)','color' : 'data(textColor)','text-valign': 'center', 'width': '50px', 'height': '50px'}).selector('edge').css({'target-arrow-shape': 'triangle','width': 4,'line-color': 'data(color)','target-arrow-color': 'data(color)'}),elements: {nodes: [" + nodes + "],edges: [" + edges + "]}, layout: {name: 'dagre', directed: true}});});</script></body></html>");
 
    }
}
if (printOutput != 0)
console.log("Finished generating graphs!");

//PADDING : http://www.webtoolkit.info/javascript-pad.html#.VONx8nW99E4

var STR_PAD_LEFT = S$.symbol('STR_PAD_LEFT',1);


var STR_PAD_RIGHT = S$.symbol('STR_PAD_RIGHT',2);


var STR_PAD_BOTH = S$.symbol('STR_PAD_BOTH',3);



    if (typeof(len) == "undefined") { var len = 0; }
    if (typeof(pad) == "undefined") { var pad = ' '; }
    if (typeof(dir) == "undefined") { var dir = STR_PAD_RIGHT; }

    if (len + 1 >= str.length) {

        switch (dir){

            case STR_PAD_LEFT:
                if (con_str_6){ 
                 str = Array(len + 1 - str.length).join(pad) + str;
 
                }
                break;

            case STR_PAD_BOTH:
                var right = Math.ceil((padlen = len - str.length) / 2);
                var left = padlen - right;
                if (con_str_7){ 
                 str = Array(left+1).join(pad) + str + Array(right+1).join(pad);
 
                }
                break;

            default:
                if (con_str_8){ 
                 str = str + Array(len + 1 - str.length).join(pad);
 
                }
                break;

        } // switch

    }
    return str;
}
