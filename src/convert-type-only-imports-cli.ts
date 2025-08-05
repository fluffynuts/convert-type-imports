#!/usr/bin/env node
import yargs = require("yargs");
import { convertTypeOnlyImports, type Options } from "./convert-type-only-imports";

function gatherOptions(args: string[]): Options {
    return yargs(args)
        .usage(`usage: $0 [options]
negate any boolean option by prepending --no-`)
        .option("in", {
            type: "string",
            default: process.cwd()
        }).option("consolidate-type-imports", {
            type: "boolean",
            default: true,
            demandOption: false
        }).argv as Options;
}

(async function main() {
    const
        args = process.argv.slice(2),
        opts = gatherOptions(args);
    await convertTypeOnlyImports(opts);
})();
