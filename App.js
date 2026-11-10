'use strict';

const passwordButton = document.querySelector('.password-toggle');
passwordButton?.addEventListener('click', () => {
  const input = document.getElementById('password');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  passwordButton.textContent = show ? 'Hide' : 'Show';
  passwordButton.setAttribute('aria-pressed', String(show));
  passwordButton.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});

document.querySelectorAll('[data-print]').forEach(button => {
  button.addEventListener('click', () => window.print());
});
 
const dialog = document.getElementById('delete-dialog');
document.querySelectorAll('[data-delete]').forEach(button => {
  button.addEventListener('click', () => {
    document.getElementById('delete-id').value = button.dataset.delete;
    dialog.showModal();
    dialog.querySelector('[data-close-dialog]').focus();
  });
});
document.querySelector('[data-close-dialog]')?.addEventListener('click', () => dialog.close());

const matricInput = document.getElementById('matric-input');
matricInput?.addEventListener('input', () => {
  const match = [...document.querySelectorAll('#student-options option')].find(option => option.value.toLowerCase() === matricInput.value.trim().toLowerCase());
  if (match) document.getElementById('student-name').value = match.dataset.name;
});

const scoreInputs = ['test_1', 'test_2', 'final_exam'].map(id => document.getElementById(id));
if (scoreInputs.every(Boolean)) {
  const update = () => {
    const ready = scoreInputs.every(input => input.value.trim() !== '' && input.validity.valid && /^\d{1,3}(?:\.\d{1,2})?$/.test(input.value));
    const totalNode = document.getElementById('preview-total');
    const gradeNode = document.getElementById('preview-grade');
    const help = document.getElementById('preview-help');
    if (!ready) {
      totalNode.textContent = '—'; gradeNode.textContent = 'Pending';
      help.textContent = 'Complete all three marks to see the final grade.';
      return;
    }
    // Integer hundredths avoid floating-point changes at grade boundaries.
    const hundredths = scoreInputs.map(input => Math.round(Number(input.value) * 100));
    const total = Math.round((hundredths[0] * 20 + hundredths[1] * 30 + hundredths[2] * 50) / 100) / 100;
    totalNode.textContent = total.toFixed(2);
    gradeNode.textContent = total >= 80 ? 'A' : total >= 65 ? 'B' : total >= 50 ? 'C' : total >= 40 ? 'D' : 'E';
    help.textContent = 'Preview only. Your result is saved when you submit the form.';
  };
  scoreInputs.forEach(input => input.addEventListener('input', update)); update();
}

const directorySearch = document.getElementById('directory-search');
directorySearch?.addEventListener('input', () => {
  const tokens = directorySearch.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  let visible = 0;
  document.querySelectorAll('[data-search]').forEach(row => {
    row.hidden = !tokens.every(token => row.dataset.search.includes(token));
    if (!row.hidden) visible++;
  });
  document.getElementById('directory-search-status').hidden = visible > 0;
});

document.querySelectorAll('form[method="post"]').forEach(form => {
  form.addEventListener('submit', () => {
    // Freeze only the submitting button to prevent accidental repeated submissions.
    const submit = form.querySelector('button:not([type="button"])');
    if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
  });
});
// Restore buttons if the browser navigates back to a previously submitted form.
window.addEventListener('pageshow', () => {
  document.querySelectorAll('[aria-busy="true"]').forEach(button => {
    button.disabled = false; button.removeAttribute('aria-busy');
  });
});
