(function() {

    var LOW_LEVEL = 0;
    var PLEAKED_LEVEL = 1;
    var HIGH_LEVEL = 2;

    function compare(label1, label2) {
        return label1 > label2;
    }

    //this can be optimized to not call compare
    function aggregate(label1, label2) {
        if (compare(label1, label2))
            return label1;
        return label2;
    }

    var module;
    if (typeof exports !== "undefined") {
        // export to code running in node application
        module = exports;
    } else {
        // export to code running in browser
        window.$Labels = {};
        module = window.$NSUSimpleLabels;
    }

    // exports
    module.LOW_LEVEL = LOW_LEVEL;
    module.PLEAKED_LEVEL = PLEAKED_LEVEL;
    module.HIGH_LEVEL = HIGH_LEVEL;
    module.aggregate = aggregate;
    module.compare = compare;
})();

