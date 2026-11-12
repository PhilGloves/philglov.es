/**
 * The one script of the admin pages (served at /admin/write.js, behind Access,
 * under the admin CSP). Public pages never load it. It adds, on /admin/write:
 *  - the slug suggested from the title while the slug field is untouched;
 *  - what the slug means (new, other-language version, existing) and the
 *    reference text, from /admin/write/reference;
 *  - autosave in this browser (localStorage), restored when newer than the server copy;
 *  - photo uploads one at a time, with progress and automatic retry.
 * Plain ES2017, no framework, DOM built with createElement/textContent only.
 * Kept as a string so the Worker can serve it; tests/unit/admin-client.test.ts parses it.
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
    var tags = Array.prototype.filter.call(form.querySelectorAll('input[name="tags"]'), function (c) { return c.checked; })
      .map(function (c) { return c.value; });
    return { savedAt: Date.now(), title: title.value, slug: slug.value, lang: lang.value,
      description: form.elements.namedItem("description").value, tags: tags, body: body.value, photos: photos };
  }
  var timer;
  function save() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      try { localStorage.setItem(key, JSON.stringify(snapshot())); } catch (e) {}
    }, 400);
  }
  function restore() {
    var saved;
    try { saved = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { saved = null; }
    if (!saved || saved.savedAt <= serverTime) return;
    title.value = saved.title; slug.value = saved.slug; lang.value = saved.lang; body.value = saved.body;
    form.elements.namedItem("description").value = saved.description;
    form.querySelectorAll('input[name="tags"]').forEach(function (c) { c.checked = saved.tags.indexOf(c.value) >= 0; });
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

  // Uploads: one at a time, progress, retry with growing pauses.
  var queue = [], busy = false;
  function say(text) { status.textContent = text; }
  function next() {
    if (busy || !queue.length) return;
    busy = true;
    var job = queue.shift();
    var row = el("div", { class: "upload" });
    var label = el("span", { class: "fine" }, job.file.name);
    var bar = el("progress", { max: "100", value: "0", "aria-label": job.file.name + " upload" });
    row.appendChild(label); row.appendChild(bar);
    status.parentNode.insertBefore(row, status);
    function attempt(n) {
      var xhr = new XMLHttpRequest();
      xhr.open("PUT", "/admin/upload?slug=" + encodeURIComponent(job.slug) + "&name=" + encodeURIComponent(job.name));
      xhr.setRequestHeader("X-CSRF-Token", csrf);
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) {
          var pct = Math.round((e.loaded / e.total) * 100);
          bar.value = pct;
          label.textContent = job.file.name + " · " + (job.file.size / 1048576).toFixed(1) + " MB · " + pct + " %";
        }
      };
      xhr.onload = function () {
        var data = {};
        try { data = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status === 200 && data.key) {
          row.parentNode.removeChild(row);
          list.appendChild(photoItem(data.key, "", ""));
          say(job.file.name + " uploaded. Add its alt text.");
          save(); busy = false; next();
        } else if (xhr.status >= 500 || xhr.status === 0) retry(n);
        else { label.textContent = job.file.name + ": " + (data.error || "rejected"); busy = false; next(); }
      };
      xhr.onerror = function () { retry(n); };
      xhr.send(job.file);
    }
    function retry(n) {
      if (n >= 5) { label.textContent = job.file.name + ": failed after 5 tries. Pick it again to retry."; busy = false; next(); return; }
      label.textContent = job.file.name + ": connection lost, retrying (" + (n + 1) + " of 5)";
      setTimeout(function () { attempt(n + 1); }, 1000 * Math.pow(2, n));
    }
    attempt(0);
  }

  $("photos-field").hidden = false;
  $("w-photos").addEventListener("change", function (e) {
    if (!slug.value) { say("Set the slug first: photos are stored under it."); e.target.value = ""; return; }
    Array.prototype.forEach.call(e.target.files, function (file) {
      if (file.size > maxSize) { say(file.name + " is over 25 MB."); return; }
      var base = file.name.replace(/\.[a-z0-9]{1,5}$/i, "");
      queue.push({ file: file, slug: slug.value, name: slugify(base || "photo") + "-" + Math.random().toString(36).slice(2, 6) });
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
