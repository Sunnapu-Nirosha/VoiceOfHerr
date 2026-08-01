
  // Auth guard
  if (typeof isLoggedIn === 'function' && !window.isLoggedIn()) {
    window.location.href = 'index.html';
  }

  // Logout
  const logoutBtnSm = document.getElementById('logout-btn-sm');
  if (logoutBtnSm) {
    logoutBtnSm.addEventListener('click', function(e) {
      e.preventDefault();
      localStorage.clear();
      document.cookie.split(";").forEach(function(c) { document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); });
      window.location.href = 'index.html';
    });
  }

  // Sidebar collapse
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('main-content');
  const overlay = document.getElementById('sidebar-overlay');

  if (localStorage.getItem('sidebar-collapsed') === 'true') {
    sidebar.classList.add('collapsed');
    mainContent.classList.add('expanded');
  }

  document.getElementById('sidebar-collapse-btn').addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    mainContent.classList.toggle('expanded');
    localStorage.setItem('sidebar-collapsed', sidebar.classList.contains('collapsed'));
  });

  document.getElementById('mobile-toggle').addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
  });
  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  });

  // Date
  const now = new Date();
  const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const dateEl = document.getElementById('topbar-date');
  if (dateEl) dateEl.textContent = now.toLocaleDateString('en-US', dateOptions);

  // Greeting
  const hours = now.getHours();
  let greeting = 'Good morning';
  if (hours >= 12 && hours < 17) greeting = 'Good afternoon';
  else if (hours >= 17) greeting = 'Good evening';

  // Load user info
  async function loadUserInfo() {
    try {
      let name = localStorage.getItem('userName') || '';
      let email = localStorage.getItem('userPhone') || '';

      if (!name && typeof getUserProfile === 'function') {
        const profile = await getUserProfile();
        name = profile.name || 'User';
        email = profile.email || profile.phone || '';
      }

      if (!name) name = 'User';
      setUserInfo(name, email);
    } catch (e) {
      setUserInfo('User', '');
    }
  }

  function setUserInfo(name, detail) {
    const welcomeEl = document.getElementById('welcome-text');
    if (welcomeEl) welcomeEl.textContent = greeting + ', ' + name + '!';
    const sbName = document.getElementById('sb-name');
    if (sbName) sbName.textContent = name;
    const sbEmail = document.getElementById('sb-email');
    if (sbEmail) sbEmail.textContent = detail;
  }

  // =========== Emergency Contacts ===========
  let currentContacts = [];

  async function loadContacts() {
    try {
      if (typeof getEmergencyContacts === 'function') {
        const contacts = await window.getEmergencyContacts();
        currentContacts = contacts || [];
        renderContacts(currentContacts);
      }
    } catch (e) {
      console.warn('Could not load contacts:', e.message);
      renderContacts([]);
    }
  }

  function renderContacts(contacts) {
    const list = document.getElementById('contacts-list');
    if (!list) return;

    if (!contacts || contacts.length === 0) {
      list.innerHTML = `
        <div class="empty-contacts">
          <i class="fas fa-user-plus"></i>
          <p>No contacts added yet.<br>Add your first contact above.</p>
        </div>`;
      return;
    }

    list.innerHTML = contacts.map(c => `
      <div class="contact-row" id="contact-${c._id || c.id}">
        <div class="contact-c-avatar">${c.name ? c.name.charAt(0).toUpperCase() : '?'}</div>
        <div class="contact-info">
          <div class="contact-c-name">${escHtml(c.name || 'Contact')}</div>
          <div class="contact-c-phone">${escHtml(c.phone || '')}</div>
          ${c.relationship ? `<span class="contact-c-rel">${escHtml(c.relationship)}</span>` : ''}
        </div>
        <button class="contact-delete-btn" onclick="handleDeleteContact('${c._id || c.id}')" title="Remove contact">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
    `).join('');
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function showToast(message, type) {
    const toast = document.getElementById('contact-toast');
    if (!toast) return;
    toast.textContent = '';
    const icon = document.createElement('i');
    icon.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
    toast.appendChild(icon);
    toast.appendChild(document.createTextNode(' ' + message));
    toast.className = 'contact-toast ' + type;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.className = 'contact-toast';
    }, 4000);
  }

  async function handleAddContact() {
    const nameEl = document.getElementById('contact-name');
    const phoneEl = document.getElementById('contact-phone');
    const relEl = document.getElementById('contact-relationship');
    const btn = document.getElementById('btn-add-contact');

    const name = nameEl.value.trim();
    // Sanitize phone: strip +91 country code, spaces, dashes, parentheses
    const rawPhone = phoneEl.value.trim();
    const phone = rawPhone.replace(/^\+91\s*/, '').replace(/[\s\-().]/g, '');
    const relationship = relEl.value;

    if (!name) { showToast('Please enter a contact name.', 'error'); nameEl.focus(); return; }
    if (!phone) { showToast('Please enter a phone number.', 'error'); phoneEl.focus(); return; }
    if (!/^[6-9]\d{9}$/.test(phone)) { showToast('Enter a valid 10-digit Indian mobile number (e.g. 9876543210).', 'error'); phoneEl.focus(); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';

    try {
      if (typeof addEmergencyContact === 'function') {
        const result = await addEmergencyContact(name, phone, relationship);
        showToast('Contact added successfully!', 'success');
        nameEl.value = '';
        phoneEl.value = '';
        relEl.value = '';
        await loadContacts();
      } else {
        btn.innerHTML = 'Error: addEmergencyContact missing';
        showToast('Contact feature not available.', 'error');
      }
    } catch (e) {
      console.error('HandleAddContact Error:', e);
      btn.innerHTML = '<span style="color:#ffcc00; font-size:12px;">' + (e.message || 'Error') + '</span>';
      showToast(e.message || 'Failed to add contact. Try again.', 'error');
    } finally {
      btn.disabled = false;
      setTimeout(() => {
        if (btn.innerHTML.includes('Add Contact') === false) {
           btn.innerHTML = '<i class="fas fa-plus"></i> Add Contact';
        }
      }, 5000);
    }
  }

  async function handleDeleteContact(contactId) {
    if (!confirm('Remove this emergency contact?')) return;
    try {
      if (typeof deleteEmergencyContact === 'function') {
        await deleteEmergencyContact(contactId);
        showToast('Contact removed.', 'success');
        await loadContacts();
      }
    } catch (e) {
      showToast(e.message || 'Could not delete contact.', 'error');
    }
  }

  // Allow pressing Enter in inputs to submit
  document.getElementById('contact-name').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('contact-phone').focus(); });
  document.getElementById('contact-phone').addEventListener('keydown', e => { if (e.key === 'Enter') handleAddContact(); });

  // Init
  loadUserInfo();
  loadContacts();
