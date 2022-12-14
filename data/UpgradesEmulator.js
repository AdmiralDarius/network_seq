(function () {

    var upgrades;
    var initPerformed = 0;
    var fs = require('fs');

    function UpgradesEmulator(fileName) {
        this.fileName = fileName;
        this.addUpgrade = addUpgrade;
        this.existsUpgrade = existsUpgrade;
        this.exportToFile = exportToFile;
        this.init = init;
        this.getNoUpgrades = getNoUpgrades;
    }

    function init() {
        this.initPerformed = 1;
        if (fs.existsSync(this.fileName)) {
            var fileContent = fs.readFileSync(this.fileName);
            this.upgrades = JSON.parse(fileContent);
        } else {
            this.upgrades = {};
        }
    }

    function addUpgrade(iid, label) {
        if (!this.initPerformed) {
            this.init();
        }
        this.upgrades[iid] = {label:label};
    }

    function existsUpgrade(iid) {
        if (!this.initPerformed) {
            this.init();
        }
        var upg = this.upgrades[iid];
        if (upg) {
            return upg.label;
        }
        return false;
    }

    function getNoUpgrades() {
        return Object.keys(this.upgrades).length;
    }

    function exportToFile() {
        var fileContent = JSON.stringify(this.upgrades);
        fs.writeFileSync(this.fileName, fileContent);
        console.log("Upgrades file was generated" + fileContent);
    }

    var module;
    if (typeof exports !== "undefined") {
        // export to code running in node application
        module = exports;
    } else {
        // export to code running in browser
        window.$UpgradesEmulator = {};
        module = window.$UpgradesEmulator;
    }

    // exports
    module.addUpgrade = addUpgrade;
    module.existsUpgrade = existsUpgrade;
    module.exportToFile = exportToFile;
    module.UpgradesEmulator = UpgradesEmulator;
    module.getNoUpgrades = getNoUpgrades;

})();
