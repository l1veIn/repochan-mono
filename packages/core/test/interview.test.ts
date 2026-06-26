import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  createOrUpdateInterview,
  appendToInterview,
} from "../src/entities.js";
import { initProtocol } from "../src/protocol/index.js";
import { hasInterview, requireInterview } from "../src/protocol/index.js";

describe("interview report", () => {
  let tmpRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-core-interview-"));
    projectRoot = tmpRoot;
    await initProtocol(projectRoot);
    // seed analysis (interview.create requires analysis to exist)
    const r = path.join(projectRoot, ".repochan");
    await fs.writeFile(
      path.join(r, "analysis", "current.json"),
      JSON.stringify({ summary: "test repo", documentLanguage: "English" }),
    );
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  // ── create ──────────────────────────────────────────────────

  describe("interview.create", () => {
    const validInterview = {
      summary: "User wants a cool cyberpunk mascot.",
      keyConstraints: ["must be female"],
      preferences: ["neon colors"],
      avoidList: ["no guns"],
      questions: [
        {
          id: "q1",
          question: "What tone do you want?",
          category: "tone",
          rationale: "README is ambiguous between serious and playful.",
          options: [
            { label: "Dark & edgy", description: "Cyberpunk noir" },
            { label: "Bright & fun", description: "Pop cyberpunk" },
          ],
          optional: false,
        },
      ],
      responses: [
        { questionId: "q1", kind: "option", answer: "Dark & edgy" },
      ],
    };

    it("creates interview report successfully", async () => {
      const result = await createOrUpdateInterview(projectRoot, {
        interview: validInterview,
      });
      expect(result.data.schemaVersion).toBe("repochan.interview.v1");
      expect(result.data.summary).toBe("User wants a cool cyberpunk mascot.");
      expect(result.data.questions).toHaveLength(1);
      expect(result.data.responses).toHaveLength(1);

      // current.json should exist
      const current = JSON.parse(
        await fs.readFile(
          path.join(projectRoot, ".repochan", "interview", "current.json"),
          "utf8",
        ),
      );
      expect(current.summary).toBe("User wants a cool cyberpunk mascot.");

      // version file should exist
      const versionsDir = path.join(projectRoot, ".repochan", "interview", "versions");
      const versions = (await fs.readdir(versionsDir)).filter((f) => f.endsWith(".json"));
      expect(versions.length).toBeGreaterThanOrEqual(1);
    });

    it("accepts questionnaire categories used by the interviewer skill", async () => {
      const result = await createOrUpdateInterview(projectRoot, {
        interview: {
          ...validInterview,
          questions: [
            { ...validInterview.questions[0], id: "q-weight", category: "weight" },
            { ...validInterview.questions[0], id: "q-world", category: "world" },
            { ...validInterview.questions[0], id: "q-reference", category: "reference" },
          ],
        },
      });

      expect(result.data.questions.map((q) => q.category)).toEqual([
        "weight",
        "world",
        "reference",
      ]);
    });

    it("rejects creation when analysis is missing", async () => {
      await fs.rm(path.join(projectRoot, ".repochan", "analysis", "current.json"));
      await expect(
        createOrUpdateInterview(projectRoot, { interview: validInterview }),
      ).rejects.toThrow(/analysis\/current\.json/);
    });

    it("rejects duplicate without overwrite", async () => {
      await createOrUpdateInterview(projectRoot, { interview: validInterview });
      await expect(
        createOrUpdateInterview(projectRoot, { interview: validInterview }),
      ).rejects.toThrow(/already exists/);
    });

    it("overwrites and archives previous when overwrite=true", async () => {
      const first = await createOrUpdateInterview(projectRoot, {
        interview: validInterview,
        slug: "v1",
      });
      const second = await createOrUpdateInterview(projectRoot, {
        interview: { ...validInterview, summary: "Updated summary." },
        overwrite: true,
        slug: "v2",
      });

      expect(second.data.summary).toBe("Updated summary.");

      // versions dir should have: v1 original + previous archive + v2
      const versionsDir = path.join(projectRoot, ".repochan", "interview", "versions");
      const versions = (await fs.readdir(versionsDir)).filter((f) => f.endsWith(".json"));
      // v1 + v2 + -previous archive = 3
      expect(versions.length).toBe(3);

      // The -previous archive should match the original data
      const archiveFile = versions.find((f) => f.includes("previous"));
      expect(archiveFile).toBeTruthy();
      const archived = JSON.parse(
        await fs.readFile(path.join(versionsDir, archiveFile!), "utf8"),
      );
      expect(archived.summary).toBe("User wants a cool cyberpunk mascot.");
    });

    it("rejects interview missing required summary", async () => {
      await expect(
        createOrUpdateInterview(projectRoot, {
          interview: { keyConstraints: [] },
        }),
      ).rejects.toThrow(/interview\.create|summary/);
    });

    it("rejects interview missing required keyConstraints", async () => {
      await expect(
        createOrUpdateInterview(projectRoot, {
          interview: { summary: "test" },
        }),
      ).rejects.toThrow(/interview\.create|keyConstraints/);
    });
  });

  // ── append ──────────────────────────────────────────────────

  describe("interview.append", () => {
    beforeEach(async () => {
      await createOrUpdateInterview(projectRoot, {
        interview: {
          summary: "Initial interview.",
          keyConstraints: ["constraint-1"],
          preferences: ["pref-1"],
          avoidList: ["avoid-1"],
          questions: [
            {
              id: "q1",
              question: "First question?",
              category: "tone",
              rationale: "test",
              optional: false,
            },
          ],
          responses: [
            { questionId: "q1", kind: "option", answer: "Answer 1" },
          ],
        },
        slug: "initial",
      });
    });

    it("appends questions and responses", async () => {
      const result = await appendToInterview(projectRoot, {
        questions: [
          {
            id: "q2",
            question: "Second question?",
            category: "style",
            rationale: "follow-up",
            optional: true,
          },
        ],
        responses: [
          { questionId: "q2", kind: "custom", answer: "Custom answer" },
        ],
        summary: "Updated synthesis of all answers.",
        slug: "round2",
      });

      expect(result.data.questions).toHaveLength(2);
      expect(result.data.responses).toHaveLength(2);
      expect(result.data.summary).toBe("Updated synthesis of all answers.");
      // Original constraint preserved (not passed in append)
      expect(result.data.keyConstraints).toEqual(["constraint-1"]);
    });

    it("replaces summary fields when provided", async () => {
      const result = await appendToInterview(projectRoot, {
        summary: "Completely new summary.",
        keyConstraints: ["new-constraint"],
        preferences: ["new-pref"],
        avoidList: ["new-avoid"],
      });

      expect(result.data.summary).toBe("Completely new summary.");
      expect(result.data.keyConstraints).toEqual(["new-constraint"]);
      expect(result.data.preferences).toEqual(["new-pref"]);
      expect(result.data.avoidList).toEqual(["new-avoid"]);
    });

    it("archives previous state before appending", async () => {
      await appendToInterview(projectRoot, {
        summary: "Updated.",
        slug: "round2",
      });

      const versionsDir = path.join(projectRoot, ".repochan", "interview", "versions");
      const versions = (await fs.readdir(versionsDir)).filter((f) => f.endsWith(".json"));
      // initial + round2 + round2-previous
      expect(versions.length).toBe(3);

      const archiveFile = versions.find((f) => f.includes("round2-previous"));
      expect(archiveFile).toBeTruthy();
      const archived = JSON.parse(
        await fs.readFile(path.join(versionsDir, archiveFile!), "utf8"),
      );
      expect(archived.summary).toBe("Initial interview.");
    });

    it("fails when no existing interview", async () => {
      await fs.rm(path.join(projectRoot, ".repochan", "interview", "current.json"));
      await expect(
        appendToInterview(projectRoot, { summary: "test" }),
      ).rejects.toThrow(/interview\/current\.json/);
    });
  });

  // ── protocol helpers ────────────────────────────────────────

  describe("protocol helpers", () => {
    it("hasInterview returns false before create, true after", async () => {
      expect(await hasInterview(projectRoot)).toBe(false);
      await createOrUpdateInterview(projectRoot, {
        interview: { summary: "x", keyConstraints: [] },
      });
      expect(await hasInterview(projectRoot)).toBe(true);
    });

    it("requireInterview throws when missing", async () => {
      await expect(requireInterview(projectRoot)).rejects.toThrow(/Missing/);
    });

    it("requireInterview passes after create", async () => {
      await createOrUpdateInterview(projectRoot, {
        interview: { summary: "x", keyConstraints: [] },
      });
      await expect(requireInterview(projectRoot)).resolves.toBeUndefined();
    });

    it("initProtocol creates interview/versions directory", async () => {
      const dir = path.join(projectRoot, ".repochan", "interview", "versions");
      const stat = await fs.stat(dir);
      expect(stat.isDirectory()).toBe(true);
    });
  });
});
