(function () {

    var violations = 0, upgrades = 0;
    var impFlows = 0, expFlows = 0, bntFlows = 0
    var flows = [];

    function FlowsCounter(agg) {
        this.aggregate = agg;
        this.explicitFlow = explicitFlow;
        this.implicitFlow = implicitFlow;
        this.bntFlow = bntFlow;
        this.report = report;
        this.violation = violation;
        this.upgrade = upgrade;
    }

    function explicitFlow(flowId) {

        if (!this.aggregate) {
            expFlows++;
            return;
        }
        if (flows.indexOf(flowId) == -1) {
            expFlows++;
            flows.push(flowId);
        }
    }

    function implicitFlow(flowId) {
        if (!this.aggregate) {
            impFlows++;
            return;
        }
        if (flows.indexOf(flowId) == -1) {
            impFlows++;
            flows.push(flowId);
        }
    }

    function bntFlow(flowId) {
        if (!this.aggregate) {
            bntFlows++;
            return;
        }
        if (flows.indexOf(flowId) == -1) {
            bntFlows++;
            flows.push(flowId);
        }
    }

    function violation() {
        violations++;
    }

    function upgrade() {
        upgrades++;
    }

    function report() {
//        console.log("There were observed: " + expFlows + " explicit flows, " + impFlows + " implicit flows and  " +
//            bntFlows + " branch not taken flows.")
        return {expFlows:expFlows, impFlows:impFlows, bntFlows:bntFlows, violations: violations, upgrades: upgrades};
    }

    var module;
    if (typeof exports !== "undefined") {
        // export to code running in node application
        module = exports;
    } else {
        // export to code running in browser
        window.$EsprimaUtil = {};
        module = window.$FlowsCounter;
    }

    // exports
    module.FlowsCounter = FlowsCounter;

})();
