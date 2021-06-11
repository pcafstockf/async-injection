// jasmine-ts-console-reporter doesn't seem to work for us, and this one reports line numbers in .ts files just fine.
const JasmineConsoleReporter = require("jasmine-console-reporter");

jasmine.getEnv().clearReporters(); // Clear default console reporter
jasmine.getEnv().addReporter(new JasmineConsoleReporter());
