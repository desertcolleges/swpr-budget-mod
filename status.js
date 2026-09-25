const SUPABASE_URL = 'https://dfghvbhidpzxjdcczcck.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IXoPGcfK7o5LbccQvk6g9g_cWbtfrH2';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const state = {
  request: null,
  modifications: [],
  statusToken: ''
};

document.addEventListener('DOMContentLoaded', () => {
  document
    .getElementById('lookupForm')
    .addEventListener('submit', handleLookup);

  document
    .getElementById('printRecordButton')
    .addEventListener('click', () => window.print());

  const params = new URLSearchParams(window.location.search);
  const requestId = params.get('requestId') || '';
  const token = params.get('token') || '';

  state.statusToken = token;

  if (requestId) {
    document.getElementById('requestNumberInput').value = requestId;

    if (token) {
      showMessage('Secure request link detected. You can run lookup now.', 'success');
    } else {
      showMessage('Enter requester email to view this request.', 'success');
    }
  }
});

async function handleLookup(event) {
  event.preventDefault();

  const requestNumber =
    document.getElementById('requestNumberInput').value.trim();
  const requesterEmail =
    document.getElementById('requesterEmailInput').value.trim().toLowerCase();

  if (!requestNumber) {
    showMessage('Request number is required.', 'error');
    return;
  }

  if (!state.statusToken && !requesterEmail) {
    showMessage('Requester email is required unless using a secure token link.', 'error');
    return;
  }

  try {
    showLoading(true);
    clearMessage();

    await fetchBySecureRpc(
      requestNumber,
      requesterEmail,
      state.statusToken
    );

    if (!state.request) {
      throw new Error('No request matched the provided lookup details.');
    }

    renderStatusRecord();
  } catch (error) {
    document.getElementById('statusResultSection').classList.add('hidden');
    showMessage('Lookup failed: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function fetchBySecureRpc(requestNumber, requesterEmail, statusToken) {
  const { data, error } = await supabaseClient.rpc('get_request_status', {
    p_request_number: requestNumber,
    p_requester_email: requesterEmail || null,
    p_status_token: statusToken || null
  });

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    state.request = null;
    state.modifications = [];
    return;
  }

  const first = rows[0];
  state.request = {
    id: first.submission_id,
    request_number: first.request_number,
    requester_name: first.requester_name,
    requester_email: first.requester_email,
    institution: first.institution,
    round: first.round,
    status: first.status,
    admin_notes: first.admin_notes,
    justification: first.justification,
    created_at: first.created_at,
    reviewed_at: first.reviewed_at
  };

  state.modifications = rows
    .filter(row => row.title || row.proposed_description || row.activity_title)
    .map(row => ({
      title: row.title,
      activity_title: row.activity_title,
      proposed_activity_title: row.proposed_activity_title,
      object_code: row.object_code,
      budget_item_description: row.budget_item_description,
      proposed_description: row.proposed_description,
      current_budget: row.current_budget,
      proposed_budget: row.proposed_budget,
      is_deleted: row.is_deleted,
      is_new_line: row.is_new_line,
      round: row.modification_round || row.round
    }));
}

function renderStatusRecord() {
  const request = state.request;

  document.getElementById('statusResultSection').classList.remove('hidden');
  document.getElementById('statusRequestHeading').textContent =
    `Request ${request.request_number}`;

  const summary = document.getElementById('requestSummary');
  summary.innerHTML = `
    <div class="record-grid">
      <p><strong>Requester:</strong> ${escapeHtml(request.requester_name || '')}</p>
      <p><strong>Email:</strong> ${escapeHtml(request.requester_email || '')}</p>
      <p><strong>Institution:</strong> ${escapeHtml(request.institution || '')}</p>
      <p><strong>Round:</strong> ${escapeHtml(request.round || 'Unknown')}</p>
      <p><strong>Status:</strong> <span class="status-badge status-${String(request.status || '').toLowerCase()}">${escapeHtml(request.status || '')}</span></p>
      <p><strong>Submitted:</strong> ${formatDate(request.created_at)}</p>
      <p><strong>Reviewed:</strong> ${formatDate(request.reviewed_at)}</p>
    </div>
    <p><strong>Justification:</strong> ${escapeHtml(request.justification || '')}</p>
    <p><strong>Admin Notes:</strong> ${escapeHtml(request.admin_notes || 'No notes provided')}</p>
  `;

  renderModificationTable();
  renderResubmissionBlock();
}

function renderModificationTable() {
  const container = document.getElementById('requestModifications');

  if (!state.modifications.length) {
    container.innerHTML = '<p class="card">No modification lines were found for this request.</p>';
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Round</th>
          <th>Project</th>
          <th>Activity</th>
          <th>Proposed Activity</th>
          <th>Object Code</th>
          <th>Current Details</th>
          <th>Revised Details</th>
          <th>Current Budget</th>
          <th>Proposed Budget</th>
          <th>Flags</th>
        </tr>
      </thead>
      <tbody>
  `;

  state.modifications.forEach(row => {
    const isDeleted = Boolean(row.is_deleted);
    const isNew = Boolean(row.is_new_line);

    html += `
      <tr class="${isDeleted ? 'deleted-row' : ''}">
        <td>${escapeHtml(row.round || state.request.round || '')}</td>
        <td>${escapeHtml(row.title)}</td>
        <td>${escapeHtml(row.activity_title)}</td>
        <td>${escapeHtml(row.proposed_activity_title || '')}</td>
        <td>${escapeHtml(row.object_code)}</td>
        <td>${escapeHtml(row.budget_item_description)}</td>
        <td>${escapeHtml(row.proposed_description)}</td>
        <td class="money">${formatCurrency(row.current_budget)}</td>
        <td class="money">${formatCurrency(row.proposed_budget)}</td>
        <td>
          ${isDeleted ? '<span class="flag flag-delete">Marked Deleted</span>' : ''}
          ${isNew ? '<span class="flag flag-new">New Line</span>' : ''}
          ${!isDeleted && !isNew ? '<span class="flag">Updated</span>' : ''}
        </td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function renderResubmissionBlock() {
  const block = document.getElementById('resubmissionBlock');

  if (state.request.status === 'Rejected') {
    block.innerHTML = `
      <strong>Resubmission:</strong>
      This request is preserved as an audit record and cannot be edited in place.
      Submit a new request from the main budget form for this round.
    `;
    return;
  }

  block.innerHTML =
    '<strong>Record Notice:</strong> This is a print/download-friendly status record.';
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(
    String(value || '')
      .replace(/[$,\s]/g, '')
      .trim()
  );

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(toNumber(value));
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showMessage(message, type) {
  document.getElementById('messageArea').innerHTML = `
    <div class="alert alert-${type}">
      ${escapeHtml(message)}
    </div>
  `;
}

function clearMessage() {
  document.getElementById('messageArea').innerHTML = '';
}

function showLoading(show) {
  document
    .getElementById('loadingOverlay')
    .classList.toggle('hidden', !show);
}
