import { join } from "path";

export interface ModelOption {
  value: string;
  label: string;
  hint: string;
}

export interface PersistedModelState {
  favoriteModels: string[];
  recentModels: string[];
}

interface RankOptions {
  favoriteModels: string[];
  recentModels: string[];
}

export function getOpenCodeModelStatePath(
  env: Record<string, string | undefined>,
  homeDir: string,
): string {
  // Source: anomalyco/opencode `packages/opencode/src/global/index.ts`.
  // OpenCode resolves Global.Path.state from XDG state dir and supports
  // OPENCODE_TEST_HOME for test isolation; model prefs live in state/model.json.
  // Ref: https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/global/index.ts
  const xdgStateHome = env.XDG_STATE_HOME?.trim();
  const opencodeTestHome = env.OPENCODE_TEST_HOME?.trim();
  const baseHome = opencodeTestHome || homeDir;
  const stateRoot = xdgStateHome || join(baseHome, ".local", "state");
  return join(stateRoot, "opencode", "model.json");
}

const MODEL_ID_RE = /^[a-z0-9][a-z0-9.-]*\/[a-z0-9][a-z0-9._-]*$/i;

export function parseDiscoveredModels(rawOutput: string): string[] {
  const seen = new Set<string>();
  const models: string[] = [];

  for (const line of rawOutput.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!MODEL_ID_RE.test(trimmed)) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    models.push(trimmed);
  }

  return models;
}

export function parsePersistedModelState(rawJson: string): PersistedModelState {
  try {
    const parsed = JSON.parse(rawJson) as {
      favorite?: Array<{ providerID?: string; modelID?: string }>;
      recent?: Array<{ providerID?: string; modelID?: string }>;
    };

    const favoriteModels = normalizePersistedModelList(parsed.favorite);
    const recentModels = normalizePersistedModelList(parsed.recent);

    return {
      favoriteModels,
      recentModels,
    };
  } catch {
    return {
      favoriteModels: [],
      recentModels: [],
    };
  }
}

function normalizePersistedModelList(
  entries?: Array<{ providerID?: string; modelID?: string }>,
): string[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of entries) {
    const providerID = entry?.providerID?.trim();
    const modelID = entry?.modelID?.trim();
    if (!providerID || !modelID) continue;
    const fullModel = `${providerID}/${modelID}`;
    if (seen.has(fullModel)) continue;
    seen.add(fullModel);
    normalized.push(fullModel);
  }

  return normalized;
}

export function rankDiscoveredModels(discovered: string[], options: RankOptions): string[] {
  const favorites = new Set(options.favoriteModels);
  const recents = new Set(options.recentModels);
  const favorite: string[] = [];
  const recent: string[] = [];
  const other: string[] = [];
  const seen = new Set<string>();

  for (const model of discovered) {
    if (seen.has(model)) continue;
    seen.add(model);

    if (favorites.has(model)) {
      favorite.push(model);
      continue;
    }
    if (recents.has(model)) {
      recent.push(model);
      continue;
    }
    other.push(model);
  }

  return [...favorite, ...recent, ...other];
}

export function buildModelOptionsFromDiscovered(
  discovered: string[],
  persisted: PersistedModelState,
  fallbackModels: string[] = [],
): ModelOption[] {
  const sourceModels = discovered.length > 0 ? discovered : fallbackModels;
  const ranked = rankDiscoveredModels(sourceModels, {
    favoriteModels: persisted.favoriteModels,
    recentModels: persisted.recentModels,
  });
  const favorites = new Set(persisted.favoriteModels);
  const recents = new Set(persisted.recentModels);

  return ranked.map((model) => {
    if (favorites.has(model)) {
      return {
        value: model,
        label: model,
        hint: "Favorite - Discovered from opencode models",
      };
    }
    if (recents.has(model)) {
      return {
        value: model,
        label: model,
        hint: "Recent - Discovered from opencode models",
      };
    }
    return {
      value: model,
      label: model,
      hint: "Discovered from opencode models",
    };
  });
}
