import * as fsp from "node:fs/promises";
import { randomBytes } from "node:crypto";

export async function atomicWriteFile(targetPath: string, content: string): Promise<void> {
  const suffix = `${process.pid}.${Date.now()}.${randomBytes(4).toString("hex")}`;
  const tmp = `${targetPath}.${suffix}.tmp`;
  try {
    await fsp.writeFile(tmp, content);
    await fsp.rename(tmp, targetPath);
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}
