var BNTColor = "#556270";
var EFColor = "#E97F02";
var IFColor = "#948C75";
var fs = require("fs");
var generateGraphs = true;
var EF_TYPE = 0, IF_TYPE = 1, BNT_TYPE = 2;
var TraceConstants = require("./TraceConstants.js");
var TRACE_ENTRY_SEP = ',';

var verify = process.argv[3];
var e2e = process.argv[4];
var traceSize = 0;
console.log("Counting Flows and checking assertions");

//var tracesFile = "../../../results/trace.json";
var tracesFile = process.argv[2];
var reports = fs.readFileSync(tracesFile).toString().split("#");
for (var index in reports) {
    if (reports[index].length) {
        var explicitFlows = 0, implicitFlows = 0, bntFlows = 0;
        var entries = reports[index].split("\n");
        traceSize += entries.length;
        reports[index] = ""; // hopefully a memory optimization :)
        var testName = entries[0].replace(/\..*/, "").replace(/.*\//, "");
        //console.log("Aggregate logs for " + testName);
        var flows = [];
        var graphFile = "./results/graphs/" + testName + ".html";
        var graph = {};
        var upgrades = [];
        graph.nodes = [];
        graph.edges = [];
        var varsLastOp = [];
        var idCount = 0;
        var edgesCount = 0;
        var pc = [];
        var sinks = [];
        for (var indexOp = 1; indexOp < entries.length; indexOp++) {
            if (entries[indexOp].length) {
//                var entry = JSON.parse(entries[indexOp]);
                var entry = entries[indexOp].split(TRACE_ENTRY_SEP);
                if (indexOp > 0 && indexOp % 10000 == 0) {
                    console.log(indexOp + " " + varsLastOp.length + " " + pc.length + " " + graph.edges.length + " " + graph.nodes.length);
//                    break;
                }
                var color = "#948C75";
                var name = "N/A";
                var isRoot = false;
                var node = {};
                node.id = idCount++;
                node.edges = [];
                node.type = entry[0];
                var iid;
                if (entry[0] == TraceConstants.SOURCE_OP) {
                    iid = entry[3];
                    if (generateGraphs) {
                        color = "#8A9B0F";
                        name = "So(" + entry[1] + ")";
                        isRoot = true;
                    }
                    varsLastOp[entry[1]] = node;
                }

                if (entry[0] == TraceConstants.FLOW_OP) {
                    iid = entry[3];
                    if (varsLastOp[entry[1]]) {
                        var idTarget = varsLastOp[entry[1]].id;
                        if (generateGraphs)
                            graph.edges.push({id: "e" + edgesCount++, color: '#ddd', sourceNode: node, target: node.id, source: idTarget});
                        node.edges.push(varsLastOp[entry[1]]);
                        if (varsLastOp[entry[1]].type != TraceConstants.WRITE_OP && varsLastOp[entry[1]].type != TraceConstants.SOURCE_OP) {
                            delete varsLastOp[entry[1]];
                        }
                    }
                    if (generateGraphs) {
                        name = "Si(" + entry[1] + ")";
                        color = "#CC2A41";
                    }
                    sinks.push(node);
                }

                if (entry[0] == TraceConstants.WRITE_OP) {
                    iid = entry[3];
                    name = "Wr(" + entry[2] + ")";
                    for (var i in pc) {
                        var idTarget = pc[i].id;
                        flows.push({type: IF_TYPE, node1: pc[i], node2: node});
                        if (generateGraphs)
                            graph.edges.push({id: "e" + edgesCount++, color: IFColor, sourceNode: node, target: node.id, source: idTarget});
                        node.edges.push(pc[i]);
                    }
                    if (varsLastOp[entry[2]]) {
                        var idTarget = varsLastOp[entry[2]].id;
                        if (generateGraphs) {
                            graph.edges.push({id: "e" + edgesCount++, color: '#ddd', sourceNode: node, target: node.id, source: idTarget});
                            color = EFColor;
                        }
                        node.edges.push(varsLastOp[entry[2]]);
                        flows.push({type: EF_TYPE, node1: varsLastOp[entry[2]], node2: node});
                        if (varsLastOp[entry[2]].type != TraceConstants.WRITE_OP && varsLastOp[entry[2]].type != TraceConstants.SOURCE_OP) {
                            delete varsLastOp[entry[2]];
                        }
                    }
                    varsLastOp[entry[2]] = node;
                }

                if (entry[0] == TraceConstants.UPGRADE_OP) {
                    upgrades.push(node);
                    iid = entry[3];
                    name = "Up(" + entry[1] + ")";
                    if (varsLastOp[entry[2]]) {
                        var idTarget = varsLastOp[entry[2]].id;
                        if (generateGraphs)
                            graph.edges.push({id: "e" + edgesCount++, color: '#ddd', sourceNode: node, target: node.id, source: idTarget});
                        node.edges.push(varsLastOp[entry[2]]);
                        if (varsLastOp[entry[2]].type != TraceConstants.WRITE_OP && varsLastOp[entry[2]].type != TraceConstants.SOURCE_OP) {
                            delete varsLastOp[entry[2]];
                        }
                    } else {
                        color = BNTColor;
                        flows.push({type: BNT_TYPE, node1: varsLastOp[entry[2]], node2: node});
                    }
                    varsLastOp[entry[1]] = node;
                }
                if (entry[0] == TraceConstants.OP_OP) {
                    iid = entry[entry.length -1];
                    if (varsLastOp[entry[1]]) {
                        var idTarget = varsLastOp[entry[1]].id;
                        if (generateGraphs)
                            graph.edges.push({id: "e" + edgesCount++, color: '#ddd', sourceNode: node, target: node.id, source: idTarget});
                        node.edges.push(varsLastOp[entry[1]]);
                        if (varsLastOp[entry[1]].type != TraceConstants.WRITE_OP && varsLastOp[entry[1]].type != TraceConstants.SOURCE_OP) {
                            delete varsLastOp[entry[1]];
                        }
                    }
                    if (varsLastOp[entry[2]]) {
                        var idTarget = varsLastOp[entry[2]].id;
                        if (generateGraphs)
                            graph.edges.push({id: "e" + edgesCount++, color: '#ddd', sourceNode: node, target: node.id, source: idTarget});
                        node.edges.push(varsLastOp[entry[2]]);
                        if (varsLastOp[entry[2]].type != TraceConstants.WRITE_OP && varsLastOp[entry[2]].type != TraceConstants.SOURCE_OP) {
                            delete varsLastOp[entry[2]];
                        }
                    }
                    name = "Op(" + entry[2] + ")";
                    if (entry.length == 4)
                        varsLastOp[entry[2]] = node;
                    else
                        varsLastOp[entry[3]] = node;
                }
                if (entry[0] == TraceConstants.PUSH_OP) {
                    iid = entry[entry.length - 1];
                    if (varsLastOp[entry[1]]) {
                        var idTarget = varsLastOp[entry[1]].id;
                        if (generateGraphs)
                            graph.edges.push({id: "e" + edgesCount++, color: '#ddd', sourceNode: node, target: node.id, source: idTarget});
                        node.edges.push(varsLastOp[entry[1]]);
                        if (varsLastOp[entry[1]].type != TraceConstants.WRITE_OP && varsLastOp[entry[1]].type != TraceConstants.SOURCE_OP) {
                            delete varsLastOp[entry[1]];
                        }
                    }
                    pc.push(node);
                    name = "Pu(" + entry[1] + ")";
                }
                if (entry[0] == TraceConstants.POP_OP) {
                    iid = entry[1];
                    while (pc.length > 0 && pc[pc.length - 1].iid == entry[1]) {
                        pc.pop();
                    }
                    continue;
                    name = "Po";
                }
                node.iid = iid;
                if (generateGraphs) {
                    node.color = color;
                    node.textColor = "white";
                    node.isRoot = isRoot;
                    node.name = name;
                    node.label = JSON.stringify(entry);
                    graph.nodes.push(node);
                }
            }
        }
        if (e2e == 1 && sinks.length > 0) {
            markEndToEndFlows(upgrades.concat(sinks));
            // markEndToEndFlows(sinks);
            // var newArr = [];
            // newArr.push(upgrades.pop());
            // markEndToEndFlows(newArr);

        }

        for (var index in flows) {
            if (e2e == 0 || (!flows[index].node1 || flows[index].node1.e2e) && flows[index].node2.e2e) {
                if (flows[index].type == EF_TYPE) {
                    explicitFlows++;
                }
                if (flows[index].type == IF_TYPE) {
                    implicitFlows++;
                }
                if (flows[index].type == BNT_TYPE) {
                    bntFlows++;
                }
            }
        }
        if (verify == 0)
            console.log("There are " + explicitFlows + "EF " + implicitFlows + "IF and " + bntFlows + "BNT" + ", flows to sink " + sinks.length + ", trace size " + traceSize);
        if (generateGraphs)
            printGraph(graphFile, graph);
        if (verify == 1) {
            var assertionFile = entries[0].replace(/\/[^\/]*$/, "").replace(/\/[^\/]*$/, "\/") + "flows.json";
            verifyFlows(testName, assertionFile, implicitFlows, explicitFlows, bntFlows);
        }
    }
}

function verifyFlows(testName, assertionFile, implicitFlows, explicitFlows, bntFlows) {
//    var explicitFlows = 0, implicitFlows = 0, bntFlows = 0;
//    for (var i in graph.nodes) {
//        if (graph.nodes[i].color == BNTColor) {
//            bntFlows++;
//        }
//        if (graph.nodes[i].color == EFColor) {
//            explicitFlows++;
//        }
//    }
//    for (var i in graph.edges) {
//        if (graph.edges[i].color == IFColor) {
//            implicitFlows++;
//        }
//    }
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
    console.log(formatString, pad(testName, 40, " ", 2),  pad(explicitFlows, 4, " ", STR_PAD_LEFT), pad(implicitFlows, 4, " ", STR_PAD_LEFT), pad(bntFlows, 4, " ", STR_PAD_LEFT));
}

function markEndToEndFlows(sinks) {
    for (var i in sinks) {
        var queue = [];
        queue.push(sinks[i]);
        while (queue.length) {
            var element = queue.shift();
            element.e2e = true;
            for (var iNodes in element.edges) {
                if (!element.edges[iNodes].e2e)
                    queue.push(element.edges[iNodes]);
            }
        }

    }
}

function printGraph(graphFile, graph) {
    var tos = function() {var output = ''; for (var property in this) if (typeof this[property] != 'function' && property != "edges" && property != "sourceNode") { output +=(output? ", " : "") + property + ': \'' + this[property]+'\''; } return "{" + output + "}"};
    var nodes = "";
    var roots = "";
    var count = 0;
    for (var i in graph.nodes) {
        if (e2e == 1 && !graph.nodes[i].e2e) {
            graph.nodes[i].color = "#F2E9E1";
            graph.nodes[i].textColor = "black";
        } else {
            // graph.nodes[i].color = "blue";
            // graph.nodes[i].textColor = "white";
            graph.nodes[i].toString = tos;
            // if (count < 200) {
                count++;
                console.log(graph.nodes[i].name + " => " + graph.nodes[i].iid);
                nodes += (nodes ? ", " : "") + "{ data : " + graph.nodes[i].toString() + "}";
            // }
            if (graph.nodes[i].isRoot) {
                roots += (roots ? "," : "") + "#" + graph.nodes[i].id;
            }
        }
    }
    console.log("Generating graph with " + count + " nodes");
    var edges = "";
    for (var i in graph.edges) {
        if (!graph.edges[i].sourceNode.e2e) {
            graph.edges[i].color = "#ddd";
        } else {
            graph.edges[i].toString = tos;
            count++;
            edges += (edges ? ", " : "") + "{ data : " + graph.edges[i].toString() + "}";
        }
    }
    console.log("and " + count + " edges")
//    console.log(nodes);
//    console.log(edges)
//    var edges = "{ data: { id: 'a\"e', source: '0', target: '2' } }";
    //breadthfirst
    fs.writeFileSync(graphFile, "<html><head></head><body><div id=\"cy\" style=\"height:900px;width:1400px;border:1px solid #d4d4d4;\"></div><script src=\"../dagre.js\"></script><script src=\"../jquery-2.1.3.js\"></script><script src=\"../cytoscape.js\"></script><script> $(function(){window.cy = this; var cy = cytoscape({container: document.getElementById('cy'),style: cytoscape.stylesheet().selector('node').css({'content': 'data(name)', 'font-size': 10, class:'node-class', 'font-weight': 'bold', 'background-color': 'data(color)','color' : 'data(textColor)','text-valign': 'center', 'width': '50px', 'height': '50px'}).selector('edge').css({'target-arrow-shape': 'triangle','width': 4,'line-color': 'data(color)','target-arrow-color': 'data(color)'}),elements: {nodes: [" + nodes + "],edges: [" + edges + "]}, layout: {name: 'dagre', directed: true}});});</script></body></html>");
}
console.log("Finished generating graphs!");

//PADDING : http://www.webtoolkit.info/javascript-pad.html#.VONx8nW99E4
var STR_PAD_LEFT = 1;
var STR_PAD_RIGHT = 2;
var STR_PAD_BOTH = 3;

function pad(str, len, pad, dir) {

    if (typeof(len) == "undefined") { var len = 0; }
    if (typeof(pad) == "undefined") { var pad = ' '; }
    if (typeof(dir) == "undefined") { var dir = STR_PAD_RIGHT; }

    if (len + 1 >= str.length) {

        switch (dir){

            case STR_PAD_LEFT:
                str = Array(len + 1 - str.length).join(pad) + str;
                break;

            case STR_PAD_BOTH:
                var right = Math.ceil((padlen = len - str.length) / 2);
                var left = padlen - right;
                str = Array(left+1).join(pad) + str + Array(right+1).join(pad);
                break;

            default:
                str = str + Array(len + 1 - str.length).join(pad);
                break;

        } // switch

    }
    return str;
}