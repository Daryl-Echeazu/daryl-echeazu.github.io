/* Keyboard activation for elements build.py promotes to role="button"
 * (the Experience company rows). Native buttons fire click on Enter/Space;
 * divs don't, so translate. The gold focus ring lives in build.py's injected
 * CSS (:focus-visible). Loaded in the outer head; the listener is on
 * `document`, which survives the bundler's documentElement swap.
 */
(function () {
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var el = document.activeElement;
    if (el && el.tagName === "DIV" && el.getAttribute &&
        el.getAttribute("role") === "button") {
      e.preventDefault(); // keep Space from scrolling the page
      el.click();
    }
  });
})();
