import { z } from "zod/v4";

export const TimestampSchema = z.iso.datetime();
