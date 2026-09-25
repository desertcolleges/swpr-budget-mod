import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
const appBaseUrl = "https://desertcolleges.github.io/swpr-budget-mod";

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
    const { requester_email, request_number, action, notes } = body;

    if (!requester_email || !request_number || !action) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const statusLink = `${appBaseUrl}/status.html?requestId=${encodeURIComponent(request_number)}`;
    const subject = action === "Approved"
      ? `Budget Request Approved: ${request_number}`
      : `Budget Request Rejected: ${request_number}`;

    const htmlBody = action === "Approved"
      ? `
        <h2>Budget Request Approved</h2>
        <p>Your budget modification request <strong>${request_number}</strong> has been approved.</p>
        <p><a href="${statusLink}">View Request Details</a></p>
        <p>You will be contacted with next steps.</p>
      `
      : `
        <h2>Budget Request Rejected</h2>
        <p>Your budget modification request <strong>${request_number}</strong> has been rejected.</p>
        <p><strong>Reason:</strong></p>
        <p>${notes || "No reason provided"}</p>
        <p><a href="${statusLink}">View Request and Resubmit</a></p>
        <p>Please contact your administrator if you have questions.</p>
      `;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`
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
      console.error("Resend API error:", result);
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
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
