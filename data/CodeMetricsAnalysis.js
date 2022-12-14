(function(sandbox) {
    function FlowAnalysis() {

        var Constants = sandbox.Constants;
        var HOP = Constants.HOP;
        var sort = Array.prototype.sort;
        var currentFile;
        var smemory = sandbox.smemory;

        var conditionals = 0;
        var functionCalls = {};
        var operations = 0;
        var noCalls = 0;
        var coverage = {};

        this.conditional = function(iid, left, result_c) {
            if (!coverage[iid]) {
                coverage[iid] = 0;
            }
            if (left)
                coverage[iid] |= 2;
            else
                coverage[iid] |= 1;
            operations++;
            conditionals++;
            return left;
        };

        /****** FUNCTION HOOKS******/
        /**/
        this.invokeFunPre = function(iid, f, base, args, val, isConstructor) {
        };


        /**/
        this.invokeFun = function(iid, f, base, args, val, isConstructor) {
            operations++;
            noCalls++;
            var currentFC = functionCalls[f];
            if (!currentFC) {
                functionCalls[f]=[];
                currentFC = functionCalls[f];
            }
            var exists = false;
            for (var i = 0; i < currentFC.length; i++) {
                var iidCurrent = currentFC[i];
                if (iid === iidCurrent) {
                    exists = true;
                }
            }
            if (!exists) {
                currentFC.push(iid);
            }
            return val;
        };

        this.scriptEnter = function(iid, fileName) {
            operations++;
            if (!currentFile) {
                currentFile = fileName;
            }
        };

        this.endExecution = function() {
            operations++;
            //console.log("In file " + currentfile);
            //console.log(conditionals + " conditionals");
            var total = 0, sum = 0;
            for (var i in functionCalls) {
                total++;
                sum+=functionCalls[i].length;
            }
            var totalCond = 0, covered = 0;
            for (var i in coverage) {
                totalCond++;
                if (coverage[i] == 3) {
                    covered++;
                }
            }
            console.log(sum + " " + total);
            console.log(conditionals/operations + "," +  (sum / total) + "," + noCalls/operations + ", " + covered/totalCond);
        };

        this.declare = function (iid, name, val, isArgument, argIndex) {
            operations++;};


        this.literal = function (iid, val) {
            operations++;
            return val;
        };

        this.getField = function (iid, base, offset, val) {
            operations++;
            return val;
        }

        this.putField = function (iid, base, offset, val) {
            operations++;
            return val;
        };

        this.read = function (iid, name, val, isGlobal) {
            operations++;
            return val;
        };

        this.write = function (iid, name, val, oldValue) {
            operations++;
            return val;
        };

        this.binary = function (iid, op, left, right, result_c) {
            operations++;
            return result_c;
        };


        this.unary = function (iid, op, left, result_c) {
            operations++;
            return result_c;
        };

        this.functionEnter = function (iid, fun, dis /* this */, args) {
            operations++;};

        this.functionExit = function (iid) {
            operations++;
            return false;
            /* a return of false means that do not backtrack inside the function */
        };

        this.return_ = function (val) {
            operations++;
            return val;
        };

        this.instrumentCode = function(iid, code) {
            operations++;
            return code;
        };


    }

    sandbox.analysis = new FlowAnalysis();
})(J$)
