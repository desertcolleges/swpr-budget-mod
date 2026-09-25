import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
const appBaseUrl = "https://desertcolleges.github.io/swpr-budget-mod";

function escapeHtml(value: unknown): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { requester_email, request_number, action, notes, status_token } = body;

    if (!requester_email || !request_number || !action) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const tokenQuery = status_token
      ? `&token=${encodeURIComponent(status_token)}`
      : "";
    const statusLink = `${appBaseUrl}/status.html?requestId=${encodeURIComponent(request_number)}${tokenQuery}`;
    const subject = action === "Approved"
      ? `Budget Request Approved: ${request_number}`
      : `Budget Request Rejected: ${request_number}`;

    const escapedRequest = escapeHtml(request_number);
    const escapedNotes = escapeHtml(notes || "No rejection reason provided.");

    const htmlBody = action === "Approved"
      ? `
        <h2>Budget Request Approved</h2>
        <p>Your budget modification request <strong>${escapedRequest}</strong> has been approved.</p>
        <p><a href="${statusLink}">View Request Status Record</a></p>
        <p>You can print or save the status record from the portal.</p>
      `
      : `
        <h2>Budget Request Rejected</h2>
        <p>Your budget modification request <strong>${escapedRequest}</strong> has been rejected.</p>
        <p><strong>Reason:</strong> ${escapedNotes}</p>
        <p><a href="${statusLink}">View Request Status Record</a></p>
        <p>This rejection notification does not include a PDF attachment.</p>
      `;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + resendApiKey,
      },
      body: JSON.stringify({
        from: "noreply@desertcolleges.org",
        to: requester_email,
        subject,
        html: htmlBody
      })
    });

    const result = await resendResponse.json();

    if (!resendResponse.ok) {
      return new Response(
        JSON.stringify({ error: result.message || "Failed to send email" }),
        { status: resendResponse.status, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, messageId: result.id }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
