import { folderExists, folderName, FsEntities, joinPath, ls, readTextFile, writeTextFile } from "yafs";
import { ctx } from "exec-step";
import * as path from "path";

export interface Dictionary<T> {
    [key: string]: T;
}

// TODO: time and see if there's value in adding a memcache for
//       file content, since we'll read each file twice

export interface CliOptions {
    in: string;
    consolidateTypeImports?: boolean;
    alias?: Dictionary<string>;
}

interface Options extends CliOptions {
    consolidateTypeImports: boolean;
    alias: Dictionary<string>;
}

const defaultOptions: CliOptions = {
    in: "",
    consolidateTypeImports: true,
    alias: {}
};
const importSyntaxWordsWithinBraces = new Set<string>([ ",", "as" ]);

export async function convertTypeOnlyImports(
    options: CliOptions
): Promise<void> {
    if (!options.in) {
        throw new Error(`option 'in' was not set`);
    }
    const folder = options.in;
    if (!await folderExists(folder)) {
        throw new Error(`folder not found: ${folder}`);
    }

    const opts = {
        ...defaultOptions,
        ...options
    } as Options;

    const allFiles = await ls(folder, {
        recurse: true,
        fullPaths: true,
        exclude: /node_modules/,
        entities: FsEntities.files,
        match: /\.ts(x?)$/  // should work for tsx too?
    });

    const baseFolder = await tryFindFolderContainingNodeModules(folder);
    const typeExports = await parseAllTypeExportsFrom(
        allFiles,
        baseFolder,
        opts.alias
    );
    let idx = 1;
    for (const file of allFiles) {
        const perc = (idx++ * 100 / allFiles.length).toFixed(0);
        await ctx.exec(`Processing (${perc}% of ${allFiles.length}): ${file}`,
            async () => {
                await processFile(file, typeExports, opts);
            });
    }
}

async function processFile(
    file: string,
    typeExports: Set<string>,
    opts: Options
) {
    const
        contents = await readTextFile(file),
        words = contents.split(/\b/),
        result = [] as string[];
    let
        inImport = false,
        inImportBraces = false,
        importedConcrete = false;
    for (const word of words) {
        if (word === "import") {
            inImport = true;
            result.push(word);
            continue;
        }

        if (inImport && word.trim() === "{") {
            inImportBraces = true;
            result.push(word);
            continue;
        }

        const isCloseBrace = word.trim() === "}";

        // tslint:disable-next-line:label-position
        check_import: if (inImport) {
            if (typeExports.has(word)) {
                result.push(`type ${word}`);
            } else {
                if (!isCloseBrace) {
                    const isOtherSyntaxWord = importSyntaxWordsWithinBraces.has(
                        word.trim()
                    );
                    if (!isOtherSyntaxWord) {
                        importedConcrete = true;
                    }
                }
                result.push(word);
            }
        }

        if (inImport) {
            if (inImportBraces && isCloseBrace) {
                // the block labeled 'check_import' would have appended the brace,
                // so consolidateRecentTypeImports can backtrack to consolidate
                inImportBraces = false;
                inImport = false;
                if (!importedConcrete && opts.consolidateTypeImports) {
                    consolidateRecentTypeImports(result);
                }
            }
        } else {
            result.push(word);
        }
    }
    await writeTextFile(file, result.join(""));
}

async function tryFindFolderContainingNodeModules(
    fromFolder: string
): Promise<string | undefined> {
    let
        search = fromFolder,
        last = search;
    do {
        if (await folderExists(joinPath(search, "node_modules"))) {
            return search;
        }
        search = folderName(search);
        last = search;
    } while (last !== search);
    console.warn(`
Can't find node_modules folder when traversing upwards from '${fromFolder}'
- type imports from packages cannot be fixed up.
`.trim()
    );
}

function consolidateRecentTypeImports(result: string[]) {
    for (let i = result.length - 1; i--; i > 0) {
        const current = result[i];
        if (current.trim() === "}") {
            continue;
        }
        if (current.trim() === "{") {
            result[i] = current.replace("{", "type {");
            break;
        } else {
            result[i] = current.replace("type ", "");
        }
    }
}

async function parseAllTypeExportsFrom(
    files: string[],
    packageBaseFolder: string | undefined,
    alias: Dictionary<string>
): Promise<Set<string>> {
    const result = new Set<string>();
    for (const file of files) {
        const typeExports = await parseTypeExportsFrom(file);
        for (const e of typeExports) {
            result.add(e);
        }
        if (packageBaseFolder) {
            const typeImports = await parseNodeModuleTypeImportsFrom(
                file,
                packageBaseFolder,
                alias
            );
            for (const e of typeImports) {
                result.add(e);
            }
        }
    }
    return result;
}

const
    globalExportMatcher = /export\s+(interface|type)\s+([A-Za-z0-9_]+)/g,
    localExportMatcher = /export\s+(interface|type)\s+(?<typeName>[A-Za-z0-9_]+)/;

async function parseTypeExportsFrom(file: string): Promise<string[]> {
    const
        result = new Set<string>(),
        contents = await readTextFile(file),
        globalMatches = contents.match(globalExportMatcher);
    if (!globalMatches) {
        return [];
    }
    for (const str of globalMatches) {
        const localMatch = str.match(localExportMatcher);
        if (!localMatch || !localMatch.groups) {
            console.error(`
ERROR: local export match doesn't work on file '${file}' for fragment: '${str}'
(please report this with an example)`.trim());
            continue;
        }
        result.add(localMatch.groups["typeName"]);
    }
    return Array.from(result);
}

const
    globalImportMatcher = /import.* from "([^"]+)"/g,
    localImportMatcher = /import.* from "(?<moduleName>[^"]+)"/;

async function parseNodeModuleTypeImportsFrom(
    file: string,
    packageBaseFolder: string,
    alias: Dictionary<string>
): Promise<string[]> {
    const
        result = new Set<string>(),
        contents = await readTextFile(file),
        globalMatches = contents.match(globalImportMatcher);
    if (!globalMatches) {
        return [];
    }
    for (const str of globalMatches) {
        const localMatch = str.match(localImportMatcher);
        if (!localMatch || !localMatch.groups) {
            console.error(`
ERROR: local import match doesn't work on file '${file}' for fragment: '${str}'
(please report this with an example)`.trim()
            );
            continue;
        }
        const moduleName = resolveAliases(
            localMatch.groups["moduleName"],
            alias
        );
        const searchPath = path.join(
            packageBaseFolder,
            "node_modules",
            moduleName
        );

        if (!await folderExists(searchPath)) {
            console.error(`
WARNING: can't find node module '${moduleName}' at '${searchPath}'
- type exports from this module will not be processed`.trim()
            );
        }

        const moduleFiles = await ls(
            searchPath, {
                recurse: true,
                fullPaths: true,
                match: /\.ts$/,
                entities: FsEntities.files
            }
        );

        for (const moduleFile of moduleFiles) {
            const exportedTypes = await parseTypeExportsFrom(moduleFile);
            for (const t of exportedTypes) {
                result.add(t);
            }
        }

    }
    return Array.from(result);
}

function resolveAliases(
    moduleName: string,
    alias: Dictionary<string>
): string {
    if (alias[moduleName]) {
        return alias[moduleName];
    }
    for (const key of Object.keys(alias)) {
        if (moduleName.startsWith(key)) {
            return `${alias[key]}${moduleName.slice(key.length)}`;
        }
    }
    return moduleName;
}
