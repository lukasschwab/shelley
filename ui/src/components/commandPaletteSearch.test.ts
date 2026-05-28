import {
  scoreConversation,
  mergeConversationMatches,
} from "./commandPaletteSearch";
import type { ConversationWithState } from "../types";

let pass = 0;
let fail = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`✓ ${name}`);
  } catch (e) {
    fail++;
    console.log(`✗ ${name}`);
    console.log(e);
  }
}
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("assertion failed: " + msg);
}
function eq<T>(a: T, b: T, msg = "") {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${msg}`);
}

function conv(id: string, slug: string | null, cwd: string | null = null): ConversationWithState {
  return {
    conversation_id: id,
    slug: slug ?? "",
    user_initiated: true,
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
    cwd,
    archived: false,
    parent_conversation_id: null,
    model: null,
    conversation_options: "{}",
    current_generation: 0,
    agent_working: false,
    tags: "[]",
    working: false,
    subagent_count: 0,
    max_sequence_id: 0,
  };
}

// --- scoreConversation ---
test("scoreConversation: uses slug for name", () => {
  const c = conv("id123", "deploy-fix");
  assert(scoreConversation("deploy", c) > 500, "prefix match on slug");
});
test("scoreConversation: falls back to conversation_id when slug empty", () => {
  const c = conv("abc-deploy", "");
  assert(scoreConversation("deploy", c) > 0, "id used");
});
test("scoreConversation: cwd matches penalized vs name", () => {
  const byName = conv("a", "deploy", "/home/x/unrelated");
  const byCwd = conv("b", "unrelated-slug", "/home/x/deploy");
  const sName = scoreConversation("deploy", byName);
  const sCwd = scoreConversation("deploy", byCwd);
  assert(sName > sCwd, `name (${sName}) should beat cwd (${sCwd})`);
  assert(sCwd > 0, "cwd still matches");
});
test("scoreConversation: cwd null doesn't crash", () => {
  const c = conv("a", "foo", null);
  scoreConversation("x", c);
});

// --- mergeConversationMatches ---
test("merge: empty query returns inMemory unchanged", () => {
  const a = conv("a", "alpha");
  const b = conv("b", "beta");
  eq(mergeConversationMatches("", [a, b], []), [a, b]);
});
test("merge: empty query ignores server results", () => {
  const a = conv("a", "alpha");
  const s = conv("server", "x");
  eq(mergeConversationMatches("   ", [a], [s]), [a]);
});
test("merge: local matches sorted by score desc", () => {
  const fuzzy = conv("1", "fxoxo");        // fuzzy
  const contains = conv("2", "xfooy");      // contains
  const prefix = conv("3", "foobar");       // prefix
  const exact = conv("4", "foo");           // exact
  const noMatch = conv("5", "bar");
  const out = mergeConversationMatches("foo", [fuzzy, contains, prefix, exact, noMatch], []);
  eq(out.map((c) => c.conversation_id), ["4", "3", "2", "1"]);
});
test("merge: non-matching local entries dropped", () => {
  const a = conv("a", "alpha");
  const b = conv("b", "beta");
  const out = mergeConversationMatches("alp", [a, b], []);
  eq(out.map((c) => c.conversation_id), ["a"]);
});
test("merge: server-only results appended after local", () => {
  const local = conv("local", "alpha");
  const server = conv("srv", "alpha-archived");
  const out = mergeConversationMatches("alpha", [local], [server]);
  eq(out.map((c) => c.conversation_id), ["local", "srv"]);
});
test("merge: dedupes when server returns a local match", () => {
  const local = conv("dup", "alpha");
  const localOnly = conv("local2", "alphabet");
  const serverDup = conv("dup", "alpha");
  const serverNew = conv("srv", "alpha-archived");
  const out = mergeConversationMatches("alpha", [local, localOnly], [serverDup, serverNew]);
  // dup appears once, from local; srv appended; local2 also matches "alpha" fuzzy
  const ids = out.map((c) => c.conversation_id);
  assert(ids.filter((x) => x === "dup").length === 1, "dup deduped");
  assert(ids.includes("srv"), "server-new included");
  // local entries come before server-only
  assert(ids.indexOf("srv") === ids.length - 1, "server appended last");
});
test("merge: server-result order preserved", () => {
  const s1 = conv("s1", "alpha-1");
  const s2 = conv("s2", "alpha-2");
  const s3 = conv("s3", "alpha-3");
  const out = mergeConversationMatches("zzz", [], [s1, s2, s3]);
  // none of these match "zzz" locally (no in-memory), server appended in order
  eq(out.map((c) => c.conversation_id), ["s1", "s2", "s3"]);
});
test("merge: empty inMemory + empty server returns empty", () => {
  eq(mergeConversationMatches("x", [], []), []);
});



console.log(`\ncommandPaletteSearch: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
