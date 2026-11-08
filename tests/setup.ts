if (typeof HTMLElement !== "undefined" && !HTMLElement.prototype.createEl) {
  Object.defineProperty(HTMLElement.prototype, "createEl", {
    configurable: true,
    value(this: HTMLElement, tagName: string) {
      const element = this.ownerDocument.createElement(tagName);
      this.appendChild(element);
      return element;
    },
  });
}
