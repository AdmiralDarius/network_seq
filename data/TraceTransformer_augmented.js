var S$ = require('S$');

var traceFile = S$.symbol('traceFile',[true, "1234", "random"]);


var sourceMapFile = S$.symbol('sourceMapFile',[true, "1234", "random"]);

traceTransform(traceFile, sourceMapFile);

    var i = 0;
    for (i = 0; i < sourceMap.length; i++) {
        if (sourceMap[i][iid]) {
            return sourceMap[i][iid];
        }
    }
    return -1
}

    var fs = require("fs");
    var traceContent = fs.readFileSync(traceFile);
    var sourceMapContent = fs.readFileSync(sourceMapFile).toString();
    var lines = traceContent.toString().split("\n");
    iids = JSON.parse(sourceMapContent);
    var result = ""
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line) {
            if (!line.match(/#.*/)) {
                var elements = line.split(",");
                var iid = elements[elements.length - 1];
                var map = getSource(iids, iid)
                if (map == -1) {
                    console.log("ERROR" + " -- " + iid + " " + line)
                }
                var re = new RegExp(iid + "$");
                line = line.replace(re, iids[0][iid]);
            } else {
//            line = line.replace(/_jalangi_/, "");
            }
            result += line + "\n";
        }
    }
    fs.writeFileSync(traceFile, result);

}

