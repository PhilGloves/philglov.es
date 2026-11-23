/**
 * The two scripts of the admin pages, served by the Worker behind Access under
 * the admin CSP (never from /_assets/; public pages never load them). Each is
 * kept as a string so the Worker can serve it; tests/unit/admin-client.test.ts
 * parses both. Plain ES2017, no framework, DOM built with createElement/textContent only.
 */

/**
 * /admin/moderation.js, on /admin (decision 0020). Approve, reject, reply, mark
 * done and delete go in the background: the same form fields plus the button
 * pressed, `Accept: application/json`, same origin only, no redirect followed.
 * The Worker answers a `RowReply` (worker/src/admin/moderation.ts) and only the
 * cards of that item change: badge, buttons, reply, the counts, and a line in
 * the card's status slot, which takes focus. A redirect can only come from
 * Access (the Worker never redirects a JSON request): the login has expired, so
 * the page reloads and Access shows its sign-in (owner decision O5; a form post
 * there would be blocked by form-action 'self'). On anything else (network
 * error, an expired CSRF token, `ok: false`) the form is posted again the plain
 * way, exactly as without JavaScript. Every action is idempotent, so a request
 * that did arrive is safe to repeat.
 */
export const MODERATION_SCRIPT = String.raw`"use strict";
(function () {
  var hides = { approve: "approved", reject: "rejected", done: "done" };
  function lines(node, text) {
    while (node.firstChild) node.removeChild(node.firstChild);
    text.split("\n").forEach(function (line, i) {
      if (i) node.appendChild(document.createElement("br"));
      node.appendChild(document.createTextNode(line));
    });
  }
  function update(card, data) {
    var slot = card.querySelector("[data-row-status]");
    if (data.status === "deleted") {
      while (card.firstChild) card.removeChild(card.firstChild);
      card.appendChild(slot);
    } else {
      var badge = card.querySelector(".badge");
      badge.textContent = data.status;
      badge.className = "badge" + (data.status === "approved" ? " badge--ok" : data.status === "rejected" ? " badge--bad" : "");
      card.querySelectorAll('button[name="action"]').forEach(function (b) {
        if (hides[b.value]) b.hidden = hides[b.value] === data.status;
      });
      if (typeof data.reply === "string") {
        var box = card.querySelector("[data-reply]"), text = card.querySelector('textarea[name="reply"]');
        lines(box.querySelector("p"), data.reply);
        box.hidden = data.reply === "";
        text.value = data.reply;
        text.closest("details").open = false;
      }
    }
    slot.textContent = data.notice;
  }
  document.addEventListener("submit", function (e) {
    var form = e.target, button = e.submitter, card = form.closest("[data-row]");
    if (!card || !button || form.getAttribute("action") !== "/admin/action" || form.hasAttribute("data-plain")) return;
    e.preventDefault();
    var body = new URLSearchParams(new FormData(form));
    body.append(button.name, button.value);
    button.disabled = true;
    fetch("/admin/action", {
      method: "POST", body: body, mode: "same-origin", credentials: "same-origin", redirect: "manual",
      headers: { Accept: "application/json" }
    })
      .then(function (r) {
        if (r.type === "opaqueredirect") { location.reload(); return new Promise(function () {}); }
        if (r.status !== 200 || (r.headers.get("Content-Type") || "").indexOf("application/json")) throw 0;
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) throw 0;
        button.disabled = false;
        document.querySelectorAll('[data-row="' + data.row + '"]').forEach(function (c) { update(c, data); });
        document.querySelectorAll("[data-count]").forEach(function (n) {
          n.textContent = data.counts[n.getAttribute("data-count")];
        });
        card.querySelector("[data-row-status]").focus();
      })
      .catch(function () {
        button.disabled = false;
        form.setAttribute("data-plain", "");
        form.requestSubmit(button);
      });
  });
})();
`;

/**
 * /admin/write.js, on /admin/write. It adds:
 *  - the slug suggested from the title while the slug field is untouched;
 *  - what the slug means (new, other-language version, existing) and the
 *    reference text, from /admin/write/reference;
 *  - autosave in this browser (localStorage), restored when newer than the server copy; a first Save draft
 *    removes the copy the text came from (data-moved), and Publish the draft's own (data-clear);
 *  - photo uploads one at a time, with progress and automatic retry;
 *  - on an entry's form, the language switch on change (decision 0029): the typed text is written to the browser
 *    copy at once, so it is there again on switching back; the Switch button, for pages without JavaScript, is
 *    hidden. The choice leads to another page, it is not a field, so changing it is never autosaved. A photo still
 *    uploading would be lost on leaving, so it holds the switch as it holds Publish (TO-01). The other version's alt
 *    text and caption under a carried-over photo (`data-hint`) are kept when a browser copy is restored;
 *  - Publish and Save draft greyed out, saying "Sending…", from the first tap until the answer (T2-03). Without
 *    JavaScript the Worker is the protection: a second Publish of an entry on its way opens nothing.
 */
export const WRITE_SCRIPT = String.raw`"use strict";
(function () {
  var done = document.getElementById("published");
  if (done) {
    try { localStorage.removeItem("philglov-write:" + done.getAttribute("data-clear")); } catch (e) {}
    return;
  }
  var form = document.getElementById("write-form");
  if (!form) return;
  var $ = function (id) { return document.getElementById(id); };
  var title = $("w-title"), slug = $("w-slug"), lang = $("w-lang"), body = $("w-body");
  var hint = $("w-slug-hint"), list = $("photo-list"), status = $("upload-status");
  var csrf = form.elements.namedItem("csrf").value;
  var key = "philglov-write:" + (form.getAttribute("data-draft") || "new");
  // A first Save draft moved the text to the server: the copy it came from would come back as the next entry (SO-03).
  // Once only: the address loses "moved", so a reload later never removes a newer copy typed since.
  var moved = form.getAttribute("data-moved");
  if (moved) {
    try { localStorage.removeItem("philglov-write:" + moved); } catch (e) {}
    history.replaceState(null, "", location.href.replace(/&moved=[^&#]*/, ""));
  }
  var version = $("w-version");
  if (version) form.querySelector('button[value="switch"]').hidden = true;
  var hints = {};
  Array.prototype.forEach.call(list.querySelectorAll(".photo-item"), function (li) {
    var h = hints[li.querySelector('input[name="photo_key"]').value] = {};
    Array.prototype.forEach.call(li.querySelectorAll("[data-hint]"), function (n) { h[n.getAttribute("data-hint")] = n; });
  });
  var serverTime = Number(form.getAttribute("data-updated")) || 0;
  var maxSize = Number(form.getAttribute("data-max"));
  var autoSlug = slug.value === "";
  var counter = 0;

  function slugify(text) {
    return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).slice(0, 5).join("-").slice(0, 60).replace(/-+$/, "");
  }

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text) node.textContent = text;
    return node;
  }

  function photoItem(photoKey, alt, caption) {
    var id = "phn-" + (counter++);
    var li = el("li", { class: "card photo-item" });
    li.appendChild(el("input", { type: "hidden", name: "photo_key", value: photoKey }));
    li.appendChild(el("p", { class: "fine" }, photoKey.split("/").pop()));
    [["alt", "Alt text: what is in it and why it matters", alt, true], ["cap", "Caption", caption, false]].forEach(function (f) {
      var field = el("div", { class: "field" });
      field.appendChild(el("label", { for: id + "-" + f[0] }, f[1]));
      var input = el("input", { id: id + "-" + f[0], name: f[0] === "alt" ? "photo_alt" : "photo_caption", maxlength: "300" });
      if (f[3]) input.required = true;
      input.value = f[2] || "";
      field.appendChild(input);
      var hint = (hints[photoKey] || {})[f[0]];
      if (hint) {
        hint.id = id + "-" + f[0] + "-hint";
        input.setAttribute("aria-describedby", hint.id);
        field.appendChild(hint);
      }
      li.appendChild(field);
    });
    var actions = el("div", { class: "actions" });
    actions.appendChild(el("button", { type: "button", class: "btn btn--ghost", "data-remove": "" }, "Remove"));
    li.appendChild(actions);
    return li;
  }

  // Autosave in this browser.
  function snapshot() {
    var photos = Array.prototype.map.call(list.querySelectorAll(".photo-item"), function (li) {
      var inputs = li.querySelectorAll("input");
      return { key: inputs[0].value, alt: inputs[1].value, caption: inputs[2].value };
    });
    return { savedAt: Date.now(), title: title.value, slug: slug.value, lang: lang.value,
      description: form.elements.namedItem("description").value, body: body.value, photos: photos };
  }
  var timer = 0;
  function store() {
    clearTimeout(timer); timer = 0;
    try { localStorage.setItem(key, JSON.stringify(snapshot())); } catch (e) {}
  }
  function save(e) {
    if (e && e.target === version) return;
    clearTimeout(timer);
    timer = setTimeout(store, 400);
  }
  function restore() {
    var saved;
    try { saved = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { saved = null; }
    if (!saved || saved.savedAt <= serverTime) return;
    title.value = saved.title; slug.value = saved.slug; lang.value = saved.lang; body.value = saved.body;
    form.elements.namedItem("description").value = saved.description;
    while (list.firstChild) list.removeChild(list.firstChild);
    saved.photos.forEach(function (p) { list.appendChild(photoItem(p.key, p.alt, p.caption)); });
    autoSlug = false;
    var note = el("p", { class: "notice", role: "status" }, "Restored what you typed in this browser at " + new Date(saved.savedAt).toLocaleTimeString() + ".");
    form.parentNode.insertBefore(note, form);
  }

  // What the slug means, and the other-language text for reference.
  var lookupTimer;
  function lookup() {
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(function () {
      if (!slug.value) return;
      fetch("/admin/write/reference?slug=" + encodeURIComponent(slug.value) + "&lang=" + lang.value, { credentials: "same-origin" })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          hint.textContent = data.message;
          var box = $("reference");
          while (box.firstChild) box.removeChild(box.firstChild);
          if (data.reference) {
            var details = el("details", { open: "" });
            details.appendChild(el("summary", {}, "The " + (lang.value === "en" ? "Italian" : "English") + " version, for reference"));
            details.appendChild(el("pre", { class: "fine" }, data.reference));
            box.appendChild(details);
          }
        })
        .catch(function () {});
    }, 500);
  }

  // Uploads: one at a time, progress, retry with growing pauses. Every selected photo has its row, with Remove, from
  // the moment it is picked. While one is waiting, uploading or about to retry, Publish and Save draft are held with
  // a message that says why, and work again once it has finished or been removed: nothing picked is dropped
  // silently (TO-01, decision 0027). Without JavaScript there are no uploads, so nothing changes.
  var queue = [], current = null, held = null;
  var buttons = form.querySelector('button[value="publish"]').parentNode;
  function say(text) { status.textContent = text; }
  function pending() { return queue.length + (current ? 1 : 0); }
  function gate() {
    if (!held) return;
    var n = pending();
    if (!n) { held.parentNode.removeChild(held); held = null; return; }
    held.textContent = "Not yet: " + n + (n === 1 ? " photo is" : " photos are") + " still uploading. " +
      (version ? "Publish, Save draft and the language switch work" : "Publish and Save draft work") + " as soon as " +
      (n === 1 ? "it has" : "they have") + " finished, or remove " + (n === 1 ? "it" : "them") + ".";
  }
  function hold() {
    if (!held) { held = el("p", { class: "alert", role: "alert" }); buttons.parentNode.insertBefore(held, buttons); }
    gate();
  }
  // From the first tap until the answer arrives, Publish and Save draft are greyed out, the one pressed says so, and
  // another tap sends nothing (T2-03). Disabled only after this event: a disabled button is not sent with the form.
  var sending = false, sends = [form.querySelector('button[value="publish"]'), form.querySelector('button[value="save"]')];
  form.addEventListener("submit", function (e) {
    if (sending || pending()) { e.preventDefault(); if (!sending) hold(); return; }
    sending = true;
    var pressed = e.submitter;
    setTimeout(function () {
      sends.forEach(function (b) { b.disabled = true; b.setAttribute("data-label", b.textContent); });
      if (sends.indexOf(pressed) >= 0) pressed.textContent = "Sending…";
    }, 0);
  });
  // Back to this page from the next one: the buttons work again.
  addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    sending = false;
    sends.forEach(function (b) { b.disabled = false; if (b.hasAttribute("data-label")) b.textContent = b.getAttribute("data-label"); });
  });
  if (version) version.addEventListener("change", function () {
    if (pending()) { version.value = lang.value; hold(); return; }
    if (timer) store();
    location.href = "/admin/write?edit=1&slug=" + encodeURIComponent(slug.value) + "&lang=" + version.value;
  });
  function finished(job) {
    if (current === job) current = null;
    gate(); next();
  }
  function cancel(job) {
    job.cancelled = true;
    clearTimeout(job.timer);
    if (job.xhr) job.xhr.abort();
    var i = queue.indexOf(job);
    if (i >= 0) queue.splice(i, 1);
    if (job.row.parentNode) job.row.parentNode.removeChild(job.row);
    say(job.file.name + " removed.");
    finished(job);
  }
  function add(job) {
    job.row = el("div", { class: "upload" });
    job.label = el("span", { class: "fine" }, job.file.name + " · waiting");
    job.bar = el("progress", { max: "100", value: "0", "aria-label": job.file.name + " upload" });
    var remove = el("button", { type: "button", class: "btn btn--ghost" }, "Remove");
    remove.addEventListener("click", function () { cancel(job); });
    job.row.appendChild(job.label); job.row.appendChild(job.bar); job.row.appendChild(remove);
    status.parentNode.insertBefore(job.row, status);
    queue.push(job);
  }
  function next() {
    if (current || !queue.length) return;
    var job = current = queue.shift();
    var row = job.row, label = job.label, bar = job.bar;
    function attempt(n) {
      if (job.cancelled) return;
      var xhr = job.xhr = new XMLHttpRequest();
      xhr.open("PUT", "/admin/upload?slug=" + encodeURIComponent(job.slug) + "&name=" + encodeURIComponent(job.name) + "&upload=" + job.id);
      xhr.setRequestHeader("X-CSRF-Token", csrf);
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) {
          var pct = Math.round((e.loaded / e.total) * 100);
          bar.value = pct;
          label.textContent = job.file.name + " · " + (job.file.size / 1048576).toFixed(1) + " MB · " + pct + " %";
        }
      };
      xhr.onload = function () {
        if (job.cancelled) return;
        var data = {};
        try { data = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status === 200 && data.key) {
          row.parentNode.removeChild(row);
          list.appendChild(photoItem(data.key, "", ""));
          say(job.file.name + " uploaded. Add its alt text.");
          save(); finished(job);
        } else if (xhr.status >= 500 || xhr.status === 0) retry(n);
        else { label.textContent = job.file.name + ": " + (data.error || "rejected"); finished(job); }
      };
      xhr.onerror = function () { if (!job.cancelled) retry(n); };
      xhr.send(job.file);
    }
    // A photo that failed or was refused keeps its row and its message: it is never left out without a word.
    function retry(n) {
      if (n >= 5) { label.textContent = job.file.name + ": failed after 5 tries. Pick it again to retry."; finished(job); return; }
      label.textContent = job.file.name + ": connection lost, retrying (" + (n + 1) + " of 5)";
      job.timer = setTimeout(function () { attempt(n + 1); }, 1000 * Math.pow(2, n));
    }
    attempt(0);
  }

  $("photos-field").hidden = false;
  $("w-photos").addEventListener("change", function (e) {
    if (!slug.value) { say("Set the slug first: photos are stored under it."); e.target.value = ""; return; }
    Array.prototype.forEach.call(e.target.files, function (file) {
      if (file.size > maxSize) { say(file.name + " is over 25 MB."); return; }
      var base = file.name.replace(/\.[a-z0-9]{1,5}$/i, "");
      // The Worker adds the random end and never replaces a stored photo (decision 0030).
      // One id per pick, the same on every retry: a retry after a lost answer gets the photo already stored (0040).
      add({ file: file, slug: slug.value, name: slugify(base || "photo"), id: crypto.randomUUID() });
    });
    e.target.value = "";
    next();
  });
  list.addEventListener("click", function (e) {
    if (e.target.hasAttribute("data-remove")) { e.target.closest("li").remove(); save(); }
  });
  title.addEventListener("input", function () { if (autoSlug) { slug.value = slugify(title.value); lookup(); } });
  slug.addEventListener("input", function () { autoSlug = slug.value === ""; lookup(); });
  lang.addEventListener("change", lookup);
  form.addEventListener("input", save);
  form.addEventListener("change", save);
  restore();
})();
`;
