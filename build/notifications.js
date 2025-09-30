const STACK_DELAY = 3500;

export class NotificationManager {
  constructor() {
    this.container = document.getElementById("notification-stack");
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "notification-stack";
      document.body.appendChild(this.container);
    }
  }

  show({ message, icon = "✅" }) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.textContent = `${icon} ${message}`;
    this.container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("visible");
    });

    setTimeout(() => {
      toast.classList.remove("visible");
      toast.addEventListener("transitionend", () => {
        toast.remove();
      });
    }, STACK_DELAY);
  }
}
