import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";

interface Manifest {
  readonly manifest_version: number;
  readonly permissions: readonly string[];
  readonly host_permissions: readonly string[];
  readonly icons: Readonly<Record<string, string>>;
  readonly action: {
    readonly default_title: string;
    readonly default_popup: string;
    readonly default_icon: Readonly<Record<string, string>>;
  };
  readonly content_scripts: readonly {
    readonly matches: readonly string[];
    readonly js: readonly string[];
  }[];
  readonly web_accessible_resources: readonly {
    readonly resources: readonly string[];
    readonly matches: readonly string[];
  }[];
}

const projectRoot = resolve(import.meta.dirname, "../..");

describe("extension manifest", () => {
  it("uses Manifest V3 with local settings as its only API permission", async () => {
    const manifest = await readManifest();

    assert.equal(manifest.manifest_version, 3);
    assert.deepEqual(manifest.permissions, ["storage"]);
    assert.deepEqual(manifest.action, {
      default_title: "Adaptive Speech Rate",
      default_popup: "popup/popup.html",
      default_icon: {
        "16": "icons/icon16.png",
        "32": "icons/icon32.png",
      },
    });
    assert.deepEqual(manifest.icons, {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png",
    });
  });

  it("limits its host and content-script scope to YouTube", async () => {
    const manifest = await readManifest();

    assert.deepEqual(manifest.host_permissions, ["https://www.youtube.com/*"]);
    assert.deepEqual(manifest.content_scripts, [
      {
        matches: ["https://www.youtube.com/*"],
        js: ["content/youtube-entry.js"],
        run_at: "document_idle",
      },
    ]);
    assert.deepEqual(manifest.web_accessible_resources, [
      {
        resources: ["audio/audio-worklet.js", "icons/icon32.png"],
        matches: ["https://www.youtube.com/*"],
      },
    ]);
  });
});

async function readManifest(): Promise<Manifest> {
  const source = await readFile(resolve(projectRoot, "manifest.json"), "utf8");
  return JSON.parse(source) as Manifest;
}
