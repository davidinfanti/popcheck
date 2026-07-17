import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("frontend staging deployment", () => {
  it("routes deep links through the Vite SPA entrypoint", () => {
    const config = JSON.parse(projectFile("vercel.json"));
    expect(config.rewrites).toEqual([{ source: "/(.*)", destination: "/index.html" }]);
  });

  it("reports immediate signup sessions without asking for email confirmation", () => {
    const authProvider = projectFile("src/hooks/useAuth.tsx");
    const authPage = projectFile("src/pages/Auth.tsx");

    expect(authProvider).toContain("return data.session");
    expect(authPage).toContain("const signupSession = await signUp");
    expect(authPage).toContain("Account created. You are signed in.");
    expect(authPage).toContain("Account created! Check your email to verify.");
  });
});
