var fs = require("fs");
var EF_TYPE = 0, IF_TYPE = 1, BNT_TYPE = 2;
var TraceConstants = require("./TraceConstants.js");
var TRACE_ENTRY_SEP = ',';
var NO_ID = -1;
var verify = true; //process.argv[3];
var e2e = true;// process.argv[4];
var printOutput = 0;

module.exports = function(dir, lcEntries, printTraces) {
    if (printOutput != 0)
        console.log("Counting Flows and checking assertions");
    var traceSize = 0;

    var fs = require('fs');
    var files = fs.readdirSync(dir); //process.argv[2]
    files.sort(function (a, b) {
        if (a.match(/trace.*json$/) && b.match(/trace.*json$/)) {
            var noA = parseInt(a.replace(/.json$/, "").match(/\d+$/)[0]);
            var noB = parseInt(b.replace(/.json$/, "").match(/\d+$/)[0]);
            return noA - noB;
        }
        return a - b;
    });
    var explicitFlows = 0, implicitFlows = 0, bntFlows = 0;
    var totalExplicitFlows = 0, totalImplicitFlows = 0, totalBntFlows = 0;
    var flows = [];
    var lastNode = {};
    var memory = {};
    var idCount = 0;
    var pc = [];
    var sinks = [];
    var sources = [];
    var nodes = [];
    var EF_POS = 0;
    var OIF_POS = 1;
    var HIF_POS = 2;

    function getPrevious(id) {
        return memory[id];
    }

    function addToMemory(id, node) {
        if (!memory[id])
            memory[id] = [];
        memory[id].push(node);
    }

    function addEdge(node1, node2) {
        node1.edges.push(node2);
        node2.forEdges.push(node1);
        node1.flows |= node2.flows;
        if (node2.type == TraceConstants.WRITE_OP) {
            node1.ownFlows |= node2.ownFlows;
        }
    }

    function addEdges(id, node, cb) {
        var prevs = getPrevious(id);
        if (prevs) {
            for (var i = 0; i < prevs.length; i++) {
                var prev = prevs[i];
                addEdge(node, prev);
                if (cb)
                    cb(node, prev)
            }
        } else {
            // console.log(id)
        }
    }

    var coverage = {};
    for (var index in files) {
        var name = files[index];
        var path = dir + "/" + name; //process.argv[2]
        if (path.match("trace[0-9]*.json$")) {
            var content = fs.readFileSync(path).toString();
            var entries = content.split("\n");
            traceSize += entries.length;
            for (var indexOp = 1; indexOp < entries.length; indexOp++) {
                if (entries[indexOp].length && entries[indexOp][0] != '#') {
                    var entry = entries[indexOp].split(TRACE_ENTRY_SEP);
                    if (indexOp > 0 && indexOp % 100000 == 0) {
                        if (printOutput != 0)
                            console.log("Checkpoint " + indexOp + " " + pc.length);
//                break;
                    }

                    var node = {};
                    var iid;
                    node.id = idCount++;
                    node.edges = [];
                    node.forEdges = [];
                    node.e2e = false;
                    node.type = entry[0];
                    node.prodId = -1;
                    node.flows = 0;
                    node.ownFlows = 0;
                    nodes.push(node);
                    if (entry[0] == TraceConstants.SOURCE_OP) {
                        iid = entry[3];
                        node.prodId = entry[1];
                        addToMemory(entry[1], node)
                        sources.push(node);
                    }

                    if (entry[0] == TraceConstants.FLOW_OP) {
                        iid = entry[3];
                        addEdges(entry[1], node);
                        sinks.push(node);
                    }
                    if (entry[0] == TraceConstants.WRITE_OP) {
                        var ovwVal = getPrevious(entry[1]);
                        iid = entry[entry.length-1];
                        node.totalWrites = parseInt(entry[entry.length-2]);
                        var count = 0;
                        addEdges(entry[2], node, function (node1, node2) {
                            count++;
                            if (!ovwVal) {
                                flows.push({type: EF_TYPE, node1: node2, node2: node1});
                                node.flows |= (1 << EF_POS);
                                node.ownFlows |= (1 << EF_POS);
                            }
                        });
                        if (count === 0)
                            for (var i = 0; i < pc.length; i++) {
                                if (!ovwVal) {
                                    node.flows |= (1 << OIF_POS);
                                    node.ownFlows |= (1 << OIF_POS);
                                    flows.push({type: IF_TYPE, node1: pc[i], node2: node});
                                }
                                addEdge(node, pc[i]);
                            }
                        addToMemory(entry[2], node)
                    }

                    if (entry[0] == TraceConstants.UPGRADE_OP) {
                        iid = entry[3];
                        var count = 0;
                        addEdges(entry[2], node, function () {
                            count++;
                        });
                        if (count === 0) {
                            node.flows |= (1 << HIF_POS);
                            node.ownFlows |= (1 << HIF_POS);
                            flows.push({type: BNT_TYPE, node1: node, node2: node});
                        }
                        node.prodId = entry[1];
                        if (count === 0) {
                            sources.push(node);
                        }
                        addToMemory(entry[1], node)
                    }
                    if (entry[0] == TraceConstants.OP_OP) {
                        if (entry.length === 5) {
                            node.prodId = entry[3]
                            iid = entry[4];
                            addEdges(entry[1], node);
                            addEdges(entry[2], node);
                            addToMemory(entry[3], node);
                        } else {
                            node.prodId = entry[2]
                            iid = entry[3];
                            var count = 0;
                            addEdges(entry[1], node, function () {
                                count++;
                            });
                            if (count === 0) {
                                for (var i = 0; i < pc.length; i++) {
                                    addEdge(node, pc[i]);
                                    node.flows |= (1 << OIF_POS);
                                    node.ownFlows |= (1 << OIF_POS);
                                    flows.push({type: IF_TYPE, node1: pc[i], node2: node});
                                }
                            }
                            addToMemory(entry[2], node);
                        }
                    }
                    if (entry[0] == TraceConstants.PUSH_OP) {
                        iid = entry[entry.length - 1];
                        if (entry.length === 4) {
                            if (iid.indexOf("Policy.js") === -1) {
                                if (!coverage[iid])
                                    coverage[iid] = 0;
                                if (entry[2] != "false" && entry[2] != "undefined" && entry[2] != "null")
                                    coverage[iid] |= 2
                                else if (entry[2] == 'false' || entry[2] == "undefined" || entry[2] == "null")
                                    coverage[iid] |= 1
                            }
                        }
                        addEdges(entry[1], node)
                        pc.push(node);
                    }
                    if (entry[0] == TraceConstants.POP_OP) {
                        iid = entry[1];
                        while (pc.length > 0) {
                            //TODO check why the popped conditional is not allways at the end
                            if (pc[pc.length - 1].iid === entry[1]) {
                                pc.pop();
                            } else {
                                break;
                            }
                        }
                        continue;
                    }
                    node.iid = iid;
                }
            }
        }
    }
    var diffTypes = [0, 0, 0, 0, 0, 0, 0, 0];
    var iids = {};
    var sinksE2E = 0;
    if (e2e) {
        //Bottom-up traversal for removing nodes that do not contribute
        markEndToEndFlows(sinks);
        //Top-down traversal for computing type of flows
        //appendTypeOfFlows(sources);

        for (var i = 0; i < sinks.length; i++) {
            var sink = sinks[i];
            if (sink.e2e) {
                sinksE2E++;
                diffTypes[sink.flows]++;
                var obj;
                if (!(sinks[i].iid in iids)) {
                    iids[sink.iid] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
                }
                obj = iids[sink.iid];
                obj[8]++;
                obj[sink.flows]++;
            }
        }
    }
    var keys = Object.keys(coverage);
    var count = 0;
    var toCov = "";
    var total = 0;
    for (var i = 0; i < keys.length; i++) {
        if (coverage[keys[i]] === 3)
            count++;
        else
            toCov += keys[i] + "\n"
    }
// console.log("Still to cover:\n" + toCov);
    var covResult = (count / keys.length) + "=" + count + "/" + keys.length;
    if (keys.length === 0)
        covResult = "NO COND";
    for (var iFlows = 0; iFlows < flows.length; iFlows++) {
        var currentFlow = flows[iFlows];

        if (currentFlow.type == EF_TYPE) {
            totalExplicitFlows++;
        }
        if (currentFlow.type == IF_TYPE) {
            totalImplicitFlows++;
        }
        if (currentFlow.type == BNT_TYPE) {
            totalBntFlows++;
        }
        if (e2e && (!currentFlow.node1 || currentFlow.node1.e2e == true) && currentFlow.node2.e2e == true) {
            if (currentFlow.type == EF_TYPE) {
                explicitFlows++;
            }
            if (currentFlow.type == IF_TYPE) {
                implicitFlows++;
            }
            if (currentFlow.type == BNT_TYPE) {
                bntFlows++;
            }
        }
    }
    // if (printTraces) {
    //     var oldSink = sinks[sinks.length - 1]
    //     sinks = [];
    //     sinks.push(oldSink)
    //     console.log(sinks);
    // }
    var iflowPaths = getSourceToSink(sinks, function () {
        return true;
    });
    var iflowPathsCount = countPaths(iflowPaths, printTraces);
    var typee2eFlows = [0,0,0,0,0,0,0,0];
    for (var j = 0; j < iflowPaths.length; j++) {
        var currPath = iflowPaths[j];
        var type = 0;
        var pathtoStr = ""
        for (var k = 0; k < currPath.length; k++) {
            type |= currPath[k].ownFlows;
            pathtoStr += currPath[k].type + " ";
        }
        // console.log("Path[" + currPath.length + "]=" + pathtoStr);
        typee2eFlows[type]++;
    }
    // console.log(typee2eFlows)
    var observableSecrecyPaths = countPaths(getSourceToSink(sinks, function (element) {
        if (element.type === (TraceConstants.UPGRADE_OP + "") && element.edges.length === 0)
            return false;
        return true;
    }));
    var taintPaths = getSourceToSink(sinks, function (element) {
        if ((element.type === (TraceConstants.UPGRADE_OP + "") && element.edges.length === 0)
            || element.type === (TraceConstants.PUSH_OP + ""))
            return false;
        return true;
    });

    var newSources = [];
    for (var i = 0; i < sources.length; i++)
        if (sources[i].type != TraceConstants.UPGRADE_OP)
            newSources.push(sources[i])
    markEndToEndNodes(newSources,"osec","osecQ", function(element) {
        if (element.type === (TraceConstants.UPGRADE_OP + "") && element.edges.length === 0)
            return false;
        return true;
    });
    markEndToEndNodes(sources,"esec","esecQ", function(element) {
        if ((element.type === (TraceConstants.UPGRADE_OP + "") && element.edges.length === 0)
            || element.type === (TraceConstants.PUSH_OP + "") || element.type === (TraceConstants.POP_OP + ""))
            return false;
        return true;
    });

    var nsuViolations = {}
    for (var i = 0; i < flows.length; i++) {
        if (flows[i].type == IF_TYPE)
            nsuViolations[flows[i].node2.iid] = true;
    }

    var oseCost = 0;
    var eseCost = 0;
    var oseWritesIndex = 0;
    var eseWritesIndex = 0;
    var writesIndex = 0;
    var lastWrite = 0;
    for (var i = 0; i <  nodes.length; i++) {
        var node = nodes[i];
        if (nodes[i].osec) {
            oseCost++;
            if (node.type == TraceConstants.WRITE_OP)
                oseWritesIndex++;
        }
        if (nodes[i].esec) {
            eseCost++;
            if (node.type == TraceConstants.WRITE_OP)
                eseWritesIndex++;
        }
        if (node.type == TraceConstants.WRITE_OP) {
            writesIndex++;
            var lastWrite = node;
        }
    }
    // console.log(dir)
    // console.log(writesIndex + " " + oseWritesIndex + " " + eseWritesIndex);
    // console.log(lcEntries[lcEntries.length - 2]);
    // var noWrites = lastWrite.totalWrites
    var noWrites = (lcEntries.length)? lcEntries.length - 1 : 0;
    // console.log(noWrites);
    var lcNI = getLCEntries(nodes, noWrites, null);
    var lcOSEC = getLCEntries(nodes, noWrites, "osec");
    var lcESEC = getLCEntries(nodes, noWrites, "esec");
    for (var k = 0; k < 10; k++){
        var valB = Math.floor((k + 1) * (noWrites / 10));
        lcNI[(k+1)*10] = lcNI[(k+1)*10]/valB;
        lcOSEC[(k+1)*10] = lcOSEC[(k+1)*10]/valB;
        lcESEC[(k+1)*10] = lcESEC[(k+1)*10]/valB;
    }
    console.log((lcNI[100] / noWrites).toFixed(2) + " " + (lcOSEC[100] / noWrites).toFixed(2) + " " + (lcESEC[100] / noWrites).toFixed(2))
    // console.log();

    // console.log(eseCost + " " + oseCost + " " + nodes.length)

    var taintPathsCount = countPaths(taintPaths);
    // if (taintPathsCount == 0)
    //     console.log(taintPaths.length + " " + taintPathsCount)
// console.log("There are EF+OIF+HIF paths", iflowPathsCount);
// console.log("There are EF+OIF paths", observableSecrecyPaths);
// console.log("There are EF paths", taintPathsCount);
    var outText = "";
    outText += (covResult + ", " + iflowPathsCount + ", " + observableSecrecyPaths + ", " + taintPathsCount + ", " + totalExplicitFlows + ", " + totalImplicitFlows + ", " + totalBntFlows + ", " + explicitFlows + ", " + implicitFlows + ", " + bntFlows + ", " + sinksE2E + ", " + traceSize + ", " + diffTypes[0] + ", " + diffTypes[1] + ", " + diffTypes[2] + ", " + diffTypes[3] + ", " + diffTypes[4] + ", " + diffTypes[5] + ", " + diffTypes[6] + ", " + diffTypes[7] + ",,,,,,,,,,") + "\n";
    for (var i in iids) {
        var iid = iids[i];
        outText += (",,,,,,,,,,,,,,,,,,,,,," + i + "," + iid[8] + "," + iid[0] + ", " + iid[1] + ", " + iid[2] + ", " + iid[3] + ", " + iid[4] + ", " + iid[5] + ", " + iid[6] + ", " + iid[7]);
    }


    var res = {
        coverage: covResult,
        iflowPaths: iflowPathsCount,
        obsSecPaths: observableSecrecyPaths,
        taintPaths: taintPathsCount,
        totalExplicitFlows: totalExplicitFlows,
        totalImplcitFlows: totalImplicitFlows,
        totalHiddenFlows: totalBntFlows,
        violations: sinks.length,
        e2eExplicit: explicitFlows,
        e2eImplicit: implicitFlows,
        e2eHidden: bntFlows,
        outText:outText,
        e2ePaths:typee2eFlows,
        niCost: nodes.length,
        oseCost: oseCost,
        eseCost: eseCost,
        nsuViolations: Object.keys(nsuViolations).length,
        lcNI: (noWrites) ? (lcNI[100]) : 0,
        lcOS: (noWrites) ? (lcOSEC[100]) : 0,
        lcES: (noWrites) ? (lcESEC[100]) : 0,
        lcNIVec: lcNI,
        lcOSVec: lcOSEC,
        lcESVec: lcESEC
    };
    return res;

    function getLCEntries(nodes, noWrites, prop) {
        var lcs = {10:0, 20:0, 30:0, 40:0, 50:0, 60:0, 70:0, 80:0, 90:0, 100:0};
        var arr = [];
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            if (node.type == TraceConstants.WRITE_OP && (!prop || node[prop])) {
                for (var k = 0; k < 10; k++) {
                    var valA = Math.floor((k) * (noWrites / 10));
                    var valB = Math.floor((k + 1) * (noWrites / 10));
                    // console.log(node.totalWrites + " " + valA + " " + valB)
                    if (node.totalWrites <= valB) {
                        lcs[(k+1)*10]++
                    }
                }
            }
        }
        return lcs;
    }

    function countPathsLength(paths) {
        return paths.length
    }

    function countPaths(paths, printTraces) {
        var uniquePaths = {};
        for (var i = 0; i < paths.length; i++) {
            var iids = {};
            for (var j = 0; j < paths[i].length; j++) {
                iids[paths[i][j].iid] = true;
            }
            uniquePaths[Object.keys(iids).join(" ")] = true;
        }
        if (printTraces) {
            console.log("Unique paths: " + Object.keys(uniquePaths).length);
            console.log(Object.keys(uniquePaths).join("\n"));
        }
        return Object.keys(uniquePaths).length
    }

    function markEndToEndFlows(sinks) {
        for (var i in sinks) {
            var queue = [];
            queue.push(sinks[i]);
            while (queue.length > 0) {
                var element = queue.shift();
                element.e2e = true;
                for (var iNodes=0; iNodes<element.edges.length; iNodes++) {
                    if (element.edges[iNodes] && !element.edges[iNodes].inQ1) {
                        queue.push(element.edges[iNodes]);
                        element.edges[iNodes].inQ1 = 1;
                    }
                }
            }
        }
    }

    function markEndToEndNodes(sources, prop1, prop2, cb) {
        for (var i in sources) {
            var queue = [];
            queue.push(sources[i]);
            while (queue.length > 0) {
                var element = queue.shift();
                element[prop1] = true;
                for (var iNodes=0; iNodes<element.forEdges.length; iNodes++) {
                    if (element.forEdges[iNodes] && !element.forEdges[iNodes][prop2] && cb(element.forEdges[iNodes])) {
                        queue.push(element.forEdges[iNodes]);
                        element.forEdges[iNodes][prop2] = 1;
                    }
                }
            }
        }
    }

    function getSourceToSink(sinks, callback) {
        var res = []
        for (var i = 0; i < sinks.length; i++) {
            var newSinks = [];
            newSinks.push(sinks)
            res = res.concat(getSourceToSinkPerSink(sinks, callback));
        }
        return res;
    }

    function getSourceToSinkPerSink(sinks, callback) {
        for (var i = 0; i < nodes.length; i++)
            nodes[i].inQ1 = false;
        var result = [];
        for (var i in sinks) {
            var queue = [];
            var path = [];
            path.push(sinks[i]);
            queue.push({node:sinks[i], path: path});
            while (queue.length > 0) {
                var entry = queue.shift();
                var element = entry.node;
                var one = false;
                if (sources.indexOf(element) != -1)
                    result.push(entry.path);
                for (var iNodes=0; iNodes<element.edges.length; iNodes++) {
                    if (element.edges[iNodes] && !element.edges[iNodes].inQ1
                        && callback(element.edges[iNodes])) {
                        one = true;
                        var newPath = entry.path.slice(0);
                        newPath.push(element.edges[iNodes]);
                        queue.push({node: element.edges[iNodes], path : newPath});
                        element.edges[iNodes].inQ1 = 1;
                    }
                }
                // if (!one)
                //     console.log(element.prodId);
            }
        }
        return result;
    }

    function appendTypeOfFlows(sources) {
        for (var i in sources) {
            var queue = [];
            queue.push(sources[i]);

            while (queue.length>0) {
                var element = queue.shift();
                for (var iNodes in element.forEdges) {
                    if (element.e2e && element.forEdges[iNodes] && element.forEdges[iNodes].inQ2) {
                        element.forEdges[iNodes].flows |= element.flows;
                        queue.push(element.forEdges[iNodes]);
                        element.forEdges[iNodes].inQ2 = 1;
                    }
                }
            }
        }
    }
}

