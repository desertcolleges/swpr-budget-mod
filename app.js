const SUPABASE_URL = 'https://dfghvbhidpzxjdcczcck.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IXoPGcfK7o5LbccQvk6g9g_cWbtfrH2';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY

async function loadInstitutions() {
  const { data, error } = await supabaseClient
    .from('budget_reference')
    .select('institution')
    .order('institution');

  if (error) {
    console.error(error);
    return;
  }

  const institutions = [...new Set(data.map(item => item.institution))];

  const select = document.getElementById('institutionSelect');
  select.innerHTML = '<option value="">Select an institution</option>';

  institutions.forEach(institution => {
    const option = document.createElement('option');
    option.value = institution;
    option.textContent = institution;
    select.appendChild(option);
  });
}

async function loadBudgetData(institution) {
  const [budgetResult, expenditureResult] = await Promise.all([
    supabaseClient
      .from('budget_reference')
      .select('*')
      .eq('institution', institution),

    supabaseClient
      .from('expenditure_reference')
      .select('*')
      .eq('institution', institution)
  ]);

  if (budgetResult.error) throw budgetResult.error;
  if (expenditureResult.error) throw expenditureResult.error;

  return {
    budget: budgetResult.data,
    expenditures: expenditureResult.data
  };
}

async function renderInstitutionData() {
  const institution = document.getElementById('institutionSelect').value;
  if (!institution) return;

  const data = await loadBudgetData(institution);

  const results = document.getElementById('results');

  let html = `
    <h2>${institution}</h2>

    <h3>Budget Reference</h3>
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Activity</th>
          <th>Object Code</th>
          <th>Budget</th>
        </tr>
      </thead>
      <tbody>
  `;

  data.budget.forEach(row => {
    html += `
      <tr>
        <td>${row.title || ''}</td>
        <td>${row.activity_title || ''}</td>
        <td>${row.object_code || ''}</td>
        <td>$${Number(row.budget || 0).toLocaleString()}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;

  html += `
    <h3>Expenditures</h3>
    <table>
      <thead>
        <tr>
          <th>Project</th>
          <th>Object Code</th>
          <th>Expenditure Amount</th>
        </tr>
      </thead>
      <tbody>
  `;

  data.expenditures.forEach(row => {
    html += `
      <tr>
        <td>${row.project || ''}</td>
        <td>${row.object_code || ''}</td>
        <td>$${Number(row.expenditure_amount || 0).toLocaleString()}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;

  results.innerHTML = html;
}

document
  .getElementById('institutionSelect')
  .addEventListener('change', renderInstitutionData);

loadInstitutions();
