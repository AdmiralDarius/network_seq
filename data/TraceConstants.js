(function() {

    var module;
    if (typeof exports !== "undefined") {
        // export to code running in node application
        module = exports;
    } else {
        // export to code running in browser
        window.$TraceConstants = {};
        module = window.$TraceConstants;
    }

    // exports
    module.NOP = 0;
    module.WRITE_OP = 1;
    module.UPGRADE_OP = 2;
    module.OP_OP = 3;
    module.PUSH_OP = 4;
    module.FLOW_OP = 5;
    module.POP_OP = 6;
    module.SOURCE_OP = 7;
})();

