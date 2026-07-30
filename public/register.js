document.getElementById('register-form').addEventListener('submit', async function(event) {
  event.preventDefault();

  var errorMsg = document.getElementById('error-message');
  var successMsg = document.getElementById('success-message');
  var btn = document.getElementById('registration-btn');

  errorMsg.style.display = 'none';
  successMsg.style.display = 'none';

  var aadhar = document.getElementById('aadhar').value.trim();
  var password = document.getElementById('password').value.trim();
  var phone = document.getElementById('phone').value.trim();
  var name = document.getElementById('name').value.trim();
  var email = document.getElementById('email').value.trim();

  var errors = [];
  if (!password || password.length < 6) errors.push('Password must be at least 6 characters.');
  if (!aadhar || !/^\d{12}$/.test(aadhar)) errors.push('Aadhar must be exactly 12 digits.');
  if (!phone || !/^[6-9]\d{9}$/.test(phone)) errors.push('Enter a valid Indian mobile number.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Enter a valid email.');

  if (errors.length > 0) {
    errorMsg.textContent = errors.join(' ');
    errorMsg.style.display = 'block';
    return;
  }

  if (typeof window.registerUser !== 'function') {
    errorMsg.textContent = 'Registration service not loaded. Please refresh.';
    errorMsg.style.display = 'block';
    return;
  }

  btn.textContent = 'Registering...';
  btn.disabled = true;

  try {
    var response = await window.registerUser({ aadhar: aadhar, password: password, phone: phone, name: name, email: email });
    console.log('Registration successful:', response);

    successMsg.textContent = 'Registration Successful! Redirecting...';
    successMsg.style.display = 'block';
    document.getElementById('register-form').reset();

    setTimeout(function() {
      window.location.href = 'dashboard.html';
    }, 2000);
  } catch (error) {
    console.error('Registration failed:', error);
    errorMsg.textContent = (error && error.message) ? error.message : 'Registration failed. Please try again.';
    errorMsg.style.display = 'block';
  } finally {
    btn.textContent = 'Register';
    btn.disabled = false;
  }
});
