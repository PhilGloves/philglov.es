import { test } from "node:test";
import assert from "node:assert/strict";
import { displayDate, isoDate, localDay } from "../../src/lib/dates.ts";

const date = new Date("2026-11-20T00:00:00Z");

test("isoDate is the machine form, in both languages' pages: YYYY-MM-DD", () => {
  assert.equal(isoDate(date), "2026-11-20");
  assert.equal(isoDate(new Date("2026-01-05T23:59:59Z")), "2026-01-05");
});

test("Italian dates shown as numbers read day/month/year with slashes", () => {
  assert.equal(displayDate("it", date), "20/11/2026");
  assert.equal(displayDate("it", new Date("2026-01-05T00:00:00Z")), "05/01/2026");
});

test("English dates shown as numbers keep today's format: 2026-11-20", () => {
  assert.equal(displayDate("en", date), "2026-11-20");
});

test("a date written out stays written out, in the page language (the entry's details block)", () => {
  const entry = new Date("2026-10-21T00:00:00Z");
  assert.equal(displayDate("en", entry, true), "21 October 2026");
  assert.equal(displayDate("it", entry, true), "21 ottobre 2026");
  assert.equal(displayDate("en", new Date("2026-01-01T00:30:00Z"), true), "1 January 2026");
  assert.equal(displayDate("it", new Date("2026-01-01T00:30:00Z"), true), "1 gennaio 2026");
});

test("no time zone moves a date: the late evening of the 31st stays the 31st", () => {
  const lateEvening = new Date("2026-12-31T23:30:00Z");
  assert.equal(displayDate("it", lateEvening), "31/12/2026");
  assert.equal(displayDate("en", lateEvening), "2026-12-31");
  assert.equal(displayDate("en", lateEvening, true), "31 December 2026");
  assert.equal(displayDate("it", lateEvening, true), "31 dicembre 2026");
});

test("a new entry is dated by the day in Malta, not in UTC (0040)", () => {
  // 00:40 in Msida on 23 November is still 22 November in UTC (winter, UTC+1); 01:30 in summer (UTC+2) too.
  assert.equal(localDay(new Date("2026-11-22T23:40:00Z")), "2026-11-23");
  assert.equal(localDay(new Date("2026-07-14T23:30:00Z")), "2026-07-15");
  assert.equal(localDay(new Date("2026-11-23T12:00:00Z")), "2026-11-23");
});
