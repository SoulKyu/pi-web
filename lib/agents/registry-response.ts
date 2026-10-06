import { NextResponse } from "next/server";
import { AgentRegistryError } from "./registry";

const headers = { "Cache-Control": "no-store" };
/** invalid → 400, conflict → 409, not_found → 404, anything else → 500 with the message. */
export const registryErrorResponse = (error: unknown): Response => error instanceof AgentRegistryError
  ? NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "conflict" ? 409 : error.code === "not_found" ? 404 : 400, headers })
  : NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500, headers });
