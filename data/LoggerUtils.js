(function() {

    var DEBUG_LEVEL = 0;
    var WARNING_LEVEL = 1;

    function Logger(printOnScreen, level) {

        if (printOnScreen) {
            this.level = level;
            this.log = function (message, level) {
                if (this.level <= level) {
                    console.log(message)
                }
            }
        } else {
            this.log = function(){}
        }
    }

    var module;
    if (typeof exports !== "undefined") {
        // export to code running in node application
        module = exports;
    } else {
        // export to code running in browser
        window.$LoggerUtil = {};
        module = window.$LoggerUtil;
    }

    // exports
    module.Logger = Logger;
    module.DEBUG_LEVEL = DEBUG_LEVEL;
    module.WARNING_LEVEL = WARNING_LEVEL;
})();

