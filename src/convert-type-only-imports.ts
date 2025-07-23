import { folderExists } from "yafs";

export async function convertTypeOnlyImports(
    folder: string
): Promise<void> {
    if (! await folderExists(folder)) {
        throw new Error(`folder not found: ${folder}`);
    }
}
