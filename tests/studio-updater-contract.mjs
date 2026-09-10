import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;
const rust = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../src/runtime/index.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const runner = readFileSync(new URL("../start.ps1", import.meta.url), "utf8");

assert.match(rust, /studio_update_check/);
assert.match(rust, /studio_update_apply/);
assert.match(rust, /merge-base", "--is-ancestor"/);
assert.match(rust, /"merge", "--ff-only"/);
assert.doesNotMatch(rust, /reset --hard/);
assert.doesNotMatch(rust, /git clean/);
assert.match(rust, /GIT_TERMINAL_PROMPT/);
assert.match(runtime, /checkStudioUpdate\(\)/);
assert.match(runtime, /applyStudioUpdate\(\)/);
assert.match(app, /Update & restart/);
assert.match(app, /studioUpdateHasPendingWork/);
assert.match(runner, /SWARM_STUDIO_ROOT/);
assert.match(runner, /RefreshDependencies/);

const run = (cwd, args) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
};

const temp = mkdtempSync(join(tmpdir(), "swarm-studio-updater-contract-"));
try {
  const remote = join(temp, "remote.git");
  const seed = join(temp, "seed");
  const user = join(temp, "user");
  run(temp, ["init", "--bare", remote]);
  run(temp, ["clone", remote, seed]);
  run(seed, ["config", "user.email", "contract@example.invalid"]);
  run(seed, ["config", "user.name", "Contract Test"]);
  writeFileSync(join(seed, "package.json"), '{"name":"swarm-studio-standalone","version":"0.63.16"}\n');
  writeFileSync(join(seed, "start.ps1"), "Write-Host test\n");
  run(seed, ["add", "."]);
  run(seed, ["commit", "-m", "v0.63.16"]);
  run(seed, ["branch", "-M", "main"]);
  run(seed, ["push", "-u", "origin", "main"]);
  run(remote, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  run(temp, ["clone", remote, user]);
  run(user, ["config", "user.email", "contract@example.invalid"]);
  run(user, ["config", "user.name", "Contract Test"]);

  writeFileSync(join(seed, "package.json"), '{"name":"swarm-studio-standalone","version":"0.63.17"}\n');
  run(seed, ["add", "package.json"]);
  run(seed, ["commit", "-m", "add updater"]);
  run(seed, ["push"]);
  run(user, ["fetch", "origin"]);

  assert.equal(run(user, ["rev-list", "--count", "HEAD..origin/main"]), "1", "clean client must detect one remote commit");
  assert.doesNotThrow(() => run(user, ["merge-base", "--is-ancestor", "HEAD", "origin/main"]), "clean client should be fast-forwardable");
  assert.equal(run(user, ["status", "--porcelain", "--untracked-files=normal"]), "", "clean client should be updater-eligible");

  const untracked = join(user, "local-note.txt");
  writeFileSync(untracked, "do not eat me\n");
  assert.notEqual(run(user, ["status", "--porcelain", "--untracked-files=normal"]), "", "untracked user files must block automatic update");
  rmSync(untracked, { force: true });

  writeFileSync(join(user, "start.ps1"), "Write-Host locally-edited\n");
  assert.notEqual(run(user, ["status", "--porcelain", "--untracked-files=normal"]), "", "tracked local edits must block automatic update");
  run(user, ["checkout", "--", "start.ps1"]);
  run(user, ["merge", "--ff-only", "origin/main"]);
  assert.equal(run(user, ["rev-parse", "HEAD"]), run(user, ["rev-parse", "origin/main"]), "ff-only update must land exactly on origin/main");
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log("Studio updater contract OK.");
