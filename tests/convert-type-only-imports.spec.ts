import "expect-even-more-jest";
import { faker } from "@faker-js/faker";
import { Sandbox } from "filesystem-sandbox";
import { convertTypeOnlyImports } from "../src";
import { heredoc } from "heredoc-ts";
import { readTextFile } from "yafs";

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
        const result = await readTextFile(tsFilePath);
        expect(result)
            .toEqual(expected);
    });

    it(`should modify a single type import`, async () => {
        // Arrange
        const
            sandbox = await Sandbox.create(),
            exporter = heredoc`
            export interface ICow {
                name: string
            }
            `,
            originalMain = heredoc`
                import { ICow } from "./cow.ts;
                export function makeCow(): ICow {
                    return { name: "Daisy" };
                }
            `;
        // TODO: continue from here
        // Act
        // Assert
    });

    afterEach(async () => {
        await Sandbox.destroyAll();
    });
});
