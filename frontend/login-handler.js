document.getElementById('login-form').addEventListener('submit', async function(event) {
  event.preventDefault();

  var errorMsg = document.getElementById('error-message');
  var btn = document.getElementById('login-btn');

  errorMsg.style.display = 'none';

  var aadhar = document.getElementById('aadhar').value.trim();
  var password = document.getElementById('password').value.trim();

  if (!aadhar || !password) {
    errorMsg.textContent = 'Please enter both Aadhar and Password.';
    errorMsg.style.display = 'block';
    return;
  }

  if (!/^\d{12}$/.test(aadhar)) {
    errorMsg.textContent = 'Aadhar number must be exactly 12 digits.';
    errorMsg.style.display = 'block';
    return;
  }

  btn.textContent = 'Logging in...';
  btn.disabled = true;

  try {
    var response = await window.loginUser(aadhar, password);
    console.log('Login successful:', response);
    window.location.href = 'dashboard.html';
  } catch (error) {
    console.error('Login failed:', error);
    errorMsg.textContent = (error && error.message) ? error.message : 'Login failed. Please check your credentials.';
    errorMsg.style.display = 'block';
  } finally {
    btn.textContent = 'Login';
    btn.disabled = false;
  }
});
