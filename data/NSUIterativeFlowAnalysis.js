(function(sandbox) {
    function FlowAnalysis() {

        var iidToLocation = sandbox.iidToLocation;
        var Constants = sandbox.Constants;
        var HOP = Constants.HOP;
        var sort = Array.prototype.sort;
        var smemory = sandbox.smemory;


        var fs = require('fs');
        var path = require('path');
        // use path.resolve() to make it work with a symlink to jalangi
        var sourceMap = require(path.resolve("./jalangi_sourcemap.js"));
        var ConcolicValue = require(path.resolve(process.cwd(), '../../../jalangi/src/js/ConcolicValue.js'));
        var LoggerUtils = require(path.resolve(process.cwd(), "../src/js/analysis/LoggerUtils.js"));
        var Labels = require(path.resolve(process.cwd(), "../src/js/analysis/Labels.js"));
        var FlowsCounter = require("./FlowsCounter.js");
        var TraceConstants = require("./TraceConstants.js");
        var flowsCounter = new FlowsCounter.FlowsCounter();

        var UpgradesEmulator = require("./UpgradesEmulator.js")

        var upgrades = new UpgradesEmulator.UpgradesEmulator(path.resolve(process.cwd(), "../upgrades.json"));
        var flowsReportFile = path.resolve(process.cwd(), "../flows.json");
        var traceFile = path.resolve(process.cwd(), "../results/trace.json");
        var trace = [];
        var TRACE_BUFFSIZE = 10000;
        var TRACE_ENTRY_SEP = ',';
        var currentFile;

        var logger = new LoggerUtils.Logger(true, LoggerUtils.DEBUG_LEVEL);
        var context = {programCounter:[]}

        var sources = [];
        var sinks = [];

        var currentFctDepth = 0;
        var currentFlow = 0;
        var currentValueID = 0;

        var getConcrete = this.getConcrete = ConcolicValue.getConcrete;
        var getShadow = this.getShadow = function(obj) {
            var sobj = smemory.getShadowObject(obj);
            if (sobj) {
                return sobj.shadow;
            } else {
                return undefined;
            }
        };

        /* Return true if the passed object is undefined/null or function, number, boolean, string; else otherwise */
        function isPrimitive(obj) {
            var type = typeof obj;
            if (!obj)
                return true;
            if (type === "function")
                return true;
            if (type === "number")
                return true;
            if (type === "boolean")
                return true;
            if (type === "string")
                return true;
            return false
        }

        /* Wrap the object passed as parameter in a ConcolicValue object with autoWrapped attribute set as true. */
        function wrap(obj) {
            var res;
            res = new ConcolicValue(obj);
            res.autoWrapped = true;
            return res
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
            if ((object instanceof ConcolicValue) && (object.autoWrapped))
                return true;
            return false;
        }

        /* Unifies in a new set the source of all variables passed as arguments */
        function aggregateSource() {
            var result = []
            for (var i = 0, n = arguments.length; i < n; i++) {
                for (var v in arguments[i].source) {
                    if (result.indexOf(arguments[i].source[v]) === -1) {
                        result.push(arguments[i].source[v])
                    }
                }
            }
            return result;
        }

        /**
         * Unifies the arrays given as parameters in a new set. No duplicates allowed!
         * @returns {Array}
         */
        function aggregateArray() {
            var result = []
            for (var i = 0, n = arguments.length; i < n; i++) {
                for (var v in arguments[i]) {
                    if (result.indexOf(arguments[i][v]) === -1) {
                        result.push(arguments[i][v])
                    }
                }
            }
            return result;
        }

        /* Mark the given object with the label passed as parameter. The source is also added to be able to identify
         * flows of information from sources to sinks. If the passed object is a primitive, we wrap and return it as the
         * result. */
        function mark(object, label, source) {
//            if (isPrimitive(object))
            if (!isAutoWrapped(object))
                object = wrap(object)
            var shadow = smemory.getShadowObject(object);
            shadow.label = label;
            shadow.source = [];
            shadow.id = currentValueID++;
            shadow.source.push(source);
            logger.log("Marked " + object + " " + label + ", source " + source, LoggerUtils.DEBUG_LEVEL);
            return object;

        }

        /* Check if the property name given as parameter is a special property introduced by jalangi */
        function isSpecialProp(name) {
            return name.indexOf(Constants.SPECIAL_PROP) != -1 ||
                  name.indexOf(Constants.SPECIAL_PROP2) != -1 ||
                  name.indexOf(Constants.SPECIAL_PROP3) != -1 ||
                  name.indexOf(Constants.SPECIAL_PROP4) != -1;
        }

        /* Check if the object argument is marked with the given label */
        function isMarked(object, label) {
            var shadow = smemory.getShadowObject(object);
            if (shadow && shadow.label && (unwrap(shadow.label) === label || shadow.label === label)) {
                return true;
            }
            return false;
        }

        function addTraceEntry(entry) {
            var entryText = "";
            for (var index in entry)
                entryText += (entryText ? TRACE_ENTRY_SEP : "") + entry[index];
            trace.push(entryText);
            if (trace.length > TRACE_BUFFSIZE) {
                printTrace();
                trace = [];
            }
        }

        /****** READ HOOKS ******/
        /**/
        function readMem(iid, name, val, isGlobal) {
            if (!isAutoWrapped(val) && (typeof val !== "function")) {
                logger.log("Auto Wrapping " + name, LoggerUtils.LOW_LEVEL);
                val = wrap(val);
                shadow = smemory.getShadowObject(val);
                shadow.label = Labels.LOW_LEVEL;
            }
            if (label = upgrades.existsUpgrade(iid)) {
                if (isPrimitive(val))
                    val = wrap(val)
                logger.log("Upgrade reached " + iid + " " + label, LoggerUtils.DEBUG_LEVEL);
                logger.log(isMarked(val, Labels.LOW_LEVEL))
                if (!isMarked(val, Labels.HIGH_LEVEL)) {
                    //FlowsCounter.bntFlow("bnt", name);
                    shadow = smemory.getShadowObject(val);
                    if (shadow) {
//                        if (shadow.flows.bntf.indexOf(1) === -1) {
//                        }
//                        shadow.flows.bntf.push(currentFlow++);
                    }
                }
                shadow = smemory.getShadowObject(val);
                var oldID = (shadow ? shadow.id : -1);
                val = mark(val, label, "bnt");
                shadow = smemory.getShadowObject(val);
//                trace.push(TraceConstants.UPGRADE_OP + "," + shadow.id + "," +  oldID);
                addTraceEntry([TraceConstants.UPGRADE_OP, shadow.id, (oldID ? oldID : -1), iid]);

            }
            var shadow;
            if (!isPrimitive(val)) {
                shadow = smemory.getShadowObject(val);
                //TODO change this for NSU
//                if (shadow.label === Labels.PLEAKED_LEVEL && context.programCounter.length === 0) {
//                    logger.log("Violation of Permissive-Upgrade Policy at iid " + iid + ", read variable:" + name
//                    + ", an upgrade will be inserted ", LoggerUtils.WARNING_LEVEL);
//                    flowsCounter.upgrade();
//                    addUpgrade(iid, name, Labels.HIGH_LEVEL)
//                }
                shadow.lastName = name;
                shadow.involvedVars = [];
                shadow.involvedVars.push(val);
            }
            //TODO check if it's needed to aggregate the PC
            return val
        }

        /**/
        this.readPre = function(iid, name, val, isGlobal) {
            return val;
        };

        /**/
        this.read = function(iid, name, val, isGlobal) {
            logger.log("Read:" + name + " " + (typeof val) + " " + !val, LoggerUtils.DEBUG_LEVEL);
            return readMem(iid, name, val, isGlobal);
        };

        /**/
        this.getField = function(iid, base, offset, val) {
            var name = base + "[" + offset + "]";
            var oldValue = base[offset];
            logger.log("Get " + val + " " + val + " " + isPrimitive(val) + " ", LoggerUtils.DEBUG_LEVEL);
            return readMem(iid, name, val);
        };

        this.literalPre = function(iid, val) {
            return val;
        };

        this.literal = function(iid, val) {
            if (!isAutoWrapped(val) && (typeof val !== "function")) {
                logger.log("Auto Wrapping " + val, LoggerUtils.LOW_LEVEL);
                val = wrap(val);
                var shadow = smemory.getShadowObject(val);
                shadow.label = Labels.LOW_LEVEL;
            }
            return val;
        };

        /****** WRITE HOOKS ******/
        function addUpgrade(iid, variable, label) {
            logger.log("An upgrade instruction is added for variable " + variable + " at IID " + iid + " to label " + label, LoggerUtils.WARNING_LEVEL);
            upgrades.addUpgrade(iid, label);
            upgrades.exportToFile();
            printTrace();
            process.exit();
        }

        /**
         *
         * @param iid
         * @param name
         * @param val
         * @param oldValue
         * @returns {*}
         */
        function updateVar(iid, name, val, oldValue) {
            if (label = upgrades.existsUpgrade(iid)) {
                if (isPrimitive(val))
                    val = wrap(val)
                logger.log("Upgrade reached " + iid + " " + label, LoggerUtils.DEBUG_LEVEL);
                shadow = smemory.getShadowObject(val);
                var oldID = (shadow ? shadow.id : -1);
                val = mark(val, label, "bnt");
                shadow = smemory.getShadowObject(val);
                addTraceEntry([TraceConstants.UPGRADE_OP, shadow.id, (oldID ? oldID : -1), iid]);

            }

            for (index in context.programCounter) {
                logger.log("Combine with PC entry: " + context.programCounter[index], LoggerUtils.DEBUG_LEVEL);
                if (!(val && isAutoWrapped(val))) {
                    val = wrap(val);
                    var shadow = smemory.getShadowObject(val);
                    shadow.id = currentValueID++;
                }
                var shadowNew = smemory.getShadowObject(val);
                shadowNew.lastWrite = iid;
                var shadowOld = smemory.getShadowObject(oldValue);
                var pcEntry = context.programCounter[index];
                shadowSource = smemory.getShadowObject(pcEntry.val);
                if (!shadowOld || !shadowOld.label || (shadowOld.label && shadowOld.label === Labels.LOW_LEVEL)) {
                    var iidToAdd = pcEntry.iid;
                    if (shadowOld && shadowOld.lastWrite) {
                        iidToAdd = shadowOld.lastWrite;
                    }
                    logger.log("Violation of Permissive-Upgrade Policy at iid " + iid + ", read variable:" + name
                        + ", an upgrade will be inserted", LoggerUtils.WARNING_LEVEL);
                    addUpgrade(iidToAdd, name, Labels.HIGH_LEVEL)
                }
                shadowNew.label = Labels.aggregate(shadowNew.label, shadowSource.label);
                shadowNew.source = aggregateSource(shadowNew, shadowSource);
            }
            if (val && isAutoWrapped(val)) {
                var shadowOld = smemory.getShadowObject(oldValue);
                var shadowNew = smemory.getShadowObject(val);
                shadowNew.lastWrite = iid;
                addTraceEntry([TraceConstants.WRITE_OP, (shadowOld ? shadowOld.id : -1), (shadowNew ? shadowNew.id : -1), iid]);
                if (shadowNew) {
                    var shadowSource, index;
                    if (shadowNew.label && shadowNew.label === Labels.HIGH_LEVEL) {
                    }
                    for (index in shadowNew.involvedVars) {
                        shadowSource = smemory.getShadowObject(shadowNew.involvedVars[index]);
                    }
                }
            }
            return val;
        }

        this.write = function(iid, name, val, oldValue) {
            logger.log("Write " + name + " " + val + " " + isPrimitive(val) + " " + oldValue + " " +
            (oldValue instanceof ConcolicValue), LoggerUtils.DEBUG_LEVEL)
            return updateVar(iid, name, val, oldValue);
        };

        this.putFieldPre = function(iid, base, offset, val) {
            var name = "base[" + offset + "]";
            var oldValue = base[offset];
            logger.log("Put " + name + " " + val + " " + isPrimitive(val) + " " + oldValue, LoggerUtils.DEBUG_LEVEL)
            return updateVar(iid, name, val, oldValue);
            ;
        }
        this.putField = function(iid, base, offset, val) {
            return val;
        };

        /****** PROPAGATION HOOKS ******/
        this.binaryPre = function(iid, op, left, right) {
            logger.log("Binary " + typeof left + " " + typeof right, LoggerUtils.DEBUG_LEVEL)
        };
        this.binary = function(iid, op, left, right, result) {
            var wrappedLeft = (left && isAutoWrapped(left));
            var wrappedRight
                = (right && isAutoWrapped(right));
            var shadowResult;
            if (wrappedLeft && wrappedRight) {
                var shadowLeft = smemory.getShadowObject(left)
                var shadowRight = smemory.getShadowObject(right)
                if (typeof result != "undefined") {
                    result = wrap(result);
                    shadowResult = smemory.getShadowObject(result);
                    shadowResult.label = Labels.aggregate(shadowLeft.label, shadowRight.label);
                    shadowResult.source = aggregateSource(shadowLeft, shadowRight);
                    shadowResult.id = currentValueID++;
                    shadowResult.involvedVars = aggregateArray(shadowLeft.involvedVars, shadowRight.involvedVars);
                    addTraceEntry([TraceConstants.OP_OP, shadowLeft.id, shadowRight.id, shadowResult.id, iid]);
                    logger.log("Binary (both wrapped) " + iid + " " + op + " " + left + " " + " " + right + " " + result
                          + " " + shadowLeft.label + " " + shadowRight.label + " " + shadowResult.label,
                          LoggerUtils.DEBUG_LEVEL);
                }
            } else if (wrappedLeft || wrappedRight) {
                var wrappedValue = (wrappedLeft) ? left : right;
                var shadowWrapped = smemory.getShadowObject(wrappedValue);
                if (result != "undefined") {
                    result = wrap(result);
                    shadowResult = smemory.getShadowObject(result);
                    shadowResult.id = currentValueID++;
                    shadowResult.label = shadowWrapped.label;
                    shadowResult.source = shadowWrapped.source;
                    shadowResult.involvedVars = shadowWrapped.involvedVars;
                    addTraceEntry([TraceConstants.OP_OP, shadowWrapped.id, shadowResult.id, iid]);
                    logger.log("Binary (one wrapped) " + iid + " " + op + " " + result + " " + shadowResult.label,
                          LoggerUtils.DEBUG_LEVEL);
                }
            }
            return result;
        };

        /**
         * Propagate to the result the label, source and involvedVars of the operand
         *
         * @param iid
         * @param op
         * @param left
         * @param result
         * @returns {*}
         */
        this.unary = function(iid, op, left, result) {
            if (left && isAutoWrapped(left)) {
                var shadowLeft = smemory.getShadowObject(left);
                if (result != "undefined") {
                    result = wrap(result);
                    var shadowResult = smemory.getShadowObject(result);
                    shadowResult.id = currentValueID++;
                    shadowResult.label = shadowLeft.label;
                    shadowResult.source = shadowLeft.source;
                    shadowResult.involvedVars = shadowLeft.involvedVars;
                    addTraceEntry([TraceConstants.OP_OP, shadowLeft.id, shadowResult.id, iid]);
                    logger.log("Unary " + iid + " " + op + " " + left + " " + shadowLeft.label + " " + shadowResult.label,
                          LoggerUtils.DEBUG_LEVEL)
                }
            }
            return result
        };

        this.conditionalPre = function(iid, left) {
            logger.log("Conditional [" + left + "]. ", LoggerUtils.DEBUG_LEVEL)
        };

        /**
         * For all the values in involvedVars (an array that stores the values that contribute to the computation of
         * the conditional value), we create an entry in the program counter.
         *
         * @param iid
         * @param left
         * @param result_c
         * @returns {*}
         */
        this.conditional = function(iid, left, result_c) {

            logger.log("Conditional: " + left + " " + result_c, LoggerUtils.DEBUG_LEVEL)
            // TODO call coverage aggregator

            if (left && isAutoWrapped(left)) {
                var shadowLeft = smemory.getShadowObject(left)
//                var index;
//                for (index in shadowLeft.involvedVars) {
//                    var shadowInvVar = smemory.getShadowObject(shadowLeft.involvedVars[index]);
//                    context.programCounter.push({label: shadowInvVar.label, iid: iid, varName: shadowInvVar.lastName, val: shadowLeft.involvedVars[index], condVal: result_c, fctDepth: currentFctDepth});
//                    logger.log("Pushed " + shadowInvVar.lastName + " on PC", LoggerUtils.DEBUG_LEVEL);
                if (isMarked(left, Labels.HIGH_LEVEL)) {
                    addTraceEntry([TraceConstants.PUSH_OP, shadowLeft.id, iid]);
                    context.programCounter.push({
                        label:shadowLeft.label,
                        iid:iid,
                        varName:"conditional",
                        val:left,
                        condVal:result_c,
                        fctDepth:currentFctDepth
                    });
                    logger.log("Pushed " + left + " on PC", LoggerUtils.DEBUG_LEVEL);
                }
//                }

            }
            // TODO implement here conditional stack
            return left;
        };

        /****** FUNCTION HOOKS******/
        /**/
        this.invokeFunPre = function(iid, f, base, args, val, isConstructor) {
            if (f && f.name && f.name === "upgrade") {

            }
        };

        function printReport() {
            var result = {file:currentFile, flows:flowsCounter.report()};
            fs.appendFileSync(flowsReportFile, JSON.stringify(result) + "\n");
        }

        function printTrace() {
            logger.log("Printing trace...", LoggerUtils.WARNING_LEVEL);
//            var result = {file: currentFile, trace: trace};
//            fs.appendFileSync(traceFile, JSON.stringify(result) + "\n");
            for (var index in trace) {
                fs.appendFileSync(traceFile, trace[index] + "\n");
            }
            logger.log("Printed trace (length " + trace.length + ")", LoggerUtils.WARNING_LEVEL);
        }

        /**/
        this.invokeFun = function(iid, f, base, args, val, isConstructor) {

            logger.log("Invoke function " + f.name, LoggerUtils.DEBUG_LEVEL);
            var result = val;
            /* Sinks */
            if (f.name === "addSink") {
                sinks.push(args[0]);
            }
            if (f.name === "sink" || sinks.indexOf(f) != -1) {
                logger.log("Sink: " + args[0] + " ", LoggerUtils.DEBUG_LEVEL);
                if (!isPrimitive(args[0]) && (isMarked(args[0], Labels.HIGH_LEVEL) )) {
                    var resString = "";
                    var shadow = smemory.getShadowObject(args[0]);
                    /* Count flows */
                    if (shadow && shadow) {
                        addTraceEntry([TraceConstants.FLOW_OP, shadow.id, "id", iid]);
                    }

                    for (var index in shadow.source) {
                        resString += shadow.source[index] + " ";
                    }
                    logger.log("Information flow VIOLATION DETECTED! Information from the following sources was leaked: " + resString, LoggerUtils.WARNING_LEVEL);
                    flowsCounter.violation();
//                    printReport();
                }
            }

            if (f.name === "cleanPC") {
                var exists = false;
                while (context.programCounter.length > 0) {
                    exists = true;
                    var indexLast = context.programCounter.length - 1;
                    if (context.programCounter[indexLast].fctDepth === currentFctDepth && context.programCounter[indexLast].iid === args[0]) {
                        logger.log("Popped " + context.programCounter[indexLast].varName, LoggerUtils.DEBUG_LEVEL);
                        context.programCounter.pop();
                    } else {
                        break;
                    }
                }
                if (exists) {
                    addTraceEntry([TraceConstants.POP_OP, args[0]]);
                }
            }

            /* Sources */
            if (f.name === "addSource") {
                logger.log("New source:" + args[0] + " with " + args[1], LoggerUtils.DEBUG_LEVEL);
                if (args[1]) {
                    sources.push({fct:args[0], label:args[1], source:args[2]});
                } else {
                    sources.push({fct:args[0], label:Labels.HIGH_LEVEL, source:"auto"});
                }
            }
            if (f.name === "source") {
//                logger.log("Variable marked:"  + args[0] + " with " + args[1] + ", source " + args[2], LoggerUtils.WARNING_LEVEL);
                if (args[1]) {
                    result = mark(args[0], args[1], args[2]);
                } else {
                    result = mark(args[0], Labels.HIGH_LEVEL, "auto");
                }
                var shadow = smemory.getShadowObject(result);
                addTraceEntry([TraceConstants.SOURCE_OP, shadow.id, shadow.source[0], iid]);
            }
            for (var s in sources) {
                if (sources[s].fct === f) {
                    result = mark(val, sources[s].label, sources[s].source)
                    var shadow = smemory.getShadowObject(result);
                    addTraceEntry([TraceConstants.SOURCE_OP, shadow.id, shadow.source[0], iid]);
                }
            }
            logger.log("Result of function invokation: " + result + " " + typeof result, LoggerUtils.DEBUG_LEVEL);
            return result;
        };

        this.scriptEnter = function(iid, fileName) {
            if (!currentFile) {
                currentFile = fileName;
                fs.appendFileSync(traceFile, "#" + currentFile + "\n");
            }
        };

        this.scriptExit = function(iid) {
        };


        this.endExecution = function() {
            printReport();
            printTrace();
        };

        this.functionEnter = function(iid, fun, dis /* this */, args) {
            currentFctDepth++;
            logger.log("New  function entered " + fun.name + " " + iid, LoggerUtils.DEBUG_LEVEL)
        };

        this.functionExit = function(iid, returnVal, exceptionVal) {
            logger.log("Function exit, clear PC:", LoggerUtils.DEBUG_LEVEL);
            while (context.programCounter.length > 0 && context.programCounter[context.programCounter.length - 1].fctDepth === currentFctDepth) {
                logger.log("Popped " + context.programCounter[context.programCounter.length - 1].varName, LoggerUtils.DEBUG_LEVEL);
                context.programCounter.pop();
            }

            currentFctDepth--;
            if (exceptionVal)
                logger.log("Exception cought! " + exceptionVal, LoggerUtils.WARNING_LEVEL);
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
        function unwrapArguments(isRequire, args) {
            //TODO find a better way to whitelist this!
            var whitelist = ["vm", "os", "path", "os", "fs", "util", "./TestUtils", "../tests/permUpdateInfoFlowAnalysis/basicTests/TestUtils"];
            var newArgs = [];
            for (arg in args) {
                var unwrapped = unwrap(args[arg]);
                if (isRequire && whitelist.indexOf(unwrapped) == -1 && unwrapped.indexOf("TestUtils") == -1) {
                    var instrumented = unwrapped.replace(/\.[^/.]+$/, "") + "_jalangi_.js";
                    newArgs.push(instrumented)
                } else {
                    newArgs.push(unwrapped)
                }
            }
            return newArgs
        }

        /**
         * A hook introduced by us in jalangi, that allows us to unwrap the arguments passed to uninstrumented
         *  functions.
         *
         * @param old_fct
         * @param base
         * @param isConstructor
         * @returns {*}
         */
        this.getFunction = function(old_fct, base, isConstructor) {
            if (!old_fct)
                return old_fct;
            var shadow = smemory.getShadowObject(base);
            // if instrumented function, do not unwrap the arguments
            if (HOP(old_fct, Constants.SPECIAL_PROP2)) {
                return old_fct;
            }

            var isRequire;
            if (old_fct.name == 'require') {
                isRequire = true;
            }

            if (!isConstructor) {
                return function() {
                    var args = unwrapArguments(isRequire, arguments);
                    base = unwrap(base);
                    logger.log("Native call: " + old_fct + " " + base + " " + args[0] + " " + args[1], LoggerUtils.DEBUG_LEVEL)
                    return Function.prototype.apply.call(old_fct, base, args);
                }
            } else {
                return function() {
                    var args = unwrapArguments(isRequire, arguments);
                    base = unwrap(base);
                    logger.log("Native constructor call: " + old_fct + " " + base + " " + args[0] + " " + args[1], LoggerUtils.DEBUG_LEVEL);
                    return callAsNativeConstructor(old_fct, args);
                }
            }

        };

        /**
         *  Call the given constructor using the new operator and passing the arguments provided as second argument.
         *  Maximum number of arguments is 5. This code is replicated from jalangi!
         *
         * @param Constructor
         * @param args
         * @returns {Constructor}
         */
        function callAsNativeConstructor(Constructor, args) {
            //TODO allow constructor to have more than 5 args
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
        }

        /* This method is here only as a warning that it should not be used to modify the return value of a function
         * call. Use function exit instead*/
        this.return_ = function(val) {
            logger.log("Return called: " + val + " " + isPrimitive(val) + " " + (val instanceof ConcolicValue),
                  LoggerUtils.DEBUG_LEVEL);
            //This value will not be returned as result of the function!!!
            return val;
        };

    }

    sandbox.analysis = new FlowAnalysis();
})(J$)