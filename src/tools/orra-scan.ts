import { z } from "zod";
import { scanAll } from "../core/awareness.js";

export const orraScanSchema = z.object({});

export async function handleOrraScan(projectRoot: string) {
  const result = await scanAll(projectRoot);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
}
