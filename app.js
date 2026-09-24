const SUPABASE_URL = 'https://dfghvbhidpzxjdcczcck.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IXoPGcfK7o5LbccQvk6g9g_cWbtfrH2';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const state = {
  institution: '',
  budgetRows: [],
  expenditureRows: [],
  modificationRows: []
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
});

const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

document.addEventListener('DOMContentLoaded', () => {
  document
    .getElementById('loadBudgetButton')
    .addEventListener('click', loadSelectedInstitution);

  document
    .getElementById('startModificationButton')
    .addEventListener('click', showModificationView);

  document
    .getElementById('cancelModificationButton')
    .addEventListener('click', showBudgetView);

  document
    .getElementById('submissionForm')
    .addEventListener('submit', submitModification);

  loadInstitutions();
});

async function loadInstitutions() {
  try {
    showLoading(true);

    const { data, error } = await supabaseClient
      .from('budget_reference')
      .select('institution')
      .order('institution');

    if (error) throw error;

    const institutions = [
      ...new Set(
        data
          .map(row => row.institution)
          .filter(Boolean)
      )
    ];

    const select = document.getElementById('institutionSelect');

    select.innerHTML = '<option value="">Select an institution</option>';

    institutions.forEach(institution => {
      const option = document.createElement('option');
      option.value = institution;
      option.textContent = institution;
      select.appendChild(option);
    });
  } catch (error) {
    showMessage(
      'Unable to load institutions: ' + error.message,
      'error'
    );
  } finally {
    showLoading(false);
  }
}

async function loadSelectedInstitution() {
  const institution = document.getElementById('institutionSelect').value;

  if (!institution) {
    showMessage('Please select an institution.', 'error');
    return;
  }

  try {
    showLoading(true);
    clearMessage();

    const [budgetResult, expenditureResult] = await Promise.all([
      supabaseClient
        .from('budget_reference')
        .select('*')
        .eq('institution', institution)
        .order('title')
        .order('activity_title')
        .order('object_code'),

      supabaseClient
        .from('expenditure_reference')
        .select('*')
        .eq('institution', institution)
        .order('project')
        .order('object_code')
    ]);

    if (budgetResult.error) throw budgetResult.error;
    if (expenditureResult.error) throw expenditureResult.error;

    state.institution = institution;
    state.budgetRows = budgetResult.data || [];
    state.expenditureRows = expenditureResult.data || [];

    renderBudget();
  } catch (error) {
    showMessage(
      'Unable to load budget data: ' + error.message,
      'error'
    );
  } finally {
    showLoading(false);
  }
}

function renderBudget() {
  document
    .getElementById('budgetSection')
    .classList.remove('hidden');

  document
    .getElementById('modificationSection')
    .classList.add('hidden');

  document.getElementById('institutionHeading').textContent =
    state.institution;

  renderSummaryCards();
  renderBudgetTable();
}

function renderSummaryCards() {
  const totalBudget = state.budgetRows.reduce(
    (total, row) => total + toNumber(row.budget),
    0
  );

  const totalExpenditures = state.expenditureRows.reduce(
    (total, row) => total + toNumber(row.expenditure_amount),
    0
  );

  const remaining = totalBudget - totalExpenditures;

  document.getElementById('summaryCards').innerHTML = `
    <div class="summary-card">
      <span>Total Budget</span>
      <strong>${formatCurrency(totalBudget)}</strong>
    </div>

    <div class="summary-card">
      <span>Total Expenditures</span>
      <strong>${formatCurrency(totalExpenditures)}</strong>
    </div>

    <div class="summary-card">
      <span>Remaining</span>
      <strong class="${remaining < 0 ? 'difference-invalid' : ''}">
        ${formatCurrency(remaining)}
      </strong>
    </div>
  `;
}

function renderBudgetTable() {
  const container = document.getElementById('budgetResults');

  if (state.budgetRows.length === 0) {
    container.innerHTML = '<p>No budget data was found.</p>';
    return;
  }

  const groupedBudget = groupByProject(state.budgetRows);
  const groupedExpenditures = groupExpenditures(
    state.expenditureRows
  );

  let html = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Project</th>
            <th>Activity</th>
            <th>Description</th>
            <th>Object Code</th>
            <th class="money">Budget</th>
            <th class="money">Expenditures</th>
            <th class="money">Remaining</th>
          </tr>
        </thead>
        <tbody>
  `;

  Object.entries(groupedBudget).forEach(
    ([project, rows]) => {
      const projectBudget = rows.reduce(
        (total, row) => total + toNumber(row.budget),
        0
      );

      const projectExpenditures = rows.reduce(
        (total, row) =>
          total +
          getExpenditureForBudgetRow(
            row,
            groupedExpenditures
          ),
        0
      );

      html += `
        <tr class="project-row">
          <td colspan="4">${escapeHtml(project)}</td>
          <td class="money">${formatCurrency(projectBudget)}</td>
          <td class="money">
            ${formatCurrency(projectExpenditures)}
          </td>
          <td class="money">
            ${formatCurrency(projectBudget - projectExpenditures)}
          </td>
        </tr>
      `;

      rows.forEach(row => {
        const budget = toNumber(row.budget);
        const expenditures = getExpenditureForBudgetRow(
          row,
          groupedExpenditures
        );

        html += `
          <tr>
            <td>${escapeHtml(row.title)}</td>
            <td>${escapeHtml(row.activity_title)}</td>
            <td>
              ${escapeHtml(row.budget_item_description)}
            </td>
            <td>${escapeHtml(row.object_code)}</td>
            <td class="money">${formatCurrency(budget)}</td>
            <td class="money">
              ${formatCurrency(expenditures)}
            </td>
            <td class="money">
              ${formatCurrency(budget - expenditures)}
            </td>
          </tr>
        `;
      });
    }
  );

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
}

function showModificationView() {
  if (state.budgetRows.length === 0) {
    showMessage('There is no budget data to modify.', 'error');
    return;
  }

  state.modificationRows = state.budgetRows.map(row => ({
    ...row,
    proposed_budget: toNumber(row.budget),
    proposed_description: row.budget_item_description || ''
  }));

  document
    .getElementById('budgetSection')
    .classList.add('hidden');

  document
    .getElementById('modificationSection')
    .classList.remove('hidden');

  renderModificationTable();
  updateModificationTotals();
}

function showBudgetView() {
  document
    .getElementById('modificationSection')
    .classList.add('hidden');

  document
    .getElementById('budgetSection')
    .classList.remove('hidden');

  clearMessage();
}

function renderModificationTable() {
  const container = document.getElementById('modificationRows');

  let html = `
    <table>
      <thead>
        <tr>
          <th>Project</th>
          <th>Activity</th>
          <th>Object Code</th>
          <th>Current Description</th>
          <th class="money">Current Budget</th>
          <th>Proposed Description</th>
          <th>Proposed Budget</th>
        </tr>
      </thead>
      <tbody>
  `;

  state.modificationRows.forEach((row, index) => {
    html += `
      <tr>
        <td>${escapeHtml(row.title)}</td>
        <td>${escapeHtml(row.activity_title)}</td>
        <td>${escapeHtml(row.object_code)}</td>
        <td>${escapeHtml(row.budget_item_description)}</td>
        <td class="money">
          ${formatCurrency(row.budget)}
        </td>
        <td>
          <input
            type="text"
            data-index="${index}"
            data-field="proposed_description"
            value="${escapeAttribute(row.proposed_description)}"
          />
        </td>
        <td>
          <input
            class="amount-input"
            type="number"
            min="0"
            step="0.01"
            data-index="${index}"
            data-field="proposed_budget"
            value="${numberFormatter.format(row.proposed_budget)}"
          />
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
    .querySelectorAll('input[data-index]')
    .forEach(input => {
      input.addEventListener('input', handleModificationChange);
    });
}

function handleModificationChange(event) {
  const input = event.target;
  const index = Number(input.dataset.index);
  const field = input.dataset.field;

  if (field === 'proposed_budget') {
    state.modificationRows[index][field] =
      toNumber(input.value);
  } else {
    state.modificationRows[index][field] = input.value;
  }

  updateModificationTotals();
}

function updateModificationTotals() {
  const currentTotal = state.modificationRows.reduce(
    (total, row) => total + toNumber(row.budget),
    0
  );

  const proposedTotal = state.modificationRows.reduce(
    (total, row) => total + toNumber(row.proposed_budget),
    0
  );

  const difference = proposedTotal - currentTotal;
  const valid = Math.abs(difference) < 0.005;

  document.getElementById('currentTotal').textContent =
    formatCurrency(currentTotal);

  document.getElementById('proposedTotal').textContent =
    formatCurrency(proposedTotal);

  const differenceElement =
    document.getElementById('totalDifference');

  differenceElement.textContent =
    formatCurrency(difference);

  differenceElement.className = valid
    ? 'difference-valid'
    : 'difference-invalid';

  document.getElementById('submitButton').disabled = !valid;
}

async function submitModification(event) {
  event.preventDefault();

  const currentTotal = state.modificationRows.reduce(
    (total, row) => total + toNumber(row.budget),
    0
  );

  const proposedTotal = state.modificationRows.reduce(
    (total, row) => total + toNumber(row.proposed_budget),
    0
  );

  if (Math.abs(currentTotal - proposedTotal) >= 0.005) {
    showMessage(
      'The proposed budget must equal the current budget.',
      'error'
    );
    return;
  }

  const requesterName =
    document.getElementById('requesterName').value.trim();

  const requesterEmail =
    document.getElementById('requesterEmail').value.trim();

  const justification =
    document.getElementById('justification').value.trim();

  if (!requesterName || !requesterEmail || !justification) {
    showMessage(
      'Please complete all required fields.',
      'error'
    );
    return;
  }

  try {
    showLoading(true);
    clearMessage();

    const requestNumber =
      'REQ-' +
      crypto.randomUUID()
        .replaceAll('-', '')
        .substring(0, 8)
        .toUpperCase();

    const { data: submission, error: submissionError } =
      await supabaseClient
        .from('budget_submissions')
        .insert({
          request_number: requestNumber,
          requester_name: requesterName,
          requester_email: requesterEmail,
          institution: state.institution,
          justification: justification,
          status: 'Pending'
        })
        .select()
        .single();

    if (submissionError) throw submissionError;

    const modifications = state.modificationRows.map(row => ({
      submission_id: submission.id,
      title: row.title,
      activity_title: row.activity_title,
      budget_item_description:
        row.budget_item_description,
      object_code: row.object_code,
      current_budget: toNumber(row.budget),
      proposed_budget: toNumber(row.proposed_budget),
      current_expenditure: 0,
      proposed_description: row.proposed_description
    }));

    const { error: modificationError } =
      await supabaseClient
        .from('submission_modifications')
        .insert(modifications);

    if (modificationError) throw modificationError;

    document.getElementById('submissionForm').reset();

    showMessage(
      `Request ${requestNumber} was submitted successfully.`,
      'success'
    );

    showBudgetView();
  } catch (error) {
    showMessage(
      'Unable to submit request: ' + error.message,
      'error'
    );
  } finally {
    showLoading(false);
  }
}

function groupByProject(rows) {
  return rows.reduce((groups, row) => {
    const project = row.title || 'Unassigned';

    if (!groups[project]) {
      groups[project] = [];
    }

    groups[project].push(row);
    return groups;
  }, {});
}

function groupExpenditures(rows) {
  return rows.reduce((groups, row) => {
    const key = [
      row.project,
      row.object_code
    ]
      .map(value => String(value || '').trim().toLowerCase())
      .join('|');

    groups[key] = (groups[key] || 0) +
      toNumber(row.expenditure_amount);

    return groups;
  }, {});
}

function getExpenditureForBudgetRow(row, groupedExpenditures) {
  const key = [
    row.title,
    row.object_code
  ]
    .map(value => String(value || '').trim().toLowerCase())
    .join('|');

  return groupedExpenditures[key] || 0;
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
  return currencyFormatter.format(toNumber(value));
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
  const area = document.getElementById('messageArea');

  area.innerHTML = `
    <div class="alert alert-${type}">
      ${escapeHtml(message)}
    </div>
  `;

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

function clearMessage() {
  document.getElementById('messageArea').innerHTML = '';
}

function showLoading(show) {
  document
    .getElementById('loadingOverlay')
    .classList.toggle('hidden', !show);
}
