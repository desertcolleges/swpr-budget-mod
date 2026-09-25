const SUPABASE_URL =
  'https://dfghvbhidpzxjdcczcck.supabase.co';

const SUPABASE_ANON_KEY =
  'sb_publishable_IXoPGcfK7o5LbccQvk6g9g_cWbtfrH2';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const state = {
  requests: [],
  selectedRequest: null
};

document.addEventListener('DOMContentLoaded', async () => {
  document
    .getElementById('loginForm')
    .addEventListener('submit', signIn);

  document
    .getElementById('logoutButton')
    .addEventListener('click', signOut);

  document
    .getElementById('statusFilter')
    .addEventListener('change', renderRequestList);

  document
    .getElementById('backToRequestsButton')
    .addEventListener('click', showRequestList);

  document
    .getElementById('approveButton')
    .addEventListener('click', () => processRequest('Approved'));

  document
    .getElementById('rejectButton')
    .addEventListener('click', () => processRequest('Rejected'));

  await loadExistingSession();
});

async function loadExistingSession() {
  const { data, error } =
    await supabaseClient.auth.getSession();

  if (error) {
    showMessage(error.message, 'error');
    return;
  }

  if (data.session) {
    const isAuthorized = await isAdminUser(data.session.user.id);

    if (!isAuthorized) {
      await supabaseClient.auth.signOut();
      showMessage(
        'This account does not have admin access.',
        'error'
      );
      return;
    }

    await showAdminDashboard(data.session);
  }
}

async function isAdminUser(userId) {
  const { data, error } = await supabaseClient
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .eq('active', true)
    .limit(1);

  if (error) {
    console.error('Admin check failed:', error);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

async function signIn(event) {
  event.preventDefault();

  const email =
    document.getElementById('loginEmail').value.trim();

  const password =
    document.getElementById('loginPassword').value;

  try {
    showLoading(true);
    clearMessage();

    const { data, error } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

    if (error) throw error;

    const isAuthorized = await isAdminUser(data.user.id);

    if (!isAuthorized) {
      await supabaseClient.auth.signOut();
      throw new Error(
        'This account does not have admin access.'
      );
    }

    await showAdminDashboard(data.session);
  } catch (error) {
    showMessage(
      'Unable to sign in: ' + error.message,
      'error'
    );
  } finally {
    showLoading(false);
  }
}

async function showAdminDashboard(session) {
  document
    .getElementById('loginSection')
    .classList.add('hidden');

  document
    .getElementById('reviewSection')
    .classList.add('hidden');

  document
    .getElementById('adminSection')
    .classList.remove('hidden');

  document.getElementById('signedInUser').textContent =
    `Signed in as ${session.user.email}`;

  await loadRequests();
}

async function loadRequests() {
  try {
    showLoading(true);
    clearMessage();

    const { data, error } = await supabaseClient
      .from('budget_submissions')
      .select(`
        id,
        request_number,
        requester_name,
        requester_email,
        institution,
        justification,
        status,
        admin_notes,
        created_at,
        reviewed_at
      `)
      .order('created_at', {
        ascending: false
      });

    if (error) throw error;

    state.requests = data || [];
    renderRequestList();
  } catch (error) {
    showMessage(
      'Unable to load requests: ' + error.message,
      'error'
    );
  } finally {
    showLoading(false);
  }
}

function renderRequestList() {
  const container =
    document.getElementById('requestList');

  const status =
    document.getElementById('statusFilter').value;

  const requests = status
    ? state.requests.filter(
        request => request.status === status
      )
    : state.requests;

  if (requests.length === 0) {
    container.innerHTML =
      '<p class="card">No requests found.</p>';
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Request</th>
          <th>Date</th>
          <th>Requester</th>
          <th>Institution</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
  `;

  requests.forEach(request => {
    html += `
      <tr>
        <td>
          <span class="status-badge status-${request.status.toLowerCase()}">
            ${escapeHtml(request.status)}
          </span>
        </td>

        <td>
          ${escapeHtml(request.request_number)}
        </td>

        <td>
          ${formatDate(request.created_at)}
        </td>

        <td>
          ${escapeHtml(request.requester_name)}
        </td>

        <td>
          ${escapeHtml(request.institution)}
        </td>

        <td>
          <button
            class="button primary small-button"
            data-request-id="${request.id}"
          >
            Review
          </button>
        </td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;

  container
    .querySelectorAll('[data-request-id]')
    .forEach(button => {
      button.addEventListener('click', () => {
        loadRequestDetail(button.dataset.requestId);
      });
    });
}

async function loadRequestDetail(requestId) {
  try {
    showLoading(true);
    clearMessage();

    const request = state.requests.find(
      item => item.id === requestId
    );

    if (!request) {
      throw new Error('Request was not found.');
    }

    const { data: modifications, error } =
      await supabaseClient
        .from('submission_modifications')
        .select('*')
        .eq('submission_id', requestId)
        .order('title')
        .order('activity_title')
        .order('object_code');

    if (error) throw error;

    state.selectedRequest = {
      ...request,
      modifications: modifications || []
    };

    renderRequestDetail();
  } catch (error) {
    showMessage(
      'Unable to load request: ' + error.message,
      'error'
    );
  } finally {
    showLoading(false);
  }
}

function renderRequestDetail() {
  const request = state.selectedRequest;

  document
    .getElementById('adminSection')
    .classList.add('hidden');

  document
    .getElementById('reviewSection')
    .classList.remove('hidden');

  document.getElementById('reviewRequestNumber')
    .textContent = request.request_number;

  document.getElementById('requestMetadata').innerHTML = `
    <p>
      <strong>Requester:</strong>
      ${escapeHtml(request.requester_name)}
    </p>

    <p>
      <strong>Email:</strong>
      <a href="mailto:${escapeAttribute(request.requester_email)}">
        ${escapeHtml(request.requester_email)}
      </a>
    </p>

    <p>
      <strong>Institution:</strong>
      ${escapeHtml(request.institution)}
    </p>

    <p>
      <strong>Status:</strong>
      ${escapeHtml(request.status)}
    </p>

    <p>
      <strong>Submitted:</strong>
      ${formatDate(request.created_at)}
    </p>

    <hr />

    <p>
      <strong>Justification:</strong>
    </p>

    <p>
      ${escapeHtml(request.justification)}
    </p>
  `;

  renderModificationDetails();

  document.getElementById('adminNotes').value =
    request.admin_notes || '';

  const isPending = request.status === 'Pending';

  document
    .getElementById('reviewActions')
    .classList.toggle('hidden', !isPending);
}

function renderModificationDetails() {
  const request = state.selectedRequest;
  const container =
    document.getElementById('modificationDetails');

  if (!request.modifications.length) {
    container.innerHTML =
      '<p class="card">No modifications were found.</p>';
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Project</th>
          <th>Activity</th>
          <th>Object Code</th>
          <th>Current Description</th>
          <th>Proposed Description</th>
          <th>Current Budget</th>
          <th>Proposed Budget</th>
        </tr>
      </thead>
      <tbody>
  `;

  request.modifications.forEach(row => {
    html += `
      <tr>
        <td>${escapeHtml(row.title)}</td>
        <td>${escapeHtml(row.activity_title)}</td>
        <td>${escapeHtml(row.object_code)}</td>
        <td>
          ${escapeHtml(row.budget_item_description)}
        </td>
        <td>
          ${escapeHtml(row.proposed_description)}
        </td>
        <td class="money">
          ${formatCurrency(row.current_budget)}
        </td>
        <td class="money">
          ${formatCurrency(row.proposed_budget)}
        </td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

async function processRequest(action) {
  const request = state.selectedRequest;

  if (!request || request.status !== 'Pending') {
    showMessage(
      'Only pending requests can be processed.',
      'error'
    );
    return;
  }

  const notes =
    document.getElementById('adminNotes').value.trim();

  if (action === 'Rejected' && !notes) {
    showMessage(
      'Please provide notes explaining the rejection.',
      'error'
    );
    return;
  }

  const confirmed = window.confirm(
    `Are you sure you want to mark this request as ${action}?`
  );

  if (!confirmed) return;

  try {
    showLoading(true);
    clearMessage();

    const { error } = await supabaseClient
      .from('budget_submissions')
      .update({
        status: action,
        admin_notes: notes || null,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', request.id)
      .eq('status', 'Pending');

    if (error) throw error;

    await notifyRequester(
      request.requester_email,
      request.request_number,
      action,
      notes
    );

    showMessage(
      `Request marked as ${action}.`,
      'success'
    );

    await loadRequests();
    showRequestList();
  } catch (error) {
    showMessage(
      'Unable to process request: ' + error.message,
      'error'
    );
  } finally {
    showLoading(false);
  }
}

async function notifyRequester(
  email,
  requestNumber,
  action,
  notes
) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/send-approval`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          requester_email: email,
          request_number: requestNumber,
          action: action,
          notes: notes
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error(
        'Approval email failed:',
        result.error || 'Unknown error'
      );
    }
  } catch (error) {
    console.error('Approval email failed:', error);
  }
}

function showRequestList() {
  document
    .getElementById('reviewSection')
    .classList.add('hidden');

  document
    .getElementById('adminSection')
    .classList.remove('hidden');

  state.selectedRequest = null;
}

async function signOut() {
  await supabaseClient.auth.signOut();

  document
    .getElementById('adminSection')
    .classList.add('hidden');

  document
    .getElementById('reviewSection')
    .classList.add('hidden');

  document
    .getElementById('loginSection')
    .classList.remove('hidden');

  document.getElementById('loginForm').reset();
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return '';

  return new Date(value).toLocaleString();
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
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
