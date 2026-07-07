// Generate QR for install modal when opened
document.getElementById('qr-install-modal').addEventListener('click', function() {});

function generateQR() {
  var url = window.location.href.split('?')[0].split('#')[0];
  document.getElementById('install-qr-url').textContent = url;
  var img = document.getElementById('install-qr-img');
  if (!img) return;
  // Use Google Charts QR API (no library needed, works offline-ish via cache)
  var encoded = encodeURIComponent(url);
  img.src = 'https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=' + encoded + '&chco=0057A8&chf=bg,s,FFFFFF&chld=M|2';
  img.onerror = function() {
    // Fallback: use QR Server API
    img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encoded + '&color=0057A8&bgcolor=FFFFFF&margin=2';
  };
}

function showInstallQR() {
  var modal = document.getElementById('qr-install-modal');
  modal.style.display = 'flex';
  generateQR();
}

// Override button in splash to use showInstallQR
document.addEventListener('DOMContentLoaded', function() {
  var btns = document.querySelectorAll('[onclick*="qr-install-modal"]');
  btns.forEach(function(btn) {
    btn.onclick = function(e) { e.stopPropagation(); showInstallQR(); };
  });
});
