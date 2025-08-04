import "expect-even-more-jest";
import { faker } from "@faker-js/faker";
import { Sandbox } from "filesystem-sandbox";
import { convertTypeOnlyImports } from "../src";
import { heredoc } from "heredoc-ts";

describe(`convert-type-only-imports`, () => {
    const { stringContaining } = expect;
    it(`should fail when the provided folder doesn't exist`, async () => {
        // Arrange
        const
            sandbox = await Sandbox.create(),
            badPath = sandbox.fullPathFor(faker.word.noun());
        // Act
        await expect(convertTypeOnlyImports(badPath))
            .toBeRejected(
                stringContaining(
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
        await convertTypeOnlyImports(sandbox.path);
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
        await convertTypeOnlyImports(sandbox.path, { consolidateTypeImports: false });
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
        await convertTypeOnlyImports(sandbox.path, { consolidateTypeImports: false });
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
        await convertTypeOnlyImports(sandbox.path, { consolidateTypeImports: true });
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
        await convertTypeOnlyImports(sandbox.path);
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
        await convertTypeOnlyImports(sandbox.path);
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
        await convertTypeOnlyImports(sandbox.path);
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
        await convertTypeOnlyImports(sandbox.path);
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
        await convertTypeOnlyImports(sandbox.path);
        // Assert
        expect(exporterFile)
            .toHaveContents(exporter);
        expect(mainFile)
            .toHaveContents(expected);
    });

    afterEach(async () => {
        await Sandbox.destroyAll();
    });
});
