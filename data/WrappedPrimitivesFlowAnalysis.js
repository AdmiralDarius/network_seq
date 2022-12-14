(function(sandbox) {
    function FlowAnalysis() {

        var Constants = sandbox.Constants;
        var HOP = Constants.HOP;

        var PROJ_ROOT = __dirname + '/../../../../';
        var fs = require('fs');
        var path = require('path');

        var ConcolicValue = require(PROJ_ROOT + 'jalangi/src/js/ConcolicValue.js');
        var LoggerUtils = require(PROJ_ROOT + "pu/src/js/analysis/LoggerUtils.js");
        var Labels = require(PROJ_ROOT + "pu/src/js/analysis/Labels.js");
        var TraceConstants = require(PROJ_ROOT + "pu/src/js/analysis/TraceConstants.js");
        var DEFAULT_META_INFO = {id : -1, label:Labels.LOW_LEVEL};

        var metaHelper = require(PROJ_ROOT + "meta-tracking/src/MetaHelper.js")(DEFAULT_META_INFO);
        var traversalHelper = require(PROJ_ROOT + "utils/src/ObjectTraversalUtils.js")(Constants.SPECIAL_PROP, Constants.SPECIAL_PROP2, Constants.SPECIAL_PROP3, Constants.SPECIAL_PROP4, metaHelper.MAPPING_PROPERTY);

        var UpgradesEmulator = require(PROJ_ROOT + "pu/src/js/analysis/UpgradesEmulator.js")
        var smemory = sandbox.smemory;

        var upgrades = new UpgradesEmulator.UpgradesEmulator(path.resolve("./upgrades.json"));
        var traceFile =  path.resolve("./trace1.json");
        var trace = [];
        var TRACE_BUFFSIZE = 30000;
        var MAX_WRITE_PERFILE = 100;
        var TRACE_ENTRY_SEP = ',';
        var currentFile;
        var noWrites = 0;
        var currentTraceCount = 1;

        var logger = new LoggerUtils.Logger(true, LoggerUtils.DEBUG_LEVEL);
        var context = {programCounter:[]};

        var sources = [];
        var sinks = {};
        var callbacksSources = [];
        var callbacksMapping = {};
        var coverage = {};

        var currentFctDepth = 0;
        var currentValueID = 0;

        var getConcrete = this.getConcrete =  ConcolicValue.getConcrete;

        var writes = 0;
        var secretWrites = 0
        var lcHistory = [];


        /* Wrap the object passed as parameter in a ConcolicValue object with autoWrapped attribute set as true. */
        function wrap(obj) {
            var res;
            res = new ConcolicValue(obj);
            Object.defineProperty(res, "autoWrapped", {
                enumerable: false,
                writable: true
            });
            res.autoWrapped = true;
            return res;
        }

        /* Unwrap the object given as parameter by calling getConcrete on it.*/
        function unwrap(object) {
            if (!(object instanceof ConcolicValue)) {
                return object;
            }
            return getConcrete(object);
        }

        /**
         * Check if the given object was wrapped by our analysis.
         *
         * @param object
         * @returns {boolean}
         */
        function isAutoWrapped(object) {
            if (object && (object instanceof ConcolicValue) && (object.autoWrapped))
                return true;
            return false;
        }

        /**
         *  Shallow clone the given object. Use contructor for Number, String, RegExp, Date, Array and Object.create
         *  for the rest.
         */
        function clone(x) {
            if (x instanceof Number)
                return new Number(x);
            if (x instanceof String)
                return new String(x);
            if (x instanceof RegExp)
                return new RegExp(x);
            if (x instanceof Date)
                return new Date(x);
            if (x instanceof Array)
                return x.slice();
            return Object.create(x);
        }

        /* Mark the given object with the label passed as parameter. The source is also added to be able to identify
         * flows of information from sources to sinks. If the passed object is a primitive, we wrap and return it as the
         * result. */
        function markNonRec(object, label, source) {
            if (!isAutoWrapped(object)) {
                object = wrap(object);
            } else {
                object = wrap(getConcrete(object));
            }
            object.label = label;
            object.id = currentValueID++;
            return object;
        }

        function indexOf(arr, el) {
            for (var i = 0; i < arr.length; i++) {
                if (arr[i] === el)
                return i;
            }
            return -1;
        }


        function mark(object, label, source, iid) {
            var parentEvent = currentValueID;
            traversalHelper.traverse(object, function(parent, prop, val) {
                var id = currentValueID++;
                metaHelper.storeMeta(parent, prop, {id: id, label: label});
                addTraceEntry([TraceConstants.SOURCE_OP, id, source, iid]);//, parentEvent
            });
            return markNonRec(object, label, source);
        }


        function markArgs(args, label, index, iid) {
            // logger.log("Marking arguments...", LoggerUtils.DEBUG_LEVEL)
            var newArgs = [];
            for (var i = 0; i < args.length; i++) {
                if (i === index) {
                    logger.log("Marked argument " + i, LoggerUtils.DEBUG_LEVEL);// + "(" + args[i] + ")");
                    newArgs[i] = mark(args[i], label, "callbackWrapped", iid);
                    addTraceEntry([TraceConstants.SOURCE_OP, newArgs[i].id, "callbackWrapped", iid]);
                } else
                    newArgs[i] = args[i];
            }
            return newArgs;
        }

        /* Check if the object argument is marked with the given label */
        function isMarked(object, label) {
            if (isAutoWrapped(object) && object.label === label) {
                return true;
            }
            return false;
        }

        function isMarkedRec(object, callback) {
            if (isAutoWrapped(object) && Labels.isSensitive(object.label)) {
                return true;
            }
            var result = false;
            traversalHelper.traverse(object, function (parent, key, value) {
                var meta = metaHelper.readMeta(parent, key, value);
                if (meta.id != -1 && Labels.isSensitive(meta.label)) {
                    if (callback)
                        callback(meta.id);
                    result = true;
                }
            });
            return result;
        }


        function addTraceEntry(entry) {
            var entryText = "";
            for (var index = 0; index < entry.length; index++) {
                if (entry[0] == TraceConstants.WRITE_OP && index == (entry.length-1)) {
                    entryText += TRACE_ENTRY_SEP + secretWrites + TRACE_ENTRY_SEP + writes;
                }
                if (index == entry.length-1 && entry[index])
                    entry[index] = sandbox.iidToLocation(entry[index]).toString();
                entryText += (entryText ? TRACE_ENTRY_SEP : "") + entry[index];
            }
            trace.push(entryText);
            if (trace.length > TRACE_BUFFSIZE) {
                noWrites++;
                if (noWrites === MAX_WRITE_PERFILE) {
                    noWrites = 0;
                    currentTraceCount++;
                    traceFile = path.resolve(process.cwd(), "./trace" + currentTraceCount + ".json");
                }
                printTrace();
                trace = [];
            }
        }

        /****** READ HOOKS ******/
        /**/
        function readMem(iid, base, name, val, isGlobal) {
            var meta = metaHelper.readMeta(getConcrete(base), name, val);
            if (meta.id != -1) {
                val = wrap(val);
                val.label = meta.label;
                val.id = meta.id;;
            } else if (isAutoWrapped(base)) {
                val = wrap(val);
                val.label = base.label;
                val.id = currentValueID++;
                addTraceEntry([TraceConstants.OP_OP, base.id, val.id, iid]);
            }

            if (label = upgrades.existsUpgrade(iid)) {
                if (isAutoWrapped(val))
                    var oldID = val.id;
                val = markNonRec(val, label, "bnt", iid);
                addTraceEntry([TraceConstants.UPGRADE_OP, val.id, (oldID ? oldID : -1), iid]);
            }

            if (isAutoWrapped(val)) {
                if (val.label === Labels.PLEAKED_LEVEL && context.programCounter.length === 0) {
                    logger.log("Violation of Permissive-Upgrade Policy at iid " + iid + ", read variable:" + name
                        + ", an upgrade will be inserted ", LoggerUtils.WARNING_LEVEL);
                    addUpgrade(iid, name, val.id, Labels.HIGH_LEVEL)
                }
            }
            return val;
        }

        /**/
        this.readPre = function(iid, name, val, isGlobal) {
            return val;
        };

        /**/
        this.read = function(iid, name, val, isGlobal) {
            return readMem(iid, smemory.getFrame(name), name, val, isGlobal);
        };

        /**/
        this.getField = function(iid, base, offset, val) {

            var oldValue = base[offset];
            var result = readMem(iid, base, offset, val);
            /* Models */
            /* Transfer from base */
            var concreteBase = getConcrete(base);
            if(offset === "length" && ((typeof concreteBase === "string") || (concreteBase.constructor === Array))) {
                result = aggregateComponents(result, base, iid);
            }
            return result;
        };

        this.literalPre = function(iid, val) {
            if (typeof val === "object")
                traversalHelper.traverse(val, function(parent, name, value) {
                    if (isAutoWrapped(value)) {
                        metaHelper.storeMeta(parent, name, {id : value.id, label : value.label});
                        parent[name] = getConcrete(value);
                    }
                });
            return val;
        };

        this.literal = function(iid, val) {
            return val;
        };

        /****** WRITE HOOKS ******/
        function addUpgrade(iid, variable, id, label) {
            logger.log("An upgrade instruction is added for variable " + variable + " at IID " + iid + " to label " + label, LoggerUtils.WARNING_LEVEL);
            upgrades.addUpgrade(iid, label);
            upgrades.exportToFile();
            addTraceEntry([TraceConstants.UPGRADE_OP, id+1 , id, iid]);
            printTraceUpgrades();
            fs.writeFileSync("./lc.json", "");
            fs.writeFileSync(traceFile, "");
            process.exit();
        }

        function updateVar(iid, base, name, val, oldValue) {
            val = aggregatePC(val, iid);
            writes++;
            if (isAutoWrapped(val)) {
                secretWrites++;
                addTraceEntry([TraceConstants.WRITE_OP, (isAutoWrapped(oldValue) ? oldValue.id : -1), (isAutoWrapped(val) ? val.id : -1), iid]);
                metaHelper.storeMeta(base, name, {id:val.id, label:val.label});
                val = getConcrete(val);
            } else {
                metaHelper.removeMeta(base, name);
            }
            lcHistory.push({s:secretWrites ,t:writes});
            return val;
        }

        this.write = function(iid, name, val, oldValue) {
            return updateVar(iid, smemory.getFrame(name), name, val, oldValue);
        };

        this.putFieldPre = function(iid, base, offset, val) {
            var oldValue = base[offset];
            return updateVar(iid, base, offset, val, oldValue);

        };

        this.putField = function(iid, base, offset, val) {
            return val;
        };

        /****** PROPAGATION HOOKS ******/
        this.binaryPre = function(iid, op, left, right) {
        };

        this.binary = function(iid, op, left, right, result) {
            if (op === "delete") {
                if (context.programCounter.length > 0) {
                    var prevId = -1;
                    var prev = left[right];
                    if (prev && prev.id)
                        prevId = prev.id;
                    writes++;
                    secretWrites++;
                    lcHistory.push({s:secretWrites ,t:writes});
                    addTraceEntry([TraceConstants.WRITE_OP, prevId, currentValueID++, iid]);
                    metaHelper.storeMeta(left, right, {id:currentValueID, label:Labels.PLEAKED_LEVEL});
                }
                return result;
            }
            var wrappedLeft = isAutoWrapped(left);
            var wrappedRight = isAutoWrapped(right);
            if (wrappedLeft && wrappedRight) {
                result = wrap(result);
                result.label = Labels.aggregate(left.label, right.label);
                result.id = currentValueID++;
                addTraceEntry([TraceConstants.OP_OP, left.id, right.id, result.id, iid]);
            } else if (wrappedLeft || wrappedRight) {
                var wrappedValue = (wrappedLeft) ? left : right;
                result = wrap(result);
                result.id = currentValueID++;
                result.label = wrappedValue.label;
                addTraceEntry([TraceConstants.OP_OP, wrappedValue.id, result.id, iid]);
            }
            return result;
        };

        /**
         * Propagate to the result the label, source and involvedVars of the operand
         *
         */
        this.unary = function(iid, op, left, result) {
            if (isAutoWrapped(left)) {
                result = wrap(result);
                result.id = currentValueID++;
                result.label = left.label;
                addTraceEntry([TraceConstants.OP_OP, left.id, result.id, iid]);
            }
            return result
        };

        /**
         * For all the values in involvedVars (an array that stores the values that contribute to the computation of
         * the conditional value), we create an entry in the program counter.
         *
         */
        this.conditional = function(iid, left, result_c) {
            if (isAutoWrapped(left)) {
                if (Labels.isSensitive(left.label)) {
                    if (!coverage[iid]) {
                        coverage[iid] = 0;
                    }
                    if (result_c)
                        coverage[iid] |= 2;
                    else
                        coverage[iid] |= 1;
                    addTraceEntry([TraceConstants.PUSH_OP, left.id, result_c, iid]);
                    context.programCounter.push({
                        label:left.label,
                        iid:iid,
                        varName:"conditional",
                        val:left,
                        condVal:result_c,
                        fctDepth:currentFctDepth
                    });
                }
            }
            return left;
        };

        function flowDetected(objectID, sinkProps, iid) {
            if (sinkProps && sinkProps.id)
                addTraceEntry([TraceConstants.FLOW_OP, objectID, sinkProps.id, iid]);
            else
                addTraceEntry([TraceConstants.FLOW_OP, objectID, "id", iid]);

            logger.log("Information flow VIOLATION DETECTED! Information from the following sources was leaked: " + objectID, LoggerUtils.WARNING_LEVEL);
            //printTrace();
            //process.exit();
        }

        /****** FUNCTION HOOKS******/
        this.evalInvoked = function(code, iid) {
            if (sinks.hasOwnProperty(eval.toString())) {
                var sinkProps = sinks[eval.toString()];
                if (isAutoWrapped(code)) {
                    flowDetected(code.id, sinkProps, iid);
                }
                isMarkedRec(code, function (id) {
                    flowDetected(id, sinkProps, iid);
                });
            }
            return code;
        };

        /**/
        this.invokeFunPre = function(iid, f, base, args, val, isConstructor) {
            // logger.log("Enter function " + f.name + " from " + _getCallerFile(), LoggerUtils.DEBUG_LEVEL);
            if (!f) //|| f.name === "cleanPC"
                return;

            var actF = f;
            if ((actF === [].forEach || getConcrete(actF) === [].forEach) && (typeof args[0] === "function") && HOP(args[0], Constants.SPECIAL_PROP2)) {
                var oldFct = args[0];
                var currBase = base;
                args[0] = function() {
                    var newArgs = [];
                    for (var i = 0; i < arguments.length; i++) {
                        newArgs[i] = aggregateComponents(arguments[i], currBase, iid);
                    }
                    return Function.prototype.apply.call(oldFct, currBase, newArgs);
                }
            } else if (context.programCounter.length > 0) {
                for (var i = 0; i < args.length; i++)
                    if (!isAutoWrapped(args[i])) {
                        args[i] = aggregatePC(args[i], iid);
                        if (isAutoWrapped(args[i])) {
                            secretWrites++;
                            addTraceEntry([TraceConstants.WRITE_OP, -1, args[i].id, iid]);
                        }
                        writes++;
                        lcHistory.push({s:secretWrites ,t:writes});
                    }
            }

            if (f === Function.prototype.apply || f === Function.prototype.call) {
                if (typeof f === "function") {
                    actF = base;
                }
            }

            if (isAutoWrapped(actF) && actF && HOP(actF, Constants.SPECIAL_PROP2)) {
                addTraceEntry([TraceConstants.PUSH_OP, actF.id, iid]);
                context.programCounter.push({
                    label:actF.label,
                    iid:iid,
                    varName:"function-call",
                    val:actF,
                    condVal:true,
                    fctDepth:currentFctDepth
                });
                actF = getConcrete(actF);
            }
            var sinkProps;
            if (actF && sinks.hasOwnProperty(actF.toString()))
                sinkProps = sinks[actF.toString()];
            else if (actF && actF.actFct && sinks.hasOwnProperty(actF.actFct.toString()))
                sinkProps = sinks[actF.act.toString()];

            if (actF.name === "sink" ||  sinkProps) {
                if (sinkProps && sinkProps.isBaseSink) {
                    logger.log("sink hit");
                    if (isAutoWrapped(base)) {
                        flowDetected(base.id, sinkProps, iid);
                    }
                    isMarkedRec(base, function(id) {
                        flowDetected(id, sinkProps, iid);
                    });
                } else {
                    for (var i = 0; i < args.length; i++) {
                        if (isAutoWrapped(args[i])) {
                            flowDetected(args[i].id, sinkProps, iid);
                        }
                        isMarkedRec(args[i], function(id) {
                            flowDetected(id, sinkProps, iid);
                        });
                    }
                }
            }
            if (callbacksSources.indexOf(actF) != -1 || callbacksSources.indexOf(actF.actFct) != -1) {
                var currCB = callbacksMapping[actF] || callbacksMapping[actF.actFct];
                var index = currCB.index;
                var label = currCB.label;
                var aIndex = currCB.argIndex;
                var name = currCB.name;
                var construc = currCB.construc;
                var currIID = iid;
                if (!construc || base instanceof construc) {
                    logger.log("Registered wrapped callback for " + name, LoggerUtils.DEBUG_LEVEL);
                    if (args[index] && (HOP(args[index], Constants.SPECIAL_PROP2) || (typeof args[index] === "function"))) { //TODO check for function:
                        logger.log("Registration successful for argument " + index, LoggerUtils.DEBUG_LEVEL);
                        var oldFct = args[index];
                        args[index] = function () {
                            logger.log("Executed wrapped callback: " + name + ", mark " + aIndex + "-th parameter, " + arguments.length + " actual args", LoggerUtils.DEBUG_LEVEL);
                            var newArgs = markArgs(arguments, label, aIndex, currIID);
                            return Function.prototype.apply.call(oldFct, unwrap(base), newArgs);
                        };
                        args[index].actFct = oldFct;
                    }
                }
            }
        };

        function printReport() {

        }

        function printTraceUpgrades() {
            if (trace.length != 0) {
                logger.log("Printing trace upgrades...", LoggerUtils.WARNING_LEVEL);
                var result = "";
                for (var index = 0; index < trace.length; index++) {
                    result += trace[index] + "\n";
                }
                fs.appendFileSync("./traceUpgrades" + upgrades.getNoUpgrades() + ".json", result);
                logger.log("Printed trace (length " + trace.length + ")", LoggerUtils.WARNING_LEVEL);
            }
        }

        function printTrace() {
            if (trace.length != 0) {
                logger.log("Printing trace...", LoggerUtils.WARNING_LEVEL);
                var result = "";
                for (var index = 0; index < trace.length; index++) {
                    result += trace[index] + "\n";
                }
                fs.appendFileSync(traceFile, result);
                result = "";
                for (var i = 0; i < lcHistory.length; i++)
                    result += lcHistory[i].s + "," + lcHistory[i].t + "," + (lcHistory[i].s / lcHistory[i].t) + "\n";
                fs.appendFileSync("./lc.json", result);
                logger.log("Printed trace (length " + trace.length + ")", LoggerUtils.WARNING_LEVEL);
            }
        }

        this.aggregatePC = aggregatePC;
        function aggregatePC(val, iid) {
            //for now is enough that we have one element in PC
            if (context.programCounter.length > 0 && !isAutoWrapped(val)) {
                var oldId = -1;
                if (!(isAutoWrapped(val))) {
                    val = wrap(val);
                    val.id = currentValueID++;
                } else {
                    oldId = val.id;
                }
                val.label = Labels.aggregatePartially(val.label, Labels.HIGH_LEVEL);
                addTraceEntry([TraceConstants.OP_OP, oldId, val.id, iid]);
            }
            return val;
        }

        this.cleanPC = cleanPC
        function cleanPC(iid) {
            var exists = false;

            for (var i = 0; i < context.programCounter.length; i++) {
                if (context.programCounter[i].fctDepth === currentFctDepth
                    && context.programCounter[i].iid === iid)
                    exists = true;
            }
            if (exists) {
                while (context.programCounter.length > 0) {
                    var indexLast = context.programCounter.length - 1;
                    if (context.programCounter[indexLast].fctDepth === currentFctDepth) {
                        var popped = context.programCounter.pop();
                        addTraceEntry([TraceConstants.POP_OP, popped.iid]);
                        if (popped.iid === iid)
                            break;
                    } else {
                        break;
                    }
                }
            }
        }

        /**/
        this.invokeFun = function(iid, f, base, args, val, isConstructor) {
            var result = val;
            /* Sinks */
            if (f.name === "addSink") {
                if (args[0])
                    // sinks[args[0].toString()]
                    sinks[args[0]]= {id : args[1], isBaseSink : args[2]};
                return;
            }

            if (f.name === "downgrade") {
                return getConcrete(args[0]);
            }

            if (f.name === "unwrap") {
                return unwrap(args[0]);
            }
            if (context.programCounter.length > 0) {
                lastEntry = context.programCounter[context.programCounter.length - 1];
                if (lastEntry.varName === "function-call" && lastEntry.fctDepth === currentFctDepth && lastEntry.val === f) {
                    // Auto wrapped due to secret function call function
                    var prevId = -1;
                    if (!(isAutoWrapped(val))) {
                        val = wrap(val);
                        val.id = currentValueID++;
                    } else {
                        prevId = val.id;
                    }
                    val.label = Labels.aggregatePartially(val.label, Labels.HIGH_LEVEL);
                    writes++;
                    secretWrites++;
                    lcHistory.push({s:secretWrites ,t:writes});
                    addTraceEntry([TraceConstants.WRITE_OP, -1, val.id, iid]);
                    cleanPC(lastEntry.iid);
                    return val;
                }
            }

            // if (f.name === "cleanPC") {
            //     cleanPC(args[0]);
            //     return;
            // }

            /* Sources */
            if (f.name === "addCallbackSource") {
                logger.log("Register callback for " + args[4], LoggerUtils.DEBUG_LEVEL);
                callbacksSources.push(args[0]);
                callbacksMapping[args[0]] = {index : args[1], label : args[3], argIndex: args[2], name: args[4], construc: args[5]};
                return;
            }
            if (f.name === "addSource") {
                //logger.log("New source:" + args[0] + " with " + args[1], LoggerUtils.DEBUG_LEVEL);
                if (args[1]) {
                    sources.push({fct:args[0], label:args[1], source:args[2]});
                } else {
                    sources.push({fct:args[0], label:Labels.HIGH_LEVEL, source:"auto"});
                }
                return;
            }
            if (f.name === "source") {
                if (args[1]) {
                    result = mark(args[0], args[1], args[2], iid);
                } else {
                    result = mark(args[0], Labels.HIGH_LEVEL, "auto", iid);
                }
                logger.log("Variable marked:"  + result.id + " with " + args[1] + ", source " + args[2], LoggerUtils.WARNING_LEVEL);
                addTraceEntry([TraceConstants.SOURCE_OP, result.id, args[2], iid]);
                return result;
            }
            for (var s=0; s < sources.length; s++) {
                if (sources[s].fct === f) {
                    result = mark(val, sources[s].label, sources[s].source, iid);
                    //logger.log("Source reaced: " + sources[s].source, LoggerUtils.WARNING_LEVEL);
                    logger.log("Variable marked:"  + result.id  + " with " + sources[s].label + ", source " + args[2], LoggerUtils.WARNING_LEVEL);
                    addTraceEntry([TraceConstants.SOURCE_OP, result.id, sources[s].source, iid]);
                }
            }

            /* Models */
            /* Transfer from the arguments */
            //if (f === JSON.stringify) {
            if (!HOP(f, Constants.SPECIAL_PROP2)) {
                for (var i = 0; i < args.length; i++)
                    result = aggregateComponents(result, args[i], iid);
            }

            /* Transfer from base object */
            //if (f === "".indexOf || f === [].indexOf || f === [].lastIndexOf ||  f === [].concat ||  f === [].join || f === [].valueOf) {
            if (base !== global && base !== console && !HOP(f, Constants.SPECIAL_PROP2)) { //TODO check if this console and global checks are necessary
                result = aggregateComponents(result, base, iid);
            }

            if (f === Object.prototype.hasOwnProperty) {
                var val = readMem(iid, base, args[0], getConcrete(base)[args[0]]);
                if (isAutoWrapped(val)) {
                    val.concrete = getConcrete(result);
                    return val;
                }
            }

            if (f === Object.defineProperty && args && args[0] && args[2] && args[1] && args[2].value) {
                try {
                    var oldValue = args[0][args[1]];
                } catch (e){
                    var oldValue = null;
                }
                var newValue = readMem(iid, args[2], "value", args[2].value);
                result = updateVar(iid, args[0], args[1], newValue, oldValue);
                    console.log("hit the define property model " + isAutoWrapped(newValue) + " " + newValue);
            }

            if (f === [].push) {
                if (isAutoWrapped(args[0])) {
                    metaHelper.storeMeta(base, base.length - 1, {id: args[0].id, label:args[0].label});
                    writes++;
                    secretWrites++;
                    lcHistory.push({s:secretWrites ,t:writes});
                    addTraceEntry([TraceConstants.WRITE_OP, -1, args[0].id, iid]);
                }
            }
            if (f === [].pop) {
                metaHelper.removeMeta(base, base.length); // this is performed after the actual remove
            }
            if (f === [].concat) {
                if (isAutoWrapped(args[0])) {
                    // store meta on the parent object - how to get a reference for that?
                }
            }
            if (f === [].splice) {
                var pos = args[0];
                var howMany = args[1];
                var toadd = args.length - 2;
                result = wrap(result);
                // remove old meta and transfer them to result
                for (var i = pos; i < pos + howMany; i++) {
                    var oldMeta = metaHelper.readMeta(base, i);
                    metaHelper.storeMeta(result, i - pos, oldMeta);
                    metaHelper.removeMeta(base, i);
                }
                //shift old metas
                //TODO
                //add new metas
                //TODO
            }
            if (f === "x".split) {
                if (isAutoWrapped(base)) {
                    for (var i = 0; i < val.length; i++) {
                        var newId = currentValueID++;
                        metaHelper.storeMeta(val, i, {id: newId, label:base.label});
                        addTraceEntry([TraceConstants.OP_OP, base.id, newId, iid]);
                    }
                }
            }
            return result;
        };

        function aggregateComponents(result, element, iid) {
            if (isAutoWrapped(element)) {
                if (!isAutoWrapped(result)) {
                    result = wrap(result);
                    result.id = currentValueID++;
                    result.label = Labels.LOW_LEVEL;
                }
                result.label = Labels.aggregate(result.label, element.label);
                addTraceEntry([TraceConstants.OP_OP, element.id, result.id, iid]);
            }
            traversalHelper.traverse(element, function (parent, key, value) {
                var meta = metaHelper.readMeta(parent, key, value);
                if (meta.id != -1) {
                    if (!isAutoWrapped(result)) {
                        result = wrap(result);
                        result.id = currentValueID++;
                        result.label = Labels.LOW_LEVEL;
                    }
                    result.label = Labels.aggregate(result.label, meta.label);
                    addTraceEntry([TraceConstants.OP_OP, meta.id, result.id, iid]);
                }
            });
            return result;
        }

        this.scriptEnter = function(iid, fileName) {
            if (!currentFile) {
                currentFile = fileName;
                fs.appendFileSync(traceFile, "#" + currentFile + "\n");
            }
        };

        this.beginExecution = function(fileName) {
            currentFile = fileName;
            fs.appendFileSync(traceFile, "#" + currentFile + "\n");
        };

        this.scriptExit = function(iid) {
        };


        this.endExecution = function() {
            printReport();
            printTrace();
            var totalCond = 0, covered = 0, covBranches = 0;
            var toBeCov = "";
            for (var i in coverage) {
                var loc = sandbox.iidToLocation(i).toString();
                if (loc.indexOf("Policy.js") === -1) {
                    totalCond++;
                    if (coverage[i] == 3) {
                        covBranches += 2;
                        covered++;
                    } else {
                        covBranches++;
                        toBeCov += loc + "\n";
                    }
                }
            }
            console.log("Coverage report:");
            console.log(covered + "/" + totalCond + " " + (covered/totalCond));
            console.log("Dynamic branch coverage: " + (covBranches/(2*totalCond)));
            console.log("To improve: \n" + toBeCov);
        };

        this.functionEnter = function(iid, fun, dis /* this */, args) {
            currentFctDepth++;
        };

        this.functionExit = function(iid, returnVal, exceptionVal) {

            while (context.programCounter.length > 0 && context.programCounter[context.programCounter.length - 1].fctDepth === currentFctDepth) {
                var popped = context.programCounter.pop();
                addTraceEntry([TraceConstants.POP_OP, popped.iid]);
            }
            currentFctDepth--;

            if (exceptionVal)
                logger.log("Exception caught! " + exceptionVal, LoggerUtils.WARNING_LEVEL);
            return returnVal;
        };

        /**
         * Unwrap the elements contained in the second parameter. If the first element is set, certain arguments are
         * whitelisted from the unwrapping.
         *
         * @param isRequire
         * @param args
         * @returns {Array}
         */
        function unwrapArguments(args) {
            var newArgs = [];
            for (var index = 0; index < args.length; index++) {
                if (isAutoWrapped(args[index]))
                    var unwrapped = getConcrete(args[index]);
                else
                    var unwrapped = args[index];

                newArgs.push(unwrapped);
            }
            return newArgs
        }

        /**
         * Get from the stack trace the filed that called the analysis
         */
        function _getCallerFile() {
            try {
                var err = new Error();
                var callerfile;
                var currentfile;

                Error.prepareStackTrace = function (err, stack) { return stack; };

                currentfile = err.stack.shift().getFileName();

                while (err.stack.length) {
                    callerfile = err.stack.shift().getFileName();
                    if(currentfile !== callerfile) return callerfile;
                }
            } catch (err) {}
            return undefined;
        }

        /**
         * A hook introduced by us in jalangi, that allows us to unwrap the arguments passed to uninstrumented
         *  functions.
         *
         */
        this.getFunction = function(old_fct, base, isConstructor) {
            if (!old_fct) //|| old_fct.name === "cleanPC"
                return old_fct;
            if (HOP(old_fct, Constants.SPECIAL_PROP2)) {
                return old_fct;
            }

            if (!isConstructor) {
                var retFct = function() {
                    var ee = null;
                    try {
                        ee = require('events').EventEmitter.prototype.emit;
                    } catch (e) {}
                    if (((old_fct === Object.apply || old_fct === Object.call)) || old_fct === ee) {
                        // logger.log("Calling with wrapped args", LoggerUtils.DEBUG_LEVEL);
                        var args = arguments;
                        if (base !== global) { // TODO change this
                            if (isAutoWrapped(base)) {
                                base = unwrap(base);
                            }
                        }
                    } else {
                        var args = unwrapArguments(arguments);
                        if (base !== global) { // TODO change this
                            if (isAutoWrapped(base)) {
                                base = unwrap(base);
                            }
                        }
                    }
                    var fct = unwrap(old_fct);
                    return Function.prototype.apply.call(fct, base, args);
                };
                retFct.actFct = old_fct;
                return retFct;
            } else {
                var retFct = function() {
                    var args = unwrapArguments(arguments);
                    old_fct = unwrap(old_fct);
                    return callAsNativeConstructor(old_fct, args);
                };
                retFct.actFct = old_fct;
                return retFct;
            }
        };

        function callAsNativeConstructorWithEval(Constructor, args) {
            var a = [];
            for (var i = 0; i < args.length; i++)
                a[i] = 'args[' + i + ']';
            return eval('new Constructor(' + a.join() + ')');
        }

        /**
         *  Call the given constructor using the new operator and passing the arguments provided as second argument.
         *  Maximum number of arguments is 5. This code is replicated from jalangi!
         */
        function callAsNativeConstructor(Constructor, args) {
            if (args.length === 0) {
                return new Constructor();
            }
            if (args.length === 1) {
                return new Constructor(args[0]);
            }
            if (args.length === 2) {
                return new Constructor(args[0], args[1]);
            }
            if (args.length === 3) {
                return new Constructor(args[0], args[1], args[2]);
            }
            if (args.length === 4) {
                return new Constructor(args[0], args[1], args[2], args[3]);
            }
            if (args.length === 5) {
                return new Constructor(args[0], args[1], args[2], args[3], args[4]);
            }
            return callAsNativeConstructorWithEval(Constructor, args);
        }

        /* This method is here only as a warning that it should not be used to modify the return value of a function
         * call. Use function exit instead*/
        this.return_ = function(val) {
            //This value will not be returned as result of the function!!!
            return val;
        };

    }

    sandbox.analysis = new FlowAnalysis();
})(J$);
