#!/usr/bin/env node
import { example } from "./index";
import yargs = require("yargs");

export interface CliOptions {
    someFlag: boolean;
    someOptionalString?: string;
}
function gatherOptions(): CliOptions | Promise<CliOptions> {
    return yargs
            .usage(`usage: $0 [options]
negate any boolean option by prepending --no-`)
            .option("someFlag", {
                type: "boolean",
                default: false
            }).option("someOptionalString", {
                type: "string",
                demandOption: false
            }).argv;
}

(async function main() {
    const args = yargs.argv;
    example();
})();