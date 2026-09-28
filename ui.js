// The toolbar, money display, and status hint are ordinary HTML elements
// layered over the canvas (see index.html), not drawn on it. Buttons, text
// and hover states are things browsers already know how to do well — no
// reason to reinvent them in canvas drawing code.

const UI = {
  defaultHint: "Left-click, or drag, to build. Right-click/drag or WASD/arrows to scroll.",

  showHint(message) {
    const el = document.getElementById("hint");
    el.textContent = message || this.defaultHint;
    el.classList.toggle("hint-error", !!message);
  },

  reportResult(result) {
    this.showHint(result.ok ? null : result.reason);
    if (result.ok) this.updateMoney();
  },

  updateMoney() {
    document.getElementById("money").textContent = World.formatMoney(World.money);
  },

  attachToolbar() {
    const buttons = document.querySelectorAll("#toolbar button[data-tool]");
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        Tool.current = button.dataset.tool;
        buttons.forEach((b) => b.classList.toggle("active", b === button));
        this.showHint(null);
      });
    });
    // "floor" is the default tool, so its button should look selected
    // before the player has clicked anything.
    document.querySelector('#toolbar button[data-tool="floor"]').classList.add("active");
  },
};
