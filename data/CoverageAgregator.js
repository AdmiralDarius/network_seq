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

var flowsReportFile = process.argv[2];
var fs = require("fs");
var content = fs.readFileSync(flowsReportFile);
var lines = content.toString().split("\n");

if (process.argv[3] == "0") {
    for (var line in lines) {
        if (lines[line].length > 2) {
            var reportLine = JSON.parse(lines[line]);
            console.log(reportLine);
            //TODO aggregate flows
        }
    }
    return;
}
var assertionFile =  JSON.parse(fs.readFileSync(process.argv[3]).toString());

console.log("\x1b[1m========================================== Report Number of Flows ==========================================\x1b[22m")
for (var line in lines) {
    if (lines[line].length>2) {
        var reportLine = JSON.parse(lines[line]);
        var testName = reportLine.file.replace(/.*\//,"").replace(/_jalangi_.js/,"");

        var efColor = "";
        var ifColor = "";
        var bntColor = "";
        var res = "PASSED";

        if (assertionFile[testName].hasOwnProperty("direct")) {
            if (assertionFile[testName].direct == reportLine.flows.expFlows) {
                efColor = "\x1b[32m"
            } else {
                // ASSERTION VIOLATION
                efColor = "\x1b[31m"
                res = "FAILED";
            }
        }
        if (assertionFile[testName].hasOwnProperty("indirect")) {
            if (assertionFile[testName].indirect == reportLine.flows.impFlows) {
                ifColor = "\x1b[32m"
            } else {
                // ASSERTION VIOLATION
                ifColor = "\x1b[31m"
                res = "FAILED";
            }
        }

        if (assertionFile[testName].hasOwnProperty("branchNotTaken")) {
            if (assertionFile[testName].branchNotTaken == reportLine.flows.bntFlows) {
                bntColor = "\x1b[32m"
            } else {
                // ASSERTION VIOLATION
                bntColor = "\x1b[31m"
                res = "FAILED";
            }
        }
        fs.appendFileSync(process.argv[4], reportLine.file.replace(/_jalangi_.js/,"") + " " + res + "\n");
        var formatString = "%s " + efColor + " %s\x1b[0m" + ifColor + " %s\x1b[0m"+ bntColor + " %s\x1b[0m";
        console.log(formatString, pad(testName, 40, " ", 2),  pad(reportLine.flows.expFlows, 4, " ", STR_PAD_LEFT), pad(reportLine.flows.impFlows, 4, " ", STR_PAD_LEFT), pad(reportLine.flows.bntFlows, 4, " ", STR_PAD_LEFT));
    }
}
