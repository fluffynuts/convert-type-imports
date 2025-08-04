import { folderExists, ls, readTextFile, writeTextFile } from "yafs";

// TODO: time and see if there's value in adding a memcache for
//       file content, since we'll read each file twice

export interface Options {
    consolidateTypeImports: boolean;
}
const defaultOptions: Options = {
    consolidateTypeImports: true
};
const importSyntaxWordsWithinBraces = new Set<string>([ ",", "as" ]);
export async function convertTypeOnlyImports(
    folder: string,
    options?: Options
): Promise<void> {
    if (!await folderExists(folder)) {
        throw new Error(`folder not found: ${folder}`);
    }

    const opts = {
        ...defaultOptions,
        ...options
    };

    const allFiles = await ls(folder, {
        recurse: true,
        fullPaths: true,
        exclude: /node_modules/,
        match: /\.ts(x?)$/  // should work for tsx too?
    });

    const typeExports = await parseAllTypeExportsFrom(allFiles);
    for (const file of allFiles) {
        // TODO: gather external imports & pass through parseAllTypeExportsFrom
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

async function parseAllTypeExportsFrom(files: string[]): Promise<Set<string>> {
    const result = new Set<string>();
    for (const file of files) {
        const typeExports = await parseTypeExportsFrom(file);
        for (const e of typeExports) {
            result.add(e);
        }
    }
    return result;
}

const
    globalMatcher = /export\s+(interface|type)\s+(?<typeName>[A-Za-z0-9_]+)/g,
    localMatcher = /export\s+(interface|type)\s+(?<typeName>[A-Za-z0-9_]+)/;

async function parseTypeExportsFrom(file: string): Promise<string[]> {
    const
        result = new Set<string>(),
        contents = await readTextFile(file),
        globalMatches = contents.match(globalMatcher);
    if (!globalMatches) {
        return [];
    }
    for (const str of globalMatches) {
        const localMatch = str.match(localMatcher);
        if (!localMatch || !localMatch.groups) {
            console.error(`local match doesn't work on: '${str}'`);
            continue;
        }
        result.add(localMatch.groups["typeName"]);
    }
    return Array.from(result);
}
