#!/usr/bin/env node
import yargs = require("yargs");
import { convertTypeOnlyImports, type CliOptions, Dictionary } from "./convert-type-only-imports";

interface RawCliOptions extends Omit<CliOptions, "alias"> {
    alias: string[];
}

function gatherOptions(args: string[]): RawCliOptions {
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
        }).option("alias", {
            type: "array",
            demandOption: false
        }).argv as RawCliOptions;
}

function massage(rawOpts: RawCliOptions): CliOptions {
    const aliases = rawOpts.alias ?? [];
    const resolvedAlias: Dictionary<string> = {};
    for (const alias of aliases) {
        const
            parts = alias.split("="),
            key = parts[0],
            value = parts.slice(1).join("=");
        resolvedAlias[key] = value;
    }
    return {
        ...rawOpts,
        alias: resolvedAlias
    };
}

(async function main() {
    const
        args = process.argv.slice(2),
        rawOpts = gatherOptions(args),
        opts = massage(rawOpts);
    await convertTypeOnlyImports(opts);
})();
