const SUPABASE_URL = 'https://dfghvbhidpzxjdcczcck.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IXoPGcfK7o5LbccQvk6g9g_cWbtfrH2';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const DEFAULT_VISIBLE_ROUNDS = ['R10'];

const state = {
  institution: '',
  budgetRows: [],
  expenditureRows: [],
  visibleRounds: [...DEFAULT_VISIBLE_ROUNDS],
  selectedRound: '',
  modificationRows: [],
  rowCounter: 0
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
    .getElementById('backToRoundsButton')
    .addEventListener('click', showRoundSelection);

  document
    .getElementById('startModificationButton')
    .addEventListener('click', showModificationView);

  document
    .getElementById('cancelModificationButton')
    .addEventListener('click', showRoundDetailView);

  document
    .getElementById('addNewLineButton')
    .addEventListener('click', addNewLine);

  document
    .getElementById('submissionForm')
    .addEventListener('submit', submitModification);

  document
    .getElementById('modificationRows')
    .addEventListener('input', handleModificationInput);

  document
    .getElementById('modificationRows')
    .addEventListener('change', handleModificationInput);

  document
    .getElementById('roundCards')
    .addEventListener('click', handleRoundCardClick);

  loadInstitutions();
});

async function loadVisibleRounds() {
  try {
    const { data, error } = await supabaseClient
      .from('site_config')
      .select('visible_rounds')
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const rounds = normalizeRoundList(data?.visible_rounds);
    state.visibleRounds = rounds.length
      ? rounds
      : [...DEFAULT_VISIBLE_ROUNDS];
  } catch (error) {
    console.warn('Using fallback visible rounds:', error.message);
    state.visibleRounds = [...DEFAULT_VISIBLE_ROUNDS];
  }
}

async function loadInstitutions() {
  try {
    showLoading(true);

    const { data, error } = await supabaseClient.rpc(
      'get_public_institutions'
    );

    if (error) throw error;

    const select = document.getElementById('institutionSelect');
    select.innerHTML =
      '<option value="">Select an institution</option>';

    (data || []).forEach(row => {
      const option = document.createElement('option');
      option.value = row.institution;
      option.textContent = row.institution;
      select.appendChild(option);
    });

    if (!data || data.length === 0) {
      select.innerHTML =
        '<option value="">No institutions found</option>';
    }
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

    const visibleRoundsPromise = loadVisibleRounds();

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
    await visibleRoundsPromise;

    if (budgetResult.error) throw budgetResult.error;
    if (expenditureResult.error) throw expenditureResult.error;

    state.institution = institution;
    state.selectedRound = '';
    state.modificationRows = [];

    state.budgetRows = (budgetResult.data || []).map(row => ({
      ...row,
      inferred_round: inferRound(row.title)
    }));

    state.expenditureRows = expenditureResult.data || [];

    renderRoundSelection();
  } catch (error) {
    showMessage(
      'Unable to load budget data: ' + error.message,
      'error'
    );
  } finally {
    showLoading(false);
  }
}

function renderRoundSelection() {
  document.getElementById('institutionHeading').textContent =
    state.institution;

  hideSections();
  document
    .getElementById('roundSection')
    .classList.remove('hidden');

  const cards = document.getElementById('roundCards');
  const allowedRounds = state.visibleRounds;

  const summaries = allowedRounds
    .map(round => summarizeRound(round))
    .filter(summary => summary.projectCount > 0);

  if (!summaries.length) {
    cards.innerHTML = '<p class="card">No visible round data found for this institution.</p>';
    return;
  }

  cards.innerHTML = summaries
    .map(summary => {
      const breakdown = summary.projects
        .slice(0, 5)
        .map(project => `<li>${escapeHtml(project.name)}: ${formatCurrency(project.total)}</li>`)
        .join('');

      return `
        <article class="card round-card">
          <h3>${escapeHtml(summary.round)}</h3>
          <p><strong>Total Budget:</strong> ${formatCurrency(summary.totalBudget)}</p>
          <p><strong>Projects:</strong> ${summary.projectCount}</p>
          <ul class="compact-list">${breakdown || '<li>No project details available.</li>'}</ul>
          <button class="button primary" data-round="${escapeAttribute(summary.round)}">Select ${escapeHtml(summary.round)}</button>
        </article>
      `;
    })
    .join('');
}

function summarizeRound(round) {
  const roundRows = getRowsForRound(round);
  const grouped = groupByProject(roundRows);
  const projects = Object.entries(grouped).map(([name, rows]) => ({
    name,
    total: rows.reduce((sum, row) => sum + toNumber(row.budget), 0)
  }));

  return {
    round,
    totalBudget: roundRows.reduce(
      (sum, row) => sum + toNumber(row.budget),
      0
    ),
    projectCount: projects.length,
    projects
  };
}

function handleRoundCardClick(event) {
  const button = event.target.closest('[data-round]');
  if (!button) return;

  const round = button.dataset.round;
  state.selectedRound = round;
  showRoundDetailView();
}

function showRoundSelection() {
  state.selectedRound = '';
  renderRoundSelection();
}

function showRoundDetailView() {
  if (!state.selectedRound) {
    renderRoundSelection();
    return;
  }

  hideSections();
  document
    .getElementById('roundDetailSection')
    .classList.remove('hidden');

  document.getElementById('selectedRoundHeading').textContent =
    `${state.institution} • ${state.selectedRound}`;

  renderBudgetTableForRound(state.selectedRound);
}

function renderBudgetTableForRound(round) {
  const container = document.getElementById('budgetResults');
  const roundRows = getRowsForRound(round);

  if (!roundRows.length) {
    container.innerHTML = '<p class="card">No budget rows found for this round.</p>';
    return;
  }

  const groupedBudget = groupByProject(roundRows);
  const groupedExpenditures = groupExpenditures(
    state.expenditureRows,
    round
  );

  const currentTotal = roundRows.reduce(
    (total, row) => total + toNumber(row.budget),
    0
  );

  const expenditureTotal = roundRows.reduce(
    (total, row) =>
      total + getExpenditureForBudgetRow(row, groupedExpenditures),
    0
  );

  const remaining = currentTotal - expenditureTotal;

  document.getElementById('roundCurrentTotal').textContent =
    formatCurrency(currentTotal);
  document.getElementById('roundExpenditureTotal').textContent =
    formatCurrency(expenditureTotal);

  const remainingElement = document.getElementById('roundRemainingTotal');
  remainingElement.textContent = formatCurrency(remaining);
  remainingElement.className = remaining < 0 ? 'difference-invalid' : '';

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

  Object.entries(groupedBudget).forEach(([project, rows]) => {
    const projectBudget = rows.reduce(
      (total, row) => total + toNumber(row.budget),
      0
    );

    const projectExpenditures = rows.reduce(
      (total, row) =>
        total + getExpenditureForBudgetRow(row, groupedExpenditures),
      0
    );

    html += `
      <tr class="project-row">
        <td colspan="4">${escapeHtml(project)}</td>
        <td class="money">${formatCurrency(projectBudget)}</td>
        <td class="money">${formatCurrency(projectExpenditures)}</td>
        <td class="money">${formatCurrency(projectBudget - projectExpenditures)}</td>
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
          <td>${escapeHtml(row.budget_item_description)}</td>
          <td>${escapeHtml(row.object_code)}</td>
          <td class="money">${formatCurrency(budget)}</td>
          <td class="money">${formatCurrency(expenditures)}</td>
          <td class="money">${formatCurrency(budget - expenditures)}</td>
        </tr>
      `;
    });
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
}

function showModificationView() {
  const roundRows = getRowsForRound(state.selectedRound);

  if (!roundRows.length) {
    showMessage('There is no round data to modify.', 'error');
    return;
  }

  const startCounter = state.rowCounter;
  state.modificationRows = roundRows.map((row, index) => {
    return {
      rowId: `existing-${startCounter + index + 1}`,
      is_new_line: false,
      is_deleted: false,
      round: state.selectedRound,
      title: row.title || '',
      activity_title: row.activity_title || '',
      object_code: row.object_code || '',
      budget_item_description: row.budget_item_description || '',
      proposed_activity_title: row.activity_title || '',
      proposed_description: row.budget_item_description || '',
      proposed_budget: toNumber(row.budget),
      current_budget: toNumber(row.budget)
    };
  });
  state.rowCounter += roundRows.length;

  hideSections();
  document
    .getElementById('modificationSection')
    .classList.remove('hidden');

  document.getElementById('modificationHeading').textContent =
    `Submit ${state.selectedRound} Budget Modification`;

  renderModificationTable();
  updateModificationTotals();
}

function renderModificationTable() {
  const container = document.getElementById('modificationRows');

  let html = `
    <table>
      <thead>
        <tr>
          <th>Project</th>
          <th>Current Activity</th>
          <th>Revised Activity</th>
          <th>Current Details</th>
          <th>Revised Details</th>
          <th>Object Code</th>
          <th class="money">Current Budget</th>
          <th class="money">Proposed Budget</th>
          <th>Delete Flag</th>
        </tr>
      </thead>
      <tbody>
  `;

  state.modificationRows.forEach((row, index) => {
    const projectOptions = getProjectOptions();
    const activityOptions = getActivityOptions(row.title);

    const changedRowClass = isRowChanged(row) ? 'changed-row' : '';
    const deletedClass = row.is_deleted ? 'deleted-row' : '';

    html += `
      <tr class="${changedRowClass} ${deletedClass}" data-row-index="${index}">
        <td>
          ${row.is_new_line ? `
            <select data-index="${index}" data-field="title">
              ${projectOptions.map(option => `<option value="${escapeAttribute(option)}" ${option === row.title ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}
            </select>
          ` : escapeHtml(row.title)}
        </td>
        <td>${escapeHtml(row.activity_title)}</td>
        <td>
          ${row.is_new_line ? `
            <select data-index="${index}" data-field="proposed_activity_title">
              <option value="">Select activity</option>
              ${activityOptions.map(option => `<option value="${escapeAttribute(option)}" ${option === row.proposed_activity_title ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}
            </select>
          ` : `
            <input type="text" data-index="${index}" data-field="proposed_activity_title" value="${escapeAttribute(row.proposed_activity_title)}" />
          `}
        </td>
        <td>${escapeHtml(row.budget_item_description)}</td>
        <td>
          <textarea rows="3" data-index="${index}" data-field="proposed_description">${escapeHtml(row.proposed_description)}</textarea>
        </td>
        <td>
          ${row.is_new_line ? `
            <input type="text" data-index="${index}" data-field="object_code" value="${escapeAttribute(row.object_code)}" placeholder="Object code" />
          ` : escapeHtml(row.object_code)}
        </td>
        <td class="money">${formatCurrency(row.current_budget)}</td>
        <td>
          <input class="amount-input" type="number" min="0" step="0.01" data-index="${index}" data-field="proposed_budget" value="${numberFormatter.format(row.proposed_budget)}" />
        </td>
        <td>
          ${row.is_new_line ? `
            <button class="button danger small-button" type="button" data-index="${index}" data-action="remove_new">Remove</button>
          ` : `
            <label class="inline-checkbox">
              <input type="checkbox" data-index="${index}" data-field="is_deleted" ${row.is_deleted ? 'checked' : ''} />
              Mark for deletion
            </label>
          `}
        </td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function handleModificationInput(event) {
  const target = event.target;
  const actionButton = target.closest('[data-action="remove_new"]');

  if (actionButton) {
    const index = Number(actionButton.dataset.index);
    removeNewLine(index);
    return;
  }

  if (!target.dataset || target.dataset.index === undefined) {
    return;
  }

  const index = Number(target.dataset.index);
  const field = target.dataset.field;
  const row = state.modificationRows[index];

  if (!row) return;

  if (field === 'is_deleted') {
    row.is_deleted = Boolean(target.checked);
  } else if (field === 'proposed_budget') {
    row.proposed_budget = toNumber(target.value);
  } else {
    row[field] = target.value;
  }

  if (field === 'title' && row.is_new_line) {
    row.proposed_activity_title = '';
    renderModificationTable();
  } else {
    updateRowAppearance(index);
  }

  updateModificationTotals();
}

function addNewLine() {
  const projectOptions = getProjectOptions();

  if (!projectOptions.length) {
    showMessage('No projects are available for this round.', 'error');
    return;
  }

  state.rowCounter += 1;
  state.modificationRows.push({
    rowId: `new-${state.rowCounter}`,
    is_new_line: true,
    is_deleted: false,
    round: state.selectedRound,
    title: projectOptions[0],
    activity_title: '(new line)',
    object_code: '',
    budget_item_description: '',
    proposed_activity_title: '',
    proposed_description: '',
    proposed_budget: 0,
    current_budget: 0
  });

  renderModificationTable();
  updateModificationTotals();
}

function removeNewLine(index) {
  const row = state.modificationRows[index];

  if (!row || !row.is_new_line) return;

  state.modificationRows.splice(index, 1);
  renderModificationTable();
  updateModificationTotals();
}

function updateRowAppearance(index) {
  const rowElement = document.querySelector(
    `tr[data-row-index="${index}"]`
  );

  if (!rowElement) return;

  const row = state.modificationRows[index];

  rowElement.classList.toggle('changed-row', isRowChanged(row));
  rowElement.classList.toggle('deleted-row', row.is_deleted);
}

function isRowChanged(row) {
  if (row.is_new_line) {
    return true;
  }

  return (
    row.is_deleted ||
    (row.proposed_activity_title || '').trim() !==
      (row.activity_title || '').trim() ||
    (row.proposed_description || '').trim() !==
      (row.budget_item_description || '').trim() ||
    Math.abs(toNumber(row.proposed_budget) - toNumber(row.current_budget)) >=
      0.005
  );
}

function updateModificationTotals() {
  const currentTotal = state.modificationRows
    .filter(row => !row.is_new_line)
    .reduce((total, row) => total + toNumber(row.current_budget), 0);

  const proposedTotal = state.modificationRows.reduce((total, row) => {
    if (row.is_deleted) {
      return total;
    }

    return total + toNumber(row.proposed_budget);
  }, 0);

  const difference = proposedTotal - currentTotal;
  const valid = Math.abs(difference) < 0.005;

  document.getElementById('currentTotal').textContent =
    formatCurrency(currentTotal);
  document.getElementById('proposedTotal').textContent =
    formatCurrency(proposedTotal);

  const differenceElement = document.getElementById('totalDifference');
  differenceElement.textContent = formatCurrency(difference);
  differenceElement.className = valid ? 'difference-valid' : 'difference-invalid';

  document.getElementById('submitButton').disabled = !valid;
}

async function submitModification(event) {
  event.preventDefault();

  const currentTotal = state.modificationRows
    .filter(row => !row.is_new_line)
    .reduce((total, row) => total + toNumber(row.current_budget), 0);

  const proposedTotal = state.modificationRows.reduce((total, row) => {
    if (row.is_deleted) {
      return total;
    }

    return total + toNumber(row.proposed_budget);
  }, 0);

  if (Math.abs(currentTotal - proposedTotal) >= 0.005) {
    showMessage(
      'The proposed budget must equal the current round budget total.',
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
    showMessage('Please complete all required fields.', 'error');
    return;
  }

  const incompleteNewRows = state.modificationRows.filter(
    row =>
      row.is_new_line &&
      !row.is_deleted &&
      (
        !String(row.title || '').trim() ||
        !String(row.proposed_activity_title || '').trim() ||
        !String(row.object_code || '').trim() ||
        !String(row.proposed_description || '').trim() ||
        toNumber(row.proposed_budget) <= 0
      )
  );

  if (incompleteNewRows.length > 0) {
    showMessage(
      'Each new budget line must include project, activity, object code, revised details, and an amount greater than $0.00.',
      'error'
    );
    return;
  }

  try {
    showLoading(true);
    clearMessage();

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/submit-budget`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          institution: state.institution,
          requesterName,
          requesterEmail,
          justification,
          round: state.selectedRound,
          modifications: state.modificationRows.map(row => ({
            title: row.title,
            activity_title: row.activity_title,
            proposed_activity_title: row.proposed_activity_title,
            budget_item_description: row.budget_item_description,
            object_code: row.object_code,
            current_budget: toNumber(row.current_budget),
            proposed_budget: row.is_deleted ? 0 : toNumber(row.proposed_budget),
            current_expenditure: 0,
            proposed_description: row.proposed_description,
            is_deleted: Boolean(row.is_deleted),
            is_new_line: Boolean(row.is_new_line),
            round: state.selectedRound
          }))
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Unable to submit request.');
    }

    document.getElementById('submissionForm').reset();

    showMessage(
      `Request ${result.request_number} was submitted successfully for ${state.selectedRound}.`,
      'success'
    );

    state.modificationRows = [];
    showRoundDetailView();
  } catch (error) {
    showMessage(
      'Unable to submit request: ' + error.message,
      'error'
    );
  } finally {
    showLoading(false);
  }
}

function getRowsForRound(round) {
  return state.budgetRows.filter(
    row => row.inferred_round === round && state.visibleRounds.includes(round)
  );
}

function getProjectOptions() {
  const projects = new Set(
    getRowsForRound(state.selectedRound)
      .map(row => row.title)
      .filter(Boolean)
  );

  return Array.from(projects).sort((a, b) => a.localeCompare(b));
}

function getActivityOptions(projectTitle) {
  const activities = new Set(
    getRowsForRound(state.selectedRound)
      .filter(row => row.title === projectTitle)
      .map(row => row.activity_title)
      .filter(Boolean)
  );

  return Array.from(activities).sort((a, b) => a.localeCompare(b));
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

function groupExpenditures(rows, round) {
  return rows.reduce((groups, row) => {
    if (inferRound(row.project) !== round) {
      return groups;
    }

    const key = [row.project, row.object_code]
      .map(value => String(value || '').trim().toLowerCase())
      .join('|');

    groups[key] = (groups[key] || 0) + toNumber(row.expenditure_amount);

    return groups;
  }, {});
}

function getExpenditureForBudgetRow(row, groupedExpenditures) {
  const key = [row.title, row.object_code]
    .map(value => String(value || '').trim().toLowerCase())
    .join('|');

  return groupedExpenditures[key] || 0;
}

function inferRound(value) {
  const match = String(value || '').match(/\bR\s*(\d+)\b/i);
  if (!match) return '';
  return `R${Number(match[1])}`;
}

function normalizeRoundList(list) {
  if (!Array.isArray(list)) return [];

  const rounds = list
    .map(item => {
      const match = String(item || '').match(/\bR\s*(\d+)\b/i);
      return match ? `R${Number(match[1])}` : null;
    })
    .filter(Boolean);

  return Array.from(new Set(rounds)).sort(sortRound);
}

function sortRound(a, b) {
  return toRoundNumber(a) - toRoundNumber(b);
}

function toRoundNumber(round) {
  return Number(String(round || '').replace(/[^0-9]/g, '')) || 0;
}

function hideSections() {
  document.getElementById('roundSection').classList.add('hidden');
  document
    .getElementById('roundDetailSection')
    .classList.add('hidden');
  document
    .getElementById('modificationSection')
    .classList.add('hidden');
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
}

function clearMessage() {
  document.getElementById('messageArea').innerHTML = '';
}

function showLoading(show) {
  document
    .getElementById('loadingOverlay')
    .classList.toggle('hidden', !show);
}
