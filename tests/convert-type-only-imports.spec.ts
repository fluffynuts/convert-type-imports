import "expect-even-more-jest";
import { faker } from "@faker-js/faker";
import { Sandbox } from "filesystem-sandbox";
import { convertTypeOnlyImports } from "../src";
import { heredoc } from "heredoc-ts";
import { ctx } from "exec-step";
import { CopyFileOptions, cp } from "yafs";

describe(`convert-type-only-imports`, () => {
    describe(`within the project code`, () => {
        it(`should fail when the provided folder doesn't exist`, async () => {
            // Arrange
            const
                sandbox = await Sandbox.create(),
                badPath = sandbox.fullPathFor(faker.word.noun());
            // Act
            await expect(convertTypeOnlyImports({ in: badPath }))
                .toBeRejected(
                    expect.stringContaining(
                        "not found"
                    )
                );
            // Assert
        });

        it(`should not modify a file with no imports`, async () => {
            // Arrange
            const
                sandbox = await Sandbox.create(),
                expected = heredoc`
            export function sayMoo() {
                console.log("moo! moo, I say!")
            }
            `,
                tsFilePath = await sandbox.writeFile("main.ts", expected);
            // Act
            await convertTypeOnlyImports({ in: sandbox.path });
            // Assert
            expect(tsFilePath)
                .toHaveContents(expected);
        });

        it(`should modify a single type import (no consolidation)`, async () => {
            // Arrange
            const
                sandbox = await Sandbox.create(),
                exporter = heredoc`
                export interface ICow {
                    name: string;
                }
            `,
                originalMain = heredoc`
                import { ICow } from "./cow.ts";
                export function makeCow(): ICow {
                    return { name: "Daisy" };
                }
            `,
                expected = heredoc`
                import { type ICow } from "./cow.ts";
                export function makeCow(): ICow {
                    return { name: "Daisy" };
                }
            `;
            await sandbox.writeFile("main.ts", originalMain);
            await sandbox.writeFile("cow.ts", exporter);
            // Act
            await convertTypeOnlyImports({
                in: sandbox.path,
                consolidateTypeImports: false
            });
            // Assert
            expect(sandbox.fullPathFor("main.ts"))
                .toHaveContents(expected);
            expect(sandbox.fullPathFor("cow.ts"))
                .toHaveContents(exporter);
        });

        it(`should modify a single type import (no consolidation, vertical arrangement)`, async () => {
            // Arrange
            const
                sandbox = await Sandbox.create(),
                exporter = heredoc`
                export interface ICow {
                    name: string;
                }
            `,
                originalMain = heredoc`
                import {
                    ICow
                } from "./cow.ts";
                export function makeCow(): ICow {
                    return { name: "Daisy" };
                }
            `,
                expected = heredoc`
                import {
                    type ICow
                } from "./cow.ts";
                export function makeCow(): ICow {
                    return { name: "Daisy" };
                }
            `;
            await sandbox.writeFile("main.ts", originalMain);
            await sandbox.writeFile("cow.ts", exporter);
            // Act
            await convertTypeOnlyImports({
                in: sandbox.path,
                consolidateTypeImports: false
            });
            // Assert
            expect(sandbox.fullPathFor("main.ts"))
                .toHaveContents(expected);
            expect(sandbox.fullPathFor("cow.ts"))
                .toHaveContents(exporter);
        });

        it(`should modify a single type import (consolidated (default))`, async () => {
            // Arrange
            const
                sandbox = await Sandbox.create(),
                exporter = heredoc`
                export interface ICow {
                    name: string;
                }
            `,
                originalMain = heredoc`
                import { ICow } from "./cow.ts";
                export function makeCow(): ICow {
                    return { name: "Daisy" };
                }
            `,
                expected = heredoc`
                import type { ICow } from "./cow.ts";
                export function makeCow(): ICow {
                    return { name: "Daisy" };
                }
            `;
            await sandbox.writeFile("main.ts", originalMain);
            await sandbox.writeFile("cow.ts", exporter);
            // Act
            await convertTypeOnlyImports({
                in: sandbox.path,
                consolidateTypeImports: true
            });
            // Assert
            expect(sandbox.fullPathFor("main.ts"))
                .toHaveContents(expected);
            expect(sandbox.fullPathFor("cow.ts"))
                .toHaveContents(exporter);
        });

        it(`should modify a single type import with another concrete import`, async () => {
            // Arrange
            const
                sandbox = await Sandbox.create(),
                exporter = heredoc`
                export interface ICow {
                    name: string;
                }
                export class Cow implements ICow {
                    constructor(public name: string) {
                    }
                }
                `,
                main = heredoc`
                import { ICow, Cow } from "./cow.ts";
                export function makeCow(): ICow {
                    return new Cow("Daisy");
                }
            `,
                expected = heredoc`
                import { type ICow, Cow } from "./cow.ts";
                export function makeCow(): ICow {
                    return new Cow("Daisy");
                }
            `;
            const exporterFile = await sandbox.writeFile("cow.ts", exporter);
            const mainFile = await sandbox.writeFile("main.ts", main);
            // Act
            await convertTypeOnlyImports({ in: sandbox.path });
            // Assert
            expect(mainFile)
                .toHaveContents(expected);
            expect(exporterFile)
                .toHaveContents(exporter);
        });

        it(`should consolidate type-only imports`, async () => {
            // Arrange
            const
                sandbox = await Sandbox.create(),
                exporter = heredoc`
                export interface ICow {
                    name: string;
                }
                export interface IDog extends ICow {}
                export class Cow implements ICow {
                    constructor(public name: string) {
                    }
                }
                `,
                main = heredoc`
                import { ICow, IDog } from "./cow.ts";
                import { Cow } from "./cow.ts";
                export function makeCow(): ICow {
                    return new Cow("Daisy");
                }
            `,
                expected = heredoc`
                import type { ICow, IDog } from "./cow.ts";
                import { Cow } from "./cow.ts";
                export function makeCow(): ICow {
                    return new Cow("Daisy");
                }
            `;
            const exporterFile = await sandbox.writeFile("cow.ts", exporter);
            const mainFile = await sandbox.writeFile("main.ts", main);
            // Act
            await convertTypeOnlyImports({ in: sandbox.path });
            // Assert
            expect(exporterFile)
                .toHaveContents(exporter);
            expect(mainFile)
                .toHaveContents(expected);
        });

        it(`should not break when imports have been arranged vertically (1)`, async () => {
            // Arrange
            const
                sandbox = await Sandbox.create(),
                exporter = heredoc`
                export interface ICow {
                    name: string;
                }
                export interface IDog extends ICow {}
                export class Cow implements ICow {
                    constructor(public name: string) {
                    }
                }
                `,
                main = heredoc`
                import {
                    ICow,
                    IDog
                } from "./cow.ts";
                import { Cow } from "./cow.ts";
                export function makeCow(): ICow {
                    return new Cow("Daisy");
                }
            `,
                expected = heredoc`
                import type {
                    ICow,
                    IDog
                } from "./cow.ts";
                import { Cow } from "./cow.ts";
                export function makeCow(): ICow {
                    return new Cow("Daisy");
                }
            `;
            const exporterFile = await sandbox.writeFile("cow.ts", exporter);
            const mainFile = await sandbox.writeFile("main.ts", main);
            // Act
            await convertTypeOnlyImports({ in: sandbox.path });
            // Assert
            expect(exporterFile)
                .toHaveContents(exporter);
            expect(mainFile)
                .toHaveContents(expected);
        });

        it(`should not break when imports have been arranged vertically (2)`, async () => {
            // Arrange
            const
                sandbox = await Sandbox.create(),
                exporter = heredoc`
                export interface ICow {
                    name: string;
                }
                export interface IDog extends ICow {}
                export class Cow implements ICow {
                    constructor(public name: string) {
                    }
                }
                `,
                main = heredoc`
                import {
                    ICow, IDog
                } from "./cow.ts";
                import { Cow } from "./cow.ts";
                export function makeCow(): ICow {
                    return new Cow("Daisy");
                }
            `,
                expected = heredoc`
                import type {
                    ICow, IDog
                } from "./cow.ts";
                import { Cow } from "./cow.ts";
                export function makeCow(): ICow {
                    return new Cow("Daisy");
                }
            `;
            const exporterFile = await sandbox.writeFile("cow.ts", exporter);
            const mainFile = await sandbox.writeFile("main.ts", main);
            // Act
            await convertTypeOnlyImports({ in: sandbox.path });
            // Assert
            expect(exporterFile)
                .toHaveContents(exporter);
            expect(mainFile)
                .toHaveContents(expected);
        });

        it(`should work on a single type export`, async () => {
            // Arrange
            const
                sandbox = await Sandbox.create(),
                exporter = heredoc`
                export type Action = () => void;
            `,
                main = heredoc`
                import { Action } from "./action.ts",
                export function tryDo(action: Action, retries: number) {
                    const totalAttempts = retries + 1;
                    let lastError: any;
                    for (let i = 0; i < totalAttempts; i++) {
                        try {
                            action();
                        } catch (e) {
                            lastError = e;
                            continue;
                        }
                    });
                    throw lastError;
                }`,
                expected = heredoc`
                import type { Action } from "./action.ts",
                export function tryDo(action: Action, retries: number) {
                    const totalAttempts = retries + 1;
                    let lastError: any;
                    for (let i = 0; i < totalAttempts; i++) {
                        try {
                            action();
                        } catch (e) {
                            lastError = e;
                            continue;
                        }
                    });
                    throw lastError;
                }
            `;
            const exporterFile = await sandbox.writeFile("action.ts", exporter);
            const mainFile = await sandbox.writeFile("main.ts", main);
            // Act
            await convertTypeOnlyImports({ in: sandbox.path });
            // Assert
            expect(exporterFile)
                .toHaveContents(exporter);
            expect(mainFile)
                .toHaveContents(expected);
        });
    });

    describe(`importing types from index files`, () => {
        it(`should import types from a single index file`, async () => {
            // Arrange
            const
                sandbox = await Sandbox.create(),
                indexContents = heredoc`
                    export interface Cow {
                        name: string;
                    }
                `,
                indexFile = await sandbox.writeFile(
                    "cow/index.ts",
                    indexContents
                ),
                mainContents = heredoc`
                    import { Cow } from "./cow";
                    export function makeCow(name: string): Cow {
                        return { name }
                    }
                `,
                expected = heredoc`
                    import type { Cow } from "./cow";
                    export function makeCow(name: string): Cow {
                        return { name }
                    }
                `,
                mainFile = await sandbox.writeFile(
                    "main.ts",
                    mainContents
                );
            // Act
            await convertTypeOnlyImports({ in: sandbox.path });
            // Assert
            expect(mainFile)
                .toHaveContents(expected);
        });

        it(`should convert type imports from forwarded types in index files`, async () => {
            // Arrange
            // Arrange
            const
                sandbox = await Sandbox.create(),
                cowContents = heredoc`
                    export interface Cow {
                        name: string;
                    }
                `,
                cowFile = await sandbox.writeFile(
                    "cow.ts",
                    cowContents
                ),
                indexContents = heredoc`
                    export * from "./cow";
                `,
                indexFile = await sandbox.writeFile(
                    "cow/index.ts",
                    indexContents
                ),
                mainContents = heredoc`
                    import { Cow } from "./cow";
                    export function makeCow(name: string): Cow {
                        return { name }
                    }
                `,
                expected = heredoc`
                    import type { Cow } from "./cow";
                    export function makeCow(name: string): Cow {
                        return { name }
                    }
                `,
                mainFile = await sandbox.writeFile(
                    "main.ts",
                    mainContents
                );
            // Act
            await convertTypeOnlyImports({ in: sandbox.path });
            // Assert
            expect(mainFile)
                .toHaveContents(expected);
        });

        it(`should parse multi-line type exports`, async () => {
            // Arrange
            const
                sandbox = await Sandbox.create(),
                cowContents = heredoc`
                    export
                        interface
                            Cow
                            {
                                name: string;
                            }
                `,
                cowFile = await sandbox.writeFile(
                    "cow.ts",
                    cowContents
                ),
                mainContents = heredoc`
                    import { Cow } from "./cow";
                    export function makeCow(name: string): Cow {
                        return { name }
                    }
                `,
                expected = heredoc`
                    import type { Cow } from "./cow";
                    export function makeCow(name: string): Cow {
                        return { name }
                    }
                `,
                mainFile = await sandbox.writeFile(
                    "main.ts",
                    mainContents
                );
            // Act
            await convertTypeOnlyImports({ in: sandbox.path });
            // Assert
            expect(mainFile)
                .toHaveContents(expected);
        });
    });

    describe(`types from node_modules`, () => {
        it(`should fix the single type import`, async () => {
            // Arrange
            const
                sandbox = await Sandbox.create(),
                mainContents = heredoc`
                    import { LsOptions, ls } from "yafs";
                    export function lsr(at: string): Promise<string[]> {
                        return await ls(at, { recurse: true, fullPaths: true });
                    );
                `,
                expected = heredoc`
                    import { type LsOptions, ls } from "yafs";
                    export function lsr(at: string): Promise<string[]> {
                        return await ls(at, { recurse: true, fullPaths: true });
                    );
                `,
                mainFile = await sandbox.writeFile(
                    "main.ts",
                    mainContents
                );
            // quicker to copy an existing module than install from npm
            await cp("node_modules/yafs", sandbox.fullPathFor("node_modules/yafs"), {
                recurse: true,
                onExisting: CopyFileOptions.overwriteExisting
            });
            // Act
            await convertTypeOnlyImports({ in: sandbox.path });
            // Assert
            expect(mainFile)
                .toHaveContents(expected);
            expect(console.warn)
                .not.toHaveBeenCalled();
        });
    });

    beforeEach(() => {
        jest.spyOn(console, "warn").mockReturnValue();
        ctx.mute();
    });
    afterEach(async () => {
        await Sandbox.destroyAll();
    });
});
