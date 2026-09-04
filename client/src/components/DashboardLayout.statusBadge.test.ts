import { describe, it, expect } from "vitest";
import { conversations } from "../../../drizzle/schema";
import { OPEN_CONVERSATIONS_QUERY_INPUT } from "./DashboardLayout";

// Bug real: o badge de "conversas abertas" na sidebar consultava conversations.list com
// { status: "Aberto" }. Como o enum do banco é em inglês, o total sempre voltava 0.
describe("DashboardLayout — badge de conversas abertas usa o enum real do banco", () => {
  it("o input da query usa um valor presente no enum conversations.status", () => {
    expect(conversations.status.enumValues).toContain(OPEN_CONVERSATIONS_QUERY_INPUT.status);
  });

  it("filtra especificamente por Open, não pelo rótulo em português", () => {
    expect(OPEN_CONVERSATIONS_QUERY_INPUT.status).toBe("Open");
  });
});
