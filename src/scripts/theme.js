(function () {
  var root = document.documentElement;
  var saved;
  try {
    saved = localStorage.getItem("theme");
  } catch {}
  if (saved === "light" || saved === "dark") root.dataset.theme = saved;
  document.addEventListener("DOMContentLoaded", function () {
    var button = document.querySelector("[data-theme-toggle]");
    if (!button) return;
    var dark = function () {
      return root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    };
    button.addEventListener("click", function () {
      var next = dark() ? "light" : "dark";
      root.dataset.theme = next;
      try {
        localStorage.setItem("theme", next);
      } catch {}
    });
  });
})();
