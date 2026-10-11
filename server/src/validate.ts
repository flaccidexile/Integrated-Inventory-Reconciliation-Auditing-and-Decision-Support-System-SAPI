import { z, type ZodTypeAny } from "zod";
import { HttpError } from "./http";

/** Parses a request payload, converting a validation failure into a 400. */
export function parse<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw HttpError.badRequest(
      "The request payload is not valid.",
      result.error.flatten().fieldErrors,
    );
  }
  return result.data;
}

export { z };
