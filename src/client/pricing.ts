// The pricing page's monthly/yearly switch.
//
// Three things move together and all three matter: which price each card shows,
// which button looks pressed, and — the one that is easy to forget — the hidden
// field the checkout form posts. Miss the last and the page reads "$2" while the
// button quietly buys the monthly price.

type Period = "monthly" | "yearly";

const group = document.getElementById("billing-period");

if (group) {
  const buttons = [...group.querySelectorAll<HTMLButtonElement>("button[data-period]")];

  function select(period: Period): void {
    for (const button of buttons) {
      button.setAttribute("aria-pressed", String(button.dataset.period === period));
    }
    // Free has no yearly price and so carries no data-period-price at all,
    // which is what keeps "$0 forever" on screen in both modes.
    for (const price of document.querySelectorAll<HTMLElement>("[data-period-price]")) {
      price.hidden = price.dataset.periodPrice !== period;
    }
    for (const input of document.querySelectorAll<HTMLInputElement>("input[data-period-input]")) {
      input.value = period;
    }
  }

  for (const button of buttons) {
    button.addEventListener("click", () => {
      select(button.dataset.period === "yearly" ? "yearly" : "monthly");
    });
  }
}
