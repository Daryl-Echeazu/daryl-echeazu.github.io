/* Keyboard activation for elements build.py promotes to role="button"
 * (Experience company rows, book spines, DarylOS icons, dock items and
 * window close controls). Native buttons fire click on Enter/Space;
 * divs don't, so translate. The gold focus ring lives in build.py's injected
 * CSS (:focus-visible). Loaded in the outer head; the listener is on
 * `document`, which survives the bundler's documentElement swap.
 */
(function () {
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var el = document.activeElement;
    if (el && (el.tagName === "DIV" || el.tagName === "SPAN") && el.getAttribute &&
        el.getAttribute("role") === "button") {
      e.preventDefault(); // keep Space from scrolling the page
      el.click();
    }
  });
})();
