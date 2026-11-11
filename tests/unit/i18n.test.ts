import { test } from "node:test";
import assert from "node:assert/strict";
import { twinPath } from "../../src/i18n/index.ts";

test("language switch adds or removes /it and nothing else", () => {
  assert.equal(twinPath("en", "/"), "/it");
  assert.equal(twinPath("en", "/alps"), "/it/alps");
  assert.equal(twinPath("en", "/photos/lisbon/tram-28"), "/it/photos/lisbon/tram-28");
  assert.equal(twinPath("it", "/it"), "/");
  assert.equal(twinPath("it", "/it/alps"), "/alps");
  assert.equal(twinPath("it", "/it/journal/travel"), "/journal/travel");
});

test("a slug that merely starts with 'it' is not mistaken for the prefix", () => {
  assert.equal(twinPath("it", "/it/italy"), "/italy");
  assert.equal(twinPath("en", "/italy"), "/it/italy");
});
