import { describe, expect, test } from "bun:test";
import {
  buildModelOptionsFromDiscovered,
  getOpenCodeModelStatePath,
  parsePersistedModelState,
  parseDiscoveredModels,
  rankDiscoveredModels,
  type ModelOption,
} from "./model-discovery";

describe("parseDiscoveredModels", () => {
  test("parses provider/model lines and ignores noise", () => {
    const raw = [
      "openai/gpt-5.3-codex",
      "",
      "not-a-model-line",
      "opencode/gpt-5-nano",
      "  anthropic/claude-sonnet-4-5  ",
    ].join("\n");

    expect(parseDiscoveredModels(raw)).toEqual([
      "openai/gpt-5.3-codex",
      "opencode/gpt-5-nano",
      "anthropic/claude-sonnet-4-5",
    ]);
  });

  test("deduplicates while preserving first-seen order", () => {
    const raw = [
      "openai/gpt-5.3-codex",
      "opencode/gpt-5-nano",
      "openai/gpt-5.3-codex",
      "opencode/gpt-5-nano",
      "google/gemini-2.0-flash",
    ].join("\n");

    expect(parseDiscoveredModels(raw)).toEqual([
      "openai/gpt-5.3-codex",
      "opencode/gpt-5-nano",
      "google/gemini-2.0-flash",
    ]);
  });
});

describe("rankDiscoveredModels", () => {
  test("orders configured first, then favorites, recents, and others", () => {
    const discovered = [
      "openai/gpt-5.3-codex",
      "opencode/gpt-5-nano",
      "anthropic/claude-sonnet-4-5",
      "google/gemini-2.0-flash",
      "openai/gpt-5.3-codex-spark",
    ];
    const configuredModels = [
      "anthropic/claude-sonnet-4-5",
      "openai/gpt-5.3-codex",
    ];
    const favoriteModels = ["google/gemini-2.0-flash"];
    const recentModels = ["opencode/gpt-5-nano"];

    expect(
      rankDiscoveredModels(discovered, {
        configuredModels,
        favoriteModels,
        recentModels,
      }),
    ).toEqual([
      "openai/gpt-5.3-codex",
      "anthropic/claude-sonnet-4-5",
      "google/gemini-2.0-flash",
      "opencode/gpt-5-nano",
      "openai/gpt-5.3-codex-spark",
    ]);
  });

  test("does not duplicate models across buckets", () => {
    const discovered = [
      "openai/gpt-5.3-codex",
      "opencode/gpt-5-nano",
      "anthropic/claude-sonnet-4-5",
    ];

    expect(
      rankDiscoveredModels(discovered, {
        configuredModels: ["openai/gpt-5.3-codex", "opencode/gpt-5-nano"],
        favoriteModels: ["opencode/gpt-5-nano", "anthropic/claude-sonnet-4-5"],
        recentModels: ["anthropic/claude-sonnet-4-5"],
      }),
    ).toEqual([
      "openai/gpt-5.3-codex",
      "opencode/gpt-5-nano",
      "anthropic/claude-sonnet-4-5",
    ]);
  });
});

describe("parsePersistedModelState", () => {
  test("parses favorite and recent models from state JSON", () => {
    const raw = JSON.stringify({
      recent: [
        { providerID: "openai", modelID: "gpt-5.3-codex" },
        { providerID: "opencode", modelID: "gpt-5-nano" },
      ],
      favorite: [{ providerID: "anthropic", modelID: "claude-sonnet-4-5" }],
    });

    expect(parsePersistedModelState(raw)).toEqual({
      favoriteModels: ["anthropic/claude-sonnet-4-5"],
      recentModels: ["openai/gpt-5.3-codex", "opencode/gpt-5-nano"],
    });
  });

  test("returns empty sets when JSON is invalid", () => {
    expect(parsePersistedModelState("{" as string)).toEqual({
      favoriteModels: [],
      recentModels: [],
    });
  });

  test("returns empty sets for missing fields", () => {
    expect(parsePersistedModelState("{}")).toEqual({
      favoriteModels: [],
      recentModels: [],
    });
  });
});

describe("getOpenCodeModelStatePath", () => {
  test("uses XDG_STATE_HOME when available", () => {
    const path = getOpenCodeModelStatePath(
      { XDG_STATE_HOME: "/tmp/xdg-state" },
      "/Users/example",
    );
    expect(path).toBe("/tmp/xdg-state/opencode/model.json");
  });

  test("uses OPENCODE_TEST_HOME before provided home fallback", () => {
    const path = getOpenCodeModelStatePath(
      { OPENCODE_TEST_HOME: "/tmp/opencode-home" },
      "/Users/example",
    );
    expect(path).toBe("/tmp/opencode-home/.local/state/opencode/model.json");
  });

  test("falls back to home/.local/state", () => {
    const path = getOpenCodeModelStatePath({}, "/Users/example");
    expect(path).toBe("/Users/example/.local/state/opencode/model.json");
  });
});

describe("buildModelOptionsFromDiscovered", () => {
  const configuredOptions: ModelOption[] = [
    {
      value: "anthropic/claude-sonnet-4-5",
      label: "Claude Sonnet 4.5",
      hint: "Configured",
    },
    {
      value: "openai/gpt-5.3-codex",
      label: "GPT-5.3 Codex",
      hint: "Configured",
    },
  ];

  test("uses configured labels for matched models and keeps discovered order", () => {
    const discovered = [
      "openai/gpt-5.3-codex",
      "opencode/gpt-5-nano",
      "anthropic/claude-sonnet-4-5",
    ];

    const result = buildModelOptionsFromDiscovered(discovered, configuredOptions, {
      favoriteModels: [],
      recentModels: [],
    });

    expect(result.map((x) => x.value)).toEqual([
      "openai/gpt-5.3-codex",
      "anthropic/claude-sonnet-4-5",
      "opencode/gpt-5-nano",
    ]);
    expect(result[0].label).toBe("GPT-5.3 Codex");
    expect(result[1].label).toBe("Claude Sonnet 4.5");
    expect(result[2].label).toBe("opencode/gpt-5-nano");
  });

  test("falls back to configured options when discovery is empty", () => {
    const result = buildModelOptionsFromDiscovered([], configuredOptions, {
      favoriteModels: [],
      recentModels: [],
    });
    expect(result).toEqual(configuredOptions);
  });

  test("respects favorite and recent ordering after configured matches", () => {
    const discovered = [
      "openai/gpt-5.3-codex",
      "google/gemini-2.0-flash",
      "opencode/gpt-5-nano",
      "anthropic/claude-sonnet-4-5",
    ];

    const result = buildModelOptionsFromDiscovered(discovered, configuredOptions, {
      favoriteModels: ["google/gemini-2.0-flash"],
      recentModels: ["opencode/gpt-5-nano"],
    });

    expect(result.map((x) => x.value)).toEqual([
      "openai/gpt-5.3-codex",
      "anthropic/claude-sonnet-4-5",
      "google/gemini-2.0-flash",
      "opencode/gpt-5-nano",
    ]);
  });
});
