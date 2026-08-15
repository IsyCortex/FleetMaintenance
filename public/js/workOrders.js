// public/js/workOrders.js
// Vanilla JS for the work-order browser overview (TICKET-8).
// Handles create-work-order form submission with inline error handling.
// Uses the existing API endpoints; contains no business logic.

document.addEventListener("DOMContentLoaded", () => {
  // Handle create work order form submissions
  document.querySelectorAll(".create-wo-form").forEach((form) => {
    const errorEl = form.querySelector(".form-error");

    async function post(path, payload) {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Request failed");
      }
      return data;
    }

    function showError(message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      showError(""); // clear previous errors

      const issueId = form.elements.issueId.value;
      const assignedTo = form.elements.assignedTo.value.trim();
      const notes = form.elements.notes.value.trim();

      if (!assignedTo) {
        showError("Assigned To is required");
        return;
      }

      try {
        await post(form.action, {
          issueId: parseInt(issueId, 10),
          assignedTo,
          notes,
        });
        // After successful creation, reload the page to show the new work order
        window.location.href = "/work-orders";
      } catch (err) {
        showError(err.message);
      }
    });
  });
});