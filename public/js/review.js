// public/js/review.js
//
// Coordinator review actions. This script ONLY talks to the existing API
// endpoints (confirm / reject) with their established payloads and semantics.
// It contains no business/workflow logic; errors from the API are surfaced
// as-is (human-readable message) for the reviewer.

document.querySelectorAll(".confirm-form").forEach((form) => {
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

  // Confirm: push the (possibly edited) proposal values to the API.
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    const id = form.closest(".report-card").dataset.reportId;
    try {
      await post(form.action, {
        category: form.elements.category.value,
        severity: form.elements.severity.value,
        summary: form.elements.summary.value,
        confirmedByName: form.elements.confirmedByName.value,
      });
      window.location.href = "/reports/review";
    } catch (err) {
      showError(err.message);
    }
  });

  // Reject: POST to the existing reject endpoint.
  const rejectBtn = form.querySelector("[data-action='reject']");
  rejectBtn.addEventListener("click", async () => {
    errorEl.hidden = true;
    const id = rejectBtn.dataset.id;
    if (!window.confirm("Reject this report? It will no longer appear for review.")) return;
    try {
      await post(`/api/reports/${id}/reject`, {});
      window.location.href = "/reports/review";
    } catch (err) {
      showError(err.message);
    }
  });
});
